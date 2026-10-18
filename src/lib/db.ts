/**
 * db.ts — قاعدة بيانات IndexedDB المحلية للتاجر (Zero-Fetch Layer)
 *
 * تعمل هذه الطبقة كـ "مخزن حقيقي دائم" منفصل عن TanStack Query cache.
 * TanStack Query = ذاكرة مؤقتة (تُفقد عند إعادة التحميل).
 * Dexie IndexedDB   = مخزن دائم (يبقى حتى لو أُغلق المتصفح).
 *
 * تدفق البيانات:
 *  Firebase RTDB signal
 *   ├─► Dexie.put()           ← الحقن الأساسي الدائم
 *   └─► QueryClient.setQueryData() ← تحديث الـ UI الفوري
 *
 * عند فتح التطبيق:
 *  IndexedDB (Dexie) ──► hydrate QueryClient ──► UI بدون أي HTTP request
 */
import Dexie, { type EntityTable } from 'dexie'
import type {
  DashboardOrder,
  DashboardProduct,
  DashboardCategory,
} from '@/features/dashboard/dashboard-data'

// ─── أنواع التخزين المحلي ──────────────────────────────────────────────────

export interface LocalSyncState {
  /** المفتاح: 'cursor' أو 'last_order_seq' */
  key: string
  /** آخر eventId استُقبل وطُبِّق على قاعدة البيانات المحلية */
  lastEventId?: number
  /** آخر timestamp للحدث (بالمللي ثانية) */
  lastTimestamp?: number
  /** معرّف التاجر المُسجَّل حالياً */
  merchantId?: string
  /** القيمة العامة أو العداد */
  value?: unknown
  /** رقم تسلسلي للمنارة (Beacon sequence counter) */
  seq?: number
}

// ─── تعريف قاعدة البيانات ─────────────────────────────────────────────────

export class MerchantLocalDB extends Dexie {
  /**
   * جدول الطلبات النشطة والمؤرشفة.
   * الفهارس: id (PK) + status + createdAt للفرز والتصفية السريعة.
   */
  orders!: EntityTable<DashboardOrder, 'id'>

  /**
   * جدول المنتجات.
   * الفهارس: id (PK) + categoryId + isAvailable للقراءة السريعة.
   */
  products!: EntityTable<DashboardProduct, 'id'>

  /**
   * جدول الفئات/التصنيفات.
   */
  categories!: EntityTable<DashboardCategory, 'id'>

  /**
   * جدول وحيد الصف لحفظ حالة المزامنة (lastEventId / lastTimestamp).
   */
  syncState!: EntityTable<LocalSyncState, 'key'>

  constructor() {
    super('MerchantWorkspaceDB_v1')

    this.version(1).stores({
      // ++id = auto-increment PK | باقي الحقول = فهارس للاستعلام
      orders: 'id, status, createdAt, total',
      products: 'id, categoryId, isAvailable, approvalStatus',
      categories: 'id, parentId',
      syncState: 'key',
    })
  }
}

/** النسخة الوحيدة من قاعدة البيانات (Singleton) */
export const localDB = new MerchantLocalDB()

// ─── دوال الكتابة الذرية ──────────────────────────────────────────────────

/**
 * يحقن قائمة طلبات داخل IndexedDB بشكل ذري.
 * يستخدم `bulkPut` لضمان الـ Idempotency:
 *  - إذا كان الطلب موجوداً → يُحدَّث (لا يُكرَّر)
 *  - إذا كان جديداً       → يُضاف
 */
export async function injectOrders(orders: DashboardOrder[]): Promise<void> {
  if (!orders.length) return
  await localDB.transaction('rw', localDB.orders, async () => {
    await localDB.orders.bulkPut(orders)
  })
}

/**
 * يحقن أو يُحدّث طلباً واحداً داخل IndexedDB.
 */
export async function injectOrder(order: DashboardOrder): Promise<void> {
  await localDB.orders.put(order)
}

/**
 * يحذف طلباً من IndexedDB بمعرّفه.
 */
export async function removeOrder(orderId: string): Promise<void> {
  await localDB.orders.delete(orderId)
}

/**
 * يحقن أو يُحدّث منتجاً واحداً داخل IndexedDB.
 */
export async function injectProduct(product: DashboardProduct): Promise<void> {
  await localDB.products.put(product)
}

/**
 * يحقن قائمة منتجات داخل IndexedDB بشكل ذري.
 */
export async function injectProducts(
  products: DashboardProduct[]
): Promise<void> {
  if (!products.length) return
  await localDB.transaction('rw', localDB.products, async () => {
    await localDB.products.bulkPut(products)
  })
}

/**
 * يحذف منتجاً من IndexedDB بمعرّفه.
 */
export async function removeProduct(productId: string): Promise<void> {
  await localDB.products.delete(productId)
}

/**
 * يحقن قائمة فئات داخل IndexedDB.
 */
export async function injectCategories(
  categories: DashboardCategory[]
): Promise<void> {
  if (!categories.length) return
  await localDB.categories.bulkPut(categories)
}

// ─── دوال حالة المزامنة ───────────────────────────────────────────────────

const SYNC_CURSOR_KEY = 'cursor'

/**
 * يقرأ آخر حالة مزامنة مُسجَّلة محلياً.
 * تُستخدم عند إعادة الاتصال لإرسال `since` و `lastEventId` للسيرفر.
 */
export async function readSyncCursor(): Promise<{
  lastEventId: number
  lastTimestamp: number
}> {
  const state = await localDB.syncState.get(SYNC_CURSOR_KEY)
  return {
    lastEventId: state?.lastEventId ?? 0,
    lastTimestamp: state?.lastTimestamp ?? 0,
  }
}

/**
 * يحفظ حالة المزامنة بعد تطبيق حدث جديد.
 * يُستدعى تلقائياً من داخل `useRealtimeSync` بعد كل حدث ناجح.
 */
export async function writeSyncCursor(
  merchantId: string,
  lastEventId: number,
  lastTimestamp: number
): Promise<void> {
  await localDB.syncState.put({
    key: SYNC_CURSOR_KEY,
    lastEventId,
    lastTimestamp,
    merchantId,
  })
}

/**
 * يمسح كامل بيانات التاجر من IndexedDB (عند تسجيل الخروج أو تغيير الحساب).
 */
export async function clearMerchantLocalDB(): Promise<void> {
  await localDB.transaction(
    'rw',
    localDB.orders,
    localDB.products,
    localDB.categories,
    localDB.syncState,
    async () => {
      await Promise.all([
        localDB.orders.clear(),
        localDB.products.clear(),
        localDB.categories.clear(),
        localDB.syncState.clear(),
      ])
    }
  )
}

/**
 * يُحمِّل (Hydrate) كامل بيانات Snapshot الأولي داخل IndexedDB.
 * يُستدعى مرة واحدة فقط عند استلام الـ Snapshot الأول من الخادم.
 */
export async function hydrateFromSnapshot(params: {
  merchantId: string
  orders: DashboardOrder[]
  products: DashboardProduct[]
  categories: DashboardCategory[]
  lastEventId: number
  lastTimestamp: number
}): Promise<void> {
  const {
    merchantId,
    orders,
    products,
    categories,
    lastEventId,
    lastTimestamp,
  } = params
  await localDB.transaction(
    'rw',
    localDB.orders,
    localDB.products,
    localDB.categories,
    localDB.syncState,
    async () => {
      // نمسح البيانات القديمة ثم نكتب الجديدة دفعة واحدة
      await Promise.all([
        localDB.orders.clear(),
        localDB.products.clear(),
        localDB.categories.clear(),
      ])
      await Promise.all([
        orders.length ? localDB.orders.bulkPut(orders) : Promise.resolve(),
        products.length
          ? localDB.products.bulkPut(products)
          : Promise.resolve(),
        categories.length
          ? localDB.categories.bulkPut(categories)
          : Promise.resolve(),
      ])
      await localDB.syncState.put({
        key: SYNC_CURSOR_KEY,
        lastEventId,
        lastTimestamp,
        merchantId,
      })
    }
  )
}
