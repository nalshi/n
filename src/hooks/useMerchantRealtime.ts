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
import {
  localDB,
  injectOrder,
  removeOrder,
  injectProduct,
  removeProduct,
  writeSyncCursor,
  readSyncCursor,
  hydrateFromSnapshot,
} from '@/lib/db'
import { checkSyncBeacon } from '@/lib/beacon-checker'

// ─── قناة البث المحلي بين التبويبات (BroadcastChannel) ───────────────────
// تُستخدم لإعلام التبويبات الثانوية بالتحديثات دون أي طلب شبكة إضافي.
// التبويب القائد يكتب في Dexie ثم يبث عبر هذه القناة → التبويبات الأخرى
// تقرأ من Dexie محلياً (0 HTTP requests).
const _localBus = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('merchant_tab_mesh_v1')
  : null

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

  // ─── حقن Snapshot في Dexie IndexedDB بشكل غير متزامن ────────────────
  // نستخدم void لأن هذا الحقن لا يحتاج أن يُكمل قبل تحديث الـ UI.
  // الـ UI يتحدث فوراً من TanStack Query، بينما Dexie تُحدَّث في الخلفية
  // لضمان المخزن الدائم (Offline-First persistence).
  void hydrateFromSnapshot({
    merchantId,
    orders: [
      ...dashboard.activeOrders,
      ...dashboard.archivedOrders,
    ],
    products: dashboard.products,
    categories,
    lastEventId: snapshot.lastEventId ?? 0,
    lastTimestamp: snapshot.lastTimestamp ?? 0,
  }).catch((err) => {
    console.warn('[db] فشل حفظ Snapshot في IndexedDB:', err)
  })
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

    // ─── حقن التغيير في Dexie بالتوازي (غير مُعلِّق للـ UI) ──────────
    if (event.action === 'deleted') {
      void removeProduct(productId).catch((err) =>
        console.warn('[db] فشل حذف المنتج من IndexedDB:', err)
      )
    } else {
      const [product] = normalizeRealtimeProducts([event.data])
      if (product) {
        void injectProduct(product).catch((err) =>
          console.warn('[db] فشل حفظ المنتج في IndexedDB:', err)
        )
      }
    }

    // إعلام التبويبات الأخرى محلياً (0 طلبات شبكة)
    _localBus?.postMessage({ type: 'PRODUCT_MUTATED', productId, merchantId })
    return
  }

  // ─── معالجة أحداث الطلبات ─────────────────────────────────────────────
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
    // حذف من Dexie
    void removeOrder(orderId).catch((err) =>
      console.warn('[db] فشل حذف الطلب من IndexedDB:', err)
    )
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
      // حقن في Dexie
      void injectOrder(order).catch((err) =>
        console.warn('[db] فشل حفظ الطلب في IndexedDB:', err)
      )
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

  // إعلام التبويبات الأخرى محلياً (0 طلبات شبكة)
  _localBus?.postMessage({
    type: 'ORDER_MUTATED',
    orderId,
    merchantId,
    action: event.action,
  })
}


export function useMerchantData(merchantId: string) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: merchantBootstrapKey(merchantId),
    queryFn: async (): Promise<DashboardInitialization> => {
      // 1. تحقق من ذاكرة التاجر المحلية أولاً (Zero-Fetch on Refresh)
      const localProductsCount = await localDB.products.count()
      if (localProductsCount > 0) {
        // البيانات موجودة بالفعل في ذاكرة التاجر! عرض فوري بدون أي استدعاء للسيرفر
        const [products, orders, categories] = await Promise.all([
          localDB.products.toArray(),
          localDB.orders.toArray(),
          localDB.categories.toArray(),
        ])
        const activeOrders = orders.filter(
          (o) => o.status !== 'completed' && o.status !== 'cancelled'
        )
        const archivedOrders = orders.filter(
          (o) => o.status === 'completed' || o.status === 'cancelled'
        )
        return {
          dashboard: {
            products,
            activeOrders,
            archivedOrders,
            storeName: localStorage.getItem('merchant_store_name') || 'متجري',
            username: localStorage.getItem('merchant_username') || '',
            phone: localStorage.getItem('merchant_phone') || '',
          },
          categories,
          lastTimestamp: Date.now(),
          lastEventId: 0,
        }
      }

      // 2. إذا كانت الذاكرة فارغة تماماً (أول تسجيل دخول على هذا المتصفح فقط):
      return fetchDashboardInitialization(true)
    },
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

  // فحص منارة التزامن المشفرة عند فتح اللوحة (صفر استعلامات D1 إذا لم تكن هناك طلبات جديدة)
  useEffect(() => {
    if (!merchantId) return
    void checkSyncBeacon(merchantId).catch((err) => {
      console.warn('[beacon-checker] تعذر فحص منارة التزامن:', err)
    })
  }, [merchantId])

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
    let lockReleaser: (() => void) | null = null
    const setStatus = useRealtimeStore.getState().setStatus

    // ─── استماع التبويبات الثانوية لإشعارات القائد ──────────────────────
    // التبويبات التي لم تفز بالقفل تستمع للـ BroadcastChannel فقط.
    // عند وصول إشعار، تقرأ البيانات من Dexie محلياً (0 HTTP).
    const handleBusMessage = (ev: MessageEvent<unknown>) => {
      const msg = ev.data as Record<string, unknown>
      if (!msg || typeof msg !== 'object') return
      // التبويب الثانوي يُعيد بناء الـ cache من Dexie بشكل lazy
      if (msg.type === 'ORDER_MUTATED' && msg.merchantId === merchantId) {
        void localDB.orders.toArray().then((orders: DashboardOrder[]) => {
          const active = orders.filter(
            (o: DashboardOrder) => o.status !== 'completed' && o.status !== 'cancelled'
          )
          const archived = orders.filter(
            (o: DashboardOrder) => o.status === 'completed' || o.status === 'cancelled'
          )
          queryClient.setQueryData(
            merchantQueryKeys.orders(merchantId, 'active'),
            active
          )
          queryClient.setQueryData(
            merchantQueryKeys.orders(merchantId, 'archived'),
            archived
          )
        })
      }
      if (msg.type === 'PRODUCT_MUTATED' && msg.merchantId === merchantId) {
        void localDB.products.toArray().then((products: DashboardProduct[]) => {
          queryClient.setQueryData(
            merchantQueryKeys.products(merchantId),
            products
          )
          queryClient.setQueryData(
            merchantQueryKeys.dashboardProducts(merchantId),
            products
          )
        })
      }

    }
    _localBus?.addEventListener('message', handleBusMessage)

    // ─── دالة cursor: تقرأ من TanStack Query أولاً ثم من Dexie fallback ──
    const cursor = async () => {
      const snapshot = queryClient.getQueryData<DashboardInitialization>(
        merchantBootstrapKey(merchantId)
      )
      if (snapshot?.lastTimestamp) {
        return {
          timestamp: snapshot.lastTimestamp,
          eventId: snapshot.lastEventId || 0,
        }
      }
      // fallback: اقرأ من Dexie (ما بعد إعادة تحميل الصفحة)
      const local = await readSyncCursor()
      return {
        timestamp: local.lastTimestamp,
        eventId: local.lastEventId,
      }
    }

    const requestTicket = async () => {
      const token =
        localStorage.getItem('merchant_token') ||
        sessionStorage.getItem('merchant_token') ||
        ''
      if (!token) throw new Error('انتهت الجلسة. يرجى تسجيل الدخول مجدداً.')
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

      // ─── تحديث Dexie cursor بعد كل دفعة من الأحداث (غير مُعلِّق) ────
      if (appliedEvents.length > 0) {
        void writeSyncCursor(merchantId, lastEventId, lastTimestamp).catch(
          (err) => console.warn('[db] فشل تحديث sync cursor:', err)
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
        // ─── قراءة الـ Cursor من Dexie (Delta Sync) ──────────────────
        const currentCursor = await cursor()
        const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const url = new URL(`${scheme}//${window.location.host}/api/worker/ws`)
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

      // ─── فحص منارة التزامن المشفرة عند عودة الإنترنت (0 D1 queries إذا لم تكن هناك طلبات جديدة) ───
      void checkSyncBeacon(merchantId).catch((err) => {
        console.warn('[beacon-checker] تعذر فحص منارة التزامن عند عودة النت:', err)
      })
    }
    const onOffline = () => setStatus('offline', 'لا يوجد اتصال بالإنترنت')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)


    // ─── Leader Election عبر Web Locks API ───────────────────────────────
    // التبويب الأول الذي يحصل على القفل يصبح "القائد" ويفتح الاتصال.
    // التبويبات الأخرى تبقى في طابور الانتظار على القفل.
    // إذا أُغلق القائد، يحصل التبويب التالي في الطابور على القفل تلقائياً.
    if ('locks' in navigator) {
      const lockName = `merchant_ws_leader_${merchantId}`
      void navigator.locks.request(lockName, async (lock) => {
        if (!lock || stopped) return
        // هذا التبويب هو القائد — يفتح الاتصال الحقيقي
        void connect()
        // إبقاء القفل مُمسَكاً حتى يتوقف الـ effect
        return new Promise<void>((resolve) => {
          lockReleaser = resolve
        })
      })
    } else {
      // fallback للمتصفحات القديمة: اتصال مباشر بدون Leader Election
      void connect()
    }

    return () => {
      stopped = true
      // تحرير القفل لإتاحة الفرصة للتبويب التالي يصير قائداً
      lockReleaser?.()
      lockReleaser = null
      _localBus?.removeEventListener('message', handleBusMessage)
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
