import { HttpError } from '../../security/rbac.js';

// ========================================================
// 🚦 تحديد معدل الطلبات للمساعد الذكي
// تُحدّ الطلبات على مستوى عنوان العميل وعنوان العميل+التاجر لمنع تجاوز
// الحصة بتبديل merchant_id.
//
// الأسلوب الأساسي: Cloudflare Rate Limiting Binding (سريع، بلا كتابة
// على D1، يُضبط في wrangler.toml - راجع ملف wrangler.toml.txt المرفق).
// في حال عدم توفر الـ binding (مثلاً أثناء التطوير المحلي)، نسقط تلقائياً
// إلى عدّاد ذري في D1. إذا لم يتوفر أي منهما نرفض الطلب بدلاً من تعطيل الحماية.
// ========================================================

const FALLBACK_WINDOW_MS = 60 * 1000; // نافذة دقيقة واحدة
const FALLBACK_MAX_REQUESTS = 10; // 10 رسائل بالدقيقة لكل نطاق تحديد

export async function assertRateLimitOk(env, { merchantId, clientIp }) {
  const ipKey = `ai_chat:ip:${clientIp || 'unknown'}`;
  const merchantKey = `ai_chat:merchant:${merchantId}:${clientIp || 'unknown'}`;
  const keys = [ipKey, merchantKey];

  // --- الأسلوب الأساسي: binding مخصص لتحديد المعدل ---
  if (env.AI_CHAT_RATE_LIMITER && typeof env.AI_CHAT_RATE_LIMITER.limit === 'function') {
    for (const key of keys) {
      const { success } = await env.AI_CHAT_RATE_LIMITER.limit({ key });
      if (!success) {
        throw new HttpError('عدد الرسائل تجاوز الحد المسموح، حاول بعد قليل.', 429);
      }
    }
    return;
  }

  // --- الأسلوب الاحتياطي: عدّاد بسيط في D1 ---
  if (!env.DB) {
    throw new HttpError('خدمة المساعد الذكي غير متاحة حالياً.', 503);
  }

  const now = Date.now();
  const windowStart = now - FALLBACK_WINDOW_MS;

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ai_chat_rate_limit (
      rate_key TEXT PRIMARY KEY,
      request_count INTEGER NOT NULL DEFAULT 0,
      window_started_at INTEGER NOT NULL
    )`
  ).run();

  for (const key of keys) {
    const row = await env.DB.prepare(
      `INSERT INTO ai_chat_rate_limit (rate_key, request_count, window_started_at)
       VALUES (?, 1, ?)
       ON CONFLICT(rate_key) DO UPDATE SET
         request_count = CASE
           WHEN ai_chat_rate_limit.window_started_at <= ? THEN 1
           ELSE ai_chat_rate_limit.request_count + 1
         END,
         window_started_at = CASE
           WHEN ai_chat_rate_limit.window_started_at <= ? THEN excluded.window_started_at
           ELSE ai_chat_rate_limit.window_started_at
         END
       RETURNING request_count`
    )
      .bind(key, now, windowStart, windowStart)
      .first();

    if (!row || row.request_count > FALLBACK_MAX_REQUESTS) {
      if (!row) {
        throw new HttpError('تعذر التحقق من حد استخدام المساعد الذكي.', 503);
      }
      throw new HttpError('عدد الرسائل تجاوز الحد المسموح، حاول بعد قليل.', 429);
    }
  }
}
