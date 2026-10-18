import { getCategoriesTree } from '../services/categories/categoryService.js';

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
    this.sessions = new Set();
    this.initialSnapshot = null;
    this.initialLoadPromise = null;
    this.initialLoadError = null;
    this.storageLoadPromise = null;
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

  safeSend(ws, data) {
    try {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      } else if (ws.readyState === WebSocket.CONNECTING) {
        ws.addEventListener('open', () => {
          try { ws.send(payload); } catch (_) {}
        }, { once: true });
      }
    } catch (e) {
      console.error('safeSend error:', e);
    }
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

    // 1. التعامل مع طلبات تحديث الكاش القادمة من الـ Worker
    if (request.method === 'POST') {
      try {
        const payload = await request.json();
        
        if (url.pathname === '/sync-product') {
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
          this.broadcast({ event: 'product_updated', product: payload.product });
          return new Response('Sync OK', { status: 200 });
        }

        if (url.pathname === '/sync-order') {
          const incoming = payload.order || {};
          const orderId = incoming.id || incoming.ticket_id;
          if (this.ordersCache !== null) {
             const idx = this.ordersCache.findIndex(o => String(o.id || o.ticket_id) === String(orderId));
             if (idx !== -1) {
                this.ordersCache[idx] = { ...this.ordersCache[idx], ...incoming, id: orderId };
             } else {
                this.ordersCache.unshift({ ...incoming, id: orderId });
             }

          }
          if (this.initialSnapshot?.orders) {
            this.initialSnapshot.orders = this.ordersCache;
          }
          this.persistSnapshot();
          this.broadcast({ event: 'order_updated', order: { ...incoming, id: orderId } });

          return new Response('Sync OK', { status: 200 });
        }

        if (url.pathname === '/sync-product-removed') {
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
          const nextSettings = payload.settings || {};
          this.settingsCache = nextSettings.settings && typeof nextSettings.settings === 'object'
            ? nextSettings
            : { ...(this.settingsCache || {}), settings: nextSettings };
          if (this.initialSnapshot) {
            this.initialSnapshot.settings = this.settingsCache;
          }
          this.persistSnapshot();
          this.broadcast({ event: 'settings_updated', settings: this.settingsCache });
          return new Response('Sync OK', { status: 200 });
        }

        if (url.pathname === '/sync-message') {
          this.broadcast({
            event: 'merchant_message',
            message: payload.message || {},
          });
          return new Response('Sync OK', { status: 200 });
        }
      } catch (e) {
        return new Response('Bad Request', { status: 400 });
      }
    }

    // 2. ترقية الاتصال إلى WebSocket (دخول داشبورد التاجر)
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.sessions.add(server);
      server.accept();

      this.handleWebSocket(server, merchantId);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not Found', { status: 404 });
  }

  async handleWebSocket(ws, merchantId) {
    ws.addEventListener('close', () => { this.sessions.delete(ws); });
    ws.addEventListener('error', () => { this.sessions.delete(ws); });

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch (e) {}
    });

    // 1. محاولة إرسال اللقطة الجاهزة فوراً من الذاكرة أو التخزين المستدام
    if (!this.initialSnapshot) {
      await this.loadFromStorage();
    }

    if (this.initialSnapshot) {
      this.safeSend(ws, this.initialSnapshot);
      return;
    }

    // 2. مشاركة التحميل الأولي بين الاتصالات المتزامنة
    if (this.initialLoadPromise) {
      try {
        await this.initialLoadPromise;
        if (this.initialLoadError) {
          this.safeSend(ws, { event: 'error', message: 'فشل جلب البيانات الأولية' });
        } else if (this.initialSnapshot) {
          this.safeSend(ws, this.initialSnapshot);
        }
      } catch (e) {
        this.safeSend(ws, { event: 'error', message: 'فشل جلب البيانات الأولية' });
      }
      return;
    }

    let releaseInitialLoad;
    this.initialLoadPromise = new Promise((resolve) => {
      releaseInitialLoad = resolve;
    });

    try {
      // جلب البيانات غير المتوفرة في الكاش من D1 لأول مرة
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
                return {
                  id: row.id,
                  total_amount: row.total_amount,
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
                    total_price, currency, created_at
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
                timestamp: row.created_at
              }));
            })
        );
      }
      
      await Promise.all(promises);

      // إنشاء اللقطة السريعة الشاملة وحفظها
      this.initialSnapshot = {
        event: 'initial_load',
        products: this.productsCache || [],
        orders: this.ordersCache || [],
        archivedOrders: this.archivedOrdersCache || [],
        salesLog: this.salesLogCache || [],
        categories: this.categoriesCache || [],
        settings: this.settingsCache || {}
      };
      this.initialLoadError = null;
      
      // حفظ في وحدة التخزين المستدامة لسرعة البرق لاحقاً
      this.persistSnapshot();

      // إرسال البيانات للعميل بأمان
      this.safeSend(ws, this.initialSnapshot);
      releaseInitialLoad();
    } catch (e) {
      console.error('MerchantSession initial load failed:', e);
      this.initialLoadError = e;
      releaseInitialLoad();
      this.initialLoadPromise = null;
      this.safeSend(ws, { event: 'error', message: 'فشل جلب البيانات الأولية' });
    }
  }

  broadcast(data) {
    const message = JSON.stringify(data);
    let deliveredCount = 0;
    for (const session of this.sessions) {
      try {
        if (session.readyState === WebSocket.OPEN) {
          session.send(message);
          deliveredCount++;
        }
      } catch (e) {
        this.sessions.delete(session);
      }
    }
    return deliveredCount;
  }
}
