import { describe, expect, it, vi } from 'vitest'
import { normalizeDashboardImage, type HeicConverter } from './image-processing'

describe('normalizeDashboardImage', () => {
  it('converts HEIC photos to JPEG before browser image processing', async () => {
    const source = new File(['heic'], 'photo.HEIC', { type: 'image/heic' })
    const converted = new Blob(['jpeg'], { type: 'image/jpeg' })
    const convertHeicMock = vi.fn<HeicConverter>().mockResolvedValue(converted)

    await expect(
      normalizeDashboardImage(source, convertHeicMock)
    ).resolves.toBe(converted)
    expect(convertHeicMock).toHaveBeenCalledWith({
      blob: source,
      toType: 'image/jpeg',
      quality: 0.9,
    })
  })

  it('detects HEIF files from their container brand when MIME is missing', async () => {
    const header = new Uint8Array(12)
    header.set(new TextEncoder().encode('....ftypheic'))
    const source = new File([header], 'photo', { type: '' })
    const converted = new Blob(['jpeg'], { type: 'image/jpeg' })
    const convertHeicMock = vi.fn<HeicConverter>().mockResolvedValue(converted)

    await expect(
      normalizeDashboardImage(source, convertHeicMock)
    ).resolves.toBe(converted)
    expect(convertHeicMock).toHaveBeenCalledOnce()
  })

  it('detects compatible HEIF brands when the primary brand is generic', async () => {
    const header = new Uint8Array(20)
    header.set(new TextEncoder().encode('....ftypmif1....heif'))
    const source = new File([header], 'photo', { type: '' })
    const converted = new Blob(['jpeg'], { type: 'image/jpeg' })
    const convertHeicMock = vi.fn<HeicConverter>().mockResolvedValue(converted)

    await expect(
      normalizeDashboardImage(source, convertHeicMock)
    ).resolves.toBe(converted)
    expect(convertHeicMock).toHaveBeenCalledOnce()
  })

  it('detects HEIF files with a HEIC extension and an unknown primary brand', async () => {
    const header = new Uint8Array(20)
    header.set(new TextEncoder().encode('....ftypheif....mif1'))
    const source = new File([header], 'photo.HEIC', { type: '' })
    const converted = new Blob(['jpeg'], { type: 'image/jpeg' })
    const convertHeicMock = vi.fn<HeicConverter>().mockResolvedValue(converted)

    await expect(
      normalizeDashboardImage(source, convertHeicMock)
    ).resolves.toBe(converted)
    expect(convertHeicMock).toHaveBeenCalledOnce()
  })

  it('keeps supported browser image formats unchanged', async () => {
    const source = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'photo.png',
      { type: 'image/png' }
    )

    await expect(normalizeDashboardImage(source)).resolves.toBe(source)
  })

  it('loads the HEIC decoder only when an iPhone image is selected', async () => {
    const { default: convertHeic } = await import('heic2any')

    expect(convertHeic).toEqual(expect.any(Function))
  })

  it('rejects unsupported image formats with recovery guidance', async () => {
    const source = new File(['not an image'], 'photo', { type: 'image/heic' })
    const convertHeicMock = vi
      .fn<HeicConverter>()
      .mockResolvedValue(
        new Blob(['not jpeg'], { type: 'application/octet-stream' })
      )

    await expect(
      normalizeDashboardImage(source, convertHeicMock)
    ).rejects.toThrow('تعذر تحويل صورة الآيفون')
  })
})
