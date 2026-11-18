import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fitSize, ImageAttachError, MAX_SOURCE_BYTES, prepareImage, sniffImageFormat } from './image'

import type * as Codec from './imageCodec'

// В jsdom нет createImageBitmap и canvas: подменяем декодирование и кодирование, чтение байтов — настоящее.
const codec = vi.hoisted(() => ({ decode: vi.fn(), encode: vi.fn(), close: vi.fn() }))

vi.mock('./imageCodec', async (importOriginal) => ({
  ...(await importOriginal<typeof Codec>()),
  decodeImage: codec.decode,
  encodeImage: codec.encode,
}))

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]
const JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]
const WEBP_BYTES = [0x52, 0x49, 0x46, 0x46, 0x16, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]
const GIF_BYTES = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0]
const SVG_TEXT = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'

const file = (bytes: number[] | string, name: string, type: string) =>
  new File([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)], name, { type })

/** data URL нужной длины. */
const dataUrl = (type: string, length: number) => {
  const prefix = `data:${type};base64,`
  return prefix + 'A'.repeat(Math.max(1, length - prefix.length))
}

describe('sniffImageFormat', () => {
  it('узнаёт PNG, JPEG и WebP по сигнатуре и отвергает остальное', () => {
    expect(sniffImageFormat(new Uint8Array(PNG_BYTES))).toBe('png')
    expect(sniffImageFormat(new Uint8Array(JPEG_BYTES))).toBe('jpeg')
    expect(sniffImageFormat(new Uint8Array(WEBP_BYTES))).toBe('webp')
    expect(sniffImageFormat(new Uint8Array(GIF_BYTES))).toBeNull()
    expect(sniffImageFormat(new TextEncoder().encode(SVG_TEXT))).toBeNull()
    expect(sniffImageFormat(new Uint8Array([]))).toBeNull()
  })
})

describe('fitSize', () => {
  it('уменьшает до 1600 px по длинной стороне с сохранением пропорций и не увеличивает маленькие', () => {
    expect(fitSize(3200, 1800, 1600)).toEqual({ width: 1600, height: 900 })
    expect(fitSize(1000, 4000, 1600)).toEqual({ width: 400, height: 1600 })
    expect(fitSize(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })
})

describe('prepareImage', () => {
  beforeEach(() => {
    codec.decode.mockResolvedValue({ width: 3200, height: 2000, source: {}, close: codec.close })
    codec.encode.mockImplementation((_image: unknown, _w: number, _h: number, type: string) => dataUrl(type, 1000))
  })

  it('уменьшает картинку и перекодирует в WebP с качеством 0.8', async () => {
    const url = await prepareImage(file(PNG_BYTES, 'shot.png', 'image/png'))

    expect(url.startsWith('data:image/webp;base64,')).toBe(true)
    expect(codec.encode).toHaveBeenCalledTimes(1)
    expect(codec.encode).toHaveBeenCalledWith(expect.anything(), 1600, 1000, 'image/webp', 0.8)
    expect(codec.close).toHaveBeenCalled()
  })

  it('если браузер не умеет WebP, кодирует в JPEG', async () => {
    // toDataURL с неподдерживаемым типом возвращает PNG.
    codec.encode.mockImplementation((_image: unknown, _w: number, _h: number, type: string) =>
      dataUrl(type === 'image/webp' ? 'image/png' : type, 1000),
    )

    const url = await prepareImage(file(JPEG_BYTES, 'photo.jpg', 'image/jpeg'))

    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(codec.encode).toHaveBeenLastCalledWith(expect.anything(), 1600, 1000, 'image/jpeg', 0.8)
  })

  it('если не уложились в 400 000 символов, один раз пробует качество 0.6', async () => {
    codec.encode.mockImplementation((_image: unknown, _w: number, _h: number, type: string, quality: number) =>
      dataUrl(type, quality > 0.7 ? 500_000 : 350_000),
    )

    const url = await prepareImage(file(WEBP_BYTES, 'big.webp', 'image/webp'))

    expect(url).toHaveLength(350_000)
    expect(codec.encode).toHaveBeenCalledTimes(2)
    expect(codec.encode).toHaveBeenLastCalledWith(expect.anything(), 1600, 1000, 'image/webp', 0.6)
  })

  it('отказывает, если и после снижения качества картинка больше лимита', async () => {
    codec.encode.mockImplementation((_image: unknown, _w: number, _h: number, type: string) => dataUrl(type, 400_001))

    await expect(prepareImage(file(PNG_BYTES, 'huge.png', 'image/png'))).rejects.toMatchObject({ code: 'too-large' })
    expect(codec.encode).toHaveBeenCalledTimes(2)
    expect(codec.close).toHaveBeenCalled()
  })

  it('не принимает GIF и SVG, даже если у файла расширение и тип картинки PNG', async () => {
    await expect(prepareImage(file(GIF_BYTES, 'anim.gif', 'image/gif'))).rejects.toMatchObject({ code: 'type' })
    await expect(prepareImage(file(SVG_TEXT, 'evil.png', 'image/png'))).rejects.toMatchObject({ code: 'type' })
    await expect(prepareImage(file('просто текст', 'note.txt', 'text/plain'))).rejects.toBeInstanceOf(ImageAttachError)
    expect(codec.decode).not.toHaveBeenCalled()
  })

  it('отказывает, если браузер не смог декодировать файл с правильной сигнатурой', async () => {
    codec.decode.mockResolvedValue(null)

    await expect(prepareImage(file(PNG_BYTES, 'broken.png', 'image/png'))).rejects.toMatchObject({ code: 'broken' })
    expect(codec.encode).not.toHaveBeenCalled()
  })

  it('слишком большой исходный файл не декодируется', async () => {
    const big = file(PNG_BYTES, 'big.png', 'image/png')
    Object.defineProperty(big, 'size', { value: MAX_SOURCE_BYTES + 1 })

    await expect(prepareImage(big)).rejects.toMatchObject({ code: 'too-large' })
    expect(codec.decode).not.toHaveBeenCalled()
  })
})
