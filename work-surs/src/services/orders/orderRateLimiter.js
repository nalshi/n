import { HttpError } from '../../security/rbac.js';

// ========================================================
// 🚦 تحديد معدل إنشاء الطلبات (create_order) لكل عميل
// ✅ محسّن: عملية D1 واحدة بدل 3 (حذف CREATE TABLE + دمج SELECT/INSERT)
// ========================================================

const WINDOW_MS = 5 * 60 * 1000; // نافذة 5 دقائق
const MAX_ORDERS_PER_WINDOW = 8;

export async function assertOrderRateLimitOk(env, customerId) {
  try {
    if (!env.DB || !customerId) return;

    const key = `create_order:${customerId}`;
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    // ✅ عملية واحدة: إدراج أو تحديث مع تنظيف النافذة المنتهية تلقائياً
    const row = await env.DB.prepare(
      `INSERT INTO order_rate_limit (rate_key, request_count, window_started_at)
       VALUES (?, 1, ?)
       ON CONFLICT(rate_key) DO UPDATE SET
         request_count = CASE
           WHEN order_rate_limit.window_started_at < ? THEN 1
           ELSE order_rate_limit.request_count + 1
         END,
         window_started_at = CASE
           WHEN order_rate_limit.window_started_at < ? THEN excluded.window_started_at
           ELSE order_rate_limit.window_started_at
         END
       RETURNING request_count`
    )
      .bind(key, now, windowStart, windowStart)
      .first();

    if (row && row.request_count > MAX_ORDERS_PER_WINDOW) {
      throw new HttpError('عدد محاولات إنشاء الطلبات كبير جداً خلال وقت قصير. يرجى الانتظار قليلاً.', 429);
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.error('assertOrderRateLimitOk error (fail-open):', e);
  }
}
