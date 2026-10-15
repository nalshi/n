const PRODUCT_EVENT_SQL = `
  INSERT INTO sync_events (
    merchant_id, event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
  )
  SELECT
    ?, COALESCE((SELECT MAX(event_id) FROM sync_events WHERE merchant_id = ?), 0) + 1,
    MAX(?, COALESCE((SELECT MAX(occurred_at) FROM sync_events WHERE merchant_id = ?), 0)),
    'product', ?, ?, 'active',
    (SELECT json_object(
      'id', id, 'merchant_id', merchant_id, 'name', name, 'description', description,
      'price', price, 'cost_price', cost_price, 'discount', discount, 'image', image,
      'quantity', quantity, 'quantity_type', quantity_type, 'currency', currency,
      'category_id', category_id, 'options', options, 'features', features,
      'is_available', is_available, 'updated_at', updated_at
    ) FROM products WHERE id = ? AND merchant_id = ?)
  WHERE EXISTS (SELECT 1 FROM products WHERE id = ? AND merchant_id = ?)
  RETURNING event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
`;

const DELETED_PRODUCT_EVENT_SQL = `
  INSERT INTO sync_events (
    merchant_id, event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
  )
  SELECT
    ?, COALESCE((SELECT MAX(event_id) FROM sync_events WHERE merchant_id = ?), 0) + 1,
    MAX(?, COALESCE((SELECT MAX(occurred_at) FROM sync_events WHERE merchant_id = ?), 0)),
    'product', 'deleted', ?, 'active', ?
  WHERE changes() > 0
  RETURNING event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
`;

const ORDER_EVENT_SQL = `
  INSERT INTO sync_events (
    merchant_id, event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
  )
  SELECT
    ?, COALESCE((SELECT MAX(event_id) FROM sync_events WHERE merchant_id = ?), 0) + 1,
    MAX(?, COALESCE((SELECT MAX(occurred_at) FROM sync_events WHERE merchant_id = ?), 0)),
    'order', ?, ?, 'active',
    CASE WHEN ? = 'deleted' THEN ? ELSE (
      SELECT json_object(
        'id', ticket_id, 'ticket_id', ticket_id, 'order_group_id', order_group_id,
        'merchant_id', merchant_id, 'customer_id', customer_id, 'status', status,
        'created_at', created_at, 'delivery_code', delivery_code,
        'delivery_agent_id', delivery_agent_id, 'ticket_data', ticket_data
      ) FROM live_tickets WHERE ticket_id = ? AND merchant_id = ?
    ) END
  WHERE changes() > 0
    AND (? = 'deleted' OR EXISTS (
      SELECT 1 FROM live_tickets WHERE ticket_id = ? AND merchant_id = ?
    ))
  RETURNING event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
`;

const ARCHIVED_ORDER_EVENT_SQL = `
  INSERT INTO sync_events (
    merchant_id, event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
  )
  SELECT
    ?, COALESCE((SELECT MAX(event_id) FROM sync_events WHERE merchant_id = ?), 0) + 1,
    MAX(?, COALESCE((SELECT MAX(occurred_at) FROM sync_events WHERE merchant_id = ?), 0)),
    'order', 'created', ?, 'archived',
    (
      SELECT json_object(
        'id', ticket_id, 'ticket_id', ticket_id, 'order_group_id', order_group_id,
        'merchant_id', merchant_id, 'customer_id', customer_id,
        'final_status', final_status, 'total_amount', total_amount,
        'archived_data', archived_data, 'archived_at', archived_at
      ) FROM orders_archive WHERE ticket_id = ? AND merchant_id = ?
    )
  WHERE changes() > 0
    AND EXISTS (
      SELECT 1 FROM orders_archive WHERE ticket_id = ? AND merchant_id = ?
    )
  RETURNING event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
`;

function normalizeEvent(row) {
  if (!row) return null;
  let data;
  try {
    data = JSON.parse(row.payload_json);
  } catch (error) {
    console.error('Merchant event journal payload is invalid:', error);
    return null;
  }
  return {
    eventId: Number(row.event_id),
    timestamp: Number(row.occurred_at),
    type: row.entity_type,
    action: row.action,
    entityId: String(row.entity_id),
    scope: row.scope,
    data,
  };
}

function scheduleDelivery(env, ctx, merchantId, event) {
  const task = (async () => {
    const connection = await env.DB.prepare(
      'SELECT 1 FROM merchant_connections WHERE merchant_id = ? LIMIT 1'
    )
      .bind(String(merchantId))
      .first();
    if (!connection) return;

    const stub = env.MERCHANT_SESSION.get(
      env.MERCHANT_SESSION.idFromName(`merchant_${merchantId}`)
    );
    const delivered = await stub.pushEvent(event);
    if (!delivered) {
      console.warn('Merchant connection presence was stale', { merchantId });
      await env.DB.prepare(
        'DELETE FROM merchant_connections WHERE merchant_id = ?'
      )
        .bind(String(merchantId))
        .run();
    }
  })();

  ctx.waitUntil(
    task.catch((error) => {
      console.error('Failed to publish merchant event:', error);
    })
  );
}

export function createProductEventInsertStatement(
  db,
  merchantId,
  productId,
  action
) {
  const id = String(merchantId);
  const pid = String(productId);
  const now = Date.now();
  return db
    .prepare(PRODUCT_EVENT_SQL)
    .bind(id, id, now, id, action, pid, pid, id, pid, id);
}

export function createDeletedProductEventInsertStatement(
  db,
  merchantId,
  productId
) {
  const id = String(merchantId);
  const pid = String(productId);
  const now = Date.now();
  return db
    .prepare(DELETED_PRODUCT_EVENT_SQL)
    .bind(id, id, now, id, pid, JSON.stringify({ id: pid, product_id: pid }));
}

export function createOrderEventInsertStatement(
  db,
  merchantId,
  ticketId,
  action
) {
  const id = String(merchantId);
  const ticket = String(ticketId);
  return db
    .prepare(ORDER_EVENT_SQL)
    .bind(
      id,
      id,
      Date.now(),
      id,
      action,
      ticket,
      action,
      JSON.stringify({ id: ticket, ticket_id: ticket, merchant_id: id }),
      ticket,
      id,
      action,
      ticket,
      id
    );
}

export function createArchivedOrderEventInsertStatement(
    db,
    merchantId,
    ticketId
) {
    const id = String(merchantId);
    const ticket = String(ticketId);
    return db
      .prepare(ARCHIVED_ORDER_EVENT_SQL)
      .bind(id, id, Date.now(), id, ticket, ticket, id, ticket, id);
}

export function publishStoredMerchantEvent(env, ctx, merchantId, row) {
  if (!row) {
    console.error('Merchant event mutation completed without a journal row');
    return;
  }
  const event = normalizeEvent(row);
  if (!event || !env.MERCHANT_SESSION) {
    if (!env.MERCHANT_SESSION) {
      console.error('Merchant event cannot be delivered: missing Durable Object binding');
    }
    return;
  }
  scheduleDelivery(env, ctx, merchantId, event);
}
