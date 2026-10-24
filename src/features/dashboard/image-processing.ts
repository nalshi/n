const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'])

export type HeicConverter = (options: {
  blob: Blob
  toType: string
  quality: number
}) => Promise<Blob | Blob[]>

export async function normalizeDashboardImage(
  file: File,
  heicConverter?: HeicConverter
): Promise<Blob> {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const ascii = String.fromCharCode(...header)
  const brand = ascii.slice(8, 12).toLowerCase()
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    file.type === 'image/heic-sequence' ||
    file.type === 'image/heif-sequence' ||
    (ascii.slice(4, 8).toLowerCase() === 'ftyp' && HEIC_BRANDS.has(brand))

  if (isHeic) {
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
