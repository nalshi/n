import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './merchant-api'

const csrfToken = { current: 'csrf-initial' }
const mockedFetch = vi.fn<typeof fetch>()

function jsonResponse(
  data: unknown,
  options: { status?: number; headers?: Record<string, string> } = {}
) {
  return new Response(JSON.stringify(data), {
    status: options.status ?? 200,
    headers: options.headers,
  })
}

describe('merchant API transport', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    csrfToken.current = 'csrf-initial'
    vi.stubGlobal('fetch', mockedFetch)
    mockedFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete window.API_URL
    delete window.WORKER_API_URL
    delete window.CF_WORKER_URL
    delete window.CLOUDFLARE_WORKER_URL
  })

  it('uses the worker first and sends its token using the legacy worker contract', async () => {
    localStorage.setItem('merchant_token', 'merchant-token')
    mockedFetch.mockResolvedValue(jsonResponse({ status: 'success', data: [] }))

    await apiRequest('list_products', { page: 1 }, csrfToken)

    const [url, options] = mockedFetch.mock.calls[0]
    expect(url).toBe('/api/work/')
    expect(options?.credentials).toBe('omit')
    expect(new Headers(options?.headers).get('Authorization')).toBe(
      'Bearer merchant-token'
    )
    expect(new Headers(options?.headers).has('X-CSRF-TOKEN')).toBe(false)
    expect(JSON.parse(String(options?.body))).toEqual({
      action: 'list_products',
      page: 1,
    })
  })

  it('keeps Worker actions behind the secure proxy when the Worker is unavailable', async () => {
    localStorage.setItem('merchant_token', 'merchant-token')
    mockedFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(
      apiRequest('list_products', { page: 1 }, csrfToken)
    ).rejects.toThrow('Failed to fetch')

    expect(mockedFetch).toHaveBeenCalledOnce()
    expect(mockedFetch.mock.calls[0][0]).toBe('/api/work/')
    expect(mockedFetch.mock.calls[0][1]?.credentials).toBe('omit')
  })

  it('keeps order synchronization on the Worker without falling back to api.php', async () => {
    localStorage.setItem('merchant_token', 'merchant-token')
    mockedFetch.mockRejectedValue(new TypeError('Worker unavailable'))

    await expect(
      apiRequest('get_orders', { filter: 'active' }, csrfToken)
    ).rejects.toThrow('Worker unavailable')

    expect(mockedFetch).toHaveBeenCalledOnce()
    expect(mockedFetch.mock.calls[0][0]).toBe('/api/work/')
  })

  it('routes store logo uploads through /api/work instead of api.php', async () => {
    localStorage.setItem('merchant_token', 'merchant-token')
    mockedFetch.mockResolvedValue(jsonResponse({ status: 'success' }))
    const payload = new FormData()
    payload.set(
      'image_file',
      new File(['logo'], 'logo.webp', { type: 'image/webp' })
    )

    await apiRequest('upload_store_logo', payload, csrfToken)

    const [url, options] = mockedFetch.mock.calls[0]
    expect(url).toBe('/api/work/')
    expect(options?.credentials).toBe('omit')
    expect(payload.get('action')).toBe('upload_store_logo')
  })

  it('does not fall back for legacy no-fallback actions', async () => {
    mockedFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(
      apiRequest('publish_color_palette', {}, csrfToken)
    ).rejects.toThrow('Failed to fetch')

    expect(mockedFetch).toHaveBeenCalledTimes(1)
  })

  it('uses api.php directly for actions outside the worker action set', async () => {
    mockedFetch.mockResolvedValue(jsonResponse({ status: 'success' }))

    await apiRequest('login', { phone: '771234567' }, csrfToken)

    const [url, options] = mockedFetch.mock.calls[0]
    expect(url).toBe('https://api.nalsh.dpdns.org/api.php')
    expect(options?.credentials).toBe('include')
  })

  it('reports real upload progress for multipart Worker requests', async () => {
    const xhrInstances: Array<{ openedUrl: string }> = []

    class MockXhr extends EventTarget {
      upload = new EventTarget()
      withCredentials = false
      status = 200
      responseText = JSON.stringify({ status: 'success', id: 'product-1' })
      sentBody: FormData | null = null
      openedUrl = ''

      constructor() {
        super()
        xhrInstances.push(this)
      }

      open(_method: string, url: string) {
        this.openedUrl = url
      }

      setRequestHeader() {}

      getResponseHeader() {
        return null
      }

      send(body: XMLHttpRequestBodyInit | Document | null) {
        if (body instanceof FormData) this.sentBody = body
        const progress = new Event('progress')
        Object.defineProperties(progress, {
          lengthComputable: { value: true },
          loaded: { value: 50 },
          total: { value: 100 },
        })
        this.upload.dispatchEvent(progress)
        this.dispatchEvent(new Event('load'))
      }
    }
    vi.stubGlobal('XMLHttpRequest', MockXhr)
    const progress: number[] = []
    const payload = new FormData()
    payload.set('name', 'منتج')

    await expect(
      apiRequest('upload_store_logo', payload, csrfToken, (value) =>
        progress.push(value)
      )
    ).resolves.toMatchObject({ status: 'success', id: 'product-1' })

    expect(xhrInstances[0]?.openedUrl).toBe('/api/work/')
    expect(progress).toEqual([50, 100])
    expect(payload.get('action')).toBe('upload_store_logo')
  })
})
