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

const STOREFRONT_PUBLIC_BASE = 'https://appi.dpdns.org'

async function getJson(path: string): Promise<unknown> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  // Try the storefront public base first (works cross-origin), then fall back
  // to a relative path (works when dashboard is served from the same origin).
  const urls = [
    `${STOREFRONT_PUBLIC_BASE}${normalizedPath}`,
    normalizedPath,
  ]

  let lastError: unknown = null
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      })
      if (response.ok) {
        return (await response.json()) as unknown
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`تعذر قراءة ملف المتجر (${normalizedPath}).`)
}

async function loadThemes(): Promise<StorefrontTheme[]> {
  try {
    const catalog = await getJson('/templates/themes.json')
    // themes.json structure: { version, count, items: [...] }
    // readThemeRows handles both array and object-with-items forms.
    return readThemeRows(catalog)
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'تعذر تحميل مكتبة القوالب من ملف المتجر.'
    )
  }
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
  const sourcePath =
    theme.sourceFile && THEME_FILE_PATTERN.test(theme.sourceFile)
      ? theme.sourceFile
      : `/templates/themes/${theme.id}.json`

  const file = asRecord(await getJson(sourcePath))
  const config = asRecord(file?.config)
  if (file?.id !== theme.id || !config) {
    throw new Error('ملف القالب لا يطابق القالب المحدد أو إعداداته غير صالحة.')
  }
  return config
}

export async function loadBaseStorefrontConfig(
  savedConfig: ApiRecord
): Promise<ApiRecord> {
  try {
    const config = asRecord(await getJson('/theme-config.json'))
    if (!config) throw new Error('صيغة إعدادات القالب الأساسية غير صالحة.')
    return config
  } catch (error) {
    if (Object.keys(savedConfig).length) return savedConfig
    throw error
  }
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
