// public/sw.js — ساعي البريد الصامت في الخلفية (Zero-Waste Service Worker)
// يعمل في خلفية نظام التشغيل بدون الحاجة لفتح صفحة التاجر

importScripts('https://unpkg.com/dexie@4.4.6/dist/dexie.js');

// فتح نفس قاعدة بيانات التاجر المحلية (IndexedDB)
const db = new Dexie('MerchantWorkspaceDB_v1');
db.version(1).stores({
  orders: 'id, status, createdAt, total',
  products: 'id, categoryId, isAvailable, approvalStatus',
  categories: 'id, parentId',
  syncState: 'key',
});

// قناة التنسيق المحلية مع أي تبويبات مفتوحة
const localBus = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('merchant_tab_mesh_v1')
  : null;

// تفعيل فوري للـ Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// ─── استماع ودفع الطلبات الحقيقية فقط (Server Push) ──────────────────────
// يستيقظ حصراً عندما يشتري عميل ويرسل السيرفر إشعاراً
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();

    if (payload.type === 'NEW_ORDER' && payload.order) {
      event.waitUntil((async () => {
        const order = payload.order;

        // 1. الحقن المباشر في ذاكرة التاجر IndexedDB
        await db.orders.put(order);
        if (order.createdAt) {
          await db.syncState.put({
            key: 'last_order_time',
            value: order.createdAt,
            lastEventId: 0,
            lastTimestamp: Date.now(),
            merchantId: order.merchantId || '',
          });
        }

        // 2. إشعار أي تبويب مفتوح محلياً في 0ms (0 طلبات شبكة)
        localBus?.postMessage({
          type: 'ORDER_MUTATED',
          orderId: order.id,
          merchantId: order.merchantId,
          action: 'created',
        });

        // 3. إظهار إشعار النظام للتاجر مع التنبيه
        return self.registration.showNotification('طلب جديد في متجرك! 🛍️', {
          body: `العميل: ${order.customerName || 'عميل جديد'} - المبلغ: ${order.total || 0} ريال`,
          icon: '/images/app-icon-192.png',
          tag: `order_${order.id}`,
          renotify: true,
          data: { url: '/orders' },
        });
      })());
    }
  } catch (err) {
    console.error('[sw] خطأ في معالجة إشعار الطلب:', err);
  }
});

// فتح صفحة الطلبات عند نقر التاجر على الإشعار
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('/orders') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/orders');
      }
    })
  );
});
