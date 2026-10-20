import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { confirmDeliveryCode } from './controllers/orderController.js';
import { saveProduct, updateProductStock } from './controllers/productController.js';
import { saveMerchantSettings } from './controllers/storeController.js';
import { syncCatalogToStorefront, syncProductToStorefront } from './services/catalog/catalogSyncService.js';
import { commitMultipleFiles } from './services/storage/providers/githubProvider.js';

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
        bind(...a) {
          args = a;
          return stmt;
        },
        async first() {
          return route(sql, args, 'first') ?? null;
        },
        async all() {
          return route(sql, args, 'all') ?? { results: [] };
        },
        async run() {
          return route(sql, args, 'run') ?? { meta: { changes: 0 } };
        },
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

// يسجّل كل طلب خارجي، ويحاكي طلب GraphQL واحداً لنشر الملفات بنجاح.
async function withFakeNetwork(fn, files = {}) {
  const original = globalThis.fetch;
  const calls = [];
  const commitPosts = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = opts.method || 'GET';
    calls.push(`${method} ${u}`);
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    if (u === 'https://api.github.com/graphql' && method === 'POST') {
      const parsedBody = JSON.parse(opts.body);
      if (parsedBody.query?.includes('GetBranchHead')) {
        return json({
          data: {
            repository: {
              ref: { name: 'main', target: { oid: 'mock-head-oid' } },
              defaultBranchRef: { name: 'main', target: { oid: 'mock-head-oid' } },
            },
          },
        });
      }
      commitPosts.push(parsedBody);
      return json({ data: { createCommitOnBranch: { commit: { oid: 'c1' } } } });
    }
    if (method === 'GET' && u.includes('/contents/')) {
      const path = decodeURIComponent(new URL(u).pathname.split('/contents/')[1]);
      if (!(path in files)) return json({ message: 'not mocked' }, 404);
      return json({
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(files[path]), 'utf8').toString('base64'),
      });
    }
    return json({ message: 'not mocked' }, 404);
  };
  try {
    await fn({ calls, commitPosts });
  } finally {
    globalThis.fetch = original;
  }
}

test('stock update only republishes its product page and manifest', async () => {
  const files = {
    'stores/shop/manifest.json': {
      version: 1,
      total_products: 1,
      total_pages: 1,
      files: { search: 1, categories: 1, info: 1, pages: { page_1: 1 } },
    },
  };
  await withFakeNetwork(async ({ calls, commitPosts }) => {
    const product = {
      id: 'p1',
      name: 'A',
      category_id: null,
      quantity: 5,
      quantity_type: 'tracked',
      options: '[]',
    };
    const env = {
      DB: fakeDb([
        ['SELECT id, quantity, quantity_type, options FROM products', () => product],
        ['UPDATE products SET quantity', () => ({ meta: { changes: 1 } })],
        ['SELECT * FROM products WHERE id', () => product],
        ['SELECT COUNT(*) as total FROM products', () => ({ total: 1 })],
      ]),
    };
    const background = [];
    const ctx = { waitUntil: (p) => background.push(p) };
    const user = { user_id: 'm1', username: 'shop', role: 'merchant' };

    await updateProductStock({
      env,
      ctx,
      user,
      body: { product_id: 'p1', quantity_type: 'tracked', quantity: 3 },
    });
    await Promise.all(background);

    assert.equal(calls.filter((call) => call.includes('/graphql')).length, 2);
    assert.equal(background.length, 1, 'stock changes share one background publishing task');
    assert.equal(commitPosts[0].variables.input.expectedHeadOid, 'mock-head-oid');
    const changedPaths = commitPosts[0].variables.input.fileChanges.additions.map((file) => file.path).sort();
    assert.deepEqual(changedPaths, ['stores/shop/manifest.json']);
  }, files);
});

test('catalog snapshot is published with one GitHub request and all store files', async () => {
  await withFakeNetwork(async ({ calls, commitPosts }) => {
    const env = {
      GITHUB_OWNER: 'nalshi',
      GITHUB_REPO: 'Nynnl',
      GITHUB_DATA_REPO: 'Nynnl-data',
      GITHUB_TOKEN: 'token',
      DB: fakeDb([['FROM categories', () => ({ results: [{ id: 1, name: 'عام', parent_id: null }] })]]),
    };
    const products = [
      {
        id: 'p1',
        name: 'A',
        description: '',
        price: 10,
        discount: 0,
        image: '',
        category_id: 1,
        options: '[]',
        features: '[]',
        quantity: 4,
        quantity_type: 'tracked',
        is_available: 1,
        currency: 'YER',
      },
      {
        id: 'p2',
        name: 'B',
        description: '',
        price: 5,
        discount: 0,
        image: '',
        category_id: null,
        options: '[]',
        features: '[]',
        quantity: 9,
        quantity_type: 'tracked',
        is_available: 1,
        currency: 'YER',
      },
    ];

    await syncCatalogToStorefront(env, 'shop', 'm1', products);

    assert.equal(commitPosts.length, 1, 'one publish must create exactly one commit');
    assert.equal(calls.filter((call) => call.includes('/graphql')).length, 2, 'one publish uses one GraphQL query and one mutation');
    const input = commitPosts[0].variables.input;
    assert.equal(input.expectedHeadOid, 'mock-head-oid');
    assert.equal(input.branch.repositoryNameWithOwner, 'nalshi/Nynnl-data');
    const paths = input.fileChanges.additions.map((f) => f.path).sort();
    assert.deepEqual(paths, [
      'stores/shop/categories.json',
      'stores/shop/manifest.json',
      'stores/shop/products_page_1.json',
      'stores/shop/search_index.json',
    ]);
    const productsFile = input.fileChanges.additions.find((file) => file.path.endsWith('products_page_1.json'));
    const decodedProducts = JSON.parse(Buffer.from(productsFile.contents, 'base64').toString('utf8'));
    assert.deepEqual(Object.keys(decodedProducts.data), ['p1', 'p2']);
  });
});

test('editing a product updates only its page and compact catalog indexes', async () => {
  const files = {
    'stores/shop/manifest.json': {
      version: 1,
      total_products: 21,
      total_pages: 2,
      files: { search: 1, categories: 1, info: 1, pages: { page_1: 1, page_2: 1 } },
    },
    'stores/shop/search_index.json': { _version: 1, data: [{ id: 'p1', n: 'Old name', pg: 2 }] },
    'stores/shop/categories.json': {
      _version: 1,
      data: [{ id: 1, name: 'عام', products: [{ id: 'p1', n: 'Old name', pg: 2 }], children: [] }],
    },
    'stores/shop/products_page_2.json': {
      _version: 1,
      page: 2,
      total_pages: 2,
      data: { p1: { id: 'p1', name: 'Old name', category_id: 1, type: 'عام' } },
    },
  };
  await withFakeNetwork(async ({ commitPosts }) => {
    const env = { GITHUB_OWNER: 'nalshi', GITHUB_REPO: 'Nynnl', GITHUB_DATA_REPO: 'Nynnl-data' };
    await syncProductToStorefront(env, 'shop', 'm1', {
      product: {
        id: 'p1',
        name: 'New name',
        description: 'Updated',
        price: 10,
        discount: 0,
        image: '',
        category_id: 1,
        options: '[]',
        features: '[]',
        quantity: 2,
        quantity_type: 'tracked',
        is_available: 1,
        currency: 'YER',
      },
    });

    const additions = commitPosts[0].variables.input.fileChanges.additions;
    const paths = additions.map((file) => file.path).sort();
    assert.deepEqual(paths, [
      'stores/shop/categories.json',
      'stores/shop/manifest.json',
      'stores/shop/products_page_2.json',
      'stores/shop/search_index.json',
    ]);
    const updatedPage = JSON.parse(
      Buffer.from(additions.find((file) => file.path.endsWith('products_page_2.json')).contents, 'base64').toString()
    );
    assert.equal(updatedPage.data.p1.name, 'New name');
    const updatedIndex = JSON.parse(
      Buffer.from(additions.find((file) => file.path.endsWith('search_index.json')).contents, 'base64').toString()
    );
    assert.deepEqual(updatedIndex.data, [{ id: 'p1', n: 'New name', pg: 2 }]);
  }, files);
});

test('deleting the last product page removes it and updates page one metadata', async () => {
  const files = {
    'stores/shop/manifest.json': {
      version: 1,
      total_products: 2,
      total_pages: 2,
      files: { search: 1, categories: 1, info: 1, pages: { page_1: 1, page_2: 1 } },
    },
    'stores/shop/search_index.json': {
      _version: 1,
      data: [
        { id: 'p1', n: 'One', pg: 1 },
        { id: 'p2', n: 'Two', pg: 2 },
      ],
    },
    'stores/shop/categories.json': { _version: 1, data: [] },
    'stores/shop/products_page_1.json': { _version: 1, page: 1, total_pages: 2, data: { p1: { id: 'p1' } } },
    'stores/shop/products_page_2.json': { _version: 1, page: 2, total_pages: 2, data: { p2: { id: 'p2' } } },
  };
  await withFakeNetwork(async ({ commitPosts }) => {
    await syncProductToStorefront(
      { GITHUB_OWNER: 'nalshi', GITHUB_REPO: 'Nynnl', GITHUB_DATA_REPO: 'Nynnl-data' },
      'shop',
      'm1',
      { removedProductId: 'p2' }
    );

    const input = commitPosts[0].variables.input;
    assert.deepEqual(input.fileChanges.deletions, [{ path: 'stores/shop/products_page_2.json' }]);
    const additions = input.fileChanges.additions;
    const updatedManifest = JSON.parse(
      Buffer.from(additions.find((file) => file.path.endsWith('manifest.json')).contents, 'base64').toString()
    );
    assert.equal(updatedManifest.total_products, 1);
    assert.equal(updatedManifest.total_pages, 1);
    const firstPage = JSON.parse(
      Buffer.from(additions.find((file) => file.path.endsWith('products_page_1.json')).contents, 'base64').toString()
    );
    assert.equal(firstPage.total_pages, 1);
  }, files);
});

test('GitHub GraphQL publication failures are surfaced', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const body = JSON.parse(init.body || '{}');
    if (body.query?.includes('GetBranchHead')) {
      return new Response(
        JSON.stringify({
          data: {
            repository: {
              ref: { name: 'main', target: { oid: 'head-sha' } },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({ errors: [{ type: 'FORBIDDEN', message: 'Resource not accessible', path: ['createCommitOnBranch'] }] }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'x-github-request-id': 'request-123' },
      }
    );
  };
  try {
    await assert.rejects(
      commitMultipleFiles(
        { GITHUB_OWNER: 'nalshi', GITHUB_REPO: 'Nynnl', GITHUB_TOKEN: 'token' },
        [{ path: 'stores/shop/test.json', content: '{}' }],
        'test'
      ),
      /HTTP 200, request request-123, FORBIDDEN: Resource not accessible: createCommitOnBranch/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('delivery confirmation writes D1 in one batch and publishes once', async () => {
  await withFakeNetwork(async ({ commitPosts }) => {
    const ticketData = {
      items: [
        {
          product_id: 'p1',
          product_name: 'A',
          price: 10,
          quantity: 2,
          cost_price: 4,
          size_id: null,
        },
      ],
      financials: { grand_total: 20, currency: 'YER' },
      customer: {},
    };
    const env = {
      GITHUB_OWNER: 'nalshi',
      GITHUB_REPO: 'Nynnl',
      GITHUB_DATA_REPO: 'Nynnl-data',
      GITHUB_TOKEN: 'token',
      DB: fakeDb([
        [
          'SELECT delivery_code, status, ticket_data',
          () => ({
            delivery_code: '1234',
            status: 'out_for_delivery',
            ticket_data: JSON.stringify(ticketData),
            customer_id: 'c1',
            order_group_id: 'g1',
          }),
        ],
        ['DELETE FROM live_tickets', () => ({ meta: { changes: 1 } })],
        ['FROM categories', () => ({ results: [] })],
        ['FROM products WHERE merchant_id', () => ({ results: [] })],
      ]),
    };
    const background = [];
    const ctx = { waitUntil: (p) => background.push(p) };
    const user = { user_id: 'm1', username: 'shop', role: 'merchant' };

    await confirmDeliveryCode({
      env,
      ctx,
      user,
      body: { ticket_id: 'T1', code: '1234' },
    });
    await Promise.allSettled(background);

    assert.equal(background.length, 1, 'post-delivery work must run as one background task');
    assert.equal(env.DB.queries.filter((q) => q === 'BATCH').length, 1, 'D1 writes must be one batch');
    assert.equal(commitPosts.length, 1, 'delivery must publish exactly one commit');
  });
});

test('product mutations publish snapshots while customer stock updates remain on delivery', () => {
  const productController = readFileSync(new URL('./controllers/productController.js', import.meta.url), 'utf8');
  const customerController = readFileSync(new URL('./controllers/customerController.js', import.meta.url), 'utf8');
  assert.ok(productController.includes('syncManifestOnlyToStorefront'));
  assert.ok(!customerController.includes('catalogSyncService'));
});

test('product save commits catalog and option images in a single GitHub request', async () => {
  await withFakeNetwork(async ({ calls, commitPosts }) => {
    let savedOptions = '';
    let savedProduct;
    const background = [];
    const env = {
      GITHUB_OWNER: 'nalshi',
      GITHUB_REPO: 'Nynnl',
      GITHUB_DATA_REPO: 'Nynnl-data',
      GITHUB_TOKEN: 'token',
      DB: fakeDb([
        [
          'INSERT INTO products',
          (args) => {
            savedOptions = args[12];
            return { meta: { changes: 1 } };
          },
        ],
        ['SELECT * FROM products WHERE id', (args) => (savedProduct = { id: args[0], options: savedOptions })],
      ]),
    };
    const image = new File(['image'], 'blue.webp', { type: 'image/webp' });

    const result = await saveProduct({
      env,
      ctx: { waitUntil: (promise) => background.push(promise) },
      user: { user_id: 'm1', username: 'shop', role: 'merchant' },
      body: {
        name: 'منتج',
        price: '10',
        sizes: JSON.stringify([
          {
            id: 'blue',
            name: 'أزرق',
            image_file_key: 'option_image_0',
          },
        ]),
      },
      uploadedOptionImageFiles: { option_image_0: image },
    });
    await Promise.all(background);

    const options = JSON.parse(savedOptions);
    assert.equal(result.product_id, savedProduct.id);
    assert.match(options[0].image, new RegExp(`${savedProduct.id}-option-0\\.webp$`));
    assert.equal('image_file_key' in options[0], false);
    assert.equal(calls.filter((call) => call.includes('/graphql')).length, 2);
    assert.equal(commitPosts[0].variables.input.expectedHeadOid, 'mock-head-oid');
    const paths = commitPosts[0].variables.input.fileChanges.additions.map((file) => file.path);
    assert.ok(paths.includes(`images/shop/${savedProduct.id}-option-0.webp`));
    assert.ok(paths.includes('stores/shop/manifest.json'));
    const uploadedImage = commitPosts[0].variables.input.fileChanges.additions.find((file) =>
      file.path.includes('-option-0.webp')
    );
    assert.equal(Buffer.from(uploadedImage.contents, 'base64').toString('utf8'), 'image');
  });
});

test('merchant settings preserve the current phone while allowing store type updates', async () => {
  await withFakeNetwork(async () => {
    let updateBindings;
    const background = [];
    const env = {
      GITHUB_OWNER: 'nalshi',
      GITHUB_REPO: 'Nynnl',
      GITHUB_DATA_REPO: 'Nynnl-data',
      GITHUB_TOKEN: 'token',
      DB: fakeDb([
        ['SELECT settings, store_type, phone FROM users', () => ({
          settings: JSON.stringify({ phone: '+967700000000' }),
          store_type: 'retail',
          phone: '+967700000000',
        })],
        ['SELECT COUNT(*) as total FROM products', () => ({ total: 0 })],
        ['UPDATE users', (args, _kind) => { updateBindings = args; return { meta: { changes: 1 } }; }],
      ]),
    };

    const result = await saveMerchantSettings({
      env,
      ctx: { waitUntil: (promise) => background.push(promise) },
      user: { user_id: 'm1', username: 'shop', role: 'merchant' },
      body: {
        storeName: 'متجري',
        storeType: 'أزياء وملابس',
        settings: { phone: '+967711111111' },
      },
    });
    await Promise.all(background);

    assert.equal(updateBindings[1], 'أزياء وملابس');
    assert.equal(JSON.parse(updateBindings[2]).phone, '+967700000000');
    assert.equal(result.updated_settings.phone, '+967700000000');
  });
});
