import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import test from 'node:test';
import worker from './index.js';
import { MerchantSession } from './durableObjects/MerchantSession.js';
import { updateProductStock } from './controllers/productController.js';
import { buildCorsHeaders } from './core/response.js';
import { assertRateLimitOk } from './services/ai/rateLimiter.js';
import { syncMerchantOrderSignal } from './services/realtime/realtimeSyncService.js';

const APP_SECRET_KEY = 'bootstrap-test-secret';

function createToken({ user_id = 'merchant-1', role = 'merchant' } = {}) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    user_id,
    role,
    username: 'merchant',
    exp: Math.floor(Date.now() / 1000) + 60,
  });
  const signature = createHmac('sha256', APP_SECRET_KEY)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

function createGatewayHeaders(url, method, body = '') {
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const target = new URL(url);
  const payload = `${timestamp}:${nonce}:${method}:${target.pathname}:${target.search}:${bodyHash}`;
  const signature = createHmac('sha256', 'gateway-secret')
    .update(payload)
    .digest('hex');
  return {
    'X-Gateway-Secret': 'gateway-secret',
    'X-Gateway-Timestamp': timestamp,
    'X-Gateway-Nonce': nonce,
    'X-Gateway-Body-SHA256': bodyHash,
    'X-Gateway-Signature': signature,
  };
}

function createDatabase() {
  return {
    prepare(query) {
      let bindings = [];
      return {
        bind(...values) {
          bindings = values;
          return this;
        },
        async all() {
          if (query.includes('FROM products')) {
            return {
              results: [{ id: 'product-1', name: 'منتج', options: '[]' }],
            };
          }
          if (query.includes('FROM live_tickets')) {
            return {
              results: [
                {
                  id: 'order-1',
                  ticket_id: 'order-1',
                  status: 'out_for_delivery',
                  created_at: '2026-10-15T00:00:00Z',
                  ticket_data: JSON.stringify({
                    customer: { name: 'عميل' },
                    financials: { grand_total: 1200 },
                    items: [],
                  }),
                },
              ],
            };
          }
          if (query.includes('FROM orders_archive')) {
            return {
              results: [
                {
                  id: 'archived-1',
                  status: 'completed',
                  created_at: '2026-10-14T00:00:00Z',
                  archived_data: JSON.stringify({ customer: {}, items: [] }),
                  total_amount: 900,
                },
              ],
            };
          }
          if (query.includes('FROM categories')) {
            return { results: [{ id: 1, name: 'عام', parent_id: 0 }] };
          }
          assert.fail(`Unexpected query: ${query}; bindings: ${bindings}`);
        },
        async first() {
          if (query.includes('FROM users')) {
            return {
              id: 'merchant-1',
              username: 'merchant',
              store_name: 'متجري',
              phone: '',
              store_type: 'retail',
              settings: '{}',
            };
          }
          assert.fail(`Unexpected query: ${query}; bindings: ${bindings}`);
        },
      };
    },
  };
}

async function requestBootstrap({
  token = createToken(),
  merchantId = 'merchant-1',
} = {}) {
  const request = new Request(
    'https://worker.example/api/merchant/bootstrap',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...createGatewayHeaders(
          'https://worker.example/api/merchant/bootstrap',
          'GET'
        ),
        'X-Merchant-Id': merchantId,
      },
    }
  );
  return worker.fetch(
    request,
    {
      APP_SECRET_KEY,
      PROXY_SECRET: 'gateway-secret',
      DB: createDatabase(),
    },
    {}
  );
}

test('merchant bootstrap returns all top-level dashboard data collections', async () => {
  const response = await requestBootstrap();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'success');
  assert.deepEqual(body.products.map(({ id }) => id), ['product-1']);
  assert.deepEqual(body.orders.map(({ id }) => id), ['order-1']);
  assert.deepEqual(body.archivedOrders.map(({ id }) => id), ['archived-1']);
  assert.deepEqual(body.categories, [{ id: 1, name: 'عام', parent_id: 0 }]);
  assert.equal(body.settings.store_name, 'متجري');
});

test('merchant bootstrap rejects missing sessions and non-merchant roles', async () => {
  const unauthenticatedResponse = await requestBootstrap({ token: '' });
  assert.equal(unauthenticatedResponse.status, 401);

  const customerResponse = await requestBootstrap({
    token: createToken({ role: 'customer' }),
  });
  assert.equal(customerResponse.status, 403);
});

test('merchant bootstrap rejects a merchant ID that differs from the token', async () => {
  const response = await requestBootstrap({ merchantId: 'merchant-2' });
  assert.equal(response.status, 403);
});

test('gateway rejects HTTP requests with a tampered signed path', async () => {
  const request = new Request(
    'https://worker.example/api/merchant/bootstrap',
    {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + createToken(),
        ...createGatewayHeaders(
          'https://worker.example/api/merchant/other',
          'GET'
        ),
      },
    }
  );
  const response = await worker.fetch(
    request,
    {
      APP_SECRET_KEY,
      PROXY_SECRET: 'gateway-secret',
      DB: createDatabase(),
    },
    {}
  );
  assert.equal(response.status, 403);
});

test('websocket ticket endpoint issues a short-lived merchant ticket', async () => {
  const url = 'https://worker.example/api/worker/ws/ticket';
  const response = await worker.fetch(
    new Request(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + createToken(),
        ...createGatewayHeaders(url, 'POST'),
      },
    }),
    { APP_SECRET_KEY, PROXY_SECRET: 'gateway-secret' },
    {}
  );
  const body = await response.json();
  const ticketParts = body.ticket.split('.');
  const ticketClaims = JSON.parse(
    Buffer.from(ticketParts[1], 'base64url').toString('utf8')
  );

  assert.equal(response.status, 200);
  assert.notEqual(body.ticket, createToken());
  assert.equal(ticketClaims.user_id, 'merchant-1');
  assert.equal(ticketClaims.ws_ticket, true);
  assert.ok(ticketClaims.exp <= Math.floor(Date.now() / 1000) + 60);
  assert.ok(ticketClaims.exp > Math.floor(Date.now() / 1000));
});

test('websocket ticket endpoint refuses customer sessions', async () => {
  const url = 'https://worker.example/api/worker/ws/ticket';
  const response = await worker.fetch(
    new Request(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + createToken({ role: 'customer' }),
        ...createGatewayHeaders(url, 'POST'),
      },
    }),
    { APP_SECRET_KEY, PROXY_SECRET: 'gateway-secret' },
    {}
  );

  assert.equal(response.status, 403);
});

test('early realtime routes reject direct requests without a gateway signature', async () => {
  const ticketResponse = await worker.fetch(
    new Request('https://worker.example/api/worker/ws/ticket', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + createToken() },
    }),
    { APP_SECRET_KEY },
    {}
  );
  const signalResponse = await worker.fetch(
    new Request('https://worker.example/api/merchant/order-signals', {
      headers: { Authorization: 'Bearer ' + createToken() },
    }),
    { APP_SECRET_KEY },
    {}
  );

  assert.equal(ticketResponse.status, 403);
  assert.equal(signalResponse.status, 403);
});

test('stock updates reject invalid quantities before querying the database', async () => {
  await assert.rejects(
    updateProductStock({
      env: {
        DB: {
          prepare() {
            assert.fail('Invalid stock must be rejected before database access');
          },
        },
      },
      ctx: { waitUntil() {} },
      user: { user_id: 'merchant-1' },
      body: {
        product_id: 'product-1',
        quantity_type: 'tracked',
        quantity: -1,
      },
    }),
    { status: 400 }
  );
});

test('stock updates only look up products owned by the authenticated merchant', async () => {
  let query = '';
  let bindings = [];
  await assert.rejects(
    updateProductStock({
      env: {
        DB: {
          prepare(statement) {
            query = statement;
            return {
              bind(...values) {
                bindings = values;
                return this;
              },
              async first() {
                return null;
              },
            };
          },
        },
      },
      ctx: { waitUntil() {} },
      user: { user_id: 'merchant-1' },
      body: {
        product_id: 'product-1',
        quantity_type: 'tracked',
        quantity: 4,
      },
    }),
    { status: 404 }
  );
  assert.match(query, /id = \? AND merchant_id = \?/);
  assert.deepEqual(bindings, ['product-1', 'merchant-1']);
});

test('merchant order signal stream is scoped to the authenticated merchant', async () => {
  const originalFetch = globalThis.fetch;
  const url = 'https://worker.example/api/merchant/order-signals';
  let requestedUrl = '';
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response('event: put\ndata: {"path":"/","data":null}\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };

  try {
    const response = await worker.fetch(
      new Request(url, {
        headers: {
          Authorization: 'Bearer ' + createToken(),
          ...createGatewayHeaders(url, 'GET'),
        },
      }),
      {
        APP_SECRET_KEY,
        PROXY_SECRET: 'gateway-secret',
        FIREBASE_DB_URL: 'https://firebase.example/',
        FIREBASE_DB_SECRET: 'firebase-test-secret',
      },
      {}
    );

    assert.equal(response.status, 200);
    assert.match(requestedUrl, /merchant_order_signals\/merchant-1\.json/);
    assert.equal(response.headers.get('Content-Type'), 'text/event-stream; charset=utf-8');
    assert.match(await response.text(), /event: put/);

    const denied = await worker.fetch(
      new Request(url, {
        headers: {
          Authorization: 'Bearer ' + createToken({ role: 'customer' }),
          ...createGatewayHeaders(url, 'GET'),
        },
      }),
      {
        APP_SECRET_KEY,
        PROXY_SECRET: 'gateway-secret',
        FIREBASE_DB_URL: 'https://firebase.example/',
        FIREBASE_DB_SECRET: 'firebase-test-secret',
      },
      {}
    );
    assert.equal(denied.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('merchant order signal reports missing Firebase configuration', async () => {
  const url = 'https://worker.example/api/merchant/order-signals';
  const response = await worker.fetch(
    new Request(url, {
      headers: {
        Authorization: 'Bearer ' + createToken(),
        ...createGatewayHeaders(url, 'GET'),
      },
    }),
    { APP_SECRET_KEY, PROXY_SECRET: 'gateway-secret' },
    {}
  );

  assert.equal(response.status, 503);
  assert.equal(
    (await response.json()).message,
    'إعدادات الاتصال اللحظي غير مهيأة.'
  );
});

test('merchant order signal encrypts the ticket ID before writing Firebase', async () => {
  const originalFetch = globalThis.fetch;
  let writtenSignal = '';
  let writtenRevision = 0;
  let firebaseWriteUrl = '';
  globalThis.fetch = async (input, init) => {
    firebaseWriteUrl = String(input);
    const payload = JSON.parse(String(init?.body));
    writtenSignal = payload.signal;
    writtenRevision = payload.revision;
    return new Response(null, { status: 200 });
  };

  try {
    await syncMerchantOrderSignal(
      {
        APP_SECRET_KEY,
        FIREBASE_DB_URL: 'https://firebase.example/',
        FIREBASE_DB_SECRET: 'firebase-test-secret',
      },
      'merchant-1',
      'TCK-private-ticket-id'
    );

    assert.ok(writtenSignal);
    assert.ok(Number.isFinite(writtenRevision));
    assert.match(firebaseWriteUrl, /firebase\.example\/merchant_order_signals\/merchant-1\.json/);
    assert.equal(new URL(firebaseWriteUrl).searchParams.get('auth'), 'firebase-test-secret');
    assert.equal(writtenSignal.includes('TCK-private-ticket-id'), false);

    const bytes = Uint8Array.from(atob(writtenSignal), (character) =>
      character.charCodeAt(0)
    );
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(APP_SECRET_KEY)
    );
    const key = await crypto.subtle.importKey(
      'raw',
      digest,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) },
      key,
      bytes.slice(12)
    );
    const payload = JSON.parse(new TextDecoder().decode(plaintext));
    assert.equal(payload.merchantId, 'merchant-1');
    assert.equal(payload.ticketId, 'TCK-private-ticket-id');
    assert.equal(payload.timestamp, writtenRevision);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Firebase write errors include status and safe response details', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'Permission denied' }), {
      status: 401,
    });

  try {
    await assert.rejects(
      syncMerchantOrderSignal(
        {
          APP_SECRET_KEY,
          FIREBASE_DB_URL: 'https://firebase.example/',
          FIREBASE_DB_SECRET: 'firebase-test-secret',
        },
        'merchant-1',
        'ticket-1'
      ),
      /returned 401: \{"error":"Permission denied"\}/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Durable Object order cache does not republish an already-sent Firebase signal', async () => {
  let backgroundTasks = 0;
  const state = {
    storage: { get: async () => undefined, put: async () => {} },
    waitUntil() {
      backgroundTasks += 1;
    },
  };
  const session = new MerchantSession(state, {});
  session.broadcast = () => 0;

  const response = await session.fetch(
    new Request('http://internal/sync-order?merchant_id=merchant-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order: { id: 'order-1', status: 'pending_merchant_approval' },
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(backgroundTasks, 0);
});

test('CORS headers are only returned for explicitly allowed origins', () => {
  const allowed = buildCorsHeaders(
    new Request('https://shop.example.test/api', {
      headers: { Origin: 'https://shop.example.test' },
    }),
    { ALLOWED_ORIGINS: 'https://shop.example.test,https://admin.example.test' }
  );
  assert.equal(allowed['Access-Control-Allow-Origin'], 'https://shop.example.test');

  const rejected = buildCorsHeaders(
    new Request('https://shop.example.test/api', {
      headers: { Origin: 'https://evil.example.test' },
    }),
    { ALLOWED_ORIGINS: 'https://shop.example.test,https://admin.example.test' }
  );
  assert.equal(rejected['Access-Control-Allow-Origin'], undefined);
});

test('AI rate limit applies both client-wide and merchant-specific buckets', async () => {
  const keys = [];
  await assertRateLimitOk(
    {
      AI_CHAT_RATE_LIMITER: {
        async limit({ key }) {
          keys.push(key);
          return { success: true };
        },
      },
    },
    { merchantId: 'merchant-1', clientIp: '203.0.113.7' }
  );

  assert.deepEqual(keys, [
    'ai_chat:ip:203.0.113.7',
    'ai_chat:merchant:merchant-1:203.0.113.7',
  ]);
});

test('AI rate limit blocks clients from bypassing limits by changing merchant IDs', async () => {
  const counts = new Map();
  const env = {
    AI_CHAT_RATE_LIMITER: {
      async limit({ key }) {
        const count = (counts.get(key) || 0) + 1;
        counts.set(key, count);
        return { success: count <= 10 };
      },
    },
  };

  for (let i = 0; i < 10; i += 1) {
    await assertRateLimitOk(env, {
      merchantId: 'merchant-' + i,
      clientIp: '203.0.113.7',
    });
  }

  await assert.rejects(
    assertRateLimitOk(env, { merchantId: 'merchant-another', clientIp: '203.0.113.7' }),
    (error) => error.status === 429
  );
});

test('AI rate limit rejects when no limiter or database is configured', async () => {
  await assert.rejects(
    assertRateLimitOk({}, { merchantId: 'merchant-1', clientIp: '203.0.113.7' }),
    (error) => error.status === 503
  );
});
