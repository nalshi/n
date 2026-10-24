import { authApiRequest } from '@/lib/auth-api'
import { getMerchantIdentityFromToken } from '@/lib/merchant-accounts'
import type { ApiResult } from '@/lib/merchant-api'

type ApiRecord = Record<string, unknown>

export type ProductOption = {
  id: string
  name: string
  quantityType: 'tracked' | 'unlimited'
  quantity: number
  useMainImage: boolean
  image: string
  customPrice: number | null
}

export type DashboardProduct = {
  id: string
  productNumber: string
  name: string
  description: string
  type: string
  categoryId: string
  image: string
  price: number
  costPrice: number
  discount: number
  currency: string
  createdAt: string
  quantity: number
  quantityType: 'tracked' | 'unlimited'
  isAvailable: boolean
  approvalStatus: string
  options: ProductOption[]
}

export type DashboardCategory = {
  id: string
  name: string
  parentId: string
}

export type DashboardOrder = {
  id: string
  customerName: string
  customerPhone: string
  deliveryAddress: string
  deliveryMapUrl: string
  total: number
  deliveryFee: number
  currency: string
  status: string
  createdAt: string
  items: DashboardOrderItem[]
}

export type DashboardOrderItem = {
  id: string
  name: string
  image: string
  quantity: number
  price: number
  costPrice: number
}

export type DashboardData = {
  storeName: string
  username: string
  phone: string
  products: DashboardProduct[]
  activeOrders: DashboardOrder[]
  archivedOrders: DashboardOrder[]
}

export type DashboardInitialization = {
  dashboard: DashboardData
  categories: DashboardCategory[]
  lastTimestamp: number
  lastEventId: number
}

export type DashboardOrderSummary = {
  awaitingOrders: number
  deliveryOrders: DashboardOrder[]
  recentOrders: DashboardOrder[]
}

export function summarizeDashboardOrders(
  activeOrders: DashboardOrder[],
  archivedOrders: DashboardOrder[]
): DashboardOrderSummary {
  let awaitingOrders = 0
  const deliveryOrders: DashboardOrder[] = []
  const recentOrders: DashboardOrder[] = []
  const recentTimestamps: number[] = []
  const seenOrderIds = new Set<string>()

  for (const order of activeOrders) {
    if (order.status === 'pending_merchant_approval') awaitingOrders += 1
    if (order.status === 'out_for_delivery') deliveryOrders.push(order)
  }

  for (const orders of [activeOrders, archivedOrders]) {
    for (const order of orders) {
      if (seenOrderIds.has(order.id)) continue
      seenOrderIds.add(order.id)

      const timestamp = Date.parse(order.createdAt) || 0
      let index = 0
      while (
        index < recentTimestamps.length &&
        recentTimestamps[index] >= timestamp
      ) {
        index += 1
      }
      if (index === 5) continue

      recentOrders.splice(index, 0, order)
      recentTimestamps.splice(index, 0, timestamp)
      if (recentOrders.length > 5) {
        recentOrders.pop()
        recentTimestamps.pop()
      }
    }
  }

  return { awaitingOrders, deliveryOrders, recentOrders }
}

function asRecord(value: unknown): ApiRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as ApiRecord)
    : null
}

function readString(...values: unknown[]): string {
  const value = values.find(
    (candidate) => typeof candidate === 'string' && candidate.trim()
  )
  return typeof value === 'string' ? value.trim() : ''
}

function readProductImage(...values: unknown[]): string {
  const image = readString(...values)
  return /^https?:\/\/(?:[^/]+\.)?loremflickr\.com(?:\/|$)/i.test(image)
    ? ''
    : image
}

function readIdentifier(...values: unknown[]): string {
  const value = values.find(
    (candidate) =>
      (typeof candidate === 'string' && candidate.trim()) ||
      (typeof candidate === 'number' && Number.isFinite(candidate))
  )
  return value === undefined || value === null ? '' : String(value)
}

function readNumber(value: unknown): number {
  const number =
    typeof value === 'number' ? value : Number.parseFloat(String(value))
  return Number.isFinite(number) ? number : 0
}

function readTimestamp(...values: unknown[]): string {
  const value = values.find(
    (candidate) =>
      (typeof candidate === 'string' && candidate.trim()) ||
      (typeof candidate === 'number' && Number.isFinite(candidate))
  )
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }
  return typeof value === 'string' ? value.trim() : ''
}

function readRows(result: ApiResult, action: string): ApiRecord[] {
  if (result.status !== 'success' && result.status !== 'ok') {
    throw new Error(result.message || `تعذر تحميل ${action}.`)
  }

  const data = result.data
  const record = asRecord(data)
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(result.products)
      ? result.products
      : Array.isArray(result.orders)
        ? result.orders
        : Array.isArray(record?.products)
          ? record.products
          : Array.isArray(record?.orders)
            ? record.orders
            : Array.isArray(record?.categories)
              ? record.categories
              : Array.isArray(record?.results)
                ? record.results
                : null

  if (!rows) throw new Error(`صيغة بيانات ${action} غير متوقعة.`)
  return rows.map((row) => {
    const item = asRecord(row)
    if (!item) throw new Error(`تحتوي بيانات ${action} على عنصر غير صالح.`)
    return item
  })
}

function normalizeSettings(result: ApiResult) {
  if (result.status !== 'success' && result.status !== 'ok') {
    throw new Error(result.message || 'تعذر تحميل بيانات المتجر.')
  }

  const merchant = asRecord(result.data)
  if (!merchant) throw new Error('صيغة بيانات المتجر غير متوقعة.')

  let settings = asRecord(merchant.settings)
  if (!settings && typeof merchant.settings === 'string') {
    try {
      settings = asRecord(JSON.parse(merchant.settings) as unknown)
    } catch {
      throw new Error('صيغة إعدادات المتجر غير صالحة.')
    }
  }

  const username = readString(
    merchant.username,
    merchant.store_username
  ).replace(/^@/, '')
  const configuredStoreName = readString(
    merchant.store_name,
    merchant.storeName,
    settings?.store_name,
    settings?.storeName,
    merchant.merchant_name,
    merchant.merchantName,
    settings?.merchant_name,
    settings?.merchantName,
    merchant.name,
    settings?.name
  )
  const actualStoreName = [configuredStoreName, merchant.name, settings?.name]
    .map((value) => readString(value))
    .find(
      (name) =>
        name &&
        ![
          'متجري',
          'اسم المتجر',
          'متجرنا',
          'التاجر',
          'my store',
          'store name',
        ].includes(name.toLocaleLowerCase())
    )

  return {
    storeName: actualStoreName || 'اسم المتجر',
    username,
    phone: readString(
      merchant.phone,
      settings?.phone,
      settings?.whatsapp,
      settings?.whatsappNumber
    ),
  }
}

function normalizeOptions(value: unknown): ProductOption[] {
  let options = value
  if (typeof options === 'string') {
    try {
      options = JSON.parse(options) as unknown
    } catch {
      throw new Error('صيغة خيارات أحد المنتجات غير صالحة.')
    }
  }
  if (!Array.isArray(options)) return []

  return options.flatMap((candidate, index) => {
    const option = asRecord(candidate)
    if (!option) return []
    return [
      {
        id: readIdentifier(option.id) || `option-${index}`,
        name: readString(option.name),
        quantityType:
          option.quantity_type === 'unlimited' ? 'unlimited' : 'tracked',
        quantity: readNumber(option.quantity),
        useMainImage:
          option.use_main_image === true ||
          option.use_main_image === 1 ||
          option.use_main_image === '1' ||
          !readString(option.image),
        image: readString(option.image),
        customPrice:
          option.custom_price === null || option.custom_price === undefined
            ? null
            : readNumber(option.custom_price),
      },
    ]
  })
}

function normalizeProducts(result: ApiResult): DashboardProduct[] {
  return readRows(result, 'المنتجات')
    .map((product) => ({
      id: readIdentifier(
        product.id,
        product.global_product_id,
        product.product_id
      ),
      productNumber: readIdentifier(product.product_number),
      name: readString(product.name, product.product_name) || 'منتج بدون اسم',
      description: readString(product.description, product.mainDescription),
      type:
        readString(product.type, product.category_name, product.category) ===
        'عام'
          ? ''
          : readString(product.type, product.category_name, product.category),
      categoryId: readIdentifier(product.category_id),
      image: readProductImage(
        product.image,
        product.image_url,
        product.imageUrl
      ),
      price: readNumber(product.price),
      costPrice: readNumber(product.cost_price),
      discount: readNumber(product.discount),
      currency: readString(product.currency) || 'YER',
      createdAt: readTimestamp(
        product.created_at,
        product.createdAt,
        product.updated_at,
        product.updatedAt
      ),
      quantity:
        product.quantity_type === 'unlimited'
          ? 9999
          : readNumber(product.quantity),
      quantityType:
        product.quantity_type === 'unlimited'
          ? ('unlimited' as const)
          : ('tracked' as const),
      isAvailable:
        product.is_available === true ||
        product.is_available === 1 ||
        product.is_available === '1' ||
        product.isAvailable === true ||
        product.isAvailable === 1 ||
        product.isAvailable === '1' ||
        (product.is_available === undefined &&
          product.isAvailable === undefined),
      approvalStatus: readString(product.approval_status) || 'approved',
      options: normalizeOptions(product.options),
    }))
    .filter((product) => product.id)
    .sort(
      (left, right) =>
        (Date.parse(right.createdAt) || 0) - (Date.parse(left.createdAt) || 0)
    )
}

function normalizeOrders(result: ApiResult): DashboardOrder[] {
  return readRows(result, 'الطلبات')
    .map((order) => {
      let archivedData = asRecord(order.archived_data)
      if (!archivedData && typeof order.archived_data === 'string') {
        try {
          archivedData = asRecord(JSON.parse(order.archived_data) as unknown)
        } catch {
          throw new Error('صيغة بيانات أحد الطلبات المؤرشفة غير صالحة.')
        }
      }
      let ticketData = asRecord(order.ticket_data)
      if (!ticketData && typeof order.ticket_data === 'string') {
        try {
          ticketData = asRecord(JSON.parse(order.ticket_data) as unknown)
        } catch {
          throw new Error('صيغة بيانات أحد الطلبات النشطة غير صالحة.')
        }
      }
      const orderData = ticketData || archivedData
      const customer = asRecord(orderData?.customer)
      const financials = asRecord(orderData?.financials)
      return {
        id: readIdentifier(order.id, order.ticket_id),
        customerName:
          readString(order.customer_name, order.customerName, customer?.name) ||
          'عميل',
        customerPhone: readString(
          order.customer_phone,
          order.phone,
          customer?.phone
        ),
        deliveryAddress: readString(
          order.delivery_address_text,
          order.delivery_address,
          order.address,
          customer?.address_text
        ),
        deliveryMapUrl: readString(
          order.delivery_gps_link,
          order.delivery_map_url,
          order.map_url,
          customer?.gps_link
        ),
        total: readNumber(
          order.total_amount ?? financials?.grand_total ?? order.total
        ),
        deliveryFee: readNumber(order.delivery_fee ?? financials?.delivery_fee),
        currency: readString(order.currency, financials?.currency) || 'YER',
        status: readString(order.status, order.final_status),
        createdAt: readTimestamp(
          order.created_at,
          order.createdAt,
          order.updated_at,
          order.archived_at
        ),
        items: normalizeOrderItems(order.items ?? orderData?.items),
      }
    })
    .filter((order) => order.id)
    .sort(
      (left, right) =>
        (Date.parse(right.createdAt) || 0) - (Date.parse(left.createdAt) || 0)
    )
}

export function normalizeRealtimeProducts(value: unknown): DashboardProduct[] {
  return normalizeProducts({ status: 'success', data: value })
}

export function normalizeRealtimeOrders(value: unknown): DashboardOrder[] {
  return normalizeOrders({ status: 'success', data: value })
}

export function normalizeRealtimeCategories(
  value: unknown
): DashboardCategory[] {
  return normalizeCategories({ status: 'success', data: value })
}

export function normalizeRealtimeMerchant(value: unknown) {
  return normalizeSettings({ status: 'success', data: value })
}

function normalizeOrderItems(value: unknown): DashboardOrderItem[] {
  let items = value
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items) as unknown
    } catch {
      throw new Error('صيغة منتجات أحد الطلبات غير صالحة.')
    }
  }
  if (items === undefined || items === null) return []
  if (!Array.isArray(items))
    throw new Error('صيغة منتجات أحد الطلبات غير صالحة.')
  return items.flatMap((candidate, index) => {
    const item = asRecord(candidate)
    if (!item) return []
    return [
      {
        id: readIdentifier(item.id, item.product_id) || `item-${index}`,
        name: readString(item.product_name, item.name) || 'منتج',
        image: readProductImage(item.image, item.image_url),
        quantity: Math.max(1, readNumber(item.quantity) || 1),
        price: readNumber(item.price),
        costPrice: readNumber(item.cost_price),
      },
    ]
  })
}

function normalizeCategories(result: ApiResult): DashboardCategory[] {
  return readRows(result, 'الفئات')
    .map((category) => ({
      id: readIdentifier(category.id),
      name: readString(category.name),
      parentId:
        readIdentifier(category.parent_id) === '0'
          ? ''
          : readIdentifier(category.parent_id),
    }))
    .filter((category) => category.id && category.name)
}

let dashboardInitializationToken = ''
let dashboardInitializationRequest: Promise<DashboardInitialization> | null =
  null

export function clearDashboardInitializationCache() {
  dashboardInitializationToken = ''
  dashboardInitializationRequest = null
}

function getMerchantToken() {
  if (typeof window === 'undefined') return ''
  return (
    localStorage.getItem('merchant_token') ||
    sessionStorage.getItem('merchant_token') ||
    ''
  )
}

function getMerchantIdFromToken(token: string) {
  return getMerchantIdentityFromToken(token)
}

export function fetchDashboardInitialization(
  forceRefresh = false
): Promise<DashboardInitialization> {
  const token = getMerchantToken()
  if (!token) throw new Error('انتهت الجلسة. يرجى تسجيل الدخول مجدداً.')

  if (token !== dashboardInitializationToken) {
    dashboardInitializationToken = token
    dashboardInitializationRequest = null
  }
  if (!forceRefresh && dashboardInitializationRequest) {
    return dashboardInitializationRequest
  }

  const query = forceRefresh ? '?refresh=1' : ''
  const request = fetch(`/api/work/api/merchant/bootstrap${query}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Merchant-Id': getMerchantIdFromToken(token),
    },
    cache: 'no-store',
  })
    .then(async (response) => {
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        throw new Error(
          'مسار API أعاد صفحة الموقع بدل بيانات اللوحة. تأكد من نشر Cloudflare Pages Function لمسار /api/work/* وضبط WORKER_URL وPROXY_SECRET.'
        )
      }

      let payload: unknown
      try {
        const rawText = await response.text()
        payload = JSON.parse(rawText)
      } catch {
        if (!response.ok) {
          throw new Error(`تعذر الاتصال بالخادم (${response.status}).`)
        }
        throw new Error('أعاد الخادم استجابة غير صالحة لبيانات لوحة التحكم.')
      }

      const envelope = asRecord(payload)
      const nestedData = asRecord(envelope?.data)
      const result =
        envelope?.status === 'success' && nestedData ? nestedData : envelope
      if (!response.ok || !result) {
        const message =
          typeof result?.message === 'string'
            ? result.message
            : 'تعذر تحميل بيانات لوحة التحكم.'
        throw new Error(message)
      }
      if (result.status === 'ok') {
        throw new Error(
          'يرد خادم تهيئة اللوحة بردّ عام بدل بيانات التاجر. انشر أحدث نسخة من عامل API وتأكد من توجيه /api/merchant/bootstrap إليه.'
        )
      }
      if (
        !Array.isArray(result.products) ||
        !Array.isArray(result.orders) ||
        !Array.isArray(result.archivedOrders) ||
        !Array.isArray(result.categories) ||
        !asRecord(result.settings)
      ) {
        throw new Error('صيغة بيانات تهيئة لوحة التحكم غير متوقعة.')
      }

      const success = { status: 'success', data: undefined }
      const dashboard: DashboardData = {
        ...normalizeSettings({ ...success, data: result.settings }),
        products: normalizeProducts({ ...success, data: result.products }),
        activeOrders: normalizeOrders({ ...success, data: result.orders }),
        archivedOrders: normalizeOrders({
          ...success,
          data: result.archivedOrders,
        }),
      }

      return {
        dashboard,
        categories: normalizeCategories({
          ...success,
          data: result.categories,
        }),
        lastTimestamp: readNumber(result.lastTimestamp),
        lastEventId: readNumber(result.lastEventId),
      }
    })
    .catch((error: unknown) => {
      if (dashboardInitializationRequest === request) {
        dashboardInitializationRequest = null
      }
      throw error
    })

  dashboardInitializationRequest = request
  return request
}

export async function fetchDashboardData(): Promise<DashboardData> {
  return (await fetchDashboardInitialization()).dashboard
}

export async function fetchDashboardProducts(): Promise<DashboardProduct[]> {
  return (await fetchDashboardInitialization()).dashboard.products
}

export async function fetchDashboardCategories(): Promise<DashboardCategory[]> {
  return (await fetchDashboardInitialization()).categories
}

export async function fetchDashboardOrders(
  filter: 'active' | 'archived'
): Promise<DashboardOrder[]> {
  const result = await authApiRequest('get_orders', { filter })
  const orders = normalizeOrders(result)
  return filter === 'active'
    ? orders.filter(
        (order) => order.status !== 'completed' && order.status !== 'cancelled'
      )
    : orders
}

export async function updateDashboardOrderStatus(
  ticketId: string,
  status: 'confirmed_by_store' | 'out_for_delivery'
): Promise<string> {
  const result = await authApiRequest('update_order_status', {
    ticket_id: ticketId,
    status,
  })
  if (result.status !== 'success') {
    throw new Error(result.message || 'تعذر تحديث حالة الطلب.')
  }
  clearDashboardInitializationCache()
  return result.message || ''
}

export async function cancelDashboardOrder(ticketId: string): Promise<string> {
  const result = await authApiRequest('cancel_order', {
    ticket_id: ticketId,
    reason: 'تم الإلغاء من قبل المتجر',
  })
  if (result.status !== 'success') {
    throw new Error(result.message || 'تعذر إلغاء الطلب.')
  }
  clearDashboardInitializationCache()
  return result.message || ''
}

export async function confirmDashboardOrderDelivery(
  ticketId: string,
  code: string
): Promise<string> {
  if (!/^\d{4}$/.test(code)) {
    throw new Error('أدخل كود تسليم صحيحاً من 4 أرقام.')
  }
  const result = await authApiRequest('confirm_delivery_code', {
    ticket_id: ticketId,
    code,
  })
  if (result.status !== 'success') {
    throw new Error(result.message || 'تعذر تأكيد تسليم الطلب.')
  }
  clearDashboardInitializationCache()
  return result.message || ''
}

export async function fetchDashboardUsername(): Promise<string> {
  const { dashboard } = await fetchDashboardInitialization()
  const username = dashboard.username
  if (!username) throw new Error('اسم المستخدم للمتجر غير متوفر.')
  return username
}

export async function saveDashboardProduct(
  payload: FormData,
  onUploadProgress?: (progress: number) => void
): Promise<string> {
  const result = onUploadProgress
    ? await authApiRequest('save_product', payload, onUploadProgress)
    : await authApiRequest('save_product', payload)
  if (result.status !== 'success' && result.status !== 'ok') {
    throw new Error(result.message || 'تعذر حفظ المنتج.')
  }
  clearDashboardInitializationCache()
  return readIdentifier(result.id) || String(payload.get('id') || '')
}

export async function deleteDashboardProduct(id: string): Promise<void> {
  const result = await authApiRequest('delete_product', {
    id,
    product_id: id,
  })
  if (result.status !== 'success' && result.status !== 'ok') {
    throw new Error(result.message || 'تعذر حذف المنتج.')
  }
  clearDashboardInitializationCache()
}

export async function updateDashboardAvailability(
  productId: string,
  isAvailable: boolean
): Promise<void> {
  const result = await authApiRequest('toggle_availability', {
    id: productId,
    product_id: productId,
    is_available: isAvailable ? 1 : 0,
    isAvailable: isAvailable ? 1 : 0,
  })
  if (result.status !== 'success' && result.status !== 'ok') {
    throw new Error(result.message || 'تعذر تحديث إتاحة المنتج.')
  }
  clearDashboardInitializationCache()
}

export async function updateDashboardProductStock(
  product: DashboardProduct,
  stock: {
    quantity: number
    quantityType: 'tracked' | 'unlimited'
    options: Array<{
      id: string
      quantity: number
      quantityType: 'tracked' | 'unlimited'
    }>
  }
): Promise<string> {
  const result = await authApiRequest('update_product_stock', {
    product_id: product.id,
    quantity: stock.quantity,
    quantity_type: stock.quantityType,
    options: stock.options.map((option) => ({
      id: option.id,
      quantity: option.quantity,
      quantity_type: option.quantityType,
    })),
  })
  if (result.status !== 'success' && result.status !== 'ok') {
    throw new Error(result.message || 'تعذر تحديث مخزون المنتج.')
  }
  clearDashboardInitializationCache()
  return result.message || ''
}

export async function compressDashboardImage(
  file: File,
  quality = 0.8,
  maxDimension = 1200
): Promise<Blob> {
  const signature = await file.slice(0, 12).arrayBuffer()
  const header = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
  const supported =
    header.startsWith('FFD8FF') ||
    header.startsWith('89504E47') ||
    (header.startsWith('52494646') && header.slice(16, 24) === '57454250') ||
    header.startsWith('47494638')
  if (!supported) {
    throw new Error('صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP أو GIF.')
  }

  const image = new Image()
  const objectUrl = URL.createObjectURL(file)
  try {
    image.src = objectUrl
    await image.decode()
    const baseScale = Math.min(
      1,
      maxDimension / Math.max(image.width, image.height)
    )
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('تعذر تجهيز الصورة.')
    const scales = [1, 0.85, 0.7, 0.55]
    const qualities = [quality, 0.72, 0.62, 0.52]
    let smallestBlob: Blob | null = null
    for (const scaleFactor of scales) {
      const scale = baseScale * scaleFactor
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      for (const candidateQuality of qualities) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/webp', candidateQuality)
        )
        if (!blob || blob.type !== 'image/webp') {
          throw new Error('تعذر تحويل الصورة إلى WebP في هذا المتصفح.')
        }
        if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob
        if (blob.size <= 700 * 1024) return blob
      }
    }
    if (!smallestBlob) throw new Error('تعذر ضغط الصورة.')
    return smallestBlob
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function uploadDashboardImage(
  file: File,
  onUploadProgress?: (progress: number) => void
): Promise<string> {
  const webp =
    file.type === 'image/webp' ? file : await compressDashboardImage(file)
  const payload = new FormData()
  payload.append('image_data', webp, 'product.webp')
  const result = onUploadProgress
    ? await authApiRequest('upload_image', payload, onUploadProgress)
    : await authApiRequest('upload_image', payload)
  const record = asRecord(result.data)
  const url = readString(result.url, record?.url, record?.image)
  if (result.status !== 'success' || !url) {
    throw new Error(result.message || 'تعذر رفع الصورة.')
  }
  return url
}

export function buildPendingCategoryChain(
  categories: DashboardCategory[],
  leafId: string
) {
  const names: string[] = []
  let currentId = leafId
  const visited = new Set<string>()

  while (currentId.startsWith('NEW:') && !visited.has(currentId)) {
    visited.add(currentId)
    const node = categories.find((category) => category.id === currentId)
    if (!node) break
    names.unshift(node.name)
    currentId = node.parentId
  }

  return {
    names,
    anchorId: currentId && !currentId.startsWith('NEW:') ? currentId : '0',
  }
}
