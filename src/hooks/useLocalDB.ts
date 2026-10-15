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
import { localDB } from '@/lib/db'
import type { DashboardOrder, DashboardProduct } from '@/features/dashboard/dashboard-data'

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
  return useLiveQuery(
    () => localDB.orders.orderBy('createdAt').reverse().toArray(),
    [],
    []
  )
}

/**
 * قراءة الطلبات النشطة فقط (قيد المراجعة / التحضير / التوصيل).
 */
export function useLocalActiveOrders(): DashboardOrder[] {
  return useLiveQuery(
    () =>
      localDB.orders
        .filter((o) => ACTIVE_STATUSES.includes(o.status as (typeof ACTIVE_STATUSES)[number]))
        .toArray()
        .then((arr) => arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    [],
    []
  )
}

/**
 * قراءة الطلبات المؤرشفة (مكتملة / ملغاة).
 */
export function useLocalArchivedOrders(): DashboardOrder[] {
  return useLiveQuery(
    () =>
      localDB.orders
        .filter((o) => ARCHIVED_STATUSES.includes(o.status as (typeof ARCHIVED_STATUSES)[number]))
        .toArray()
        .then((arr) => arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    [],
    []
  )
}

/**
 * عدد الطلبات المنتظرة موافقة التاجر.
 * مفيد لشارة العداد (Badge) في القائمة الجانبية.
 */
export function useLocalPendingOrderCount(): number {
  return useLiveQuery(
    () =>
      localDB.orders
        .where('status')
        .equals('pending_merchant_approval')
        .count(),
    [],
    0
  )
}

/**
 * طلب واحد بمعرّفه.
 */
export function useLocalOrder(orderId: string): DashboardOrder | undefined {
  return useLiveQuery(
    () => localDB.orders.get(orderId),
    [orderId],
    undefined
  )
}

// ─── Hooks للمنتجات ──────────────────────────────────────────────────────

/**
 * قراءة جميع المنتجات مرتبة حسب الاسم.
 */
export function useLocalProducts(): DashboardProduct[] {
  return useLiveQuery(
    () => localDB.products.toArray(),
    [],
    []
  )
}

/**
 * المنتجات المتاحة فقط (isAvailable = true).
 */
export function useLocalAvailableProducts(): DashboardProduct[] {
  return useLiveQuery(
    () =>
      localDB.products
        .filter((p) => p.isAvailable === true)
        .toArray(),
    [],
    []
  )
}

/**
 * منتج واحد بمعرّفه.
 */
export function useLocalProduct(productId: string): DashboardProduct | undefined {
  return useLiveQuery(
    () => localDB.products.get(productId),
    [productId],
    undefined
  )
}

// ─── Hooks للإحصائيات ────────────────────────────────────────────────────

/**
 * إحصائيات لوحة التحكم محسوبة مباشرة من IndexedDB.
 * تتحدث تلقائياً مع كل طلب أو منتج جديد.
 */
export function useLocalDashboardStats() {
  return useLiveQuery(
    async () => {
      const [allOrders, productsCount] = await Promise.all([
        localDB.orders.toArray(),
        localDB.products.count(),
      ])

      const totalRevenue = allOrders.reduce(
        (sum, o) => sum + (Number(o.total) || 0),
        0
      )
      const pendingCount = allOrders.filter(
        (o) => o.status === 'pending_merchant_approval'
      ).length
      const activeCount = allOrders.filter((o) =>
        ACTIVE_STATUSES.includes(o.status as (typeof ACTIVE_STATUSES)[number])
      ).length
      const completedCount = allOrders.filter(
        (o) => o.status === 'completed'
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
    [],
    {
      totalRevenue: 0,
      totalOrders: 0,
      pendingCount: 0,
      activeCount: 0,
      completedCount: 0,
      productsCount: 0,
    }
  )
}
