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

  describe('fetchMerchantOrderSignals', () => {
    beforeEach(() => {
      localStorage.setItem('merchant_token', 'merchant-session-token')
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(new Response('', { status: 200 })))
      )
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('connects through the same-origin work proxy using the merchant session', async () => {
      const signal = new AbortController().signal

      await fetchMerchantOrderSignals(signal)

      expect(fetch).toHaveBeenCalledWith(
        '/api/work/merchant/order-signals',
        expect.objectContaining({
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${localStorage.getItem('merchant_token')}`,
          },
          cache: 'no-store',
          credentials: 'same-origin',
          signal,
        })
      )
      const fetchCalls = vi.mocked(fetch).mock.calls
      expect(String(fetchCalls[fetchCalls.length - 1]?.[0])).not.toContain(
        'firebase'
      )
    })

    it('does not open the realtime stream without a merchant session', async () => {
      localStorage.removeItem('merchant_token')
      sessionStorage.removeItem('merchant_token')

      expect(() =>
        fetchMerchantOrderSignals(new AbortController().signal)
      ).toThrow('انتهت جلسة التاجر.')
      expect(fetch).not.toHaveBeenCalled()
    })
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
