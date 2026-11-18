import { FEEDBACK_IMAGE_LIMITS, isFeedbackImage } from '@/entities/feedback'

import { decodeImage, encodeImage, readHead } from './imageCodec'

/** Форматы, которые принимает форма; GIF и SVG не подходят (SVG может содержать скрипты). */
export type ImageFormat = 'png' | 'jpeg' | 'webp'

/** Исходный файл больше этого даже не декодируется: скриншот столько не весит. */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024

export type ImageErrorCode = 'type' | 'broken' | 'too-large' | 'limit'

const IMAGE_ERROR_MESSAGES: Readonly<Record<ImageErrorCode, string>> = {
  type: 'Подходят только картинки PNG, JPEG и WebP',
  broken: 'Не удалось прочитать картинку',
  'too-large': 'Картинка слишком большая даже после сжатия. Обрежьте её или сделайте скриншот меньшей области',
  limit: `Можно приложить не больше ${FEEDBACK_IMAGE_LIMITS.maxCount} картинок`,
}

export class ImageAttachError extends Error {
  readonly code: ImageErrorCode

  constructor(code: ImageErrorCode) {
    super(IMAGE_ERROR_MESSAGES[code])
    this.name = 'ImageAttachError'
    this.code = code
  }
}

/** Понятный текст ошибки для формы. */
export function imageErrorMessage(cause: unknown): string {
  return cause instanceof ImageAttachError ? cause.message : IMAGE_ERROR_MESSAGES.broken
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte)

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
const RIFF = [0x52, 0x49, 0x46, 0x46]
const WEBP = [0x57, 0x45, 0x42, 0x50]

/** Сколько первых байт нужно, чтобы узнать формат. */
export const SIGNATURE_LENGTH = 12

/** Формат по первым байтам файла (сигнатуре), а не по расширению или MIME-типу; null — не подходит. */
export function sniffImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return 'png'
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'jpeg'
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'webp'
  return null
}

/** Размер с сохранением пропорций, длинная сторона — не больше `maxSide`; маленькие картинки не увеличиваются. */
export function fitSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * Готовит картинку к отправке и возвращает data URL:
 *  1. проверяет сигнатуру файла и декодирует его (`createImageBitmap`) — расширению не верим;
 *  2. уменьшает до 1600 px по длинной стороне и перекодирует в WebP с качеством 0.8,
 *     а если браузер не умеет WebP — в JPEG. Метаданные (EXIF, геопозиция) при этом пропадают;
 *  3. если не уложились в лимит базы (~300 КБ), один раз пробует качество пониже, иначе отказ.
 */
export async function prepareImage(file: Blob): Promise<string> {
  if (file.size > MAX_SOURCE_BYTES) throw new ImageAttachError('too-large')
  if (!sniffImageFormat(await readHead(file, SIGNATURE_LENGTH))) throw new ImageAttachError('type')

  const image = await decodeImage(file)
  if (!image || !image.width || !image.height) throw new ImageAttachError('broken')
  try {
    const { width, height } = fitSize(image.width, image.height, FEEDBACK_IMAGE_LIMITS.maxSide)
    let type = 'image/webp'
    let url = encodeImage(image, width, height, type, FEEDBACK_IMAGE_LIMITS.quality)
    if (!url.startsWith('data:image/webp;')) {
      type = 'image/jpeg'
      url = encodeImage(image, width, height, type, FEEDBACK_IMAGE_LIMITS.quality)
    }
    if (url.length > FEEDBACK_IMAGE_LIMITS.maxLength) {
      url = encodeImage(image, width, height, type, FEEDBACK_IMAGE_LIMITS.fallbackQuality)
    }
    if (url.length > FEEDBACK_IMAGE_LIMITS.maxLength) throw new ImageAttachError('too-large')
    if (!isFeedbackImage(url)) throw new ImageAttachError('broken')
    return url
  } finally {
    image.close()
  }
}
