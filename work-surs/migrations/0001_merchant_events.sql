CREATE TABLE IF NOT EXISTS merchant_events (
  merchant_id TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  occurred_at INTEGER NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('order', 'product')),
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  entity_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('active', 'archived')),
  payload_json TEXT NOT NULL,
  PRIMARY KEY (merchant_id, event_id)
);

CREATE INDEX IF NOT EXISTS merchant_events_cursor_idx
  ON merchant_events (merchant_id, occurred_at, event_id);

CREATE INDEX IF NOT EXISTS merchant_events_entity_idx
  ON merchant_events (merchant_id, entity_type, entity_id, event_id);

CREATE TRIGGER IF NOT EXISTS merchant_events_products_insert
AFTER INSERT ON products
BEGIN
  INSERT INTO merchant_events (
    merchant_id, event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
  ) VALUES (
    CAST(NEW.merchant_id AS TEXT),
    COALESCE((SELECT MAX(event_id) FROM merchant_events WHERE merchant_id = CAST(NEW.merchant_id AS TEXT)), 0) + 1,
    MAX(
      CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
      COALESCE((SELECT MAX(occurred_at) FROM merchant_events WHERE merchant_id = CAST(NEW.merchant_id AS TEXT)), 0)
    ),
    'product',
    'created',
    CAST(NEW.id AS TEXT),
    'active',
    json_object(
      'id', NEW.id, 'merchant_id', NEW.merchant_id, 'name', NEW.name,
      'description', NEW.description, 'price', NEW.price, 'cost_price', NEW.cost_price,
      'discount', NEW.discount, 'image', NEW.image, 'quantity', NEW.quantity,
      'quantity_type', NEW.quantity_type, 'currency', NEW.currency,
      'category_id', NEW.category_id, 'options', NEW.options,
      'is_available', NEW.is_available, 'features', NEW.features, 'updated_at', NEW.updated_at
    )
  );
END;

CREATE TRIGGER IF NOT EXISTS merchant_events_products_update
AFTER UPDATE ON products
BEGIN
  INSERT INTO merchant_events (
    merchant_id, event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
  ) VALUES (
    CAST(NEW.merchant_id AS TEXT),
    COALESCE((SELECT MAX(event_id) FROM merchant_events WHERE merchant_id = CAST(NEW.merchant_id AS TEXT)), 0) + 1,
    MAX(
      CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
      COALESCE((SELECT MAX(occurred_at) FROM merchant_events WHERE merchant_id = CAST(NEW.merchant_id AS TEXT)), 0)
    ),
    'product',
    'updated',
    CAST(NEW.id AS TEXT),
    'active',
    json_object(
      'id', NEW.id, 'merchant_id', NEW.merchant_id, 'name', NEW.name,
      'description', NEW.description, 'price', NEW.price, 'cost_price', NEW.cost_price,
      'discount', NEW.discount, 'image', NEW.image, 'quantity', NEW.quantity,
      'quantity_type', NEW.quantity_type, 'currency', NEW.currency,
      'category_id', NEW.category_id, 'options', NEW.options,
      'is_available', NEW.is_available, 'features', NEW.features, 'updated_at', NEW.updated_at
    )
  );
END;

CREATE TRIGGER IF NOT EXISTS merchant_events_products_delete
AFTER DELETE ON products
BEGIN
  INSERT INTO merchant_events (
    merchant_id, event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
  ) VALUES (
    CAST(OLD.merchant_id AS TEXT),
    COALESCE((SELECT MAX(event_id) FROM merchant_events WHERE merchant_id = CAST(OLD.merchant_id AS TEXT)), 0) + 1,
    MAX(
      CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
      COALESCE((SELECT MAX(occurred_at) FROM merchant_events WHERE merchant_id = CAST(OLD.merchant_id AS TEXT)), 0)
    ),
    'product',
    'deleted',
    CAST(OLD.id AS TEXT),
    'active',
    json_object('id', OLD.id, 'product_id', OLD.id, 'merchant_id', OLD.merchant_id)
  );
END;

CREATE TRIGGER IF NOT EXISTS merchant_events_live_tickets_insert
AFTER INSERT ON live_tickets
BEGIN
  INSERT INTO merchant_events (
    merchant_id, event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
  ) VALUES (
    CAST(NEW.merchant_id AS TEXT),
    COALESCE((SELECT MAX(event_id) FROM merchant_events WHERE merchant_id = CAST(NEW.merchant_id AS TEXT)), 0) + 1,
    MAX(
      CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
      COALESCE((SELECT MAX(occurred_at) FROM merchant_events WHERE merchant_id = CAST(NEW.merchant_id AS TEXT)), 0)
    ),
    'order',
    'created',
    CAST(NEW.ticket_id AS TEXT),
    'active',
    json_object(
      'id', NEW.ticket_id, 'ticket_id', NEW.ticket_id, 'order_group_id', NEW.order_group_id,
      'merchant_id', NEW.merchant_id, 'customer_id', NEW.customer_id, 'status', NEW.status,
      'created_at', NEW.created_at, 'delivery_code', NEW.delivery_code,
      'delivery_agent_id', NEW.delivery_agent_id, 'ticket_data', NEW.ticket_data
    )
  );
END;

CREATE TRIGGER IF NOT EXISTS merchant_events_live_tickets_update
AFTER UPDATE ON live_tickets
BEGIN
  INSERT INTO merchant_events (
    merchant_id, event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
  ) VALUES (
    CAST(NEW.merchant_id AS TEXT),
    COALESCE((SELECT MAX(event_id) FROM merchant_events WHERE merchant_id = CAST(NEW.merchant_id AS TEXT)), 0) + 1,
    MAX(
      CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
      COALESCE((SELECT MAX(occurred_at) FROM merchant_events WHERE merchant_id = CAST(NEW.merchant_id AS TEXT)), 0)
    ),
    'order',
    'updated',
    CAST(NEW.ticket_id AS TEXT),
    'active',
    json_object(
      'id', NEW.ticket_id, 'ticket_id', NEW.ticket_id, 'order_group_id', NEW.order_group_id,
      'merchant_id', NEW.merchant_id, 'customer_id', NEW.customer_id, 'status', NEW.status,
      'created_at', NEW.created_at, 'delivery_code', NEW.delivery_code,
      'delivery_agent_id', NEW.delivery_agent_id, 'ticket_data', NEW.ticket_data
    )
  );
END;

CREATE TRIGGER IF NOT EXISTS merchant_events_live_tickets_delete
AFTER DELETE ON live_tickets
BEGIN
  INSERT INTO merchant_events (
    merchant_id, event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
  ) VALUES (
    CAST(OLD.merchant_id AS TEXT),
    COALESCE((SELECT MAX(event_id) FROM merchant_events WHERE merchant_id = CAST(OLD.merchant_id AS TEXT)), 0) + 1,
    MAX(
      CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
      COALESCE((SELECT MAX(occurred_at) FROM merchant_events WHERE merchant_id = CAST(OLD.merchant_id AS TEXT)), 0)
    ),
    'order',
    'deleted',
    CAST(OLD.ticket_id AS TEXT),
    'active',
    json_object('id', OLD.ticket_id, 'ticket_id', OLD.ticket_id, 'merchant_id', OLD.merchant_id)
  );
END;

CREATE TRIGGER IF NOT EXISTS merchant_events_orders_archive_insert
AFTER INSERT ON orders_archive
BEGIN
  INSERT INTO merchant_events (
    merchant_id, event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
  ) VALUES (
    CAST(NEW.merchant_id AS TEXT),
    COALESCE((SELECT MAX(event_id) FROM merchant_events WHERE merchant_id = CAST(NEW.merchant_id AS TEXT)), 0) + 1,
    MAX(
      CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
      COALESCE((SELECT MAX(occurred_at) FROM merchant_events WHERE merchant_id = CAST(NEW.merchant_id AS TEXT)), 0)
    ),
    'order',
    'created',
    CAST(NEW.ticket_id AS TEXT),
    'archived',
    json_object(
      'id', NEW.ticket_id, 'ticket_id', NEW.ticket_id, 'order_group_id', NEW.order_group_id,
      'merchant_id', NEW.merchant_id, 'status', NEW.final_status,
      'total_amount', NEW.total_amount, 'created_at', NEW.archived_at,
      'archived_at', NEW.archived_at, 'archived_data', NEW.archived_data
    )
  );
END;

CREATE TRIGGER IF NOT EXISTS merchant_events_orders_archive_update
AFTER UPDATE ON orders_archive
BEGIN
  INSERT INTO merchant_events (
    merchant_id, event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
  ) VALUES (
    CAST(NEW.merchant_id AS TEXT),
    COALESCE((SELECT MAX(event_id) FROM merchant_events WHERE merchant_id = CAST(NEW.merchant_id AS TEXT)), 0) + 1,
    MAX(
      CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
      COALESCE((SELECT MAX(occurred_at) FROM merchant_events WHERE merchant_id = CAST(NEW.merchant_id AS TEXT)), 0)
    ),
    'order',
    'updated',
    CAST(NEW.ticket_id AS TEXT),
    'archived',
    json_object(
      'id', NEW.ticket_id, 'ticket_id', NEW.ticket_id, 'order_group_id', NEW.order_group_id,
      'merchant_id', NEW.merchant_id, 'status', NEW.final_status,
      'total_amount', NEW.total_amount, 'created_at', NEW.archived_at,
      'archived_at', NEW.archived_at, 'archived_data', NEW.archived_data
    )
  );
END;

CREATE TRIGGER IF NOT EXISTS merchant_events_orders_archive_delete
AFTER DELETE ON orders_archive
BEGIN
  INSERT INTO merchant_events (
    merchant_id, event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
  ) VALUES (
    CAST(OLD.merchant_id AS TEXT),
    COALESCE((SELECT MAX(event_id) FROM merchant_events WHERE merchant_id = CAST(OLD.merchant_id AS TEXT)), 0) + 1,
    MAX(
      CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
      COALESCE((SELECT MAX(occurred_at) FROM merchant_events WHERE merchant_id = CAST(OLD.merchant_id AS TEXT)), 0)
    ),
    'order',
    'deleted',
    CAST(OLD.ticket_id AS TEXT),
    'archived',
    json_object('id', OLD.ticket_id, 'ticket_id', OLD.ticket_id, 'merchant_id', OLD.merchant_id)
  );
END;
