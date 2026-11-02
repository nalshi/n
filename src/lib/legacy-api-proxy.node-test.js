import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { onRequest } from '../../functions/api/legacy.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('proxies only allowlisted legacy actions and rewrites upstream cookie domains', async () => {
  let requestedUrl
  let requestOptions
  globalThis.fetch = async (url, options) => {
    requestedUrl = url
    requestOptions = options
    return new Response(JSON.stringify({ status: 'success' }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie':
          'PHPSESSID=session-value; Domain=api.nalsh.dpdns.org; Path=/; HttpOnly; Secure; SameSite=Lax',
      },
    })
  }

  const response = await onRequest({
    request: new Request('https://dashboard.example/api/legacy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'existing=session',
        Origin: 'https://dashboard.example',
        'X-CSRF-TOKEN': 'csrf-value',
      },
      body: JSON.stringify({ action: 'login', phone: '771234567' }),
    }),
  })

  assert.equal(requestedUrl, 'https://api.nalsh.dpdns.org/api.php')
  assert.equal(requestOptions.method, 'POST')
  assert.equal(requestOptions.headers.get('Cookie'), 'existing=session')
  assert.equal(requestOptions.headers.get('X-CSRF-TOKEN'), 'csrf-value')
  assert.equal(response.status, 200)
  assert.match(
    response.headers.get('Set-Cookie') || '',
    /PHPSESSID=session-value/
  )
  assert.doesNotMatch(response.headers.get('Set-Cookie') || '', /Domain=/i)
})

<<<<<<< HEAD
test('proxies device verification and new-account OTP actions', async () => {
  const proxiedActions = []
  globalThis.fetch = async (_url, options) => {
    proxiedActions.push(
      JSON.parse(new TextDecoder().decode(options.body)).action
    )
    return new Response(JSON.stringify({ status: 'success' }))
  }

  for (const action of [
    'verify_new_device_otp',
    'resend_device_otp',
    'register_verify',
  ]) {
    const response = await onRequest({
      request: new Request('https://dashboard.example/api/legacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, otp: '123456' }),
      }),
    })
    assert.equal(response.status, 200)
  }

  assert.deepEqual(proxiedActions, [
    'verify_new_device_otp',
    'resend_device_otp',
    'register_verify',
  ])
})

=======
>>>>>>> 6afa680cf0e9b5a81df5149da2d5573b93e6ea27
test('rejects unknown legacy actions without contacting the PHP origin', async () => {
  let contactedOrigin = false
  globalThis.fetch = async () => {
    contactedOrigin = true
    return new Response('{}')
  }

  const response = await onRequest({
    request: new Request('https://dashboard.example/api/legacy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'arbitrary_proxy_target' }),
    }),
  })

  assert.equal(response.status, 403)
  assert.equal(contactedOrigin, false)
})

test('rejects unsupported methods', async () => {
  const response = await onRequest({
    request: new Request('https://dashboard.example/api/legacy', {
      method: 'GET',
    }),
  })
  assert.equal(response.status, 405)
<<<<<<< HEAD
  assert.equal(response.headers.get('Allow'), 'POST, OPTIONS')
  assert.deepEqual(await response.json(), {
    status: 'error',
    message: 'هذه البوابة تقبل طلبات POST فقط.',
  })
})

test('accepts preflight checks for same-origin-compatible request headers', async () => {
  const response = await onRequest({
    request: new Request('https://dashboard.example/api/legacy', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://dashboard.example',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-csrf-token',
      },
    }),
  })
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('Allow'), 'POST, OPTIONS')
  assert.match(
    response.headers.get('Access-Control-Allow-Headers') || '',
    /X-CSRF-TOKEN/
  )
=======
>>>>>>> 6afa680cf0e9b5a81df5149da2d5573b93e6ea27
})

test('rejects cross-origin browser requests', async () => {
  const response = await onRequest({
    request: new Request('https://dashboard.example/api/legacy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://attacker.example',
      },
      body: JSON.stringify({ action: 'login' }),
    }),
  })
  assert.equal(response.status, 403)
})
