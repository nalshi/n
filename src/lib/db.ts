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

  constructor(name: string) {
    super(name)

    this.version(1).stores({
      // ++id = auto-increment PK | باقي الحقول = فهارس للاستعلام
      orders: 'id, status, createdAt, total',
      products: 'id, categoryId, isAvailable, approvalStatus',
      categories: 'id, parentId',
      syncState: 'key',
    })
  }
}

const LEGACY_DATABASE_NAME = 'MerchantWorkspaceDB_v1'
const merchantDatabases = new Map<string, MerchantLocalDB>()
const merchantDatabaseOpenings = new Map<string, Promise<MerchantLocalDB>>()

export function getMerchantLocalDB(merchantId: string): MerchantLocalDB {
  const normalizedId = merchantId.trim()
  if (!normalizedId) {
    throw new Error('تعذر فتح ذاكرة التاجر دون معرّف حساب صالح.')
  }

  let database = merchantDatabases.get(normalizedId)
  if (!database) {
    database = new MerchantLocalDB(
      `MerchantWorkspaceDB_v2_${encodeURIComponent(normalizedId)}`
    )
    merchantDatabases.set(normalizedId, database)
  }
  return database
}

export async function openMerchantLocalDB(
  merchantId: string
): Promise<MerchantLocalDB> {
  const normalizedId = merchantId.trim()
  const existingOpening = merchantDatabaseOpenings.get(normalizedId)
  if (existingOpening) return existingOpening

  const opening = (async () => {
    const database = getMerchantLocalDB(normalizedId)
    await database.open()

    if (await database.syncState.get('cursor')) return database
    if (!(await Dexie.exists(LEGACY_DATABASE_NAME))) return database

    const legacyDatabase = new MerchantLocalDB(LEGACY_DATABASE_NAME)
    try {
      await legacyDatabase.open()
      const legacyCursor = await legacyDatabase.syncState.get('cursor')
      if (legacyCursor?.merchantId !== normalizedId) return database

      const [orders, products, categories] = await Promise.all([
        legacyDatabase.orders.toArray(),
        legacyDatabase.products.toArray(),
        legacyDatabase.categories.toArray(),
      ])
      await database.transaction(
        'rw',
        database.orders,
        database.products,
        database.categories,
        database.syncState,
        async () => {
          await Promise.all([
            orders.length ? database.orders.bulkPut(orders) : Promise.resolve(),
            products.length
              ? database.products.bulkPut(products)
              : Promise.resolve(),
            categories.length
              ? database.categories.bulkPut(categories)
              : Promise.resolve(),
            database.syncState.put(legacyCursor),
          ])
        }
      )
      return database
    } finally {
      legacyDatabase.close()
    }
  })()

  merchantDatabaseOpenings.set(normalizedId, opening)
  try {
    return await opening
  } finally {
    merchantDatabaseOpenings.delete(normalizedId)
  }
}

// ─── دوال الكتابة الذرية ──────────────────────────────────────────────────

/**
 * يحقن قائمة طلبات داخل IndexedDB بشكل ذري.
 * يستخدم `bulkPut` لضمان الـ Idempotency:
 *  - إذا كان الطلب موجوداً → يُحدَّث (لا يُكرَّر)
 *  - إذا كان جديداً       → يُضاف
 */
export async function injectOrders(
  merchantId: string,
  orders: DashboardOrder[]
): Promise<void> {
  if (!orders.length) return
  const database = await openMerchantLocalDB(merchantId)
  await database.transaction('rw', database.orders, async () => {
    await database.orders.bulkPut(orders)
  })
}

/**
 * يحقن أو يُحدّث طلباً واحداً داخل IndexedDB.
 */
export async function injectOrder(
  merchantId: string,
  order: DashboardOrder
): Promise<void> {
  const database = await openMerchantLocalDB(merchantId)
  await database.orders.put(order)
}

/**
 * يحذف طلباً من IndexedDB بمعرّفه.
 */
export async function removeOrder(
  merchantId: string,
  orderId: string
): Promise<void> {
  const database = await openMerchantLocalDB(merchantId)
  await database.orders.delete(orderId)
}

/**
 * يحقن أو يُحدّث منتجاً واحداً داخل IndexedDB.
 */
export async function injectProduct(
  merchantId: string,
  product: DashboardProduct
): Promise<void> {
  const database = await openMerchantLocalDB(merchantId)
  await database.products.put(product)
}

/**
 * يحقن قائمة منتجات داخل IndexedDB بشكل ذري.
 */
export async function injectProducts(
  merchantId: string,
  products: DashboardProduct[]
): Promise<void> {
  if (!products.length) return
  const database = await openMerchantLocalDB(merchantId)
  await database.transaction('rw', database.products, async () => {
    await database.products.bulkPut(products)
  })
}

/**
 * يحذف منتجاً من IndexedDB بمعرّفه.
 */
export async function removeProduct(
  merchantId: string,
  productId: string
): Promise<void> {
  const database = await openMerchantLocalDB(merchantId)
  await database.products.delete(productId)
}

/**
 * يحقن قائمة فئات داخل IndexedDB.
 */
export async function injectCategories(
  merchantId: string,
  categories: DashboardCategory[]
): Promise<void> {
  if (!categories.length) return
  const database = await openMerchantLocalDB(merchantId)
  await database.categories.bulkPut(categories)
}

// ─── دوال حالة المزامنة ───────────────────────────────────────────────────

const SYNC_CURSOR_KEY = 'cursor'

/**
 * يقرأ آخر حالة مزامنة مُسجَّلة محلياً.
 * تُستخدم عند إعادة الاتصال لإرسال `since` و `lastEventId` للسيرفر.
 */
export async function readSyncCursor(merchantId: string): Promise<{
  lastEventId: number
  lastTimestamp: number
}> {
  const database = await openMerchantLocalDB(merchantId)
  const state = await database.syncState.get(SYNC_CURSOR_KEY)
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
  const database = await openMerchantLocalDB(merchantId)
  await database.syncState.put({
    key: SYNC_CURSOR_KEY,
    lastEventId,
    lastTimestamp,
    merchantId,
  })
}

/**
 * يمسح بيانات قاعدة التاجر المحددة فقط عند طلب حذفها صراحةً.
 */
export async function clearMerchantLocalDB(merchantId: string): Promise<void> {
  const database = await openMerchantLocalDB(merchantId)
  await database.transaction(
    'rw',
    database.orders,
    database.products,
    database.categories,
    database.syncState,
    async () => {
      await Promise.all([
        database.orders.clear(),
        database.products.clear(),
        database.categories.clear(),
        database.syncState.clear(),
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
  const database = await openMerchantLocalDB(merchantId)
  await database.transaction(
    'rw',
    database.orders,
    database.products,
    database.categories,
    database.syncState,
    async () => {
      // نمسح البيانات القديمة ثم نكتب الجديدة دفعة واحدة
      await Promise.all([
        database.orders.clear(),
        database.products.clear(),
        database.categories.clear(),
      ])
      await Promise.all([
        orders.length ? database.orders.bulkPut(orders) : Promise.resolve(),
        products.length
          ? database.products.bulkPut(products)
          : Promise.resolve(),
        categories.length
          ? database.categories.bulkPut(categories)
          : Promise.resolve(),
      ])
      await database.syncState.put({
        key: SYNC_CURSOR_KEY,
        lastEventId,
        lastTimestamp,
        merchantId,
      })
    }
  )
}
