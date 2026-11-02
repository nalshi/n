import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getMerchantLocalDB,
  hydrateFromSnapshot,
  type MerchantLocalDB,
} from '@/lib/db'
import {
  clearDashboardInitializationCache,
  type DashboardData,
  type DashboardOrder,
} from '@/features/dashboard/dashboard-data'
import {
  applyMerchantEvent,
  fetchMerchantOrderSignals,
  merchantBootstrapKey,
  merchantQueryKeys,
  removeMerchantProductFromCache,
  refreshMerchantSnapshot,
<<<<<<< HEAD
  updateMerchantCategoriesCache,
=======
>>>>>>> 6afa680cf0e9b5a81df5149da2d5573b93e6ea27
  updateMerchantProductCache,
  updateMerchantOrderStatusCache,
} from './useMerchantRealtime'

describe('refreshMerchantSnapshot', () => {
  let queryClient: QueryClient
  let localDatabase: MerchantLocalDB
  let merchantId: string

  beforeEach(() => {
    clearDashboardInitializationCache()
    merchantId = `snapshot-${crypto.randomUUID()}`
    localStorage.setItem(
      'merchant_token',
      `header.${btoa(JSON.stringify({ user_id: merchantId }))}.signature`
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
    localDatabase = getMerchantLocalDB(merchantId)
  })

  afterEach(async () => {
    queryClient.clear()
    clearDashboardInitializationCache()
    vi.unstubAllGlobals()
    localDatabase.close()
    await localDatabase.delete()
  })

  it('replaces product, order, category, and bootstrap caches with server data', async () => {
<<<<<<< HEAD
    await localDatabase.categories.put({
      id: 'stale-category',
      name: 'فئة قديمة',
      parentId: '',
    })
=======
>>>>>>> 6afa680cf0e9b5a81df5149da2d5573b93e6ea27
    await refreshMerchantSnapshot(queryClient, merchantId)

    expect(fetch).toHaveBeenCalledWith(
      '/api/work/api/merchant/bootstrap?refresh=1',
      expect.objectContaining({ method: 'GET', cache: 'no-store' })
    )
    expect(
      queryClient.getQueryData(merchantQueryKeys.products(merchantId))
    ).toMatchObject([{ id: '9', price: 99 }])
    expect(
      queryClient.getQueryData(merchantQueryKeys.orders(merchantId, 'active'))
    ).toMatchObject([{ id: '11', customerName: 'عميل' }])
    expect(
      queryClient.getQueryData(merchantQueryKeys.categories(merchantId))
    ).toMatchObject([{ id: '4', name: 'فئة' }])
<<<<<<< HEAD
    expect(await localDatabase.categories.toArray()).toMatchObject([
      { id: '4', name: 'فئة' },
    ])
=======
>>>>>>> 6afa680cf0e9b5a81df5149da2d5573b93e6ea27
    expect(
      queryClient.getQueryData(merchantBootstrapKey(merchantId))
    ).toMatchObject({ dashboard: { products: [{ id: '9', price: 99 }] } })
  })

  describe('applyMerchantEvent', () => {
    let queryClient: QueryClient
    let merchantId: string
    let localDatabase: MerchantLocalDB

    beforeEach(async () => {
      merchantId = `realtime-${crypto.randomUUID()}`
      queryClient = new QueryClient()
      localDatabase = getMerchantLocalDB(merchantId)
      await hydrateFromSnapshot({
        merchantId,
        orders: [],
        products: [
          {
            id: 'product-1',
            productNumber: '',
            name: 'قبل التحديث',
            description: '',
            type: '',
            categoryId: '',
            image: '',
            price: 10,
            costPrice: 0,
            discount: 0,
            currency: 'YER',
            createdAt: '',
            quantity: 0,
            quantityType: 'tracked',
            isAvailable: true,
            approvalStatus: '',
            options: [],
          },
        ],
        categories: [],
        lastEventId: 1,
        lastTimestamp: 1,
      })
      queryClient.setQueryData(merchantQueryKeys.products(merchantId), [
        {
          id: 'product-1',
          productNumber: '',
          name: 'قبل التحديث',
          description: '',
          type: '',
          categoryId: '',
          image: '',
          price: 10,
          costPrice: 0,
          discount: 0,
          currency: 'YER',
          createdAt: '',
          quantity: 0,
          quantityType: 'tracked',
          isAvailable: true,
          approvalStatus: '',
          options: [],
        },
      ])
    })

    afterEach(async () => {
      queryClient.clear()
      localDatabase.close()
      await localDatabase.delete()
    })

    it('removes deleted products from both the query cache and durable local store', async () => {
      await applyMerchantEvent(queryClient, merchantId, {
        eventId: 2,
        timestamp: 2,
        type: 'product',
        action: 'deleted',
        entityId: 'product-1',
        scope: 'active',
        data: { id: 'product-1' },
      })

      expect(
        queryClient.getQueryData(merchantQueryKeys.products(merchantId))
      ).toEqual([])
      expect(await localDatabase.products.get('product-1')).toBeUndefined()
    })

    it('writes product updates to durable local storage before broadcasting them', async () => {
      await applyMerchantEvent(queryClient, merchantId, {
        eventId: 2,
        timestamp: 2,
        type: 'product',
        action: 'updated',
        entityId: 'product-1',
        scope: 'active',
        data: { id: 'product-1', name: 'بعد التحديث', price: 15 },
      })

      expect(await localDatabase.products.get('product-1')).toMatchObject({
        name: 'بعد التحديث',
        price: 15,
      })
      expect(
        queryClient.getQueryData(merchantQueryKeys.products(merchantId))
      ).toMatchObject([{ id: 'product-1', name: 'بعد التحديث', price: 15 }])
    })

<<<<<<< HEAD
    it('replaces category data in the query and durable local caches', async () => {
      await localDatabase.categories.put({
        id: 'stale-category',
        name: 'فئة قديمة',
        parentId: '',
      })

      await updateMerchantCategoriesCache(queryClient, merchantId, [
        { id: 'category-2', name: 'جوالات', parentId: 'category-1' },
      ])

      expect(await localDatabase.categories.toArray()).toEqual([
        { id: 'category-2', name: 'جوالات', parentId: 'category-1' },
      ])
      expect(
        queryClient.getQueryData(merchantQueryKeys.categories(merchantId))
      ).toEqual([{ id: 'category-2', name: 'جوالات', parentId: 'category-1' }])
    })

=======
>>>>>>> 6afa680cf0e9b5a81df5149da2d5573b93e6ea27
    it('updates and deletes products in query and durable caches after API mutations', async () => {
      await updateMerchantProductCache(queryClient, merchantId, 'product-1', {
        name: 'تعديل محفوظ',
        price: 25,
      })
      expect(await localDatabase.products.get('product-1')).toMatchObject({
        name: 'تعديل محفوظ',
        price: 25,
      })
      expect(
        queryClient.getQueryData(merchantQueryKeys.products(merchantId))
      ).toMatchObject([{ name: 'تعديل محفوظ', price: 25 }])

      await removeMerchantProductFromCache(queryClient, merchantId, 'product-1')
      expect(await localDatabase.products.get('product-1')).toBeUndefined()
      expect(
        queryClient.getQueryData(merchantQueryKeys.products(merchantId))
      ).toEqual([])
    })
  })

  it('updates an order in cache without an extra network refresh', () => {
    const order: DashboardOrder = {
      id: '11',
      customerName: 'عميل',
      customerPhone: '',
      deliveryAddress: '',
      deliveryMapUrl: '',
      total: 20,
      deliveryFee: 0,
      currency: 'YER',
      status: 'out_for_delivery',
      createdAt: '2026-10-20T12:00:00.000Z',
      items: [],
    }
    const dashboard: DashboardData = {
      storeName: 'متجر',
      username: 'shop',
      phone: '',
      products: [],
      activeOrders: [order],
      archivedOrders: [],
    }
    queryClient.setQueryData(merchantQueryKeys.orders(merchantId, 'active'), [
      order,
    ])
    queryClient.setQueryData(
      merchantQueryKeys.orders(merchantId, 'archived'),
      []
    )
    queryClient.setQueryData(merchantQueryKeys.dashboard(merchantId), dashboard)
    queryClient.setQueryData(merchantBootstrapKey(merchantId), {
      dashboard,
      categories: [],
      lastTimestamp: 0,
      lastEventId: 0,
    })

    expect(
      updateMerchantOrderStatusCache(queryClient, merchantId, '11', 'completed')
    ).toBe(true)
    expect(
      queryClient.getQueryData(merchantQueryKeys.orders(merchantId, 'active'))
    ).toEqual([])
    expect(
      queryClient.getQueryData(merchantQueryKeys.orders(merchantId, 'archived'))
    ).toMatchObject([{ id: '11', status: 'completed' }])
    expect(fetch).not.toHaveBeenCalled()
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
