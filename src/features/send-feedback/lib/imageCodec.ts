/*
 * Обращения к API браузера для картинок замечания: чтение байтов, декодирование и перекодирование через canvas.
 * Вынесены в отдельный модуль, чтобы логику в `image.ts` можно было проверить в jsdom, где нет
 * createImageBitmap и canvas, подменив только этот модуль.
 */

/** Декодированная картинка: размеры и источник для рисования на canvas. */
export type DecodedImage = {
  width: number
  height: number
  source: CanvasImageSource
  /** Освобождает память декодированной картинки. */
  close: () => void
}

/** Первые `length` байт файла — по ним определяется настоящий формат. */
export async function readHead(blob: Blob, length: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(0, length).arrayBuffer())
}

/** Декодирует картинку; null — браузер не смог её прочитать (файл повреждён или это не картинка). */
export async function decodeImage(blob: Blob): Promise<DecodedImage | null> {
  if (typeof createImageBitmap !== 'function') return null
  try {
    const bitmap = await createImageBitmap(blob)
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() }
  } catch {
    return null
  }
}

/**
 * Рисует картинку на canvas нужного размера и возвращает data URL в формате `type`.
 * Если браузер не умеет кодировать `type` (WebP в старом Safari), toDataURL вернёт PNG — это проверяет вызывающий.
 * Перекодирование через canvas заодно убирает EXIF и геопозицию.
 */
export function encodeImage(image: DecodedImage, width: number, height: number, type: string, quality: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return ''
  // У JPEG нет прозрачности: прозрачные места иначе станут чёрными.
  if (type === 'image/jpeg') {
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)
  }
  context.imageSmoothingQuality = 'high'
  context.drawImage(image.source, 0, 0, width, height)
  return canvas.toDataURL(type, quality)
}
