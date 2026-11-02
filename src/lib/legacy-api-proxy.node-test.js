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
