import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDashboardInitializationCache } from '@/features/dashboard/dashboard-data'
import {
  fetchMerchantOrderSignals,
  merchantBootstrapKey,
  merchantQueryKeys,
  refreshMerchantSnapshot,
} from './useMerchantRealtime'

describe('refreshMerchantSnapshot', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    clearDashboardInitializationCache()
    localStorage.setItem(
      'merchant_token',
      `header.${btoa(JSON.stringify({ user_id: 42 }))}.signature`
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              products: [{ id: 9, name: 'منتج', price: 99 }],
              orders: [
                {
                  id: 11,
                  customer_name: 'عميل',
                  status: 'pending_merchant_approval',
                },
              ],
              archivedOrders: [],
              categories: [{ id: 4, name: 'فئة', parent_id: 0 }],
              settings: { store_name: 'المتجر', username: 'shop' },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        )
      )
    )
    queryClient = new QueryClient()
  })

  afterEach(() => {
    queryClient.clear()
    clearDashboardInitializationCache()
    vi.unstubAllGlobals()
  })

  it('replaces product, order, category, and bootstrap caches with server data', async () => {
    await refreshMerchantSnapshot(queryClient, '42')

    expect(fetch).toHaveBeenCalledWith(
      '/api/work/api/merchant/bootstrap?refresh=1',
      expect.objectContaining({ method: 'GET', cache: 'no-store' })
    )
    expect(
      queryClient.getQueryData(merchantQueryKeys.products('42'))
    ).toMatchObject([{ id: '9', price: 99 }])
    expect(
      queryClient.getQueryData(merchantQueryKeys.orders('42', 'active'))
    ).toMatchObject([{ id: '11', customerName: 'عميل' }])
    expect(
      queryClient.getQueryData(merchantQueryKeys.categories('42'))
    ).toMatchObject([{ id: '4', name: 'فئة' }])
    expect(queryClient.getQueryData(merchantBootstrapKey('42'))).toMatchObject({
      dashboard: { products: [{ id: '9', price: 99 }] },
    })
  })
})

describe('fetchMerchantOrderSignals', () => {
  beforeEach(() => {
    vi.stubEnv(
      'VITE_FIREBASE_DB_URL',
      'https://example-default-rtdb.europe-west1.firebasedatabase.app/'
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 200 })))
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('connects directly to the merchant Firebase signal path', async () => {
    const signal = new AbortController().signal

    await fetchMerchantOrderSignals('merchant-42', signal)

    const fetchCalls = vi.mocked(fetch).mock.calls
    const [url, options] = fetchCalls[0] || []
    expect(String(url)).toBe(
      'https://example-default-rtdb.europe-west1.firebasedatabase.app/merchant_order_signals/merchant-42.json'
    )
    expect(options).toMatchObject({
      headers: { Accept: 'text/event-stream' },
      cache: 'no-store',
      credentials: 'omit',
      signal,
    })
    expect(String(url)).not.toContain('/api/work')
  })

  it('fails explicitly when Firebase URL is not configured', () => {
    vi.stubEnv('VITE_FIREBASE_DB_URL', '')

    expect(() =>
      fetchMerchantOrderSignals('merchant-42', new AbortController().signal)
    ).toThrow('عنوان Firebase غير مضبوط')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects insecure Firebase URLs', () => {
    vi.stubEnv('VITE_FIREBASE_DB_URL', 'http://firebase.example')

    expect(() =>
      fetchMerchantOrderSignals('merchant-42', new AbortController().signal)
    ).toThrow('عنوان Firebase غير صالح')
    expect(fetch).not.toHaveBeenCalled()
  })
})
