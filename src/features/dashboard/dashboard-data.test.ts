import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearDashboardInitializationCache,
  fetchDashboardInitialization,
  fetchDashboardCategories,
  fetchDashboardData,
  fetchDashboardProducts,
  fetchDashboardUsername,
  saveDashboardProduct,
  deleteDashboardProduct,
  updateDashboardAvailability,
  fetchDashboardOrders,
  updateDashboardOrderStatus,
  cancelDashboardOrder,
  confirmDashboardOrderDelivery,
  summarizeDashboardOrders,
  normalizeRealtimeOrders,
} from './dashboard-data'

const { authApiRequest } = vi.hoisted(() => ({
  authApiRequest: vi.fn(),
}))

vi.mock('@/lib/auth-api', () => ({ authApiRequest }))

function dashboardSnapshot(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    products: [],
    orders: [],
    archivedOrders: [],
    categories: [],
    settings: {
      store_name: 'متجري',
      username: '@nalsh_shop',
      phone: '',
    },
    ...overrides,
  }
}

function mockDashboardResponse(payload: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  )
}

describe('summarizeDashboardOrders', () => {
  it('counts active statuses and returns five newest unique orders', () => {
    const makeOrder = (
      id: string,
      createdAt: string,
      status = 'completed'
    ) => ({
      id,
      customerName: id,
      customerPhone: '',
      deliveryAddress: '',
      deliveryMapUrl: '',
      total: 0,
      deliveryFee: 0,
      currency: 'YER',
      status,
      createdAt,
      items: [],
    })
    const activeOrders = [
      makeOrder('active-pending', '2026-10-10', 'pending_merchant_approval'),
      makeOrder('active-delivery', '2026-10-09', 'out_for_delivery'),
      makeOrder('active-old', '2026-10-07'),
    ]
    const archivedOrders = [
      makeOrder('archive-newest', '2026-10-12'),
      makeOrder('archive-second', '2026-10-11'),
      makeOrder('active-delivery', '2026-10-13'),
      makeOrder('archive-third', '2026-10-08'),
      makeOrder('archive-oldest', '2026-10-06'),
    ]

    const summary = summarizeDashboardOrders(activeOrders, archivedOrders)

    expect(summary.awaitingOrders).toBe(1)
    expect(summary.deliveryOrders.map((order) => order.id)).toEqual([
      'active-delivery',
    ])
    expect(summary.recentOrders.map((order) => order.id)).toEqual([
      'archive-newest',
      'archive-second',
      'active-pending',
      'active-delivery',
      'archive-third',
    ])
  })
})

describe('fetchDashboardData', () => {
  beforeEach(() => {
    authApiRequest.mockReset()
    clearDashboardInitializationCache()
    localStorage.setItem('merchant_token', 'dashboard-test-token')
  })

  afterEach(() => {
    clearDashboardInitializationCache()
    vi.unstubAllGlobals()
  })

  it('loads and normalizes merchant profile, products, and both order lists', async () => {
    mockDashboardResponse(
      dashboardSnapshot({
        settings: {
          store_name: 'متجر نالش',
          username: '@nalsh_shop',
          settings: JSON.stringify({ whatsapp: '+967 700 000 000' }),
        },
        products: [
          {
            id: 42,
            name: 'منتج',
            category: 'عام',
            image_url: '/product.png',
            price: '1200',
            created_at: '2026-10-10T10:00:00Z',
          },
        ],
        orders: [
          {
            id: 'active-1',
            customer_name: 'عميل',
            total_amount: '2400',
            status: 'out_for_delivery',
            created_at: '2026-10-12T10:00:00Z',
          },
        ],
        archivedOrders: [
          {
            id: 'archived-1',
            customer_name: 'عميلة',
            total_amount: 800,
            status: 'completed',
            created_at: '2026-10-11T10:00:00Z',
          },
        ],
      })
    )

    await expect(fetchDashboardData()).resolves.toEqual({
      storeName: 'متجر نالش',
      username: 'nalsh_shop',
      phone: '+967 700 000 000',
      products: [
        {
          id: '42',
          productNumber: '',
          name: 'منتج',
          description: '',
          type: 'عام',
          categoryId: '',
          image: '/product.png',
          price: 1200,
          costPrice: 0,
          discount: 0,
          currency: 'YER',
          createdAt: '2026-10-10T10:00:00Z',
          quantity: 0,
          quantityType: 'tracked',
          isAvailable: true,
          approvalStatus: 'approved',
          options: [],
        },
      ],
      activeOrders: [
        {
          id: 'active-1',
          customerName: 'عميل',
          customerPhone: '',
          deliveryAddress: '',
          deliveryMapUrl: '',
          total: 2400,
          deliveryFee: 0,
          currency: 'YER',
          status: 'out_for_delivery',
          createdAt: '2026-10-12T10:00:00Z',
          items: [],
        },
      ],
      archivedOrders: [
        {
          id: 'archived-1',
          customerName: 'عميلة',
          customerPhone: '',
          deliveryAddress: '',
          deliveryMapUrl: '',
          total: 800,
          deliveryFee: 0,
          currency: 'YER',
          status: 'completed',
          createdAt: '2026-10-11T10:00:00Z',
          items: [],
        },
      ],
    })

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      '/api/worker/api/merchant/bootstrap',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('preserves the realtime cursor returned by the bootstrap endpoint', async () => {
    mockDashboardResponse(
      dashboardSnapshot({ lastTimestamp: 1_797_000_000_000, lastEventId: 42 })
    )

    await expect(fetchDashboardInitialization()).resolves.toMatchObject({
      lastTimestamp: 1_797_000_000_000,
      lastEventId: 42,
    })
  })

  it('normalizes raw active and archived D1 rows for realtime deltas', () => {
    const orders = normalizeRealtimeOrders([
      {
        ticket_id: 'active-1',
        status: 'pending_merchant_approval',
        created_at: '2026-10-12T10:00:00Z',
        ticket_data: JSON.stringify({
          customer: { name: 'عميل نشط', phone: '70000000' },
          financials: { grand_total: 1200, currency: 'YER', delivery_fee: 100 },
          items: [{ product_id: 'p1', product_name: 'منتج', quantity: 1 }],
        }),
      },
      {
        ticket_id: 'archived-1',
        final_status: 'completed',
        archived_at: 1_792_022_400_000,
        total_amount: 900,
        archived_data: JSON.stringify({
          customer: { name: 'عميل مؤرشف' },
          items: [{ product_id: 'p2', product_name: 'قديم', quantity: 2 }],
        }),
      },
    ])

    expect(orders.find((order) => order.id === 'active-1')).toMatchObject({
      customerName: 'عميل نشط',
      customerPhone: '70000000',
      total: 1200,
      items: [{ id: 'p1', name: 'منتج', quantity: 1 }],
    })
    expect(orders.find((order) => order.id === 'archived-1')).toMatchObject({
      customerName: 'عميل مؤرشف',
      total: 900,
      status: 'completed',
      items: [{ id: 'p2', name: 'قديم', quantity: 2 }],
    })
  })

  it('reports API failures instead of showing empty dashboard data', async () => {
    mockDashboardResponse({ message: 'انتهت الجلسة' }, 401)

    await expect(fetchDashboardData()).rejects.toThrow('انتهت الجلسة')
  })

  it('loads complete product fields and normalizes variant stock and images', async () => {
    mockDashboardResponse(
      dashboardSnapshot({
        products: [
          {
            id: 8,
            product_number: 'P-8',
            name: 'قميص',
            mainDescription: 'وصف',
            category_id: 4,
            price: '2500',
            cost_price: '1400',
            discount: '10',
            is_available: '0',
            quantity_type: 'tracked',
            quantity: '3',
            options: JSON.stringify([
              {
                id: 1,
                name: 'أحمر',
                quantity_type: 'unlimited',
                quantity: 9999,
                image: '',
                custom_price: null,
              },
            ]),
          },
        ],
      })
    )

    await expect(fetchDashboardProducts()).resolves.toMatchObject([
      {
        id: '8',
        productNumber: 'P-8',
        description: 'وصف',
        categoryId: '4',
        price: 2500,
        costPrice: 1400,
        discount: 10,
        isAvailable: false,
        quantity: 3,
        options: [
          {
            id: '1',
            name: 'أحمر',
            quantityType: 'unlimited',
            useMainImage: true,
            customPrice: null,
          },
        ],
      },
    ])
  })

  it('reports category loading errors rather than returning an empty tree', async () => {
    mockDashboardResponse({ message: 'تعذر الاتصال' }, 500)

    await expect(fetchDashboardCategories()).rejects.toThrow('تعذر الاتصال')
  })

  it('normalizes root categories so main and nested categories form a tree', async () => {
    mockDashboardResponse(
      dashboardSnapshot({
        categories: [
          { id: 1, name: 'ملابس', parent_id: 0 },
          { id: 2, name: 'قمصان', parent_id: 1 },
        ],
      })
    )

    await expect(fetchDashboardCategories()).resolves.toEqual([
      { id: '1', name: 'ملابس', parentId: '' },
      { id: '2', name: 'قمصان', parentId: '1' },
    ])
  })

  it('uses merchant settings for the public store username', async () => {
    mockDashboardResponse(
      dashboardSnapshot({
        settings: { username: '@nalsh_shop' },
      })
    )

    await expect(fetchDashboardUsername()).resolves.toBe('nalsh_shop')
  })

  it('saves a FormData product and returns the saved product id', async () => {
    authApiRequest.mockResolvedValueOnce({ status: 'success', id: 17 })
    const payload = new FormData()
    payload.set('name', 'منتج جديد')

    await expect(saveDashboardProduct(payload)).resolves.toBe('17')
    expect(authApiRequest).toHaveBeenCalledWith('save_product', payload)
  })

  it('deletes a product and updates availability using the merchant API', async () => {
    authApiRequest
      .mockResolvedValueOnce({ status: 'ok' })
      .mockResolvedValueOnce({ status: 'success' })

    await expect(deleteDashboardProduct('17')).resolves.toBeUndefined()
    await expect(
      updateDashboardAvailability('17', false)
    ).resolves.toBeUndefined()

    expect(authApiRequest).toHaveBeenNthCalledWith(1, 'delete_product', {
      id: '17',
      product_id: '17',
    })
    expect(authApiRequest).toHaveBeenNthCalledWith(2, 'toggle_availability', {
      id: '17',
      product_id: '17',
      is_available: 0,
      isAvailable: 0,
    })
  })

  it('loads complete order and product item details from get_orders', async () => {
    mockDashboardResponse(
      dashboardSnapshot({
        orders: [
          {
            id: 'ticket-1',
            customer_name: 'سارة',
            customer_phone: '+967700000000',
            delivery_address_text: 'صنعاء',
            delivery_gps_link: 'https://maps.example/order',
            total_amount: 2750,
            delivery_fee: 250,
            status: 'pending_merchant_approval',
            created_at: '2026-10-12T10:00:00Z',
            items: JSON.stringify([
              {
                product_id: 9,
                product_name: 'حقيبة',
                image: '/bag.png',
                quantity: 2,
                price: 1250,
                cost_price: 800,
              },
            ]),
          },
        ],
      })
    )

    await expect(fetchDashboardOrders('active')).resolves.toEqual([
      {
        id: 'ticket-1',
        customerName: 'سارة',
        customerPhone: '+967700000000',
        deliveryAddress: 'صنعاء',
        deliveryMapUrl: 'https://maps.example/order',
        total: 2750,
        deliveryFee: 250,
        currency: 'YER',
        status: 'pending_merchant_approval',
        createdAt: '2026-10-12T10:00:00Z',
        items: [
          {
            id: '9',
            name: 'حقيبة',
            image: '/bag.png',
            quantity: 2,
            price: 1250,
            costPrice: 800,
          },
        ],
      },
    ])
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('sends supported order state and delivery actions with legacy payload fields', async () => {
    authApiRequest
      .mockResolvedValueOnce({ status: 'success' })
      .mockResolvedValueOnce({ status: 'success' })
      .mockResolvedValueOnce({ status: 'success' })

    await expect(
      updateDashboardOrderStatus('ticket-1', 'confirmed_by_store')
    ).resolves.toBe('')
    await expect(cancelDashboardOrder('ticket-1')).resolves.toBe('')
    await expect(
      confirmDashboardOrderDelivery('ticket-1', '1234')
    ).resolves.toBe('')

    expect(authApiRequest).toHaveBeenNthCalledWith(1, 'update_order_status', {
      ticket_id: 'ticket-1',
      status: 'confirmed_by_store',
    })
    expect(authApiRequest).toHaveBeenNthCalledWith(2, 'cancel_order', {
      ticket_id: 'ticket-1',
      reason: 'تم الإلغاء من قبل المتجر',
    })
    expect(authApiRequest).toHaveBeenNthCalledWith(3, 'confirm_delivery_code', {
      ticket_id: 'ticket-1',
      code: '1234',
    })
  })

  it('rejects malformed delivery codes without making an API request', async () => {
    await expect(
      confirmDashboardOrderDelivery('ticket-1', '123')
    ).rejects.toThrow('أدخل كود تسليم صحيحاً من 4 أرقام.')
    expect(authApiRequest).not.toHaveBeenCalled()
  })
})
