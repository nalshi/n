import legacyWorker from './legacyWorker.js'
import { MerchantSession } from './MerchantSession'
import { assertAllowed, HttpError } from './security/rbac.js'
import { timingSafeEqual, verifyJWT } from './security/auth.js'
import { ROLES } from './config/constants.js'
import { getCategoriesTree } from './services/categories/categoryService.js'
import {
  createDeletedProductEventInsertStatement,
  createOrderEventInsertStatement,
  createProductEventInsertStatement,
  publishStoredMerchantEvent,
} from './services/realtime/merchantEvents.js'

export { MerchantSession }

interface Env {
  DB: D1Database
  MERCHANT_SESSION: DurableObjectNamespace<MerchantSession>
  APP_SECRET_KEY: string
  INTERNAL_SYNC_KEY?: string
  PROXY_SECRET?: string
  PROXY_SECRETS?: string
}

type RecordValue = Record<string, unknown>

function jsonResponse(
  data: unknown,
  status = 200,
  headers: HeadersInit = {}
): Response {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  })
}

function hasValidGateway(request: Request, env: Env): boolean {
  const secrets = (env.PROXY_SECRETS || env.PROXY_SECRET || '')
    .split(',')
    .map((secret) => secret.trim())
    .filter(Boolean)
  const gatewaySecret = request.headers.get('X-Gateway-Secret') || ''
  const internalKey = request.headers.get('X-Internal-Key') || ''
  const trustedGateway = secrets.some((secret) =>
    timingSafeEqual(gatewaySecret, secret)
  )
  const trustedInternal = Boolean(env.INTERNAL_SYNC_KEY) &&
    timingSafeEqual(internalKey, env.INTERNAL_SYNC_KEY || '')

  if (!trustedGateway && !trustedInternal) return false

  const timestamp = request.headers.get('X-Gateway-Timestamp')
  if (!timestamp) return trustedInternal
  const requestTime = Number(timestamp)
  return Number.isFinite(requestTime) &&
    Math.abs(Date.now() - requestTime) <= 60_000
}

async function merchantFromRequest(
  request: Request,
  env: Env
): Promise<{ id: string } | Response> {
  const token = (request.headers.get('Authorization') || '')
    .replace(/^Bearer\s+/i, '')
    .trim()
  if (!token) return jsonResponse({ message: 'غير مصرح' }, 401)

  try {
    const user = await verifyJWT(token, env.APP_SECRET_KEY)
    if (!user?.user_id) return jsonResponse({ message: 'غير مصرح' }, 401)
    assertAllowed(user, [ROLES.MERCHANT])

    const requestedMerchant = request.headers.get('X-Merchant-Id')
    const merchantId = String(user.user_id)
    if (requestedMerchant && requestedMerchant !== merchantId) {
      return jsonResponse({ message: 'هوية التاجر غير متطابقة' }, 403)
    }
    return { id: merchantId }
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ message: error.message }, error.status)
    }
    console.error('Merchant bootstrap authentication failed:', error)
    return jsonResponse({ message: 'تعذر التحقق من جلسة التاجر' }, 401)
  }
}

function parseJsonObject(value: unknown): RecordValue {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as RecordValue
  }
  return {}
}

function parseStoredJson(value: unknown, fallback: unknown, label: string) {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value) as unknown
  } catch (error) {
    console.warn(`Invalid ${label} JSON in D1:`, error)
    return fallback
  }
}

async function bootstrap(request: Request, env: Env): Promise<Response> {
  if (!hasValidGateway(request, env)) {
    return jsonResponse({ message: 'Access denied' }, 403)
  }

  const auth = await merchantFromRequest(request, env)
  if (auth instanceof Response) return auth
  const merchantId = auth.id

  try {
    const [productsResult, ordersResult, settingsResult, archivedResult, cursorResult] =
      await env.DB.batch([
        env.DB.prepare(
          'SELECT * FROM products WHERE merchant_id = ? ORDER BY updated_at DESC'
        ).bind(merchantId),
        env.DB.prepare(
          'SELECT ticket_id AS id, order_group_id, status, created_at, delivery_code, delivery_agent_id, ticket_data FROM live_tickets WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 200'
        ).bind(merchantId),
        env.DB.prepare(
          'SELECT id, username, store_name, phone, store_type, settings, created_at FROM users WHERE id = ?'
        ).bind(merchantId),
        env.DB.prepare(
          'SELECT ticket_id AS id, order_group_id, final_status AS status, archived_at AS created_at, archived_data, total_amount FROM orders_archive WHERE merchant_id = ? ORDER BY archived_at DESC LIMIT 100'
        ).bind(merchantId),
        env.DB.prepare(
          'SELECT event_id, occurred_at FROM sync_events WHERE merchant_id = ? ORDER BY event_id DESC LIMIT 1'
        ).bind(merchantId),
      ])

    const settingsRow = settingsResult.results[0]
    const settings = parseStoredJson(settingsRow?.settings, {}, 'merchant settings')
    const profile = settingsRow
      ? {
          ...settingsRow,
          settings,
          is_first_login:
            !settingsRow.store_name ||
            settingsRow.store_name === settingsRow.username,
        }
      : {}

    const products = productsResult.results.map((product) => ({
      ...product,
      options: parseStoredJson(product.options, [], 'product options'),
    }))
    const orders = ordersResult.results.map((row) => {
      const ticketData = parseJsonObject(
        parseStoredJson(row.ticket_data, {}, 'active order')
      )
      const customer = parseJsonObject(ticketData.customer)
      const financials = parseJsonObject(ticketData.financials)
      return {
        id: row.id || row.ticket_id,
        order_group_id: row.order_group_id,
        total_amount: financials.grand_total ?? 0,
        currency: financials.currency || 'YER',
        delivery_fee: financials.delivery_fee ?? 0,
        delivery_address_text: customer.address_text || 'عنوان غير محدد',
        delivery_gps_link: customer.gps_link || '',
        status: row.status,
        created_at: row.created_at,
        delivery_code: row.delivery_code || '',
        customer_name: customer.name || 'عميل',
        customer_phone: customer.phone || '',
        items: Array.isArray(ticketData.items) ? ticketData.items : [],
        is_agent_assigned:
          row.delivery_agent_id !== null && row.delivery_agent_id !== undefined,
      }
    })
    const archivedOrders = archivedResult.results.map((row) => ({
      id: row.id,
      order_group_id: row.order_group_id,
      status: row.status,
      created_at: row.created_at,
      archived_data: row.archived_data,
      total_amount: row.total_amount,
    }))
    const categories = await getCategoriesTree(env, merchantId)
    const cursor = cursorResult.results[0]

    return jsonResponse({
      settings: profile,
      products,
      orders,
      archivedOrders,
      categories: categories || [],
      lastTimestamp: cursor ? Number(cursor.occurred_at) : 0,
      lastEventId: cursor ? Number(cursor.event_id) : 0,
    })
  } catch (error) {
    console.error('Merchant bootstrap failed:', error)
    return jsonResponse({ message: 'تعذر تحميل بيانات لوحة التحكم.' }, 500)
  }
}

function readText(record: RecordValue, key: string): string {
  const value = record[key]
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : ''
}

async function triggerEvent(request: Request, env: Env, ctx: ExecutionContext) {
  if (!hasValidGateway(request, env)) {
    return jsonResponse({ message: 'Access denied' }, 403)
  }
  if (
    !env.INTERNAL_SYNC_KEY ||
    request.headers.get('X-Internal-Key') !== env.INTERNAL_SYNC_KEY
  ) {
    return jsonResponse({ message: 'Internal authorization required' }, 401)
  }

  let input: RecordValue
  try {
    input = parseJsonObject(await request.json())
  } catch {
    return jsonResponse({ message: 'Invalid JSON body' }, 400)
  }

  const merchantId = readText(input, 'merchantId')
  const type = input.type
  const action = input.action
  const data = parseJsonObject(input.data)
  if (
    !merchantId ||
    (type !== 'product' && type !== 'order') ||
    (action !== 'created' && action !== 'updated' && action !== 'deleted')
  ) {
    return jsonResponse({ message: 'Invalid merchant event' }, 400)
  }

  try {
    let entityId = ''
    let mutation: D1PreparedStatement
    let eventStatement: D1PreparedStatement

    if (type === 'product') {
      entityId = readText(data, 'id') || readText(data, 'product_id')
      if (!entityId) return jsonResponse({ message: 'Product ID is required' }, 400)
      if (action === 'deleted') {
        mutation = env.DB.prepare(
          'DELETE FROM products WHERE id = ? AND merchant_id = ?'
        ).bind(entityId, merchantId)
        eventStatement = createDeletedProductEventInsertStatement(
          env.DB,
          merchantId,
          entityId
        )
      } else {
        mutation = env.DB.prepare(
          `INSERT INTO products (id, merchant_id, name, description, price, cost_price, discount, image, quantity, quantity_type, currency, category_id, options, is_available, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, description = excluded.description, price = excluded.price,
             cost_price = excluded.cost_price, discount = excluded.discount, image = excluded.image,
             quantity = excluded.quantity, quantity_type = excluded.quantity_type,
             currency = excluded.currency, category_id = excluded.category_id,
             options = excluded.options, is_available = excluded.is_available,
             updated_at = excluded.updated_at
           WHERE products.merchant_id = excluded.merchant_id`
        ).bind(
          entityId,
          merchantId,
          readText(data, 'name'),
          readText(data, 'description'),
          Number(data.price) || 0,
          Number(data.cost_price) || 0,
          Number(data.discount) || 0,
          readText(data, 'image') || null,
          Number(data.quantity) || 0,
          readText(data, 'quantity_type') || 'tracked',
          readText(data, 'currency') || 'YER',
          data.category_id ?? null,
          typeof data.options === 'string'
            ? data.options
            : JSON.stringify(data.options || []),
          Number(data.is_available) === 0 ? 0 : 1,
          Date.now()
        )
        eventStatement = createProductEventInsertStatement(
          env.DB,
          merchantId,
          entityId,
          action
        )
      }
    } else {
      entityId = readText(data, 'ticket_id') || readText(data, 'id')
      if (!entityId) return jsonResponse({ message: 'Order ID is required' }, 400)
      if (action === 'deleted') {
        mutation = env.DB.prepare(
          'DELETE FROM live_tickets WHERE ticket_id = ? AND merchant_id = ?'
        ).bind(entityId, merchantId)
      } else if (action === 'created') {
        mutation = env.DB.prepare(
          `INSERT INTO live_tickets (ticket_id, order_group_id, merchant_id, customer_id, status, created_at, delivery_code, delivery_agent_id, ticket_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          entityId,
          readText(data, 'order_group_id'),
          merchantId,
          readText(data, 'customer_id'),
          readText(data, 'status') || 'pending_merchant_approval',
          Number(data.created_at) || Date.now(),
          readText(data, 'delivery_code'),
          data.delivery_agent_id ?? null,
          typeof data.ticket_data === 'string'
            ? data.ticket_data
            : JSON.stringify(data.ticket_data || {})
        )
      } else {
        mutation = env.DB.prepare(
          `UPDATE live_tickets
           SET status = COALESCE(?, status),
               delivery_code = COALESCE(?, delivery_code),
               delivery_agent_id = COALESCE(?, delivery_agent_id),
               ticket_data = COALESCE(?, ticket_data)
           WHERE ticket_id = ? AND merchant_id = ?`
        ).bind(
          typeof data.status === 'string' ? data.status : null,
          typeof data.delivery_code === 'string' ? data.delivery_code : null,
          data.delivery_agent_id === undefined
            ? null
            : data.delivery_agent_id,
          data.ticket_data === undefined
            ? null
            : typeof data.ticket_data === 'string'
              ? data.ticket_data
              : JSON.stringify(data.ticket_data),
          entityId,
          merchantId
        )
      }
      eventStatement = createOrderEventInsertStatement(
        env.DB,
        merchantId,
        entityId,
        action
      )
    }

    const [mutationResult, eventResult] = await env.DB.batch([
      mutation,
      eventStatement,
    ])
    if (!mutationResult.meta?.changes) {
      return jsonResponse(
        { message: type === 'product' ? 'Product not found' : 'Order not found' },
        404
      )
    }
    const event = eventResult.results?.[0]
    if (!event) {
      throw new Error('Mutation completed without an associated sync event')
    }
    publishStoredMerchantEvent(
      env,
      ctx,
      merchantId,
      event
    )
    return jsonResponse({ status: 'accepted' }, 202)
  } catch (error) {
    console.error('Merchant event trigger failed:', error)
    return jsonResponse({ message: 'تعذر تسجيل حدث التاجر.' }, 500)
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/merchant/bootstrap' && request.method === 'GET') {
      return bootstrap(request, env)
    }
    if (url.pathname === '/dashboard/init' && request.method === 'GET') {
      return bootstrap(request, env)
    }
    if (url.pathname === '/api/events/trigger' && request.method === 'POST') {
      return triggerEvent(request, env, ctx)
    }
    return legacyWorker.fetch(request, env, ctx)
  },
}
