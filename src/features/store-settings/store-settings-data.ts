import { authApiRequest } from '@/lib/auth-api'

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

export async function saveMerchantSettings(
  merchant: MerchantSettings
): Promise<string> {
  const result = await authApiRequest('save_merchant_settings', {
    storeName: merchant.storeName.trim(),
    storeType: merchant.storeType || null,
    settings: {
      phone: merchant.phone.trim(),
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
