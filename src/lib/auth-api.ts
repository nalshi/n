import { apiRequest } from '@/lib/merchant-api'

const csrfToken = { current: '' }

const readCacheTtl = new Map<string, number>([
  ['get_merchant_settings', 5 * 60_000],
  ['list_products', 5 * 60_000],
  ['get_orders', 15_000],
  ['get_categories_tree', 5 * 60_000],
  ['get_ai_assistant_config', 5 * 60_000],
  ['get_whatsapp_config', 5 * 60_000],
  ['get_storefront_config', 5 * 60_000],
  ['get_storefront_themes', 30 * 60_000],
  ['get_storefront_base_config', 30 * 60_000],
  ['get_storefront_theme_config', 30 * 60_000],
])

const readCache = new Map<
  string,
  {
    expiresAt: number
    request: Promise<Awaited<ReturnType<typeof apiRequest>>>
  }
>()
let activeAuthScope = ''

function authScope() {
  if (typeof window === 'undefined') return ''
  return (
    localStorage.getItem('merchant_token') ||
    sessionStorage.getItem('merchant_token') ||
    ''
  )
}

export function clearAuthApiCache() {
  readCache.clear()
}

export function authApiRequest(
  action: string,
  payload: Record<string, unknown> | FormData,
  onUploadProgress?: (progress: number) => void
) {
  const scope = authScope()
  if (scope !== activeAuthScope) {
    clearAuthApiCache()
    activeAuthScope = scope
  }

  const ttl = payload instanceof FormData ? undefined : readCacheTtl.get(action)
  if (ttl === undefined) {
    const request = onUploadProgress
      ? apiRequest(action, payload, csrfToken, onUploadProgress)
      : apiRequest(action, payload, csrfToken)
    return request.then((result) => {
      if (result.status === 'success' || result.status === 'ok') {
        clearAuthApiCache()
      }
      return result
    })
  }

  const cacheKey = JSON.stringify([action, payload])
  const cached = readCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.request

  const request = apiRequest(action, payload, csrfToken).then(
    (result) => {
      if (result.status !== 'success' && result.status !== 'ok') {
        if (readCache.get(cacheKey)?.request === request) {
          readCache.delete(cacheKey)
        }
      }
      return result
    },
    (error: unknown) => {
      if (readCache.get(cacheKey)?.request === request) {
        readCache.delete(cacheKey)
      }
      throw error
    }
  )
  readCache.set(cacheKey, { expiresAt: Date.now() + ttl, request })
  return request
}
