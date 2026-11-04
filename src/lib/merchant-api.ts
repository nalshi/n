const WORKER_ACTIONS = new Set([
  'save_product',
  'list_products',
  'get_public_products',
  'delete_product',
  'toggle_availability',
  'update_product_stock',
  'get_categories_tree',
  'create_category',
  'update_category',
  'delete_category',
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
  'get_ai_assistant_config',
  'save_ai_assistant_config',
  'get_whatsapp_config',
  'save_whatsapp_config',
  'upload_store_logo',
  'get_storefront_config',
  'save_storefront_config',
  'save_storefront_selection',
  'get_color_palettes',
  'apply_color_palette',
  'get_color_palette_admin',
  'save_color_palette_draft',
  'publish_color_palette',
  'set_product_sharing',
  'list_my_shared_products',
  'list_shared_product_catalog',
  'list_my_shared_product_imports',
  'import_shared_product',
  'trade_get_context',
  'trade_save_supplier_profile',
  'trade_list_marketplace',
  'trade_list_my_offers',
  'trade_save_offer',
  'trade_import_offer',
  'trade_list_imports',
  'trade_update_import_price',
  'trade_list_orders',
  'trade_update_supplier_order',
  'trade_admin_queue',
  'trade_review_item',
])
const LEGACY_API_ACTIONS = new Set([
  'check_phone',
  'login',
  'register_init',
  'register_verify',
  'recover_init',
  'recover_check_otp',
  'recover_set_password',
  'verify_new_device_otp',
  'resend_device_otp',
  'logout',
  'upload_image',
])
declare global {
  interface Window {
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
  category?: unknown
  data?: unknown
  products?: unknown
  product_id?: string
  already_imported?: boolean
  orders?: unknown
  accounts?: {
    merchant?: { name?: string }
    delivery?: { name?: string }
  }
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
  isWorkerCall: boolean,
  onUploadProgress?: (progress: number) => void
): Promise<ApiResult> {
  if (payload instanceof FormData && onUploadProgress) {
    if (!payload.has('action')) payload.append('action', action)
    if (!isWorkerCall && token) payload.set('auth_token', token)

    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest()
      request.open('POST', url)
      request.withCredentials = !isWorkerCall
      if (token) request.setRequestHeader('Authorization', `Bearer ${token}`)
      if (!isWorkerCall) {
        request.setRequestHeader('X-CSRF-TOKEN', csrfToken.current)
      }
      request.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && event.total > 0) {
          onUploadProgress(Math.round((event.loaded / event.total) * 100))
        }
      })
      request.addEventListener('load', () => {
        const newToken = request.getResponseHeader('X-New-CSRF-Token')
        if (newToken) csrfToken.current = newToken
        const rawText = request.responseText
        if (!rawText || rawText.includes('<html')) {
          reject(new Error('تعذر الاتصال بخادم نالش.'))
          return
        }

        let result: unknown
        try {
          const jsonStart = rawText.indexOf('{')
          const jsonEnd = rawText.lastIndexOf('}')
          if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error()
          result = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1))
        } catch {
          reject(new Error('أعاد الخادم استجابة غير صالحة.'))
          return
        }

        if (
          typeof result !== 'object' ||
          result === null ||
          !('status' in result) ||
          typeof result.status !== 'string'
        ) {
          reject(new Error('أعاد الخادم بيانات غير متوقعة.'))
          return
        }
        if (request.status >= 400 && request.status !== 429) {
          const message =
            'message' in result && typeof result.message === 'string'
              ? result.message
              : 'فشل الطلب إلى الخادم.'
          reject(new Error(message))
          return
        }
        onUploadProgress(100)
        resolve(result as ApiResult)
      })
      request.addEventListener('error', () =>
        reject(new Error('تعذر الاتصال بخادم نالش.'))
      )
      request.addEventListener('abort', () =>
        reject(new Error('تم إلغاء رفع الملف.'))
      )
      request.send(payload)
    })
  }

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
  csrfToken: { current: string },
  onUploadProgress?: (progress: number) => void
): Promise<ApiResult> {
  const token =
    typeof window === 'undefined'
      ? ''
      : localStorage.getItem('merchant_token') ||
        sessionStorage.getItem('merchant_token') ||
        ''
  const useWorker = WORKER_ACTIONS.has(action)
  const workerUrl = getWorkerApiUrl()

  if (useWorker) {
    return executeFetch(
      workerUrl,
      action,
      payload,
      csrfToken,
      token,
      true,
      onUploadProgress
    )
  }
  if (!LEGACY_API_ACTIONS.has(action)) {
    throw new Error(`إجراء API غير مسموح به: ${action}`)
  }

  return executeFetch(
    '/api/legacy',
    action,
    payload,
    csrfToken,
    token,
    false,
    onUploadProgress
  )
}
