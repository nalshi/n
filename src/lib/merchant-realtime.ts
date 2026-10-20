import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { addMerchantOrderNotification } from '@/stores/merchant-order-notifications'
import { useRealtimeStore, type RealtimeStatus } from '@/stores/realtime-store'
import {
  fetchDashboardInitialization,
  normalizeRealtimeOrders,
  normalizeRealtimeProducts,
  type DashboardData,
  type DashboardInitialization,
  type DashboardOrder,
  type DashboardProduct,
} from '@/features/dashboard/dashboard-data'

declare global {
  interface Window {
    dashboardSocketForceDirect?: boolean
  }
}

type RealtimeMessage = Record<string, unknown> & {
  event?: string
  type?: string
}

const MAX_ALERTED_ORDER_IDS = 100

function readAlertedOrderIds(merchantId: string): Set<string> {
  try {
    const stored = localStorage.getItem(`merchant_alerted_orders:${merchantId}`)
    if (!stored) return new Set()
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) {
      toast.error('بيانات تنبيهات الطلبات غير صالحة؛ قد يتكرر تنبيه سابق.')
      return new Set()
    }
    return new Set(
      parsed
        .filter((id): id is string => typeof id === 'string')
        .slice(-MAX_ALERTED_ORDER_IDS)
    )
  } catch (error) {
    toast.error(
      `تعذر قراءة سجل تنبيهات الطلبات: ${
        error instanceof Error ? error.message : 'خطأ تخزين غير معروف.'
      }`
    )
    return new Set()
  }
}

function persistAlertedOrderIds(
  merchantId: string,
  alertedOrderIds: Set<string>
) {
  try {
    localStorage.setItem(
      `merchant_alerted_orders:${merchantId}`,
      JSON.stringify([...alertedOrderIds].slice(-MAX_ALERTED_ORDER_IDS))
    )
  } catch (error) {
    toast.error(
      `تعذر حفظ حالة تنبيه الطلب: ${
        error instanceof Error ? error.message : 'خطأ تخزين غير معروف.'
      }`
    )
  }
}

function getSessionIdentity(token: string) {
  try {
    const encoded = token.split('.')[1]
    if (!encoded) return ''
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(
      atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    ) as Record<string, unknown>
    const expiresAt = Number(payload.exp) * 1000
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return ''
    return String(payload.user_id || payload.accountNo || '')
  } catch {
    return ''
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function updateProductList(
  products: DashboardProduct[],
  product: DashboardProduct
) {
  const index = products.findIndex((item) => item.id === product.id)
  if (index < 0) return [product, ...products]
  return products.map((item) => (item.id === product.id ? product : item))
}

function updateOrderList(orders: DashboardOrder[], order: DashboardOrder) {
  const index = orders.findIndex((item) => item.id === order.id)
  if (index < 0) return [order, ...orders]
  return orders.map((item) => (item.id === order.id ? order : item))
}

function syncSnapshot(
  queryClient: QueryClient,
  snapshot: DashboardInitialization
) {
  const { dashboard, categories } = snapshot
  const products = dashboard.products
  const activeOrders = dashboard.activeOrders
  const archivedOrders = dashboard.archivedOrders

  queryClient.setQueryDefaults(['merchant-dashboard-home'], {
    staleTime: 5 * 60_000,
  })
  queryClient.setQueryDefaults(['merchant-products'], {
    staleTime: 5 * 60_000,
  })
  queryClient.setQueryDefaults(['merchant-orders'], {
    staleTime: 5 * 60_000,
  })
  queryClient.setQueryDefaults(['merchant-product-categories'], {
    staleTime: 5 * 60_000,
  })
  queryClient.setQueryDefaults(['merchant-store-username'], {
    staleTime: 5 * 60_000,
  })

  queryClient.setQueryData(['merchant-dashboard-home'], dashboard)
  queryClient.setQueryData(['merchant-products'], products)
  queryClient.setQueryData(['merchant-dashboard-products'], products)
  queryClient.setQueryData(['merchant-orders', 'active'], activeOrders)
  queryClient.setQueryData(['merchant-orders', 'archived'], archivedOrders)
  queryClient.setQueryData(['merchant-store-username'], dashboard.username)
  queryClient.setQueryData(['merchant-product-categories'], categories)
}

function syncEvent(
  queryClient: QueryClient,
  merchantId: string,
  message: RealtimeMessage
) {
  const product = readRecord(message.product)
  const order = readRecord(message.order)

  if (
    (message.event === 'product_created' ||
      message.event === 'product_updated') &&
    product
  ) {
    const [normalized] = normalizeRealtimeProducts([product])
    if (!normalized) return
    const products =
      queryClient.getQueryData<DashboardProduct[]>(['merchant-products']) || []
    const nextProducts = updateProductList(products, normalized)
    queryClient.setQueryData(['merchant-products'], nextProducts)
    queryClient.setQueryData(['merchant-dashboard-products'], nextProducts)
    queryClient.setQueryData<DashboardData>(
      ['merchant-dashboard-home'],
      (current) => (current ? { ...current, products: nextProducts } : current)
    )
    return
  }

  if (message.event === 'product_removed' && message.product_id !== undefined) {
    const productId = String(message.product_id)
    const products =
      queryClient.getQueryData<DashboardProduct[]>(['merchant-products']) || []
    const nextProducts = products.filter((item) => item.id !== productId)
    queryClient.setQueryData(['merchant-products'], nextProducts)
    queryClient.setQueryData(['merchant-dashboard-products'], nextProducts)
    queryClient.setQueryData<DashboardData>(
      ['merchant-dashboard-home'],
      (current) => (current ? { ...current, products: nextProducts } : current)
    )
    return
  }

  if (
    (message.event === 'order_created' || message.event === 'order_updated') &&
    order
  ) {
    const [normalized] = normalizeRealtimeOrders([order])
    if (!normalized) return
    const active =
      queryClient.getQueryData<DashboardOrder[]>([
        'merchant-orders',
        'active',
      ]) || []
    const archived =
      queryClient.getQueryData<DashboardOrder[]>([
        'merchant-orders',
        'archived',
      ]) || []
    const isArchived =
      normalized.status === 'completed' || normalized.status === 'cancelled'
    const wasKnown = [...active, ...archived].some(
      (item) => item.id === normalized.id
    )
    const nextActive = isArchived
      ? active.filter((item) => item.id !== normalized.id)
      : updateOrderList(active, normalized)
    const nextArchived = isArchived
      ? updateOrderList(archived, normalized)
      : archived.filter((item) => item.id !== normalized.id)

    queryClient.setQueryData(['merchant-orders', 'active'], nextActive)
    queryClient.setQueryData(['merchant-orders', 'archived'], nextArchived)
    queryClient.setQueryData<DashboardData>(
      ['merchant-dashboard-home'],
      (current) =>
        current
          ? {
              ...current,
              activeOrders: nextActive,
              archivedOrders: nextArchived,
            }
          : current
    )

    const alertedOrderIds = readAlertedOrderIds(merchantId)
    if (
      !wasKnown &&
      !alertedOrderIds.has(normalized.id) &&
      normalized.status === 'pending_merchant_approval'
    ) {
      alertedOrderIds.add(normalized.id)
      persistAlertedOrderIds(merchantId, alertedOrderIds)
      if (
        addMerchantOrderNotification(merchantId, {
          id: normalized.id,
          customerName: normalized.customerName,
          createdAt: normalized.createdAt,
        })
      ) {
        toast.info(`وصل طلب جديد من ${normalized.customerName}.`, {
          duration: 8_000,
        })
      }
      if (
        localStorage.getItem(
          `merchant_push_notifications_enabled:${merchantId}`
        ) === 'true' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification('طلب جديد في متجرك', {
            body: `طلب جديد من ${normalized.customerName}.`,
            tag: `merchant-order-${normalized.id}`,
          })
        } catch {
          toast.error('تعذر إظهار تنبيه الطلب في هذا المتصفح.')
        }
      }
    }
    return
  }
}

type MerchantRealtimeCallbacks = {
  onInitialized?: () => void
  onInitializationError?: (error: Error) => void
}

function setStatus(status: RealtimeStatus, detail = '') {
  useRealtimeStore.getState().setStatus(status, detail)
}

export function startMerchantRealtime(
  queryClient: QueryClient,
  callbacks: MerchantRealtimeCallbacks = {}
) {
  let stopped = false
  let socket: WebSocket | null = null
  let pingTimer: number | undefined
  let reconnectTimer: number | undefined
  let resyncTimer: number | undefined
  let sharedWorkerTimer: number | undefined
  let sharedPort: MessagePort | null = null
  let sharedWorkerActive = false
  let reconnectAttempt = 0
  let resyncAttempt = 0
  let hasConnected = false
  let resyncInProgress = false
  let resyncPromise: Promise<void> | null = null
  const bufferedEvents: RealtimeMessage[] = []
  const allowedEvents = new Set([
    'product_created',
    'product_updated',
    'product_removed',
    'order_created',
    'order_updated',
  ])
  const token =
    localStorage.getItem('merchant_token') ||
    sessionStorage.getItem('merchant_token') ||
    ''
  const merchantId = getSessionIdentity(token)

  if (!token || !merchantId) {
    const error = new Error('لا تتوفر بيانات جلسة التاجر')
    setStatus('disconnected', error.message)
    callbacks.onInitializationError?.(error)
    return () => {}
  }

  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const socketOrigin = `${scheme}//${window.location.host}`

  function scheduleReconnect() {
    if (stopped || reconnectTimer !== undefined || !navigator.onLine) return
    reconnectAttempt += 1
    const delay = Math.min(
      25_000,
      1_000 * 1.8 ** Math.min(reconnectAttempt - 1, 5)
    )
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined
      void connect()
    }, delay)
  }

  function scheduleResync() {
    if (stopped || resyncTimer !== undefined || !navigator.onLine) return
    resyncAttempt += 1
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(resyncAttempt - 1, 5))
    resyncTimer = window.setTimeout(() => {
      resyncTimer = undefined
      void resyncAfterReconnect()
    }, delay)
  }

  async function resyncAfterReconnect() {
    if (stopped || resyncPromise) return resyncPromise || undefined
    resyncInProgress = true
    resyncPromise = (async () => {
      try {
        const snapshot = await fetchDashboardInitialization(true)
        if (stopped) return
        syncSnapshot(queryClient, snapshot)
        resyncAttempt = 0
        setStatus('connected', 'تمت إعادة مزامنة البيانات')
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : 'تعذر إعادة مزامنة البيانات.'
        setStatus('connected', `تعذرت المزامنة؛ ستتم إعادة المحاولة. ${detail}`)
        toast.error(`تعذر إعادة مزامنة بيانات لوحة التحكم: ${detail}`)
        scheduleResync()
      } finally {
        resyncInProgress = false
        for (const event of bufferedEvents.splice(0)) {
          syncEvent(queryClient, merchantId, event)
        }
        resyncPromise = null
      }
    })()
    return resyncPromise
  }

  function markConnected() {
    const isReconnect = hasConnected
    hasConnected = true
    reconnectAttempt = 0
    setStatus('connected', 'متصل')
    if (isReconnect) void resyncAfterReconnect()
  }

  function handleMessage(raw: unknown) {
    if (typeof raw !== 'string') return
    let message: RealtimeMessage
    try {
      message = JSON.parse(raw) as RealtimeMessage
    } catch {
      return
    }

    if (message.type === 'pong') return
    if (message.type === 'event' && readRecord(message.data)) {
      handleMessage(JSON.stringify(message.data))
      return
    }
    if (message.type === 'snapshot' || message.type === 'session_resume') return
    if (message.event === 'error') {
      setStatus(
        'disconnected',
        typeof message.message === 'string'
          ? message.message
          : 'تعذر تجهيز بيانات الاتصال'
      )
      return
    }
    if (!message.event || !allowedEvents.has(message.event)) return
    if (resyncInProgress) bufferedEvents.push(message)
    else syncEvent(queryClient, merchantId, message)
  }

  async function fetchTicket() {
    const response = await fetch('/api/worker/ws/ticket', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    if (!response.ok) {
      throw new Error(`تعذر إصدار تذكرة الاتصال (${response.status}).`)
    }
    const result: unknown = await response.json()
    const ticket = readRecord(result)?.ticket
    if (typeof ticket !== 'string' || !ticket) {
      throw new Error('استجابة تذكرة الاتصال غير صالحة.')
    }
    return ticket
  }

  function buildSocketUrl(ticket: string) {
    return `${socketOrigin}/api/worker/ws?ticket=${encodeURIComponent(ticket)}&m=${encodeURIComponent(merchantId)}`
  }

  function connectSharedWorker() {
    if (
      typeof SharedWorker !== 'function' ||
      window.dashboardSocketForceDirect
    ) {
      return false
    }

    try {
      const sharedWorker = new SharedWorker(
        '/js/dashboard/realtime-worker.js',
        { name: 'nalsh-merchant-realtime' }
      )
      const port = sharedWorker.port
      sharedPort = port
      port.onmessage = (event: MessageEvent<unknown>) => {
        let message: Record<string, unknown> | null
        if (typeof event.data === 'string') {
          try {
            message = JSON.parse(event.data) as Record<string, unknown>
          } catch {
            return
          }
        } else {
          message = readRecord(event.data)
        }
        if (!message) return

        if (sharedWorkerTimer !== undefined) {
          window.clearTimeout(sharedWorkerTimer)
          sharedWorkerTimer = undefined
        }
        sharedWorkerActive = true
        if (message.type === 'status') {
          const status =
            message.status === 'connected'
              ? 'connected'
              : message.status === 'connecting'
                ? 'connecting'
                : navigator.onLine
                  ? 'disconnected'
                  : 'offline'
          if (status === 'connected') {
            markConnected()
          } else {
            setStatus(
              status,
              typeof message.detail === 'string' ? message.detail : ''
            )
          }
          return
        }
        if (message.type === 'event' && readRecord(message.data)) {
          handleMessage(JSON.stringify(message.data))
          return
        }
        if (message.type === 'error') {
          setStatus(
            'disconnected',
            typeof message.message === 'string'
              ? message.message
              : 'حدث خطأ في الاتصال اللحظي'
          )
        }
      }
      port.start()
      sharedWorker.addEventListener('error', () => {
        if (sharedPort !== port || stopped) return
        sharedWorkerActive = false
        sharedPort = null
        port.close()
        void connect()
      })

      void fetchTicket()
        .then((ticket) => {
          if (stopped || sharedPort !== port) return
          port.postMessage({
            action: 'init',
            socketUrl: buildSocketUrl(ticket),
            merchantId,
            token: '',
          })
          sharedWorkerTimer = window.setTimeout(() => {
            sharedWorkerTimer = undefined
            if (!sharedWorkerActive && !stopped) {
              sharedPort?.postMessage({ action: 'close_port' })
              sharedPort?.close()
              sharedPort = null
              void connect()
            }
          }, 12_000)
        })
        .catch((error: unknown) => {
          if (stopped || sharedPort !== port) return
          setStatus(
            'disconnected',
            error instanceof Error ? error.message : 'تعذر إصدار تذكرة الاتصال.'
          )
          scheduleReconnect()
        })

      return true
    } catch {
      sharedPort = null
      sharedWorkerActive = false
      return false
    }
  }

  async function connect() {
    if (stopped || !navigator.onLine) {
      setStatus('offline', 'لا يوجد اتصال بالإنترنت')
      return
    }
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING)
    ) {
      return
    }

    setStatus('connecting', 'جاري إنشاء الاتصال...')
    try {
      const ticket = await fetchTicket()
      if (stopped) return

      const nextSocket = new WebSocket(buildSocketUrl(ticket))
      socket = nextSocket
      nextSocket.addEventListener('open', () => {
        if (socket !== nextSocket || stopped) {
          nextSocket.close(1000, 'اتصال قديم')
          return
        }
        markConnected()
        nextSocket.send(JSON.stringify({ type: 'ping' }))
        if (pingTimer !== undefined) window.clearInterval(pingTimer)
        pingTimer = window.setInterval(() => {
          if (nextSocket.readyState === WebSocket.OPEN) {
            nextSocket.send(JSON.stringify({ type: 'ping' }))
          }
        }, 25_000)
      })
      nextSocket.addEventListener('message', (event) => {
        if (socket === nextSocket) handleMessage(event.data)
      })
      nextSocket.addEventListener('error', () => {
        if (socket === nextSocket) {
          setStatus('disconnected', 'حدث خطأ في الاتصال')
        }
      })
      nextSocket.addEventListener('close', (event) => {
        if (socket !== nextSocket) return
        socket = null
        if (pingTimer !== undefined) {
          window.clearInterval(pingTimer)
          pingTimer = undefined
        }
        setStatus(
          navigator.onLine ? 'disconnected' : 'offline',
          event.reason || `انقطع الاتصال (${event.code})`
        )
        scheduleReconnect()
      })
    } catch (error) {
      setStatus(
        'disconnected',
        error instanceof Error ? error.message : 'تعذر بدء الاتصال'
      )
      scheduleReconnect()
    }
  }

  const onOnline = () => {
    reconnectAttempt = 0
    if (sharedPort) sharedPort.postMessage({ action: 'reconnect' })
    else void connect()
  }
  const onOffline = () => setStatus('offline', 'لا يوجد اتصال بالإنترنت')
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') return
    if (sharedPort) sharedPort.postMessage({ action: 'get_status' })
    else if (!socket) void connect()
  }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisibility)

  async function initialize() {
    try {
      const snapshot = await fetchDashboardInitialization()
      if (stopped) return
      syncSnapshot(queryClient, snapshot)
      callbacks.onInitialized?.()
      if (!connectSharedWorker()) void connect()
    } catch (error) {
      if (stopped) return
      const initializationError =
        error instanceof Error
          ? error
          : new Error('تعذر تحميل بيانات لوحة التحكم.')
      setStatus('disconnected', initializationError.message)
      callbacks.onInitializationError?.(initializationError)
    }
  }

  void initialize()

  return () => {
    stopped = true
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisibility)
    if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
    if (resyncTimer !== undefined) window.clearTimeout(resyncTimer)
    if (sharedWorkerTimer !== undefined) window.clearTimeout(sharedWorkerTimer)
    if (pingTimer !== undefined) window.clearInterval(pingTimer)
    socket?.close(1000, 'تم مغادرة لوحة التاجر')
    socket = null
    if (sharedPort) {
      sharedPort.postMessage({ action: 'close_port' })
      sharedPort.close()
      sharedPort = null
    }
    setStatus('disconnected', 'الاتصال متوقف')
  }
}
