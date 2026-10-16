import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import worker from './index.js';
import { buildCorsHeaders } from './core/response.js';
import { assertRateLimitOk } from './services/ai/rateLimiter.js';

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
        'X-Gateway-Secret': 'gateway-secret',
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
      merchantId: `merchant-${i}`,
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
