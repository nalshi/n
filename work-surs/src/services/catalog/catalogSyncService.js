import { commitMultipleFiles, getSingleFileContent } from '../storage/providers/githubProvider.js';
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

export async function syncCurrentCatalogToStorefront(env, username, merchantId, additionalFiles = []) {
  return enqueueSync(async () => {
    const productsRes = await env.DB.prepare(
      `SELECT id, name, description, price, discount, image, category_id, options, features,
              quantity, quantity_type, is_available, currency
       FROM products WHERE merchant_id = ? AND is_available = 1`
    )
      .bind(merchantId)
      .all();
    return runCatalogSync(env, username, merchantId, productsRes.results || [], additionalFiles);
  });
}

// ⚡ تحديث manifest.json فقط — بدون إعادة كتابة صفحات المنتجات.
// يُستخدم عند حفظ منتج أو تغيير الإعدادات حيث لا نريد إعادة نشر
// كامل الكتالوج (200 منتج → 10 صفحات) مع كل تعديل بسيط. يحسب
// عدد المنتجات النشطة من D1 ويحدّث manifest.json فقط.
export async function syncManifestOnlyToStorefront(env, username, merchantId, additionalFiles = []) {
  return enqueueSync(async () => {
    assertSafePathSegment(username, 'اسم المتجر');

    const basePath = `stores/${username}`;
    const manifestPath = `${basePath}/manifest.json`;

    // احسب عدد المنتجات النشطة من D1
    const countRes = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM products WHERE merchant_id = ? AND is_available = 1`
    )
      .bind(merchantId)
      .first();
    const totalProducts = Number(countRes?.total) || 0;
    const totalPages = Math.max(1, Math.ceil(totalProducts / PAGE_SIZE));

    // اقرأ manifest الحالي من GitHub (إن وُجد)
    const manifestText = await getSingleFileContent(env, manifestPath);
    const manifest = manifestText ? safeParse(manifestText, {}) : {};

    const timestamp = Date.now();
    const manifestFiles = manifest.files || {};

    // حدّث الحقول التعريفية فقط
    manifest.version = timestamp;
    manifest.total_products = totalProducts;
    manifest.total_pages = totalPages;
    manifest.files = manifestFiles;

    const files = [
      { path: manifestPath, content: JSON.stringify(manifest) },
      ...additionalFiles,
    ];

    await publishCatalogFiles(env, username, files);
  });
}

export async function syncProductToStorefront(
  env,
  username,
  merchantId,
  { product, removedProductId, additionalFiles = [], updateIndexes = true }
) {
  return enqueueSync(() =>
    runProductSync(env, username, merchantId, { product, removedProductId, additionalFiles, updateIndexes })
  );
}

function parseCatalogFile(content, path) {
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`ملف الكتالوج غير صالح في GitHub: ${path}`);
  }
}

function getCategoryNode(nodes, categoryId) {
  for (const node of nodes) {
    if (String(node.id) === String(categoryId)) return node;
    const child = getCategoryNode(node.children || [], categoryId);
    if (child) return child;
  }
  return null;
}

function removeProductFromCategories(nodes, productId) {
  for (const node of nodes) {
    node.products = (node.products || []).filter((product) => String(product.id) !== String(productId));
    removeProductFromCategories(node.children || [], productId);
  }
}

function productPayload(product, categoryName) {
  const categoryId = product.category_id ? parseInt(product.category_id, 10) : null;
  return {
    id: product.id,
    name: product.name,
    mainDescription: product.description || '',
    price: parseFloat(product.price) || 0,
    discount: parseFloat(product.discount) || 0,
    image: product.image || '',
    type: categoryName || 'عام',
    category_id: categoryId,
    options: safeParse(product.options, []),
    features: safeParse(product.features, []),
    quantity: parseInt(product.quantity, 10) || 0,
    quantity_type: product.quantity_type || 'tracked',
    is_available: Number(product.is_available ?? 1) ? 1 : 0,
    currency: product.currency || 'YER',
  };
}

async function getActiveProducts(env, merchantId) {
  const productsRes = await env.DB.prepare(
    `SELECT id, name, description, price, discount, image, category_id, options, features,
            quantity, quantity_type, is_available, currency
     FROM products WHERE merchant_id = ? AND is_available = 1`
  )
    .bind(merchantId)
    .all();
  return productsRes.results || [];
}

async function publishCatalogFiles(env, username, files) {
  const commitSha = await commitMultipleFiles(env, files, `⚡ Auto-sync via Worker [${username}]`);
  console.log(`[Catalog Sync Success] ${username}`);

  if (!env.GITHUB_DATA_REPO || env.GITHUB_DATA_REPO === env.GITHUB_REPO) {
    await waitForVercelDeployment(env, commitSha);
  }

  await purgeCloudflareCache(env);
}

async function runProductSync(env, username, merchantId, options) {
  const { product, removedProductId, additionalFiles, updateIndexes } = options;
  assertSafePathSegment(username, 'اسم المتجر');

  const basePath = `stores/${username}`;
  const manifestPath = `${basePath}/manifest.json`;
  const searchPath = `${basePath}/search_index.json`;
  const categoriesPath = `${basePath}/categories.json`;
  const [manifestText, searchText, categoriesText] = await Promise.all([
    getSingleFileContent(env, manifestPath),
    getSingleFileContent(env, searchPath),
    updateIndexes ? getSingleFileContent(env, categoriesPath) : Promise.resolve(null),
  ]);

  if (!manifestText || !searchText || (updateIndexes && !categoriesText)) {
    await runCatalogSync(env, username, merchantId, await getActiveProducts(env, merchantId), additionalFiles);
    return;
  }

  const manifest = parseCatalogFile(manifestText, manifestPath);
  const searchIndex = parseCatalogFile(searchText, searchPath);
  const categories = updateIndexes ? parseCatalogFile(categoriesText, categoriesPath) : null;
  if (!Array.isArray(searchIndex.data) || (updateIndexes && !Array.isArray(categories.data))) {
    throw new Error(`بنية فهرس الكتالوج غير صالحة للمتجر: ${username}`);
  }

  const productId = String(removedProductId || product?.id || '');
  const currentRef = searchIndex.data.find((item) => String(item.id) === productId);
  const isAvailable = Boolean(product && Number(product.is_available ?? 1));
  if (!currentRef && !isAvailable) {
    if (additionalFiles.length) await publishCatalogFiles(env, username, additionalFiles);
    return;
  }
  if (!currentRef && product && !updateIndexes) {
    await runCatalogSync(env, username, merchantId, await getActiveProducts(env, merchantId), additionalFiles);
    return;
  }
  if (!currentRef && !product && additionalFiles.length === 0) return;

  const timestamp = Date.now();
  const oldPageCount = Math.max(1, Number(manifest.total_pages) || 1);
  let pageNum = currentRef ? Number(currentRef.pg) : oldPageCount;
  if (!Number.isInteger(pageNum) || pageNum < 1) {
    throw new Error(`رقم صفحة المنتج غير صالح في فهرس المتجر: ${productId}`);
  }

  const getPage = async (number) => {
    const path = `${basePath}/products_page_${number}.json`;
    const content = await getSingleFileContent(env, path);
    return content ? parseCatalogFile(content, path) : { _version: timestamp, page: number, data: {} };
  };

  let page = await getPage(pageNum);
  if (!page.data || typeof page.data !== 'object' || Array.isArray(page.data)) {
    throw new Error(`بنية صفحة المنتجات غير صالحة في المتجر: ${username} (${pageNum})`);
  }

  if (!currentRef && product && isAvailable && Object.keys(page.data).length >= PAGE_SIZE) {
    pageNum = oldPageCount + 1;
    page = await getPage(pageNum);
  }

  if (product && isAvailable) {
    const categoriesData = categories?.data || [];
    const categoryId = product.category_id ? parseInt(product.category_id, 10) : null;
    const category = categoryId ? getCategoryNode(categoriesData, categoryId) : null;
    const nextProduct = productPayload(product, category?.name);
    page.data[productId] =
      !updateIndexes && page.data[productId]
        ? {
            ...page.data[productId],
            quantity: nextProduct.quantity,
            quantity_type: nextProduct.quantity_type,
            options: nextProduct.options,
          }
        : nextProduct;
  } else {
    delete page.data[productId];
  }

  const files = [...additionalFiles];
  let totalPages = Math.max(oldPageCount, pageNum);
  const changedPageNum = pageNum;
  const pagePath = `${basePath}/products_page_${changedPageNum}.json`;
  page._version = timestamp;
  page.page = changedPageNum;
  page.total_pages = totalPages;
  files.push({ path: pagePath, content: JSON.stringify(page) });
  const deletedPages = [];

  if (updateIndexes) {
    searchIndex.data = searchIndex.data.filter((item) => String(item.id) !== productId);
    removeProductFromCategories(categories.data, productId);

    if (product && isAvailable) {
      const ref = { id: productId, n: String(product.name).substring(0, 40), pg: pageNum };
      searchIndex.data.push(ref);
      const categoryId = product.category_id ? parseInt(product.category_id, 10) : null;
      const category = categoryId ? getCategoryNode(categories.data, categoryId) : null;
      if (category) category.products.push({ id: productId, n: ref.n, pg: pageNum });
    }

    searchIndex._version = timestamp;
    categories._version = timestamp;
    files.push(
      { path: searchPath, content: JSON.stringify(searchIndex) },
      { path: categoriesPath, content: JSON.stringify(categories) }
    );
  }

  if (removedProductId || (product && !isAvailable)) {
    while (pageNum === totalPages && pageNum > 1 && Object.keys(page.data).length === 0) {
      if (pageNum === changedPageNum) {
        files[files.findIndex((file) => file.path === pagePath)] = { path: pagePath, delete: true };
      } else {
        files.push({ path: `${basePath}/products_page_${pageNum}.json`, delete: true });
      }
      deletedPages.push(pageNum);
      totalPages -= 1;
      pageNum = totalPages;
      page = await getPage(pageNum);
      if (!page.data || typeof page.data !== 'object' || Array.isArray(page.data)) {
        throw new Error(`بنية صفحة المنتجات غير صالحة في المتجر: ${username} (${pageNum})`);
      }
    }
  }

  const manifestFiles = manifest.files || {};
  manifest.version = timestamp;
  manifest.total_products = Math.max(
    0,
    (Number(manifest.total_products) || 0) +
      (currentRef ? (product && isAvailable ? 0 : -1) : product && isAvailable ? 1 : 0)
  );
  manifest.total_pages = totalPages;
  manifestFiles.pages = manifestFiles.pages || {};
  for (const deletedPage of deletedPages) {
    delete manifestFiles.pages[`page_${deletedPage}`];
  }
  if (!deletedPages.includes(changedPageNum)) {
    manifestFiles.pages[`page_${changedPageNum}`] = timestamp;
  }
  if (totalPages !== oldPageCount && changedPageNum !== 1) {
    const firstPagePath = `${basePath}/products_page_1.json`;
    const firstPage = await getPage(1);
    if (!firstPage.data || typeof firstPage.data !== 'object' || Array.isArray(firstPage.data)) {
      throw new Error(`بنية صفحة المنتجات غير صالحة في المتجر: ${username} (1)`);
    }
    firstPage._version = timestamp;
    firstPage.total_pages = totalPages;
    manifestFiles.pages.page_1 = timestamp;
    files.push({ path: firstPagePath, content: JSON.stringify(firstPage) });
  }
  if (updateIndexes) {
    manifestFiles.search = timestamp;
    manifestFiles.categories = timestamp;
  }
  manifest.files = manifestFiles;
  files.push({ path: manifestPath, content: JSON.stringify(manifest) });

  await publishCatalogFiles(env, username, files);
}

async function runCatalogSync(env, username, merchantId, products, additionalFiles = []) {
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
    files.push(...additionalFiles);

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
    // ⚙️ ننتظر بناء Vercel فقط إذا كانت البيانات في نفس مستودع الكود المربوط به.
    // مع مستودع بيانات منفصل (GITHUB_DATA_REPO) لا يبدأ أي بناء، فالانتظار يضيع 15 ثانية بلا فائدة.
    if (!env.GITHUB_DATA_REPO || env.GITHUB_DATA_REPO === env.GITHUB_REPO) {
      await waitForVercelDeployment(env, commitSha);
    }

    // 🧹 مسح كاش Cloudflare بالكامل (Purge Everything) حتى تنعكس التحديثات
    // فوراً. تم التأكد يدوياً إن مسح روابط محددة ما يشتغل فعلياً على هذا
    // الـ Zone (على الأغلب بسبب Cache Rule بمفتاح كاش مخصص)، فاستخدمنا
    // Purge Everything لأنه الوحيد المؤكد إنه يعمل.
    await purgeCloudflareCache(env);
  } catch (error) {
    console.error('Catalog Sync Error:', error);
  }
}
