/**
 * useLocalDB.ts — Hooks للقراءة الحية من IndexedDB عبر Dexie
 *
 * تُستخدم هذه الـ Hooks في المكونات التي تريد القراءة مباشرة من Dexie
 * بدلاً من TanStack Query. النتيجة: تحديث تفاعلي فوري (0ms) بدون
 * أي شبكة أو spinner أو إعادة تحميل.
 *
 * الاستخدام:
 *   const orders = useLocalOrders()          // كل الطلبات
 *   const active = useLocalActiveOrders()    // الطلبات النشطة فقط
 *   const products = useLocalProducts()      // كل المنتجات
 *   const pendingCount = useLocalPendingOrderCount()
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { getMerchantLocalDB } from '@/lib/db'
import { useMerchantIdentity } from '@/hooks/useMerchantRealtime'
import type {
  DashboardOrder,
  DashboardProduct,
} from '@/features/dashboard/dashboard-data'

// ─── حالات الطلبات المُعرَّفة ────────────────────────────────────────────
const ACTIVE_STATUSES = [
  'pending_merchant_approval',
  'accepted',
  'preparing',
  'out_for_delivery',
] as const

const ARCHIVED_STATUSES = ['completed', 'cancelled'] as const

// ─── Hooks للطلبات ───────────────────────────────────────────────────────

/**
 * قراءة جميع الطلبات مرتبة تنازلياً (الأحدث أولاً).
 * يتحدث الـ UI تلقائياً عند أي تغيير في IndexedDB.
 */
export function useLocalOrders(): DashboardOrder[] {
  const merchantId = useMerchantIdentity()
  return useLiveQuery(
    () =>
      merchantId
        ? getMerchantLocalDB(merchantId)
            .orders.orderBy('createdAt')
            .reverse()
            .toArray()
        : Promise.resolve<DashboardOrder[]>([]),
    [merchantId],
    []
  )
}

/**
 * قراءة الطلبات النشطة فقط (قيد المراجعة / التحضير / التوصيل).
 */
export function useLocalActiveOrders(): DashboardOrder[] {
  const merchantId = useMerchantIdentity()
  const database = merchantId ? getMerchantLocalDB(merchantId) : null
  return useLiveQuery(
    () =>
      database
        ? database.orders
            .filter((o: DashboardOrder) =>
              ACTIVE_STATUSES.includes(
                o.status as (typeof ACTIVE_STATUSES)[number]
              )
            )
            .toArray()
            .then((arr: DashboardOrder[]) =>
              arr.sort((a: DashboardOrder, b: DashboardOrder) =>
                b.createdAt.localeCompare(a.createdAt)
              )
            )
        : Promise.resolve<DashboardOrder[]>([]),
    [merchantId],
    []
  )
}

/**
 * قراءة الطلبات المؤرشفة (مكتملة / ملغاة).
 */
export function useLocalArchivedOrders(): DashboardOrder[] {
  const merchantId = useMerchantIdentity()
  const database = merchantId ? getMerchantLocalDB(merchantId) : null
  return useLiveQuery(
    () =>
      database
        ? database.orders
            .filter((o: DashboardOrder) =>
              ARCHIVED_STATUSES.includes(
                o.status as (typeof ARCHIVED_STATUSES)[number]
              )
            )
            .toArray()
            .then((arr: DashboardOrder[]) =>
              arr.sort((a: DashboardOrder, b: DashboardOrder) =>
                b.createdAt.localeCompare(a.createdAt)
              )
            )
        : Promise.resolve<DashboardOrder[]>([]),
    [merchantId],
    []
  )
}

/**
 * عدد الطلبات المنتظرة موافقة التاجر.
 * مفيد لشارة العداد (Badge) في القائمة الجانبية.
 */
export function useLocalPendingOrderCount(): number {
  const merchantId = useMerchantIdentity()
  return useLiveQuery(
    () =>
      merchantId
        ? getMerchantLocalDB(merchantId)
            .orders.where('status')
            .equals('pending_merchant_approval')
            .count()
        : Promise.resolve(0),
    [merchantId],
    0
  )
}

/**
 * طلب واحد بمعرّفه.
 */
export function useLocalOrder(orderId: string): DashboardOrder | undefined {
  const merchantId = useMerchantIdentity()
  return useLiveQuery(
    async () =>
      merchantId
        ? await getMerchantLocalDB(merchantId).orders.get(orderId)
        : undefined,
    [merchantId, orderId],
    undefined
  )
}

// ─── Hooks للمنتجات ──────────────────────────────────────────────────────

/**
 * قراءة جميع المنتجات مرتبة حسب الاسم.
 */
export function useLocalProducts(): DashboardProduct[] {
  const merchantId = useMerchantIdentity()
  return useLiveQuery(
    () =>
      merchantId
        ? getMerchantLocalDB(merchantId).products.toArray()
        : Promise.resolve<DashboardProduct[]>([]),
    [merchantId],
    []
  )
}

/**
 * المنتجات المتاحة فقط (isAvailable = true).
 */
export function useLocalAvailableProducts(): DashboardProduct[] {
  const merchantId = useMerchantIdentity()
  return useLiveQuery(
    () =>
      merchantId
        ? getMerchantLocalDB(merchantId)
            .products.filter((p: DashboardProduct) => p.isAvailable === true)
            .toArray()
        : Promise.resolve<DashboardProduct[]>([]),
    [merchantId],
    []
  )
}

/**
 * منتج واحد بمعرّفه.
 */
export function useLocalProduct(
  productId: string
): DashboardProduct | undefined {
  const merchantId = useMerchantIdentity()
  return useLiveQuery(
    async () =>
      merchantId
        ? await getMerchantLocalDB(merchantId).products.get(productId)
        : undefined,
    [merchantId, productId],
    undefined
  )
}

// ─── Hooks للإحصائيات ────────────────────────────────────────────────────

/**
 * إحصائيات لوحة التحكم محسوبة مباشرة من IndexedDB.
 * تتحدث تلقائياً مع كل طلب أو منتج جديد.
 */
export function useLocalDashboardStats() {
  const merchantId = useMerchantIdentity()
  return useLiveQuery(
    async () => {
      if (!merchantId) {
        return {
          totalRevenue: 0,
          totalOrders: 0,
          pendingCount: 0,
          activeCount: 0,
          completedCount: 0,
          productsCount: 0,
        }
      }
      const database = getMerchantLocalDB(merchantId)
      const [allOrders, productsCount] = await Promise.all([
        database.orders.toArray(),
        database.products.count(),
      ])

      const totalRevenue = allOrders.reduce(
        (sum: number, o: DashboardOrder) => sum + (Number(o.total) || 0),
        0
      )
      const pendingCount = allOrders.filter(
        (o: DashboardOrder) => o.status === 'pending_merchant_approval'
      ).length
      const activeCount = allOrders.filter((o: DashboardOrder) =>
        ACTIVE_STATUSES.includes(o.status as (typeof ACTIVE_STATUSES)[number])
      ).length
      const completedCount = allOrders.filter(
        (o: DashboardOrder) => o.status === 'completed'
      ).length

      return {
        totalRevenue,
        totalOrders: allOrders.length,
        pendingCount,
        activeCount,
        completedCount,
        productsCount,
      }
    },
    [merchantId],
    {
      totalRevenue: 0,
      totalOrders: 0,
      pendingCount: 0,
      completedCount: 0,
      productsCount: 0,
    }
  )
}
