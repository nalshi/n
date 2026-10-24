import { authApiRequest } from '@/lib/auth-api'
import { compressDashboardImage } from '@/features/dashboard/dashboard-data'
import { saveStorefrontConfig } from '@/features/storefront/storefront-data'

type ApiRecord = Record<string, unknown>

export type MerchantSettings = {
  storeName: string
  storeType: string
  phone: string
  welcomeMessage: string
  freeShippingEnabled: boolean
  freeShippingType: 'always' | 'order_value' | 'item_count'
  freeShippingThreshold: number
  pushNotifications: boolean
  username: string
}

export type AiAssistantSettings = {
  enabled: boolean
  botName: string
  tone: string
  customRules: string[]
}

export type WhatsappSettings = {
  enabled: boolean
  phoneNumberId: string
  hasAccessToken: boolean
  accessTokenMasked: string
  displayPhoneNumber: string
  webhookUrl: string
  verifyToken: string
}

export type StoreSettingsData = {
  merchant: MerchantSettings
  assistant: AiAssistantSettings
  whatsapp: WhatsappSettings
}

export type StoreLogoSettings = {
  config: ApiRecord
  username: string
  logoUrl: string
  icon: string
}

export const STORE_LOGO_ICONS = [
  { value: 'fa-store', label: 'متجر' },
  { value: 'fa-shopping-bag', label: 'حقيبة' },
  { value: 'fa-tag', label: 'بطاقة' },
  { value: 'fa-star', label: 'نجمة' },
  { value: 'fa-gem', label: 'جوهرة' },
  { value: 'fa-fire', label: 'نار' },
  { value: 'fa-bolt', label: 'برق' },
  { value: 'fa-crown', label: 'تاج' },
] as const

const MAX_STORE_LOGO_SOURCE_BYTES = 10 * 1024 * 1024
const MAX_STORE_LOGO_BYTES = 1024 * 1024

export const merchantSettingsQueryKey = (merchantId: string) =>
  ['merchant-store-settings', merchantId] as const

function asRecord(value: unknown): ApiRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as ApiRecord)
    : null
}

function readString(...values: unknown[]) {
  const found = values.find(
    (value) => typeof value === 'string' && value.trim()
  )
  return typeof found === 'string' ? found.trim() : ''
}

function readNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function readBoolean(value: unknown) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function parseSettings(value: unknown): ApiRecord {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value) as unknown) || {}
    } catch {
      throw new Error('صيغة إعدادات المتجر غير صالحة.')
    }
  }
  return asRecord(value) || {}
}

function assertSuccess(
  status: string,
  message: string | undefined,
  fallback: string
) {
  if (status !== 'success' && status !== 'ok') {
    throw new Error(message || fallback)
  }
}

export async function fetchStoreSettings(): Promise<StoreSettingsData> {
  const [merchantResult, assistantResult, whatsappResult] = await Promise.all([
    authApiRequest('get_merchant_settings', {}),
    authApiRequest('get_ai_assistant_config', {}),
    authApiRequest('get_whatsapp_config', {}),
  ])

  assertSuccess(
    merchantResult.status,
    merchantResult.message,
    'تعذر تحميل إعدادات المتجر.'
  )
  assertSuccess(
    assistantResult.status,
    assistantResult.message,
    'تعذر تحميل إعدادات المساعد الذكي.'
  )
  assertSuccess(
    whatsappResult.status,
    whatsappResult.message,
    'تعذر تحميل إعدادات واتساب.'
  )

  const merchant = asRecord(merchantResult.data)
  if (!merchant) throw new Error('صيغة بيانات المتجر غير متوقعة.')
  const settings = parseSettings(merchant.settings)
  const assistant = asRecord(assistantResult.data) || {}
  const whatsapp = asRecord(whatsappResult.data) || {}
  const rules = Array.isArray(assistant.custom_rules)
    ? assistant.custom_rules.filter(
        (rule): rule is string => typeof rule === 'string'
      )
    : typeof assistant.custom_rules === 'string'
      ? assistant.custom_rules.split(/\r?\n/).filter(Boolean)
      : []
  const shippingType = readString(settings.free_shipping_type)

  return {
    merchant: {
      storeName: readString(merchant.store_name, merchant.name),
      storeType: readString(merchant.store_type),
      phone: readString(settings.phone, merchant.phone),
      welcomeMessage: readString(settings.welcome_message),
      freeShippingEnabled: readBoolean(settings.free_shipping_enabled),
      freeShippingType:
        shippingType === 'always' ||
        shippingType === 'item_count' ||
        shippingType === 'order_value'
          ? shippingType
          : 'order_value',
      freeShippingThreshold: readNumber(settings.free_shipping_threshold),
      pushNotifications: readBoolean(settings.push_notifications),
      username: readString(merchant.username, merchant.store_username).replace(
        /^@/,
        ''
      ),
    },
    assistant: {
      enabled: readBoolean(assistant.ai_enabled),
      botName: readString(assistant.bot_name) || 'المساعد الذكي',
      tone: readString(assistant.tone) || 'friendly',
      customRules: rules,
    },
    whatsapp: {
      enabled: readBoolean(whatsapp.enabled),
      phoneNumberId: readString(whatsapp.phone_number_id),
      hasAccessToken: readBoolean(whatsapp.has_access_token),
      accessTokenMasked: readString(whatsapp.access_token_masked),
      displayPhoneNumber: readString(whatsapp.display_phone_number),
      webhookUrl: readString(whatsapp.webhook_url),
      verifyToken: readString(whatsapp.verify_token),
    },
  }
}

export async function fetchStoreLogoSettings(): Promise<StoreLogoSettings> {
  const [configResult, merchantResult] = await Promise.all([
    authApiRequest('get_storefront_config', {}),
    authApiRequest('get_merchant_settings', {}),
  ])

  assertSuccess(
    configResult.status,
    configResult.message,
    'تعذر تحميل هوية المتجر.'
  )
  assertSuccess(
    merchantResult.status,
    merchantResult.message,
    'تعذر تحميل بيانات المتجر.'
  )

  const configData = asRecord(configResult.data)
  const config = asRecord(configData?.config)
  const merchant = asRecord(merchantResult.data)
  if (!config || !merchant) {
    throw new Error('صيغة بيانات هوية المتجر غير متوقعة.')
  }

  const identity = asRecord(config.store_identity) || {}
  const navigation = asRecord(config.navigation_settings) || {}
  const topBar = asRecord(navigation.top_bar) || {}
  const icon = readString(topBar.logo_icon)

  return {
    config,
    username: readString(merchant.username, merchant.store_username).replace(
      /^@/,
      ''
    ),
    logoUrl: readString(identity.logo_url, identity.logo),
    icon: STORE_LOGO_ICONS.some((option) => option.value === icon)
      ? icon
      : STORE_LOGO_ICONS[0].value,
  }
}

function validateStoreLogoSourceSize(file: File): void {
  if (!file.size || file.size > MAX_STORE_LOGO_SOURCE_BYTES) {
    throw new Error('يجب ألا يتجاوز حجم الصورة الأصلية 10 ميغابايت.')
  }
}

function isSafeStoreLogoUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === 'cdn.jsdelivr.net' &&
      url.pathname.startsWith('/gh/') &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

export async function uploadStoreLogo(
  file: File,
  onUploadProgress?: (progress: number) => void
): Promise<string> {
  validateStoreLogoSourceSize(file)
  const compressedImage = await compressDashboardImage(file, 0.8, 1024)
  if (
    compressedImage.type !== 'image/webp' ||
    compressedImage.size > MAX_STORE_LOGO_BYTES
  ) {
    throw new Error('تعذر ضغط الشعار إلى أقل من 1 ميغابايت.')
  }

  const payload = new FormData()
  payload.append('image_file', compressedImage, 'store-logo.webp')
  const result = onUploadProgress
    ? await authApiRequest('upload_store_logo', payload, onUploadProgress)
    : await authApiRequest('upload_store_logo', payload)
  const record = asRecord(result.data)
  const url = readString(result.url, record?.url)
  if (
    (result.status !== 'success' && result.status !== 'ok') ||
    !url ||
    !isSafeStoreLogoUrl(url)
  ) {
    throw new Error(result.message || 'تعذر رفع شعار المتجر بأمان.')
  }
  return url
}

export function updateStoreLogoConfig(
  currentConfig: ApiRecord,
  logoUrl: string,
  icon: string
): ApiRecord {
  if (!STORE_LOGO_ICONS.some((option) => option.value === icon)) {
    throw new Error('أيقونة الشعار المحددة غير صالحة.')
  }
  if (logoUrl && !isSafeStoreLogoUrl(logoUrl)) {
    throw new Error('رابط شعار المتجر غير آمن.')
  }

  const identity = asRecord(currentConfig.store_identity) || {}
  const navigation = asRecord(currentConfig.navigation_settings) || {}
  const topBar = asRecord(navigation.top_bar) || {}

  return {
    ...currentConfig,
    store_identity: {
      ...identity,
      logo: logoUrl,
      logo_url: logoUrl,
    },
    navigation_settings: {
      ...navigation,
      top_bar: {
        ...topBar,
        logo_icon: icon,
        show_logo_icon: true,
      },
    },
  }
}

export async function saveStoreLogoConfig(
  username: string,
  config: ApiRecord
): Promise<string> {
  if (!username) throw new Error('تعذر تحديد اسم المتجر لنشر الشعار.')
  return saveStorefrontConfig(username, config)
}

export async function saveMerchantSettings(
  merchant: MerchantSettings
): Promise<string> {
  const result = await authApiRequest('save_merchant_settings', {
    storeName: merchant.storeName.trim(),
    storeType: merchant.storeType || null,
    settings: {
      welcome_message: merchant.welcomeMessage.trim(),
      free_shipping_enabled: merchant.freeShippingEnabled,
      free_shipping_type: merchant.freeShippingType,
      free_shipping_threshold: merchant.freeShippingThreshold,
      push_notifications: merchant.pushNotifications,
    },
  })
  if (result.status !== 'success') {
    throw new Error(result.message || 'تعذر حفظ إعدادات المتجر.')
  }
  return result.message || ''
}

export async function saveAiAssistantSettings(
  assistant: AiAssistantSettings
): Promise<string> {
  const customRules = assistant.customRules
    .map((rule) => rule.trim())
    .filter(Boolean)
  if (customRules.length > 25) {
    throw new Error('الحد الأقصى 25 قاعدة مخصصة.')
  }
  if (customRules.some((rule) => rule.length > 200)) {
    throw new Error('يجب ألا يتجاوز طول كل قاعدة 200 حرف.')
  }
  const result = await authApiRequest('save_ai_assistant_config', {
    ai_enabled: assistant.enabled,
    bot_name: assistant.botName.trim() || 'المساعد الذكي',
    tone: assistant.tone,
    custom_rules: customRules,
  })
  if (result.status !== 'success') {
    throw new Error(result.message || 'تعذر حفظ إعدادات المساعد الذكي.')
  }
  return result.message || ''
}

export async function saveWhatsappSettings(
  whatsapp: WhatsappSettings,
  accessToken: string
): Promise<string> {
  if (whatsapp.enabled && !whatsapp.phoneNumberId.trim()) {
    throw new Error('أدخل Phone Number ID أولاً.')
  }
  const result = await authApiRequest('save_whatsapp_config', {
    enabled: whatsapp.enabled,
    phone_number_id: whatsapp.phoneNumberId.trim(),
    access_token: accessToken.trim(),
    display_phone_number: whatsapp.displayPhoneNumber.trim(),
  })
  if (result.status !== 'success') {
    throw new Error(result.message || 'تعذر حفظ إعدادات واتساب.')
  }
  return result.message || ''
}

export async function logoutMerchant(): Promise<void> {
  const result = await authApiRequest('logout', {})
  if (result.status !== 'success' && result.status !== 'ok') {
    throw new Error(result.message || 'تعذر إنهاء الجلسة بأمان.')
  }
}
