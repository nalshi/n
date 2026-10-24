const HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heif',
  'heis',
  'heim',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
])

export type HeicConverter = (options: {
  blob: Blob
  toType: string
  quality: number
}) => Promise<Blob | Blob[]>

export type NativeImageDecoder = (blob: Blob) => Promise<boolean>

async function canDecodeNatively(blob: Blob): Promise<boolean> {
  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = objectUrl
    await image.decode()
    return image.naturalWidth > 0 && image.naturalHeight > 0
  } catch {
    return false
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function normalizeDashboardImage(
  file: File,
  heicConverter?: HeicConverter,
  nativeImageDecoder: NativeImageDecoder = canDecodeNatively
): Promise<Blob> {
  const header = new Uint8Array(await file.slice(0, 64).arrayBuffer())
  const ascii = String.fromCharCode(...header)
  const isHeifContainer = ascii.slice(4, 8).toLowerCase() === 'ftyp'
  const brands = isHeifContainer
    ? [
        ascii.slice(8, 12),
        ...Array.from(
          { length: Math.max(0, Math.floor((header.length - 16) / 4)) },
          (_, index) => ascii.slice(16 + index * 4, 20 + index * 4)
        ),
      ]
    : []
  const isHeic =
    /^image\/hei[cf](?:$|[-+])/i.test(file.type) ||
    (isHeifContainer &&
      (brands.some((brand) => HEIF_BRANDS.has(brand.toLowerCase())) ||
        /\.(?:heic|heif)$/i.test(file.name)))

  if (isHeic) {
    if (await nativeImageDecoder(file)) return file

    const convert = heicConverter || (await import('heic2any')).default
    const converted = await convert({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9,
    })
    const image = Array.isArray(converted) ? converted[0] : converted
    if (!image || image.type !== 'image/jpeg') {
      throw new Error(
        'تعذر تحويل صورة الآيفون. جرّب حفظها بصيغة JPG ثم أعد رفعها.'
      )
    }
    return image
  }

  const supported =
    ascii.startsWith('\xff\xd8\xff') ||
    ascii.startsWith('\x89PNG\r\n\x1a\n') ||
    (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') ||
    ascii.startsWith('GIF8')
  if (!supported) {
    throw new Error(
      'صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP أو GIF أو HEIC.'
    )
  }

  return file
}
