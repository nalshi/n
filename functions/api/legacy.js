const LEGACY_API_ENDPOINT = 'https://api.nalsh.dpdns.org/api.php'
const ALLOWED_ACTIONS = new Set([
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
const MAX_BODY_BYTES = 12 * 1024 * 1024

function jsonResponse(status, message) {
  return new Response(JSON.stringify({ status: 'error', message }), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export async function onRequestPost({ request }) {
  const origin = request.headers.get('Origin')
  if (origin && origin !== new URL(request.url).origin) {
    return jsonResponse(403, 'مصدر الطلب غير مسموح به.')
  }

  const contentType = request.headers.get('Content-Type') || ''
  const isJson = contentType.toLowerCase().includes('application/json')
  const isMultipart = contentType.toLowerCase().includes('multipart/form-data')
  if (!isJson && !isMultipart) {
    return jsonResponse(415, 'نوع محتوى الطلب غير مدعوم.')
  }

  const declaredLength = Number(request.headers.get('Content-Length') || 0)
  if (declaredLength > MAX_BODY_BYTES) {
    return jsonResponse(413, 'حجم البيانات المرسلة تجاوز الحد المسموح.')
  }

  const bodyForValidation = request.clone()
  let body
  try {
    body = await request.arrayBuffer()
  } catch {
    return jsonResponse(400, 'تعذر قراءة بيانات الطلب.')
  }
  if (body.byteLength > MAX_BODY_BYTES) {
    return jsonResponse(413, 'حجم البيانات المرسلة تجاوز الحد المسموح.')
  }

  let action
  try {
    if (isMultipart) {
      action = (await bodyForValidation.formData()).get('action')
    } else {
      const payload = await bodyForValidation.json()
      action =
        typeof payload === 'object' && payload !== null ? payload.action : null
    }
  } catch {
    return jsonResponse(400, 'صيغة بيانات الطلب غير صالحة.')
  }
  if (typeof action !== 'string' || !ALLOWED_ACTIONS.has(action)) {
    return jsonResponse(403, 'إجراء API غير مسموح به عبر هذه البوابة.')
  }

  const headers = new Headers()
  for (const name of [
    'Accept',
    'Authorization',
    'Content-Type',
    'Cookie',
    'Origin',
    'X-CSRF-TOKEN',
    'X-Requested-With',
  ]) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  const clientIp = request.headers.get('CF-Connecting-IP')
  if (clientIp) headers.set('X-Forwarded-For', clientIp)

  let upstream
  try {
    upstream = await fetch(LEGACY_API_ENDPOINT, {
      method: 'POST',
      headers,
      body,
    })
  } catch (error) {
    console.error('Cloudflare legacy API proxy failed:', error)
    return jsonResponse(502, 'تعذر الاتصال بخادم الخدمة.')
  }

  const responseHeaders = new Headers(upstream.headers)
  responseHeaders.delete('Access-Control-Allow-Origin')
  responseHeaders.delete('Location')
  responseHeaders.set('Cache-Control', 'no-store')
  responseHeaders.set('X-Content-Type-Options', 'nosniff')

  const setCookies = upstream.headers.getSetCookie()
  if (setCookies.length > 0) {
    responseHeaders.delete('Set-Cookie')
    for (const cookie of setCookies) {
      responseHeaders.append(
        'Set-Cookie',
        cookie.replace(/;\s*domain=[^;]*/i, '')
      )
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        Allow: 'POST, OPTIONS',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'Authorization, Content-Type, X-CSRF-TOKEN, X-Requested-With',
        'Access-Control-Max-Age': '600',
        'Cache-Control': 'no-store',
      },
    })
  }
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({
        status: 'error',
        message: 'هذه البوابة تقبل طلبات POST فقط.',
      }),
      {
        status: 405,
        headers: {
          Allow: 'POST, OPTIONS',
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        },
      }
    )
  }
  return onRequestPost({ request })
}
