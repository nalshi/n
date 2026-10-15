CREATE TABLE IF NOT EXISTS sync_events (
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

CREATE INDEX IF NOT EXISTS sync_events_cursor_idx
  ON sync_events (merchant_id, occurred_at, event_id);

CREATE INDEX IF NOT EXISTS sync_events_entity_idx
  ON sync_events (merchant_id, entity_type, entity_id, event_id);

INSERT OR IGNORE INTO sync_events (
  merchant_id, event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
)
SELECT
  merchant_id, event_id, occurred_at, entity_type, action, entity_id, scope, payload_json
FROM merchant_events;

DROP TRIGGER IF EXISTS merchant_events_products_insert;
DROP TRIGGER IF EXISTS merchant_events_products_update;
DROP TRIGGER IF EXISTS merchant_events_products_delete;
DROP TRIGGER IF EXISTS merchant_events_live_tickets_insert;
DROP TRIGGER IF EXISTS merchant_events_live_tickets_update;
DROP TRIGGER IF EXISTS merchant_events_live_tickets_delete;
DROP TRIGGER IF EXISTS merchant_events_orders_archive_insert;
DROP TRIGGER IF EXISTS merchant_events_orders_archive_update;
DROP TRIGGER IF EXISTS merchant_events_orders_archive_delete;
DROP TABLE IF EXISTS merchant_events;

CREATE TABLE IF NOT EXISTS merchant_connections (
  merchant_id TEXT NOT NULL,
  connection_id TEXT NOT NULL PRIMARY KEY,
  connected_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS merchant_connections_merchant_idx
  ON merchant_connections (merchant_id);
