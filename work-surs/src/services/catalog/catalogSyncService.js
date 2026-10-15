import {
  commitMultipleFiles,
  getRepositoryJsonFile,
} from '../storage/providers/githubProvider.js';
import { purgeCloudflareCache } from '../storage/providers/cloudflareCacheProvider.js';
import { waitForVercelDeployment } from '../storage/providers/vercelDeployProvider.js';
import { enqueueSync } from '../storage/syncQueue.js';
import { assertSafePathSegment } from '../../core/pathSafety.js';

// ========================================================
// ⚡ خدمة مزامنة كتالوج المتجر (منتجات + فئات) إلى GitHub
// نفس منطق الأصلي بالضبط، بس بمعزل عن باقي الموديولات حتى
// تقدر تطوّر منطق الكتالوج بدون ما تلمس المنتجات أو الطلبات.
// ========================================================

const PAGE_SIZE = 20;

function safeParse(str, fallback) {
  try {
    return JSON.parse(str || JSON.stringify(fallback));
  } catch (e) {
    return fallback;
  }
}

// ⭐ ملاحظة: الدالة المُصدَّرة تمرر التنفيذ الفعلي عبر enqueueSync حتى تُسلسَل
// كل عمليات الكتابة على GitHub (راجع تعليق syncQueue.js لتفاصيل سبب الحاجة
// لهذا - منع كوميت متأخر يمحو تعديل أحدث بصمت بعد أن نفّذنا purge له فعلاً).
export async function syncCatalogToStorefront(env, username, merchantId, products) {
  return enqueueSync(() => runCatalogSync(env, username, merchantId, products));
}

export async function syncSingleProductToStorefront(
  env,
  username,
  merchantId,
  product,
  { deleted = false } = {}
) {
  return enqueueSync(() =>
    runSingleProductSync(env, username, merchantId, product, deleted)
  );
}

function walkCategoryNodes(nodes, callback) {
  for (const node of nodes) {
    callback(node);
    walkCategoryNodes(Array.isArray(node.children) ? node.children : [], callback);
  }
}

function productCatalogEntry(product, categoryName) {
  return {
    id: product.id,
    name: product.name,
    mainDescription: product.description || '',
    price: Number(product.price) || 0,
    discount: Number(product.discount) || 0,
    image: product.image || '',
    type: categoryName || 'عام',
    category_id: product.category_id ? Number(product.category_id) : null,
    options: safeParse(product.options, []),
    features: safeParse(product.features, []),
    quantity: Number(product.quantity) || 0,
    quantity_type: product.quantity_type || 'tracked',
    is_available: Number(product.is_available) || 1,
    currency: product.currency || 'YER',
  };
}

async function runSingleProductSync(env, username, merchantId, product, deleted) {
  try {
    assertSafePathSegment(username, 'اسم المتجر');
    const basePath = `stores/${username}`;
    const [manifestValue, searchValue, categoriesValue] = await Promise.all([
      getRepositoryJsonFile(env, `${basePath}/manifest.json`),
      getRepositoryJsonFile(env, `${basePath}/search_index.json`),
      getRepositoryJsonFile(env, `${basePath}/categories.json`),
    ]);
    const manifest = manifestValue || {
      version: 0,
      total_products: 0,
      total_pages: 1,
      files: { search: 0, categories: 0, info: 0, pages: {} },
    };
    const searchIndex = searchValue || { _version: 0, data: [] };
    const categories = categoriesValue || { _version: 0, data: [] };
    const refs = Array.isArray(searchIndex.data) ? searchIndex.data : [];
    const categoriesTree = Array.isArray(categories.data) ? categories.data : [];
    const existingIndex = refs.findIndex((entry) => String(entry.id) === String(product.id));
    const oldRef = existingIndex >= 0 ? refs[existingIndex] : null;
    const removeProduct = deleted || Number(product.is_available) === 0;
    const currentPageCount = Math.max(1, Number(manifest.total_pages) || 1);
    let pageNumber = oldRef?.pg || currentPageCount;
    const timestamp = Date.now();
    let pagePath = `${basePath}/products_page_${pageNumber}.json`;
    let pageValue = await getRepositoryJsonFile(env, pagePath);
    const additionalPageFiles = [];
    if (oldRef && !pageValue) {
      throw new Error(`Storefront page referenced by product index is missing: ${pagePath}`);
    }
    if (
      !oldRef &&
      !removeProduct &&
      pageValue &&
      Object.keys(pageValue.data || {}).length >= PAGE_SIZE
    ) {
      const previousPage = pageValue;
      pageNumber = currentPageCount + 1;
      pagePath = `${basePath}/products_page_${pageNumber}.json`;
      pageValue = await getRepositoryJsonFile(env, pagePath);
      if (pageValue && Object.keys(pageValue.data || {}).length) {
        throw new Error('Cannot allocate a new storefront product page safely');
      }
      manifest.total_pages = pageNumber;
      previousPage.total_pages = pageNumber;
      previousPage._version = timestamp;
      additionalPageFiles.push({
        path: `${basePath}/products_page_${currentPageCount}.json`,
        content: JSON.stringify(previousPage),
      });
    }
    const page = pageValue || {
      _version: 0,
      page: pageNumber,
      total_pages: currentPageCount,
      data: {},
    };
    const pageData = page.data && typeof page.data === 'object' ? page.data : {};

    if (oldRef && oldRef.pg !== pageNumber) {
      throw new Error('Product index and page assignment are inconsistent');
    }
    if (removeProduct) {
      if (existingIndex >= 0) refs.splice(existingIndex, 1);
      delete pageData[product.id];
      walkCategoryNodes(categoriesTree, (node) => {
        node.products = (node.products || []).filter(
          (entry) => String(entry.id) !== String(product.id)
        );
      });
    } else {
      const categoryId = product.category_id ? Number(product.category_id) : null;
      let categoryName = '';
      walkCategoryNodes(categoriesTree, (node) => {
        node.products = (node.products || []).filter(
          (entry) => String(entry.id) !== String(product.id)
        );
        if (categoryId !== null && Number(node.id) === categoryId) {
          categoryName = node.name;
          node.products.push({
            id: product.id,
            n: String(product.name).substring(0, 40),
            pg: pageNumber,
          });
        }
      });
      pageData[product.id] = productCatalogEntry(product, categoryName);
      const ref = {
        id: product.id,
        n: String(product.name).substring(0, 40),
        pg: pageNumber,
        cid: categoryId,
      };
      if (existingIndex >= 0) refs[existingIndex] = ref;
      else refs.push(ref);
    }

    page.data = pageData;
    page._version = timestamp;
    page.total_pages = Math.max(1, Number(manifest.total_pages) || currentPageCount);
    return await commitSingleProductFiles(
      env,
      username,
      merchantId,
      manifest,
      searchIndex,
      categories,
      refs,
      categoriesTree,
      [
        { path: pagePath, content: JSON.stringify(page) },
        ...additionalPageFiles,
      ],
      timestamp
    );
  } catch (error) {
    console.error('Single Product Catalog Sync Error:', error);
  }
}

async function commitSingleProductFiles(
  env,
  username,
  merchantId,
  manifest,
  searchIndex,
  categories,
  refs,
  categoriesTree,
  pageFiles,
  timestamp
) {
  searchIndex._version = timestamp;
  searchIndex.data = refs;
  categories._version = timestamp;
  categories.data = categoriesTree;
  manifest.version = timestamp;
  manifest.total_products = refs.length;
  manifest.files = manifest.files || { pages: {} };
  manifest.files.search = timestamp;
  manifest.files.categories = timestamp;
  manifest.files.info = timestamp;
  manifest.files.pages = manifest.files.pages || {};
  for (const file of pageFiles) {
    const pageName = file.path.match(/products_page_(\d+)\.json$/)?.[1];
    if (pageName) manifest.files.pages[`page_${pageName}`] = timestamp;
  }

  const files = [
    ...pageFiles,
    {
      path: `stores/${username}/search_index.json`,
      content: JSON.stringify(searchIndex),
    },
    {
      path: `stores/${username}/categories.json`,
      content: JSON.stringify(categories),
    },
    {
      path: `stores/${username}/manifest.json`,
      content: JSON.stringify(manifest),
    },
  ];
  const commitSha = await commitMultipleFiles(
    env,
    files,
    `⚡ Auto-sync product via Worker [${username}]`
  );
  await waitForVercelDeployment(env, commitSha);
  await purgeCloudflareCache(env);
  console.log(`[Single Product Catalog Sync Success] ${username}:${merchantId}`);
}

async function runCatalogSync(env, username, merchantId, products) {
  try {
    // ⭐ تحقق دفاعي إضافي: username يُستخدم حرفياً كجزء من مسارات ملفات
    // GitHub بالأسفل (stores/${username}/...) - نتأكد أنه لا يحتوي فواصل
    // مسار قبل أي استخدام، دفاعاً بعمق حتى لو حدث خلل بمصدر هذه القيمة.
    assertSafePathSegment(username, 'اسم المتجر');

    let catRows = [];
    if (merchantId) {
      const catsRes = await env.DB.prepare(
        `SELECT id, name, parent_id FROM categories WHERE user_id = ? OR user_id IS NULL ORDER BY parent_id, name`
      )
        .bind(merchantId)
        .all();
      catRows = catsRes.results || [];
    }

    const catNameById = {};
    catRows.forEach((c) => {
      catNameById[c.id] = c.name;
    });

    const timestamp = Date.now();
    let pages = {};
    let productRef = {};

    for (let i = 0; i < products.length; i += PAGE_SIZE) {
      const chunk = products.slice(i, i + PAGE_SIZE);
      const pageNum = Math.floor(i / PAGE_SIZE) + 1;
      const pageData = {};

      chunk.forEach((p) => {
        const opts = safeParse(p.options, []);
        const feats = safeParse(p.features, []);
        const cid = p.category_id ? parseInt(p.category_id) : null;

        pageData[p.id] = {
          id: p.id,
          name: p.name,
          mainDescription: p.description || '',
          price: parseFloat(p.price) || 0,
          discount: parseFloat(p.discount) || 0,
          image: p.image || '',
          type: catNameById[cid] || 'عام',
          category_id: cid,
          options: opts,
          features: feats,
          quantity: parseInt(p.quantity) || 0,
          quantity_type: p.quantity_type || 'tracked',
          is_available: parseInt(p.is_available) || 1,
          currency: p.currency || 'YER',
        };

        productRef[p.id] = { id: p.id, n: String(p.name).substring(0, 40), pg: pageNum, cid };
      });

      pages[pageNum] = pageData;
    }
    if (Object.keys(pages).length === 0) pages[1] = {};

    const catMap = {};
    catRows.forEach((c) => {
      catMap[c.id] = { id: c.id, name: c.name, parent_id: c.parent_id || 0, products: [], children: [] };
    });
    Object.values(productRef).forEach((ref) => {
      if (ref.cid && catMap[ref.cid]) {
        catMap[ref.cid].products.push({ id: ref.id, n: ref.n, pg: ref.pg });
      }
    });
    const catRoots = [];
    Object.values(catMap).forEach((node) => {
      if (node.parent_id && catMap[node.parent_id]) {
        catMap[node.parent_id].children.push(node);
      } else {
        catRoots.push(node);
      }
    });

    const categoriesData = { _version: timestamp, data: catRoots };
    const searchIndex = {
      _version: timestamp,
      data: Object.values(productRef).map((r) => ({ id: r.id, n: r.n, pg: r.pg })),
    };

    const pageNums = Object.keys(pages);
    const manifestVersions = { search: timestamp, categories: timestamp, info: timestamp, pages: {} };

    const files = [
      { path: `stores/${username}/search_index.json`, content: JSON.stringify(searchIndex) },
      { path: `stores/${username}/categories.json`, content: JSON.stringify(categoriesData) },
    ];

    pageNums.forEach((pageNum) => {
      files.push({
        path: `stores/${username}/products_page_${pageNum}.json`,
        content: JSON.stringify({
          _version: timestamp,
          page: parseInt(pageNum),
          total_pages: pageNums.length,
          data: pages[pageNum],
        }),
      });
      manifestVersions.pages[`page_${pageNum}`] = timestamp;
    });

    files.push({
      path: `stores/${username}/manifest.json`,
      content: JSON.stringify({
        version: timestamp,
        total_products: products.length,
        total_pages: pageNums.length,
        files: manifestVersions,
      }),
    });

    const commitSha = await commitMultipleFiles(env, files, `⚡ Auto-sync via Worker [${username}]`);
    console.log(`[Catalog Sync Success] ${username}`);

    // ⏳ ننتظر فعلياً لين نشر Vercel المرتبط بهذا الكوميت بالذات يصير
    // READY - مو تأخير ثابت تخميني. الموقع الحقيقي منشور على Vercel،
    // وVercel يبني نشر جديد من نفس كوميت GitHub؛ هذا البناء قد ياخذ
    // ثوانٍ أو دقيقة كاملة حسب الحمل. لو مسحنا كاش Cloudflare قبل
    // اكتمال هذا النشر، أول طلب بعد المسح يوصل للنشر *السابق* على
    // Vercel ويُخزَّن بالكاش من جديد - فترجع النسخة القديمة رغم "نجاح"
    // الـ purge. راجع تعليق vercelDeployProvider.js لتفاصيل أكثر.
    // لو ما كانت متغيرات Vercel مهيأة، الدالة ترجع false فوراً وننتقل
    // للـ purge مباشرة (نفس السلوك القديم كـ fallback).
    await waitForVercelDeployment(env, commitSha);

    // 🧹 مسح كاش Cloudflare بالكامل (Purge Everything) حتى تنعكس التحديثات
    // فوراً. تم التأكد يدوياً إن مسح روابط محددة ما يشتغل فعلياً على هذا
    // الـ Zone (على الأغلب بسبب Cache Rule بمفتاح كاش مخصص)، فاستخدمنا
    // Purge Everything لأنه الوحيد المؤكد إنه يعمل.
    await purgeCloudflareCache(env);
  } catch (error) {
    console.error('Catalog Sync Error:', error);
  }
}
