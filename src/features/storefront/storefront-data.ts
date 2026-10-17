import { authApiRequest } from '@/lib/auth-api'

type ApiRecord = Record<string, unknown>

export type StorefrontTheme = {
  id: string
  name: string
  description: string
  category: string
  sourceFile: string
  preview: {
    primary: string
    accent: string
    background: string
    dark: {
      primary: string
      accent: string
      background: string
    }
  }
  config?: ApiRecord
}

export type StorefrontLibrary = {
  themes: StorefrontTheme[]
  config: ApiRecord
  username: string
  storeName: string
  phone: string
  slogan: string
  selectedThemeId: string
  selectedMode: 'light' | 'dark' | ''
}

const THEME_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/
const THEME_FILE_PATTERN =
  /^\/templates\/(?:themes\/)?[a-z0-9][a-z0-9_-]{0,79}\.json$/

export const storefrontLibraryQueryKey = (merchantId: string) =>
  ['merchant-storefront-library', merchantId] as const

function asRecord(value: unknown): ApiRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as ApiRecord)
    : null
}

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function safeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback
}

function normalizeTheme(candidate: unknown): StorefrontTheme | null {
  const theme = asRecord(candidate)
  if (
    !theme ||
    typeof theme.id !== 'string' ||
    !THEME_ID_PATTERN.test(theme.id) ||
    !nonEmptyString(theme.name)
  ) {
    return null
  }
  const sourceFile = nonEmptyString(theme.sourceFile)
  if (sourceFile && !THEME_FILE_PATTERN.test(sourceFile)) return null

  const preview = asRecord(theme.preview) || {}
  const darkPreview = asRecord(preview.dark) || {}
  const config = asRecord(theme.config)
  return {
    id: theme.id,
    name: nonEmptyString(theme.name),
    description: nonEmptyString(theme.description),
    category: nonEmptyString(theme.category),
    sourceFile,
    preview: {
      primary: safeColor(preview.primary, '#4F46E5'),
      accent: safeColor(preview.accent, '#06B6D4'),
      background: safeColor(preview.background, '#F8FAFC'),
      dark: {
        primary: safeColor(darkPreview.primary, '#6D28D9'),
        accent: safeColor(darkPreview.accent, '#0891B2'),
        background: safeColor(darkPreview.background, '#111827'),
      },
    },
    ...(config ? { config } : {}),
  }
}

function readThemeRows(value: unknown): StorefrontTheme[] {
  const record = asRecord(value)
  const data = asRecord(record?.data)
  const rows = Array.isArray(value)
    ? value
    : Array.isArray(record?.items)
      ? record.items
      : Array.isArray(record?.themes)
        ? record.themes
        : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.themes)
            ? data.themes
            : Array.isArray(data?.data)
              ? data.data
              : null
  if (!rows) throw new Error('صيغة مكتبة القوالب غير متوقعة.')
  const themes = rows
    .map(normalizeTheme)
    .filter((theme): theme is StorefrontTheme => theme !== null)
  if (!themes.length) throw new Error('لا توجد قوالب صالحة في المكتبة.')
  return themes
}

async function loadThemes(): Promise<StorefrontTheme[]> {
  const result = await authApiRequest('get_storefront_themes', {})
  if (result.status !== 'success' && result.status !== 'ok') {
    throw new Error(result.message || 'تعذر تحميل مكتبة القوالب.')
  }
  return readThemeRows(result)
}

export async function fetchStorefrontLibrary(): Promise<StorefrontLibrary> {
  const [themes, configResult, settingsResult] = await Promise.all([
    loadThemes(),
    authApiRequest('get_storefront_config', {}),
    authApiRequest('get_merchant_settings', {}),
  ])

  if (configResult.status !== 'success' && configResult.status !== 'ok') {
    throw new Error(configResult.message || 'تعذر تحميل إعدادات المتجر.')
  }
  if (settingsResult.status !== 'success' && settingsResult.status !== 'ok') {
    throw new Error(settingsResult.message || 'تعذر تحميل بيانات حساب المتجر.')
  }

  const configData = asRecord(configResult.data)
  const config = asRecord(configData?.config) || {}
  const settings = asRecord(settingsResult.data)
  const username = nonEmptyString(
    settings?.username || settings?.store_username
  ).replace(/^@/, '')
  const merchantSettings = asRecord(settings?.settings) || {}
  const selection = asRecord(config.theme_selection) || {}
  const modeValue =
    nonEmptyString(config.default_theme_mode) ||
    nonEmptyString(config.theme_mode) ||
    nonEmptyString(selection.theme_mode)
  const selectedMode =
    modeValue === 'light' || modeValue === 'dark' ? modeValue : ''
  const selectedThemeId =
    nonEmptyString(config.theme_name) ||
    nonEmptyString(selection[selectedMode || 'light']) ||
    nonEmptyString(selection.theme_id) ||
    nonEmptyString(selection.theme)

  return {
    themes,
    config,
    username,
    storeName: nonEmptyString(
      settings?.store_name || settings?.name || merchantSettings.store_name
    ),
    phone: nonEmptyString(
      settings?.phone || merchantSettings.phone || merchantSettings.whatsapp
    ),
    slogan: nonEmptyString(
      merchantSettings.welcome_message || merchantSettings.bio
    ),
    selectedThemeId: THEME_ID_PATTERN.test(selectedThemeId)
      ? selectedThemeId
      : '',
    selectedMode,
  }
}

export async function loadStorefrontThemeConfig(
  theme: StorefrontTheme
): Promise<ApiRecord> {
  if (theme.config) return theme.config
  if (!THEME_ID_PATTERN.test(theme.id)) {
    throw new Error('معرّف القالب غير صالح.')
  }
  const result = await authApiRequest('get_storefront_theme_config', {
    id: theme.id,
  })
  if (result.status !== 'success' && result.status !== 'ok') {
    throw new Error(result.message || 'تعذر تحميل إعدادات القالب.')
  }
  const data = asRecord(result.data)
  const config = asRecord(data?.config)
  if (data?.id !== theme.id || !config) {
    throw new Error('ملف القالب لا يطابق القالب المحدد أو إعداداته غير صالحة.')
  }
  return config
}

export async function loadBaseStorefrontConfig(
  _savedConfig: ApiRecord
): Promise<ApiRecord> {
  const result = await authApiRequest('get_storefront_base_config', {})
  if (result.status !== 'success' && result.status !== 'ok') {
    throw new Error(result.message || 'تعذر تحميل إعدادات القالب الأساسية.')
  }
  const data = asRecord(result.data)
  const config = asRecord(data?.config)
  if (!config) throw new Error('صيغة إعدادات القالب الأساسية غير صالحة.')
  return config
}

export function mergeStorefrontConfig(
  target: ApiRecord,
  source: ApiRecord
): ApiRecord {
  Object.entries(source).forEach(([key, value]) => {
    const sourceRecord = asRecord(value)
    if (sourceRecord) {
      const targetRecord = asRecord(target[key])
      target[key] = mergeStorefrontConfig(
        targetRecord ? { ...targetRecord } : {},
        sourceRecord
      )
    } else {
      target[key] = value
    }
  })
  return target
}

export async function saveStorefrontConfig(
  username: string,
  config: ApiRecord
): Promise<string> {
  const result = await authApiRequest('save_storefront_config', {
    config,
    merchant_username: username,
  })
  if (result.status !== 'success') {
    throw new Error(result.message || 'تعذر نشر مظهر المتجر.')
  }
  return result.message || ''
}
