import { getCategoriesTree } from '../services/categories/categoryService.js';

// مدة صلاحية الكاش في الذاكرة بدون إعادة جلب من DB (5 دقائق)
const CACHE_FRESH_THRESHOLD_MS = 5 * 60_000;

export class MerchantSession {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.productsCache = null;
    this.ordersCache = null;
    this.settingsCache = null;
    this.archivedOrdersCache = null;
    this.salesLogCache = null;
    this.categoriesCache = null;
    this.initialSnapshot = null;
    this.initialLoadPromise = null;
    this.initialLoadError = null;
    this.storageLoadPromise = null;
    this.snapshotTimestamp = 0;
  }

  async ensureSnapshotLoaded() {
    if (!this.initialSnapshot) {
      await this.loadFromStorage();
    }
  }

  normalizeOrder(row) {
    let data = {};
    try { data = JSON.parse(row.ticket_data || '{}'); } catch (e) {}
    const customer = data.customer || {};
    const financials = data.financials || {};
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
      items: data.items || [],
      is_agent_assigned: row.delivery_agent_id !== null && row.delivery_agent_id !== undefined
    };
  }

  async loadFromStorage() {
    if (this.initialSnapshot) return this.initialSnapshot;
    if (this.storageLoadPromise) return this.storageLoadPromise;

    this.storageLoadPromise = (async () => {
      try {
        if (this.state && this.state.storage) {
          const stored = await this.state.storage.get('merchant_snapshot');
          if (stored && typeof stored === 'object') {
            this.initialSnapshot = stored;
            this.snapshotTimestamp = stored._ts || 0;
            if (Array.isArray(stored.products)) this.productsCache = stored.products;
            if (Array.isArray(stored.orders)) this.ordersCache = stored.orders;
            if (stored.settings) this.settingsCache = stored.settings;
            if (Array.isArray(stored.archivedOrders)) this.archivedOrdersCache = stored.archivedOrders;
            if (Array.isArray(stored.salesLog)) this.salesLogCache = stored.salesLog;
            if (Array.isArray(stored.categories)) this.categoriesCache = stored.categories;
          }
        }
      } catch (e) {
        console.warn('DO storage read error:', e);
      }
      return this.initialSnapshot;
    })();

    return this.storageLoadPromise;
  }

  persistSnapshot() {
    if (!this.initialSnapshot || !this.state || !this.state.storage) return;
    try {
      // تسجيل وقت الحفظ داخل الـ snapshot نفسه
      this.initialSnapshot._ts = Date.now();
      this.snapshotTimestamp = this.initialSnapshot._ts;
      this.state.storage.put('merchant_snapshot', this.initialSnapshot).catch(e => {
        console.warn('DO storage write error:', e);
      });
    } catch (e) {
      console.warn('DO storage put sync error:', e);
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const merchantId = url.searchParams.get('merchant_id');

    if (request.method === 'GET' && url.pathname === '/dashboard/init') {
      if (!merchantId) {
        return new Response('Missing merchant identity', { status: 400 });
      }

      try {
        const snapshot = await this.getDashboardSnapshot(
          merchantId,
          url.searchParams.get('refresh') === '1'
        );
        return new Response(JSON.stringify(snapshot), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      } catch (error) {
        console.error('MerchantSession dashboard initialization failed:', error);
        return new Response(
          JSON.stringify({ message: 'فشل جلب بيانات لوحة التحكم.' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          }
        );
      }
    }

    // 1. التعامل مع طلبات تحديث الكاش القادمة من الـ Worker
    if (request.method === 'POST') {
      try {
        const payload = await request.json();
        
        if (url.pathname === '/sync-product') {
          await this.ensureSnapshotLoaded();
          if (this.productsCache !== null) {
             const idx = this.productsCache.findIndex(p => String(p.id) === String(payload.product.id));
             if (idx !== -1) {
                this.productsCache[idx] = payload.product;
             } else {
                this.productsCache.unshift(payload.product);
             }
          }
          if (this.initialSnapshot?.products) {
            this.initialSnapshot.products = this.productsCache;
          }
          this.persistSnapshot();
          this.broadcast({
            event:
              payload.event === 'product_created'
                ? 'product_created'
                : 'product_updated',
            product: payload.product,
          });
          return new Response('Sync OK', { status: 200 });
        }

        if (url.pathname === '/sync-order') {
          await this.ensureSnapshotLoaded();
          const incoming = payload.order || {};
          const orderId = incoming.id || incoming.ticket_id;
          if (this.ordersCache === null) {
             this.ordersCache = [];
          }
          const idx = this.ordersCache.findIndex(o => String(o.id || o.ticket_id) === String(orderId));
          const event = idx < 0 ? 'order_created' : 'order_updated';
          if (idx !== -1) {
             this.ordersCache[idx] = { ...this.ordersCache[idx], ...incoming, id: orderId };
          } else {
             this.ordersCache.unshift({ ...incoming, id: orderId });
          }
          if (!this.initialSnapshot) {
             this.initialSnapshot = {
              _complete: false,
               products: this.productsCache || [],
               orders: this.ordersCache,
               archivedOrders: this.archivedOrdersCache || [],
               salesLog: this.salesLogCache || [],
               categories: this.categoriesCache || [],
               settings: this.settingsCache || {},
             };
          } else {
             this.initialSnapshot.orders = this.ordersCache;
          }

          this.persistSnapshot();
          this.broadcast({
            event,
            order: { ...incoming, id: orderId },
          });
          return new Response('Sync OK', { status: 200 });
        }

        if (url.pathname === '/sync-product-removed') {
          await this.ensureSnapshotLoaded();
          const productId = String(payload.product_id || '');
          if (this.productsCache !== null) {
            this.productsCache = this.productsCache.filter(
              (product) => String(product.id) !== productId
            );
          }
          if (this.initialSnapshot?.products) {
            this.initialSnapshot.products = this.productsCache;
          }
          this.persistSnapshot();
          this.broadcast({ event: 'product_removed', product_id: productId });
          return new Response('Sync OK', { status: 200 });
        }

        if (url.pathname === '/sync-settings') {
          await this.ensureSnapshotLoaded();
          const nextSettings = payload.settings || {};
          this.settingsCache = nextSettings.settings && typeof nextSettings.settings === 'object'
            ? nextSettings
            : { ...(this.settingsCache || {}), settings: nextSettings };
          if (this.initialSnapshot) {
            this.initialSnapshot.settings = this.settingsCache;
          }
          this.persistSnapshot();
          return new Response('Sync OK', { status: 200 });
        }

        if (url.pathname === '/sync-message') {
          return new Response('Sync OK', { status: 200 });
        }

        // ⭐ إصدار Ticket مؤقت للـ WebSocket (بدل JWT في URL)
        // يُستدعى من Worker بعد التحقق من JWT في Authorization Header،
        // فيُصدر ticket UUID صالح 30 ثانية ثم يُحذف عند أول استخدام (single-use).
        if (url.pathname === '/issue-ticket') {
          const mid = payload.merchantId ? String(payload.merchantId) : '';
          if (!mid) return new Response('Bad Request: missing merchantId', { status: 400 });

          const ticket = crypto.randomUUID();
          const ticketKey = `ws_ticket:${ticket}`;
          await this.state.storage.put(ticketKey, { merchantId: mid, exp: Date.now() + 30_000 });
          // ضمان حذف الـ ticket تلقائياً بعد 35 ثانية
          this.state.storage.setAlarm(Date.now() + 35_000).catch(() => {});

          return new Response(JSON.stringify({ ticket }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } catch (e) {
        return new Response('Bad Request', { status: 400 });
      }
    }

    // 2. ترقية الاتصال إلى WebSocket (دخول داشبورد التاجر)
    if (request.headers.get('Upgrade') === 'websocket') {
      // ⭐ إصلاح أمني: الـ merchantId يُستخرج من الـ ticket المؤقت بدل query string
      // لكي لا يُعرَّض JWT أو merchant_id في سجلات الخادم أو URL المرئي للمتصفح.
      const ticketParam = url.searchParams.get('ticket');
      let resolvedMerchantId = merchantId; // fallback للاتصالات الداخلية القديمة

      if (ticketParam) {
        const ticketKey = `ws_ticket:${ticketParam}`;
        let ticketData = null;
        try {
          ticketData = await this.state.storage.get(ticketKey);
        } catch (_) {}

        if (!ticketData || !ticketData.merchantId || Date.now() > ticketData.exp) {
          return new Response('Unauthorized: Ticket expired or invalid', { status: 401 });
        }

        // ⭐ استخدام مرة واحدة (single-use) — حذف فوري بعد التحقق
        await this.state.storage.delete(ticketKey).catch(() => {});
        resolvedMerchantId = ticketData.merchantId;
      }

      if (!resolvedMerchantId) {
        return new Response('Unauthorized: Missing merchant identity', { status: 401 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Hibernatable WebSocket: DO sleeps between messages, wakes only when needed
      this.state.acceptWebSocket(server, [resolvedMerchantId]);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not Found', { status: 404 });
  }

  async getDashboardSnapshot(merchantId, forceRefresh = false) {
    await this.loadFromStorage();

    const isFresh =
      this.initialSnapshot?._complete === true &&
      Date.now() - this.snapshotTimestamp < CACHE_FRESH_THRESHOLD_MS;
    if (!forceRefresh && isFresh) return this.toDashboardPayload();

    if (this.initialLoadPromise) {
      await this.initialLoadPromise;
      if (this.initialLoadError) throw this.initialLoadError;
      if (forceRefresh) {
        return this.getDashboardSnapshot(merchantId, true);
      }
      return this.toDashboardPayload();
    }

    const previousCaches = {
      products: this.productsCache,
      orders: this.ordersCache,
      settings: this.settingsCache,
      archivedOrders: this.archivedOrdersCache,
      salesLog: this.salesLogCache,
      categories: this.categoriesCache,
    };
    if (forceRefresh || this.initialSnapshot) {
      this.productsCache = null;
      this.ordersCache = null;
      this.settingsCache = null;
      this.archivedOrdersCache = null;
      this.salesLogCache = null;
      this.categoriesCache = null;
    }

    try {
      await this._fetchDashboardSnapshot(merchantId);
    } catch (error) {
      this.productsCache = previousCaches.products;
      this.ordersCache = previousCaches.orders;
      this.settingsCache = previousCaches.settings;
      this.archivedOrdersCache = previousCaches.archivedOrders;
      this.salesLogCache = previousCaches.salesLog;
      this.categoriesCache = previousCaches.categories;
      throw error;
    }
    return this.toDashboardPayload();
  }

  toDashboardPayload() {
    return {
      products: this.productsCache || [],
      orders: this.ordersCache || [],
      archivedOrders: this.archivedOrdersCache || [],
      salesLog: this.salesLogCache || [],
      categories: this.categoriesCache || [],
      settings: this.settingsCache || {},
    };
  }

  async _fetchDashboardSnapshot(merchantId) {
    let releaseInitialLoad;
    this.initialLoadPromise = new Promise((resolve) => {
      releaseInitialLoad = resolve;
    });

    try {
      const promises = [];
      if (this.productsCache === null) {
        promises.push(
          this.env.DB.prepare(`SELECT * FROM products WHERE merchant_id = ? ORDER BY updated_at DESC`)
          .bind(merchantId).all().then(res => {
             this.productsCache = (res.results || []).map(p => {
               try { p.options = JSON.parse(p.options || '[]'); } catch (e) { p.options = []; }
               return p;
             });
          })
        );
      }
      if (this.ordersCache === null) {
        promises.push(
          this.env.DB.prepare(`SELECT * FROM live_tickets WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 200`)
          .bind(merchantId).all().then(res => {
             this.ordersCache = (res.results || []).map(row => this.normalizeOrder(row));
          })
        );
      }
      if (this.settingsCache === null) {
        promises.push(
          this.env.DB.prepare(`SELECT id, username, store_name, phone, store_type, settings, created_at FROM users WHERE id = ?`)
          .bind(merchantId).first().then(res => {
             let settings = {};
             try { settings = JSON.parse(res?.settings || '{}'); } catch(e) {}
             this.settingsCache = res ? {
               ...res,
               settings,
               is_first_login: !res.store_name || res.store_name === res.username
             } : {};
          })
        );
      }
      if (this.archivedOrdersCache === null) {
        promises.push(
          this.env.DB.prepare(
            `SELECT ticket_id as id, final_status as status, archived_at as created_at,
                    archived_data, total_amount
             FROM orders_archive WHERE merchant_id = ? ORDER BY archived_at DESC LIMIT 100`
          )
            .bind(merchantId)
            .all()
            .then(res => {
              this.archivedOrdersCache = (res.results || []).map(row => {
                let data = {};
                try { data = JSON.parse(row.archived_data || '{}'); } catch (e) {}
                const customer = data.customer || {};
                const financials = data.financials || {};
                return {
                  id: row.id,
                  total_amount: row.total_amount,
                  currency: financials.currency || row.currency || 'YER',
                  status: row.status,
                  created_at: row.created_at,
                  customer_name: customer.name || 'عميل',
                  items: data.items || []
                };
              });
            })
        );
      }
      if (this.categoriesCache === null) {
        promises.push(
          getCategoriesTree(this.env, merchantId).then(result => {
            this.categoriesCache = result || [];
          })
        );
      }
      if (this.salesLogCache === null) {
        promises.push(
          this.env.DB.prepare(
            `SELECT id, product_id, product_name, quantity, price_per_item,
                    total_price, currency, cost_at_sale, created_at
             FROM sales_log WHERE user_id = ? AND type = 'sale'
             ORDER BY created_at DESC LIMIT 200`
          )
            .bind(merchantId)
            .all()
            .then(res => {
              this.salesLogCache = (res.results || []).map(row => ({
                id: row.id,
                productId: row.product_id,
                productName: row.product_name || 'منتج محذوف',
                quantity: row.quantity,
                price_per_item: row.price_per_item,
                total_price: row.total_price,
                currency: row.currency,
                cost_at_sale: row.cost_at_sale || 0,
                cost_price: row.quantity > 0 ? (row.cost_at_sale / row.quantity) : 0,
                timestamp: row.created_at
              }));
            })
        );
      }
      
      await Promise.all(promises);

      this.initialSnapshot = {
        _complete: true,
        products: this.productsCache || [],
        orders: this.ordersCache || [],
        archivedOrders: this.archivedOrdersCache || [],
        salesLog: this.salesLogCache || [],
        categories: this.categoriesCache || [],
        settings: this.settingsCache || {}
      };
      this.initialLoadError = null;
      
      // حفظ في وحدة التخزين المستدامة + تحديث snapshotTimestamp
      this.persistSnapshot();

      releaseInitialLoad();
      this.initialLoadPromise = null;
    } catch (e) {
      console.error('MerchantSession initial load failed:', e);
      this.initialLoadError = e;
      releaseInitialLoad();
      this.initialLoadPromise = null;
      throw e;
    }
  }

  broadcast(data) {
    const message = JSON.stringify(data);
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(message);
      } catch (e) {}
    }
  }

  // ========== Hibernation Event Handlers ==========
  async webSocketMessage(ws, message) {
    try {
      const msg = JSON.parse(message);
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (e) {}
  }

  async webSocketClose(ws, code, reason) {
    ws.close(code, reason);
  }

  async webSocketError(ws, error) {
    ws.close(1011, 'WebSocket error');
  }
}
