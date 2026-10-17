const API_URL = 'https://api.nalsh.dpdns.org/api.php'
const WORKER_ACTIONS = new Set([
  'save_product',
  'list_products',
  'get_public_products',
  'delete_product',
  'toggle_availability',
  'get_categories_tree',
  'get_merchant_settings',
  'save_merchant_settings',
  'get_merchant_orders',
  'get_orders',
  'update_order_status',
  'cancel_order',
  'confirm_delivery_code',
  'add_to_cart',
  'get_cart',
  'create_order',
  'save_fcm_token',
  'get_firebase_config',
  'get_merchant_realtime_config',
  'get_ai_assistant_config',
  'save_ai_assistant_config',
  'get_whatsapp_config',
  'save_whatsapp_config',
  'get_storefront_config',
  'save_storefront_config',
  'get_storefront_themes',
  'save_storefront_selection',
  'get_color_palettes',
  'apply_color_palette',
  'get_color_palette_admin',
  'save_color_palette_draft',
  'publish_color_palette',
])
const WORKER_NO_FALLBACK_ACTIONS = new Set([
  'get_merchant_realtime_config',
  'save_storefront_selection',
  'apply_color_palette',
  'get_color_palette_admin',
  'save_color_palette_draft',
  'publish_color_palette',
])

declare global {
  interface Window {
    API_URL?: string
    WORKER_API_URL?: string
    CF_WORKER_URL?: string
    CLOUDFLARE_WORKER_URL?: string
  }
}

export type ApiResult = {
  status: string
  message?: string
  token?: string
  redirect?: string
  state_token?: string
  name?: string
  id?: string | number
  url?: string
  data?: unknown
  databaseUrl?: string
  products?: unknown
  orders?: unknown
  accounts?: {
    merchant?: { name?: string }
    delivery?: { name?: string }
  }
}

function getApiUrl() {
  return typeof window === 'undefined' ? API_URL : window.API_URL || API_URL
}

export function getWorkerApiUrl() {
  if (typeof window === 'undefined') return '/api/work/'
  const configured =
    window.WORKER_API_URL ||
    window.CF_WORKER_URL ||
    window.CLOUDFLARE_WORKER_URL
  if (typeof configured !== 'string' || !configured.trim()) {
    return '/api/work/'
  }

  const value = configured.trim()
  if (value === '/api/work' || value === '/api/work/') {
    return '/api/work/'
  }
  if (value.includes('://')) {
    const normalized = value.replace(/\/$/, '')
    return normalized.endsWith('/api/work')
      ? `${normalized}/`
      : `${normalized}/api/work/`
  }
  return value.endsWith('/') ? value : `${value}/`
}

async function executeFetch(
  url: string,
  action: string,
  payload: Record<string, unknown> | FormData,
  csrfToken: { current: string },
  token: string,
  isWorkerCall: boolean
): Promise<ApiResult> {
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  if (!isWorkerCall) headers['X-CSRF-TOKEN'] = csrfToken.current

  let body: BodyInit
  if (payload instanceof FormData) {
    if (!payload.has('action')) payload.append('action', action)
    if (!isWorkerCall && token) payload.set('auth_token', token)
    body = payload
  } else {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify({
      action,
      ...(isWorkerCall || !token ? {} : { auth_token: token }),
      ...payload,
    })
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    credentials: isWorkerCall ? 'omit' : 'include',
    body,
  })

  const newToken = response.headers.get('X-New-CSRF-Token')
  if (newToken) csrfToken.current = newToken

  const rawText = await response.text()
  if (!rawText || rawText.includes('<html')) {
    throw new Error('تعذر الاتصال بخادم نالش.')
  }

  let result: unknown
  try {
    const jsonStart = rawText.indexOf('{')
    const jsonEnd = rawText.lastIndexOf('}')
    if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error()
    result = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1))
  } catch {
    throw new Error('أعاد الخادم استجابة غير صالحة.')
  }

  if (
    typeof result !== 'object' ||
    result === null ||
    !('status' in result) ||
    typeof result.status !== 'string'
  ) {
    throw new Error('أعاد الخادم بيانات غير متوقعة.')
  }

  if (!response.ok && response.status !== 429) {
    const message =
      'message' in result && typeof result.message === 'string'
        ? result.message
        : 'فشل الطلب إلى الخادم.'
    throw new Error(message)
  }

  return result as ApiResult
}

export async function apiRequest(
  action: string,
  payload: Record<string, unknown> | FormData,
  csrfToken: { current: string }
): Promise<ApiResult> {
  const token =
    typeof window === 'undefined'
      ? ''
      : localStorage.getItem('merchant_token') ||
        sessionStorage.getItem('merchant_token') ||
        ''
  const apiUrl = getApiUrl()
  const useWorker = WORKER_ACTIONS.has(action)
  const workerUrl = getWorkerApiUrl()

  if (!useWorker) {
    return executeFetch(apiUrl, action, payload, csrfToken, token, false)
  }

  try {
    return await executeFetch(
      workerUrl,
      action,
      payload,
      csrfToken,
      token,
      true
    )
  } catch (workerError) {
    if (workerUrl === apiUrl || WORKER_NO_FALLBACK_ACTIONS.has(action)) {
      throw workerError
    }
    return executeFetch(apiUrl, action, payload, csrfToken, token, false)
  }
}
