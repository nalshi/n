import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRealtimeStore } from '@/stores/realtime-store'
import { clearDashboardInitializationCache } from '@/features/dashboard/dashboard-data'
import { startMerchantRealtime } from './merchant-realtime'

const { infoToast } = vi.hoisted(() => ({ infoToast: vi.fn() }))

vi.mock('sonner', () => ({
  toast: {
    info: infoToast,
    error: vi.fn(),
  },
}))

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []
  readyState = FakeWebSocket.CONNECTING

  constructor(readonly url: string) {
    super()
    FakeWebSocket.instances.push(this)
  }

  send() {}

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.dispatchEvent(new CloseEvent('close', { code: 1000 }))
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  receive(message: Record<string, unknown>) {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(message) })
    )
  }
}

class FakeMessagePort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  postMessage = vi.fn()
  start = vi.fn()
  close = vi.fn()

  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent<unknown>)
  }
}

class FakeSharedWorker extends EventTarget {
  static instances: FakeSharedWorker[] = []
  readonly port = new FakeMessagePort()

  constructor(
    readonly url: string,
    readonly options?: WorkerOptions
  ) {
    super()
    FakeSharedWorker.instances.push(this)
  }
}

class FakeNotification {
  static permission: NotificationPermission = 'granted'
  static instances: FakeNotification[] = []

  constructor(
    readonly title: string,
    readonly options?: NotificationOptions
  ) {
    FakeNotification.instances.push(this)
  }
}

function makeToken() {
  const payload = btoa(JSON.stringify({ exp: 2_000_000_000, user_id: 42 }))
  return `header.${payload}.signature`
}

function makeDashboardResponse(refresh = false) {
  return new Response(
    JSON.stringify({
      products: [{ id: 9, name: 'منتج', price: refresh ? 99 : 15 }],
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
}

describe('merchant realtime synchronization', () => {
  let queryClient: QueryClient
  let cleanup: (() => void) | undefined

  beforeEach(() => {
    clearDashboardInitializationCache()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal('SharedWorker', undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/merchant/bootstrap')) {
          return Promise.resolve(
            makeDashboardResponse(url.includes('refresh=1'))
          )
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ticket: 'short-ticket' }), {
            status: 200,
          })
        )
      })
    )
    localStorage.clear()
    sessionStorage.clear()
    FakeNotification.instances = []
    infoToast.mockClear()
    vi.stubGlobal('Notification', FakeNotification)
    localStorage.setItem('merchant_token', makeToken())
    FakeWebSocket.instances = []
    useRealtimeStore.getState().setStatus('connecting')
    queryClient = new QueryClient()
  })

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
    clearDashboardInitializationCache()
    queryClient.clear()
    vi.unstubAllGlobals()
    FakeSharedWorker.instances = []
    vi.useRealTimers()
  })

  it('loads the HTTP snapshot before connecting and applies order updates immediately', async () => {
    cleanup = startMerchantRealtime(queryClient)
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))

    expect(fetch).toHaveBeenCalledWith(
      '/api/work/api/merchant/bootstrap',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${makeToken()}`,
        }),
      })
    )
    expect(fetch).toHaveBeenCalledWith(
      '/api/worker/ws/ticket',
      expect.objectContaining({ method: 'POST' })
    )
    expect(queryClient.getQueryData(['merchant-products'])).toMatchObject([
      { id: '9', name: 'منتج', price: 15 },
    ])
    expect(
      queryClient.getQueryData(['merchant-orders', 'active'])
    ).toMatchObject([{ id: '11', customerName: 'عميل' }])

    const socket = FakeWebSocket.instances[0]
    expect(socket.url).toContain('/api/worker/ws?ticket=')
    expect(socket.url).toContain('ticket=short-ticket')
    expect(socket.url).toContain('&m=42')
    expect(socket.url).not.toContain(makeToken())

    socket.open()
    expect(queryClient.getQueryData(['merchant-store-username'])).toBe('shop')
    expect(useRealtimeStore.getState().status).toBe('connected')

    socket.receive({
      event: 'order_updated',
      order: {
        id: 12,
        customer_name: 'عميل جديد',
        status: 'pending_merchant_approval',
      },
    })
    expect(
      queryClient.getQueryData(['merchant-orders', 'active'])
    ).toMatchObject([{ id: '12' }, { id: '11' }])

    const requestCount = vi.mocked(fetch).mock.calls.length
    socket.receive({
      event: 'product_updated',
      product: { id: 9, name: 'منتج معدل', price: 22 },
    })
    socket.receive({
      event: 'order_updated',
      order: {
        id: 11,
        customer_name: 'عميل معدل',
        status: 'confirmed_by_store',
      },
    })
    expect(queryClient.getQueryData(['merchant-products'])).toMatchObject([
      { id: '9', name: 'منتج معدل', price: 22 },
    ])
    expect(
      queryClient.getQueryData(['merchant-orders', 'active'])
    ).toMatchObject([{ id: '12' }, { id: '11', customerName: 'عميل معدل' }])
    expect(fetch).toHaveBeenCalledTimes(requestCount)
  })

  it('shows a browser notification for a new order when the merchant enabled it', async () => {
    localStorage.setItem('merchant_push_notifications_enabled:42', 'true')
    cleanup = startMerchantRealtime(queryClient)
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))

    const socket = FakeWebSocket.instances[0]
    socket.open()
    socket.receive({
      event: 'order_updated',
      order: {
        id: 12,
        customer_name: 'عميل جديد',
        status: 'pending_merchant_approval',
      },
    })

    expect(FakeNotification.instances).toHaveLength(1)
    expect(FakeNotification.instances[0]).toMatchObject({
      title: 'طلب جديد في متجرك',
      options: {
        body: 'طلب جديد من عميل جديد.',
        tag: 'merchant-order-12',
      },
    })
  })

  it('does not repeat a new-order toast after a duplicate event or page refresh', async () => {
    cleanup = startMerchantRealtime(queryClient)
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))

    const orderEvent = {
      event: 'order_created',
      order: {
        id: 12,
        customer_name: 'عميل جديد',
        status: 'pending_merchant_approval',
      },
    }
    FakeWebSocket.instances[0].open()
    FakeWebSocket.instances[0].receive(orderEvent)
    FakeWebSocket.instances[0].receive(orderEvent)
    expect(infoToast).toHaveBeenCalledTimes(1)

    cleanup()
    queryClient.clear()
    cleanup = startMerchantRealtime(queryClient)
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2))
    FakeWebSocket.instances[1].open()
    FakeWebSocket.instances[1].receive(orderEvent)

    expect(infoToast).toHaveBeenCalledTimes(1)
  })

  it('does not expose the token in a WebSocket URL when ticket provisioning fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes('/api/merchant/bootstrap')
          ? Promise.resolve(makeDashboardResponse())
          : Promise.reject(new Error('offline'))
      )
    )
    cleanup = startMerchantRealtime(queryClient)
    await vi.waitFor(() =>
      expect(useRealtimeStore.getState().status).toBe('disconnected')
    )

    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it('reuses the shared worker and applies incremental events', async () => {
    vi.stubGlobal('SharedWorker', FakeSharedWorker)
    cleanup = startMerchantRealtime(queryClient)
    await vi.waitFor(() =>
      expect(FakeSharedWorker.instances[0]?.port.postMessage).toHaveBeenCalled()
    )

    const worker = FakeSharedWorker.instances[0]
    expect(worker.url).toBe('/js/dashboard/realtime-worker.js')
    expect(worker.options).toEqual({ name: 'nalsh-merchant-realtime' })
    expect(worker.port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'init',
        merchantId: '42',
        token: '',
        socketUrl: expect.stringContaining('ticket=short-ticket'),
      })
    )

    worker.port.emit(JSON.stringify({ type: 'status', status: 'connected' }))
    worker.port.emit(
      JSON.stringify({
        type: 'event',
        data: {
          event: 'product_created',
          product: { id: 25, name: 'منتج لحظي' },
        },
      })
    )
    expect(queryClient.getQueryData(['merchant-products'])).toMatchObject([
      { id: '25', name: 'منتج لحظي' },
      { id: '9', name: 'منتج' },
    ])
    expect(useRealtimeStore.getState().status).toBe('connected')

    cleanup?.()
    cleanup = undefined
    expect(worker.port.postMessage).toHaveBeenCalledWith({
      action: 'close_port',
    })
    expect(worker.port.close).toHaveBeenCalledOnce()
  })

  it('re-syncs over HTTP when the WebSocket reconnects', async () => {
    cleanup = startMerchantRealtime(queryClient)
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))

    FakeWebSocket.instances[0].open()
    vi.useFakeTimers()
    FakeWebSocket.instances[0].close()
    await vi.advanceTimersByTimeAsync(1_000)
    await Promise.resolve()
    await Promise.resolve()

    expect(FakeWebSocket.instances).toHaveLength(2)
    FakeWebSocket.instances[1].open()
    await vi.waitFor(() =>
      expect(queryClient.getQueryData(['merchant-products'])).toMatchObject([
        { id: '9', price: 99 },
      ])
    )
    expect(fetch).toHaveBeenCalledWith(
      '/api/work/api/merchant/bootstrap?refresh=1',
      expect.objectContaining({ method: 'GET' })
    )
  })
})
