export type MerchantProfile = {
  storeName: string
  phone: string
  location: string
}

const PROFILES_STORAGE_KEY = 'nalsh_merchant_profiles_v1'

function profileKey(merchantId: string) {
  return `merchant:${merchantId}`
}

function readStoredProfiles(): Record<string, MerchantProfile> {
  const stored = localStorage.getItem(PROFILES_STORAGE_KEY)
  if (!stored) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    throw new Error(
      'تعذرت قراءة معلومات التجار المحفوظة. تحقق من بيانات الموقع على هذا الجهاز.'
    )
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('تنسيق معلومات التجار المحفوظة غير صالح.')
  }

  const profiles: Record<string, MerchantProfile> = {}
  for (const [merchantId, value] of Object.entries(parsed)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('بيانات أحد ملفات التجار المحفوظة غير صالحة.')
    }

    const profile = value as Record<string, unknown>
    if (
      typeof profile.storeName !== 'string' ||
      typeof profile.phone !== 'string' ||
      typeof profile.location !== 'string'
    ) {
      throw new Error('حقول أحد ملفات التجار المحفوظة غير صالحة.')
    }

    profiles[
      merchantId.startsWith('merchant:') ? merchantId : profileKey(merchantId)
    ] = {
      storeName: profile.storeName,
      phone: profile.phone,
      location: profile.location,
    }
  }

  return profiles
}

export function getMerchantProfile(merchantId: string): MerchantProfile {
  const normalizedId = merchantId.trim()
  if (!normalizedId) {
    throw new Error('تعذر تحميل معلومات التاجر دون معرّف حساب صالح.')
  }

  return (
    readStoredProfiles()[profileKey(normalizedId)] || {
      storeName: '',
      phone: '',
      location: '',
    }
  )
}

export function saveMerchantProfile(
  merchantId: string,
  updates: Partial<MerchantProfile>
): MerchantProfile {
  const normalizedId = merchantId.trim()
  if (!normalizedId) {
    throw new Error('تعذر حفظ معلومات التاجر دون معرّف حساب صالح.')
  }

  const profiles = readStoredProfiles()
  const key = profileKey(normalizedId)
  const current = profiles[key] || {
    storeName: '',
    phone: '',
    location: '',
  }
  const profile = { ...current, ...updates }

  if (
    profile.storeName.length > 120 ||
    profile.phone.length > 40 ||
    profile.location.length > 200
  ) {
    throw new Error('تجاوزت إحدى معلومات التاجر الحد المسموح به.')
  }

  profiles[key] = profile
  localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles))
  return profile
}
