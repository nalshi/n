import { useEffect, useRef } from 'react'
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { useRealtimeStore } from '@/stores/realtime-store'
import {
  fetchDashboardInitialization,
  normalizeRealtimeOrders,
  normalizeRealtimeProducts,
  type DashboardData,
  type DashboardInitialization,
  type DashboardOrder,
  type DashboardProduct,
} from '@/features/dashboard/dashboard-data'

export const merchantBootstrapKey = (merchantId: string) =>
  ['merchant-bootstrap', merchantId] as const
export const merchantQueryKeys = {
  dashboard: (merchantId: string) =>
    ['merchant-dashboard-home', merchantId] as const,
  products: (merchantId: string) => ['merchant-products', merchantId] as const,
  dashboardProducts: (merchantId: string) =>
    ['merchant-dashboard-products', merchantId] as const,
  orders: (merchantId: string, filter: 'active' | 'archived') =>
    ['merchant-orders', merchantId, filter] as const,
  categories: (merchantId: string) =>
    ['merchant-product-categories', merchantId] as const,
  username: (merchantId: string) =>
    ['merchant-store-username', merchantId] as const,
}

type MerchantEvent = {
  eventId: number
  timestamp: number
  type: 'order' | 'product'
  action: 'created' | 'updated' | 'deleted'
  entityId: string
  scope: 'active' | 'archived'
  data: unknown
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function getSessionIdentity(): string {
  const token =
    localStorage.getItem('merchant_token') ||
    sessionStorage.getItem('merchant_token') ||
    ''
  try {
    const encoded = token.split('.')[1]
    if (!encoded) return ''
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(
      atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    ) as Record<string, unknown>
    return String(claims.user_id || claims.accountNo || '')
  } catch {
    return ''
  }
}

function writeSnapshotQueries(
  queryClient: QueryClient,
  merchantId: string,
  snapshot: DashboardInitialization
) {
  const { dashboard, categories } = snapshot
  queryClient.setQueryData(merchantQueryKeys.dashboard(merchantId), dashboard)
  queryClient.setQueryData(
    merchantQueryKeys.products(merchantId),
    dashboard.products
  )
  queryClient.setQueryData(
    merchantQueryKeys.dashboardProducts(merchantId),
    dashboard.products
  )
  queryClient.setQueryData(
    merchantQueryKeys.orders(merchantId, 'active'),
    dashboard.activeOrders
  )
  queryClient.setQueryData(
    merchantQueryKeys.orders(merchantId, 'archived'),
    dashboard.archivedOrders
  )
  queryClient.setQueryData(
    merchantQueryKeys.username(merchantId),
    dashboard.username
  )
  queryClient.setQueryData(merchantQueryKeys.categories(merchantId), categories)
}

function upsertProduct(
  products: DashboardProduct[],
  product: DashboardProduct
): DashboardProduct[] {
  const index = products.findIndex((item) => item.id === product.id)
  if (index === -1) return [product, ...products]
  return products.map((item) => (item.id === product.id ? product : item))
}

function upsertOrder(
  orders: DashboardOrder[],
  order: DashboardOrder
): DashboardOrder[] {
  const index = orders.findIndex((item) => item.id === order.id)
  if (index === -1) return [order, ...orders]
  return orders.map((item) => (item.id === order.id ? order : item))
}

function applyMerchantEvent(
  queryClient: QueryClient,
  merchantId: string,
  event: MerchantEvent
) {
  const key = merchantBootstrapKey(merchantId)

  if (event.type === 'product') {
    const productId =
      event.entityId ||
      String(
        readRecord(event.data)?.id || readRecord(event.data)?.product_id || ''
      )
    const current =
      queryClient.getQueryData<DashboardProduct[]>(
        merchantQueryKeys.products(merchantId)
      ) || []
    const next =
      event.action === 'deleted'
        ? current.filter((product) => product.id !== productId)
        : (() => {
            const [product] = normalizeRealtimeProducts([event.data])
            return product ? upsertProduct(current, product) : current
          })()

    queryClient.setQueryData(merchantQueryKeys.products(merchantId), next)
    queryClient.setQueryData(
      merchantQueryKeys.dashboardProducts(merchantId),
      next
    )
    queryClient.setQueryData<DashboardData>(
      merchantQueryKeys.dashboard(merchantId),
      (dashboard) => (dashboard ? { ...dashboard, products: next } : dashboard)
    )
    queryClient.setQueryData<DashboardInitialization>(key, (snapshot) =>
      snapshot
        ? {
            ...snapshot,
            dashboard: { ...snapshot.dashboard, products: next },
          }
        : snapshot
    )
    return
  }

  const active =
    queryClient.getQueryData<DashboardOrder[]>([
      'merchant-orders',
      merchantId,
      'active',
    ]) || []
  const archived =
    queryClient.getQueryData<DashboardOrder[]>([
      'merchant-orders',
      merchantId,
      'archived',
    ]) || []
  const orderId =
    event.entityId ||
    String(
      readRecord(event.data)?.id || readRecord(event.data)?.ticket_id || ''
    )

  let nextActive = active
  let nextArchived = archived
  if (event.action === 'deleted') {
    if (event.scope === 'archived') {
      nextArchived = archived.filter((order) => order.id !== orderId)
    } else {
      nextActive = active.filter((order) => order.id !== orderId)
    }
  } else {
    const [order] = normalizeRealtimeOrders([event.data])
    if (order) {
      if (event.scope === 'archived') {
        nextArchived = upsertOrder(archived, order)
        nextActive = active.filter((item) => item.id !== order.id)
      } else if (order.status === 'completed' || order.status === 'cancelled') {
        nextActive = active.filter((item) => item.id !== order.id)
      } else {
        nextActive = upsertOrder(active, order)
        nextArchived = archived.filter((item) => item.id !== order.id)
      }
    }
  }

  queryClient.setQueryData(
    merchantQueryKeys.orders(merchantId, 'active'),
    nextActive
  )
  queryClient.setQueryData(
    merchantQueryKeys.orders(merchantId, 'archived'),
    nextArchived
  )
  queryClient.setQueryData<DashboardData>(
    merchantQueryKeys.dashboard(merchantId),
    (dashboard) =>
      dashboard
        ? {
            ...dashboard,
            activeOrders: nextActive,
            archivedOrders: nextArchived,
          }
        : dashboard
  )
  queryClient.setQueryData<DashboardInitialization>(key, (snapshot) =>
    snapshot
      ? {
          ...snapshot,
          dashboard: {
            ...snapshot.dashboard,
            activeOrders: nextActive,
            archivedOrders: nextArchived,
          },
        }
      : snapshot
  )
}

export function useMerchantData(merchantId: string) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: merchantBootstrapKey(merchantId),
    queryFn: () => fetchDashboardInitialization(true),
    enabled: Boolean(merchantId),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  useEffect(() => {
    if (!query.data) return
    writeSnapshotQueries(queryClient, merchantId, query.data)
  }, [merchantId, query.data, queryClient])

  return {
    data: query.data,
    error: query.error,
    isError: query.isError,
    isFetching: query.isFetching,
    isPending: query.isPending,
    refetch: query.refetch,
    cacheReady: Boolean(merchantId && query.data),
  }
}

export function useRealtimeSync(merchantId: string, enabled: boolean) {
  const queryClient = useQueryClient()
  const pendingEvents = useRef(new Map<number, MerchantEvent>())
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!merchantId || !enabled) return

    let stopped = false
    let reconnectAttempt = 0
    let reconnectTimer: number | undefined
    let gapTimer: number | undefined
    const setStatus = useRealtimeStore.getState().setStatus

    const cursor = () => {
      const snapshot = queryClient.getQueryData<DashboardInitialization>(
        merchantBootstrapKey(merchantId)
      )
      return {
        timestamp: snapshot?.lastTimestamp || 0,
        eventId: snapshot?.lastEventId || 0,
      }
    }

    const requestTicket = async () => {
      const token =
        localStorage.getItem('merchant_token') ||
        sessionStorage.getItem('merchant_token') ||
        ''
      if (!token) throw new Error('انتهت الجلسة. يرجى تسجيل الدخول مجدداً.')
      const response = await fetch('/api/work/ws/ticket', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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

    const scheduleReconnect = () => {
      if (stopped || reconnectTimer !== undefined) return
      const delay = Math.min(1_000 * 2 ** reconnectAttempt, 30_000)
      reconnectAttempt += 1
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined
        void connect()
      }, delay)
    }

    const advanceCursor = (
      event: MerchantEvent
    ): Array<{ event: MerchantEvent; wasKnown: boolean }> => {
      const snapshot = queryClient.getQueryData<DashboardInitialization>(
        merchantBootstrapKey(merchantId)
      )
      if (!snapshot || event.eventId <= snapshot.lastEventId) return []

      pendingEvents.current.set(event.eventId, event)
      let lastEventId = snapshot.lastEventId
      let lastTimestamp = snapshot.lastTimestamp
      const appliedEvents: Array<{ event: MerchantEvent; wasKnown: boolean }> =
        []
      while (pendingEvents.current.has(lastEventId + 1)) {
        const next = pendingEvents.current.get(lastEventId + 1)
        if (!next) break
        pendingEvents.current.delete(next.eventId)
        const current = queryClient.getQueryData<DashboardInitialization>(
          merchantBootstrapKey(merchantId)
        )
        const wasKnown =
          next.type === 'order' &&
          [
            ...(current?.dashboard.activeOrders || []),
            ...(current?.dashboard.archivedOrders || []),
          ].some((order) => order.id === next.entityId)
        applyMerchantEvent(queryClient, merchantId, next)
        lastEventId = next.eventId
        lastTimestamp = next.timestamp
        appliedEvents.push({ event: next, wasKnown })
        queryClient.setQueryData<DashboardInitialization>(
          merchantBootstrapKey(merchantId),
          (currentSnapshot) =>
            currentSnapshot
              ? {
                  ...currentSnapshot,
                  lastEventId,
                  lastTimestamp,
                }
              : currentSnapshot
        )
      }

      if (pendingEvents.current.size && gapTimer === undefined) {
        gapTimer = window.setTimeout(() => {
          gapTimer = undefined
          if (!stopped) {
            socketRef.current?.close(1012, 'Requesting event catch-up')
          }
        }, 2_000)
      } else if (!pendingEvents.current.size && gapTimer !== undefined) {
        window.clearTimeout(gapTimer)
        gapTimer = undefined
      }
      return appliedEvents
    }

    const handleMessage = (raw: unknown) => {
      if (typeof raw !== 'string') return
      let parsed: unknown
      try {
        parsed = JSON.parse(raw) as unknown
      } catch {
        setStatus('disconnected', 'وصلت رسالة لحظية بصيغة غير صالحة.')
        return
      }
      const message = readRecord(parsed)
      if (!message) return
      if (message.type === 'error') {
        setStatus(
          'disconnected',
          typeof message.message === 'string'
            ? message.message
            : 'تعذر تجهيز بيانات الاتصال اللحظي'
        )
        return
      }
      if (
        (message.type !== 'order' && message.type !== 'product') ||
        (message.action !== 'created' &&
          message.action !== 'updated' &&
          message.action !== 'deleted') ||
        typeof message.eventId !== 'number' ||
        typeof message.timestamp !== 'number'
      ) {
        return
      }

      const event = message as MerchantEvent
      const current = queryClient.getQueryData<DashboardInitialization>(
        merchantBootstrapKey(merchantId)
      )
      if (
        !current ||
        event.eventId <= current.lastEventId ||
        pendingEvents.current.has(event.eventId)
      ) {
        return
      }

      const committedEvents = advanceCursor(event)
      for (const committed of committedEvents) {
        const committedEvent = committed.event
        const data = readRecord(committedEvent.data)
        if (
          committedEvent.type === 'order' &&
          committedEvent.action === 'created' &&
          !committed.wasKnown &&
          data?.status === 'pending_merchant_approval'
        ) {
          const [order] = normalizeRealtimeOrders([committedEvent.data])
          if (!order) continue
          toast.info(`وصل طلب جديد من ${order.customerName}.`, {
            duration: 8_000,
          })
          if (
            localStorage.getItem('merchant_push_notifications_enabled') ===
              'true' &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            try {
              new Notification('طلب جديد في متجرك', {
                body: `طلب جديد من ${order.customerName}.`,
                tag: `merchant-order-${order.id}`,
              })
            } catch {
              toast.error('تعذر إظهار تنبيه الطلب في هذا المتصفح.')
            }
          }
        }
      }
    }

    async function connect() {
      if (stopped || !navigator.onLine) {
        setStatus('offline', 'لا يوجد اتصال بالإنترنت')
        return
      }
      if (
        socketRef.current?.readyState === WebSocket.OPEN ||
        socketRef.current?.readyState === WebSocket.CONNECTING
      ) {
        return
      }

      setStatus('connecting', 'جاري إنشاء الاتصال اللحظي...')
      try {
        const ticket = await requestTicket()
        if (stopped) return
        const currentCursor = cursor()
        const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const url = new URL(
          `${scheme}//${window.location.host}/api/work/api/live`
        )
        url.searchParams.set('ticket', ticket)
        url.searchParams.set('m', merchantId)
        url.searchParams.set('since', String(currentCursor.timestamp))
        url.searchParams.set('lastEventId', String(currentCursor.eventId))
        const socket = new WebSocket(url)
        socketRef.current = socket
        socket.addEventListener('open', () => {
          if (stopped || socketRef.current !== socket) {
            socket.close(1000, 'Superseded')
            return
          }
          reconnectAttempt = 0
          setStatus('connected', 'متصل لحظيًا')
        })
        socket.addEventListener('message', (event) => {
          if (socketRef.current === socket) handleMessage(event.data)
        })
        socket.addEventListener('error', () => {
          if (socketRef.current === socket) {
            setStatus('disconnected', 'حدث خطأ في الاتصال اللحظي')
          }
        })
        socket.addEventListener('close', (event) => {
          if (socketRef.current !== socket) return
          socketRef.current = null
          setStatus(
            navigator.onLine ? 'disconnected' : 'offline',
            event.reason || `انقطع الاتصال اللحظي (${event.code})`
          )
          scheduleReconnect()
        })
      } catch (error) {
        setStatus(
          'disconnected',
          error instanceof Error ? error.message : 'تعذر بدء الاتصال اللحظي'
        )
        scheduleReconnect()
      }
    }

    const onOnline = () => {
      reconnectAttempt = 0
      void connect()
    }
    const onOffline = () => setStatus('offline', 'لا يوجد اتصال بالإنترنت')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    void connect()

    return () => {
      stopped = true
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
      if (gapTimer !== undefined) window.clearTimeout(gapTimer)
      socketRef.current?.close(1000, 'Dashboard unmounted')
      socketRef.current = null
    }
  }, [enabled, merchantId, queryClient])
}

export function useMerchantIdentity() {
  return getSessionIdentity()
}
