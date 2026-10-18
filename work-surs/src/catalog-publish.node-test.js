import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { updateProductStock } from './controllers/productController.js';
import { confirmDeliveryCode } from './controllers/orderController.js';
import { syncCatalogToStorefront } from './services/catalog/catalogSyncService.js';

// قاعدة بيانات وهمية: كل استعلام يُطابَق بجزء من نصه، والافتراضي null/صفوف فارغة.
function fakeDb(handlers = []) {
  const queries = [];
  const route = (sql, args, kind) => {
    queries.push(sql);
    for (const [needle, fn] of handlers) {
      if (sql.includes(needle)) {
        const r = fn(args, kind);
        if (r !== undefined) return r;
      }
    }
    return undefined;
  };
  return {
    queries,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async first() { return route(sql, args, 'first') ?? null; },
        async all() { return route(sql, args, 'all') ?? { results: [] }; },
        async run() { return route(sql, args, 'run') ?? { meta: { changes: 0 } }; },
      };
      return stmt;
    },
    async batch(stmts) {
      queries.push('BATCH');
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
}

// يسجّل كل طلب خارجي، ويحاكي GitHub Git Data API بنجاح.
async function withFakeNetwork(fn) {
  const original = globalThis.fetch;
  const calls = [];
  const commitPosts = [];
  const treePosts = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = opts.method || 'GET';
    calls.push(`${method} ${u}`);
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.startsWith('https://api.github.com/')) {
      if (u.endsWith('/git/ref/heads/main') && method === 'GET') return json({ object: { sha: 'c0' } });
      if (u.includes('/git/commits/c0')) return json({ tree: { sha: 't0' } });
      if (u.endsWith('/git/trees') && method === 'POST') {
        treePosts.push(JSON.parse(opts.body));
        return json({ sha: 't1' });
      }
      if (u.endsWith('/git/commits') && method === 'POST') {
        commitPosts.push(u);
        return json({ sha: 'c1' });
      }
      if (u.endsWith('/git/refs/heads/main') && method === 'PATCH') return json({ ref: 'refs/heads/main' });
    }
    return json({ message: 'not mocked' }, 404);
  };
  try {
    await fn({ calls, commitPosts, treePosts });
  } finally {
    globalThis.fetch = original;
  }
}

test('stock update performs no GitHub calls and schedules no catalog rebuild', async () => {
  await withFakeNetwork(async ({ calls }) => {
    const product = { id: 'p1', quantity: 5, quantity_type: 'tracked', options: '[]' };
    const env = {
      DB: fakeDb([
        ['SELECT id, quantity, quantity_type, options FROM products', () => product],
        ['UPDATE products SET quantity', () => ({ meta: { changes: 1 } })],
        ['SELECT * FROM products WHERE id', () => product],
      ]),
    };
    const background = [];
    const ctx = { waitUntil: (p) => background.push(p) };
    const user = { user_id: 'm1', username: 'shop', role: 'merchant' };

    await updateProductStock({ env, ctx, user, body: { product_id: 'p1', quantity_type: 'tracked', quantity: 3 } });
    await Promise.allSettled(background);

    assert.equal(calls.length, 0, `expected no outbound calls, got: ${calls.join(' | ')}`);
    assert.equal(background.length, 0, 'stock update must not schedule background publishing');
  });
});

test('catalog snapshot is published as exactly one commit with all store files', async () => {
  await withFakeNetwork(async ({ commitPosts, treePosts }) => {
    const env = {
      GITHUB_OWNER: 'nalshi',
      GITHUB_REPO: 'Nynnl',
      GITHUB_DATA_REPO: 'Nynnl-data',
      GITHUB_TOKEN: 'token',
      DB: fakeDb([
        ['FROM categories', () => ({ results: [{ id: 1, name: 'عام', parent_id: null }] })],
      ]),
    };
    const products = [
      { id: 'p1', name: 'A', description: '', price: 10, discount: 0, image: '', category_id: 1, options: '[]', features: '[]', quantity: 4, quantity_type: 'tracked', is_available: 1, currency: 'YER' },
      { id: 'p2', name: 'B', description: '', price: 5, discount: 0, image: '', category_id: null, options: '[]', features: '[]', quantity: 9, quantity_type: 'tracked', is_available: 1, currency: 'YER' },
    ];

    await syncCatalogToStorefront(env, 'shop', 'm1', products);

    assert.equal(commitPosts.length, 1, 'one publish must create exactly one commit');
    assert.equal(treePosts.length, 1, 'one publish must create exactly one tree');
    const paths = treePosts[0].tree.map((f) => f.path).sort();
    assert.deepEqual(paths, [
      'stores/shop/categories.json',
      'stores/shop/manifest.json',
      'stores/shop/products_page_1.json',
      'stores/shop/search_index.json',
    ]);
    assert.ok(commitPosts[0].includes('/repos/nalshi/Nynnl-data/'), 'publish must target the data repo');
  });
});

test('delivery confirmation writes D1 in one batch and publishes once', async () => {
  await withFakeNetwork(async ({ commitPosts }) => {
    const ticketData = {
      items: [{ product_id: 'p1', product_name: 'A', price: 10, quantity: 2, cost_price: 4, size_id: null }],
      financials: { grand_total: 20, currency: 'YER' },
      customer: {},
    };
    const env = {
      GITHUB_OWNER: 'nalshi',
      GITHUB_REPO: 'Nynnl',
      GITHUB_DATA_REPO: 'Nynnl-data',
      GITHUB_TOKEN: 'token',
      DB: fakeDb([
        ['SELECT delivery_code, status, ticket_data', () => ({
          delivery_code: '1234',
          status: 'out_for_delivery',
          ticket_data: JSON.stringify(ticketData),
          customer_id: 'c1',
          order_group_id: 'g1',
        })],
        ['DELETE FROM live_tickets', () => ({ meta: { changes: 1 } })],
        ['FROM categories', () => ({ results: [] })],
        ['FROM products WHERE merchant_id', () => ({ results: [] })],
      ]),
    };
    const background = [];
    const ctx = { waitUntil: (p) => background.push(p) };
    const user = { user_id: 'm1', username: 'shop', role: 'merchant' };

    await confirmDeliveryCode({ env, ctx, user, body: { ticket_id: 'T1', code: '1234' } });
    await Promise.allSettled(background);

    assert.equal(background.length, 1, 'post-delivery work must run as one background task');
    assert.equal(env.DB.queries.filter((q) => q === 'BATCH').length, 1, 'D1 writes must be one batch');
    assert.equal(commitPosts.length, 1, 'delivery must publish exactly one commit');
  });
});

test('product and order controllers no longer import the catalog publisher', () => {
  for (const file of ['controllers/productController.js', 'controllers/customerController.js']) {
    const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.ok(!src.includes('catalogSyncService'), `${file} must not trigger catalog publishing`);
  }
});
