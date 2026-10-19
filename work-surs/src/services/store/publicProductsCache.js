export function publicProductsCacheKey(username) {
  return new Request(
    `https://cache.internal/get_public_products?u=${encodeURIComponent(username)}`,
    { method: 'GET' }
  );
}

export async function invalidatePublicProductsCache(username) {
  const cacheApi = typeof caches !== 'undefined' ? caches.default : null;
  if (!cacheApi || !username) return;

  try {
    await cacheApi.delete(publicProductsCacheKey(username));
  } catch (error) {
    console.error('getPublicProducts cache invalidation error:', error);
  }
}
