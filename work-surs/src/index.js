import { actionRegistry } from './router.js';
import { verifyHmacSignature, verifyJWT, timingSafeEqual } from './security/auth.js';
import { assertAllowed, HttpError } from './security/rbac.js';
import { validateAction } from './security/validate.js';
import { buildCorsHeaders, successResponse, errorResponse } from './core/response.js';
import { ROLES } from './config/constants.js';
import { handleWhatsappWebhookVerify, handleWhatsappWebhookEvent } from './controllers/whatsappController.js'; // ⭐ إضافة: ربط واتساب

// ========================================================
// 🚪 نقطة الدخول الرئيسية للـ Worker
// هذا الملف تنسيقي فقط: يحلل الطلب، يتحقق من الهوية
// والصلاحية والمدخلات، ثم يفوّض التنفيذ للـ controller المناسب
// عبر جدول الأفعال (router.js). لا يوجد منطق عمل هنا إطلاقاً.
// ========================================================
// ========================================================
// 🚪 تصدير كائنات Durable Objects
// ========================================================
export { MerchantSession } from './durableObjects/MerchantSession.js';

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createWebSocketTicket(user, secret) {
  const header = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  );
  const payload = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({
        user_id: user.user_id,
        role: user.role,
        username: user.username || '',
        ws_ticket: true,
        exp: Math.floor(Date.now() / 1000) + 60,
      })
    )
  );
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data)
  );
  return `${data}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifyGatewayAccess(request, env, corsHeaders) {
  const gatewaySecret = request.headers.get('X-Gateway-Secret') || '';
  const timestamp = request.headers.get('X-Gateway-Timestamp') || '';
  const nonce = request.headers.get('X-Gateway-Nonce') || '';
  const signature = request.headers.get('X-Gateway-Signature') || '';
  const validSecrets = (env.PROXY_SECRETS || env.PROXY_SECRET || '')
    .split(',')
    .map((secret) => secret.trim())
    .filter(Boolean);
  const matchedSecret = validSecrets.find((secret) =>
    timingSafeEqual(gatewaySecret, secret)
  );
  const isTrustedGateway = Boolean(matchedSecret);
  const internalKey = request.headers.get('X-Internal-Key') || '';
  const isTrustedLegacyServer =
    Boolean(env.INTERNAL_SYNC_KEY) &&
    timingSafeEqual(internalKey, env.INTERNAL_SYNC_KEY);

  if (!isTrustedGateway && !isTrustedLegacyServer) {
    return new Response(
      JSON.stringify({
        status: 'error',
        code: 'ACCESS_DENIED_DIRECT_CALL_BLOCKED',
        message: '⛔ وصول محظور: غير مصرح بالاتصال المباشر بالخادم.',
      }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      }
    );
  }

  const isWebSocketRequest =
    request.headers.get('Upgrade')?.toLowerCase() === 'websocket' ||
    new URL(request.url).pathname === '/api/worker/ws';
  if (!isTrustedGateway || isWebSocketRequest) return null;

  if (!timestamp || !nonce || !signature) {
    return errorResponse('توقيع بوابة الحماية مفقود.', corsHeaders, 403);
  }
  const requestTime = Number.parseInt(timestamp, 10);
  if (
    !Number.isFinite(requestTime) ||
    Math.abs(Date.now() - requestTime) > 60_000 ||
    !/^[0-9a-f-]{36}$/i.test(nonce)
  ) {
    return errorResponse(
      '⛔ الطلب منتهي الصلاحية أو تم التلاعب بالوقت.',
      corsHeaders,
      403
    );
  }

  let bodyHash = request.headers.get('X-Gateway-Body-SHA256') || '';
  if (!/^[0-9a-f]{64}$/i.test(bodyHash)) {
    return errorResponse('بصمة حمولة البوابة غير صالحة.', corsHeaders, 403);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const body = await request.clone().arrayBuffer();
    if (body.byteLength > 12 * 1024 * 1024) {
      return errorResponse(
        'حجم البيانات المرسلة تجاوز الحد المسموح.',
        corsHeaders,
        413
      );
    }
    const digest = await crypto.subtle.digest('SHA-256', body);
    bodyHash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    if (
      !timingSafeEqual(
        bodyHash,
        request.headers.get('X-Gateway-Body-SHA256')
      )
    ) {
      return errorResponse(
        'بصمة حمولة الطلب لا تطابق التوقيع.',
        corsHeaders,
        403
      );
    }
  }

  const requestUrl = new URL(request.url);
  const signaturePayload = `${timestamp}:${nonce}:${request.method}:${requestUrl.pathname}:${requestUrl.search}:${bodyHash}`;
  const isValidSignature = await verifyHmacSignature(
    matchedSecret,
    signaturePayload,
    signature
  );
  if (!isValidSignature) {
    return errorResponse('توقيع بوابة الحماية غير صالح.', corsHeaders, 403);
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = buildCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // ⭐ مسار Webhook خاص بواتساب
    if (url.pathname === '/webhooks/whatsapp') {
      if (request.method === 'GET') return handleWhatsappWebhookVerify(url, env);
      if (request.method === 'POST') return handleWhatsappWebhookEvent(request, env, ctx);
      return new Response('Method Not Allowed', { status: 405 });
    }

    const isEarlyRoute =
      url.pathname.endsWith('/ws/ticket') ||
      url.pathname.endsWith('/merchant/order-signals') ||
      url.pathname.endsWith('/ws') ||
      request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
    if (isEarlyRoute) {
      const gatewayError = await verifyGatewayAccess(request, env, corsHeaders);
      if (gatewayError) return gatewayError;
    }

    // ⭐ مسار استخراج تذكرة اتصال WebSocket (يدعم التوافق مع المتصفحات القديمة)
    if (url.pathname.endsWith('/ws/ticket')) {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ status: 'error', message: 'Method Not Allowed' }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (!token) {
        return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const user = await verifyJWT(token, env.APP_SECRET_KEY);
      if (!user) {
        return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (user.role !== ROLES.MERCHANT) {
        return new Response(JSON.stringify({ status: 'error', message: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const ticket = await createWebSocketTicket(user, env.APP_SECRET_KEY);
      return new Response(JSON.stringify({ status: 'success', ticket }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ⭐ بوابة الأمان (Auth Gate) لاتصالات الـ WebSocket لـ Durable Object
    if (url.pathname.endsWith('/ws') || request.headers.get('Upgrade') === 'websocket') {
      const origin = request.headers.get('Origin') || '';
      const allowedOrigins = (env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (allowedOrigins.length > 0 && (!origin || !allowedOrigins.includes(origin))) {
        return new Response('Forbidden: Invalid WebSocket origin', { status: 403 });
      }

      // السماح بتمرير التوكن عبر الـ Header أو Query Params (لأن المتصفح لا يدعم Headers في WebSockets مباشرة)
      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim() || url.searchParams.get('token') || url.searchParams.get('ticket');
      const merchantId = request.headers.get('X-Merchant-ID') || url.searchParams.get('merchant_id') || url.searchParams.get('m');

      if (!token || !merchantId) {
        return new Response('Unauthorized: Missing Token or Merchant ID', { status: 401 });
      }

      try {
        const user = await verifyJWT(token, env.APP_SECRET_KEY);
        // التحقق من صلاحية المستخدم
        if (
          !user ||
          user.ws_ticket !== true ||
          String(user.user_id) !== String(merchantId)
        ) {
           return new Response('Unauthorized: Invalid Token or ID Mismatch', { status: 401 });
        }

        // تمرير الاتصال للـ Durable Object
        const doId = env.MERCHANT_SESSION.idFromName(`merchant_${merchantId}`);
        const doStub = env.MERCHANT_SESSION.get(doId);
        
        // تمرير الطلب للـ Durable Object
        const doResponse = await doStub.fetch(request);
        if (doResponse.status === 101 && doResponse.webSocket) {
          return new Response(null, { status: 101, webSocket: doResponse.webSocket });
        }
        return doResponse;
      } catch (error) {
        console.error('WS Auth/DO Error:', error);
        return new Response('Unauthorized: WebSocket authentication failed', { status: 401 });
      }
    }

    if (url.pathname.endsWith('/merchant/order-signals')) {
      if (request.method !== 'GET') {
        return errorResponse('Method Not Allowed', corsHeaders, 405);
      }

      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const user = token ? await verifyJWT(token, env.APP_SECRET_KEY) : null;
      if (!user) return errorResponse('غير مصرح', corsHeaders, 401);
      if (user.role !== ROLES.MERCHANT) {
        return errorResponse('غير مصرح', corsHeaders, 403);
      }
      if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) {
        return errorResponse('إعدادات الاتصال اللحظي غير مهيأة.', corsHeaders, 503);
      }

      const merchantId = encodeURIComponent(String(user.user_id));
      const base = env.FIREBASE_DB_URL.replace(/\/$/, '');
      const firebaseUrl = new URL(
        `${base}/merchant_order_signals/${merchantId}.json`
      );
      firebaseUrl.searchParams.set('auth', env.FIREBASE_DB_SECRET);
      let firebaseResponse;
      try {
        firebaseResponse = await fetch(firebaseUrl, {
          headers: { Accept: 'text/event-stream' },
          cache: 'no-store',
          signal: request.signal,
        });
      } catch (error) {
        console.error('[firebase-realtime] فشل فتح بث إشارات الطلبات:', error);
        return errorResponse('تعذر فتح اتصال Firebase اللحظي.', corsHeaders, 502);
      }
      if (!firebaseResponse.ok || !firebaseResponse.body) {
        console.error(
          '[firebase-realtime] تعذر فتح بث إشارة الطلبات:',
          firebaseResponse.status
        );
        return errorResponse('تعذر فتح اتصال Firebase اللحظي.', corsHeaders, 502);
      }

      return new Response(firebaseResponse.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    }


    // ⭐ درع الحماية الفائق (Zero-Trust Gateway Validation)
    // كل الطلبات (ما عدا Webhook واتساب) يجب أن تأتي حصرياً عبر البروكسي الداخلي
    // وتحمل التوقيع الرقمي وسر البوابة المشفر، أو المفتاح الداخلي للسيرفر الموثوق.
    const gatewaySecret = request.headers.get('X-Gateway-Secret') || '';
    const timestamp = request.headers.get('X-Gateway-Timestamp') || '';
    const nonce = request.headers.get('X-Gateway-Nonce') || '';
    const signature = request.headers.get('X-Gateway-Signature') || '';

    const validSecrets = (env.PROXY_SECRETS || env.PROXY_SECRET || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const matchedSecret = validSecrets.find((s) => timingSafeEqual(gatewaySecret, s));
    const isTrustedGateway = Boolean(matchedSecret);

    const internalKey = request.headers.get('X-Internal-Key') || '';
    const isTrustedLegacyServer = Boolean(env.INTERNAL_SYNC_KEY) && timingSafeEqual(internalKey, env.INTERNAL_SYNC_KEY);

    // ⛔ حظر أي اتصال مباشر أو غير مصرح به
    if (!isTrustedGateway && !isTrustedLegacyServer) {
      return new Response(JSON.stringify({ 
        status: 'error', 
        code: 'ACCESS_DENIED_DIRECT_CALL_BLOCKED',
        message: '⛔ وصول محظور: غير مصرح بالاتصال المباشر بالخادم.' 
      }), {
        status: 403,
        headers: { 
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-Robots-Tag': 'noindex, nofollow'
        }
      });
    }

    const isWebSocketRequest =
      request.headers.get('Upgrade')?.toLowerCase() === 'websocket' ||
      url.pathname === '/api/worker/ws';

    // التوقيع يربط السر بالمسار والحمولة؛ السر وحده لا يكفي لقبول طلب HTTP.
    if (isTrustedGateway && !isWebSocketRequest) {
      if (!timestamp || !nonce || !signature) {
        return errorResponse('توقيع بوابة الحماية مفقود.', corsHeaders, 403);
      }
      const now = Date.now();
      const reqTime = parseInt(timestamp, 10);
      if (
        !Number.isFinite(reqTime) ||
        Math.abs(now - reqTime) > 60_000 ||
        !/^[0-9a-f-]{36}$/i.test(nonce)
      ) {
        return errorResponse('⛔ الطلب منتهي الصلاحية أو تم التلاعب بالوقت.', corsHeaders, 403);
      }

      let bodyHash = request.headers.get('X-Gateway-Body-SHA256') || '';
      if (!/^[0-9a-f]{64}$/i.test(bodyHash)) {
        return errorResponse('بصمة حمولة البوابة غير صالحة.', corsHeaders, 403);
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const body = await request.clone().arrayBuffer();
        if (body.byteLength > 12 * 1024 * 1024) {
          return errorResponse('حجم البيانات المرسلة تجاوز الحد المسموح.', corsHeaders, 413);
        }
        const digest = await crypto.subtle.digest('SHA-256', body);
        bodyHash = Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
        if (!timingSafeEqual(bodyHash, request.headers.get('X-Gateway-Body-SHA256'))) {
          return errorResponse('بصمة حمولة الطلب لا تطابق التوقيع.', corsHeaders, 403);
        }
      }

      const requestUrl = new URL(request.url);
      const signaturePayload = `${timestamp}:${nonce}:${request.method}:${requestUrl.pathname}:${requestUrl.search}:${bodyHash}`;
      const isValidSignature = await verifyHmacSignature(
        matchedSecret,
        signaturePayload,
        signature
      );
      if (!isValidSignature) {
        return errorResponse('توقيع بوابة الحماية غير صالح.', corsHeaders, 403);
      }
    }

    try {
      if (request.method === 'GET') {
        if (url.pathname === '/api/merchant/bootstrap') {
          const authHeader = request.headers.get('Authorization') || '';
          const token = authHeader.replace(/^Bearer\s+/i, '').trim();
          const user = token ? await verifyJWT(token, env.APP_SECRET_KEY) : null;
          if (!user) throw new HttpError('غير مصرح', 401);
          assertAllowed(user, [ROLES.MERCHANT]);

          const requestedMerchantId = request.headers.get('X-Merchant-Id');
          if (
            requestedMerchantId &&
            requestedMerchantId !== String(user.user_id)
          ) {
            throw new HttpError('غير مصرح', 403);
          }

          const context = { request, env, ctx, user, body: {} };
          const [
            productsResult,
            activeOrdersResult,
            archivedOrdersResult,
            categoriesResult,
            settingsResult,
          ] = await Promise.all([
            actionRegistry.list_products.handler(context),
            actionRegistry.get_orders.handler({
              ...context,
              body: { filter: 'active' },
            }),
            actionRegistry.get_orders.handler({
              ...context,
              body: { filter: 'archived', limit: 200 },
            }),
            actionRegistry.get_categories_tree.handler(context),
            actionRegistry.get_merchant_settings.handler(context),
          ]);

          const bootstrap = {
            products: productsResult?.data,
            orders: activeOrdersResult?.data,
            archivedOrders: archivedOrdersResult?.data,
            categories: categoriesResult?.data,
            settings: settingsResult?.data,
          };
          if (
            !Array.isArray(bootstrap.products) ||
            !Array.isArray(bootstrap.orders) ||
            !Array.isArray(bootstrap.archivedOrders) ||
            !Array.isArray(bootstrap.categories) ||
            !bootstrap.settings ||
            typeof bootstrap.settings !== 'object' ||
            Array.isArray(bootstrap.settings)
          ) {
            throw new HttpError(
              'تعذر تجهيز بيانات تهيئة لوحة التحكم.',
              500
            );
          }

          return successResponse(bootstrap, corsHeaders);
        }

        return successResponse({ status: 'ok' }, corsHeaders);
      }

      const { body, uploadedImageFile } = await parseRequestBody(request);
      const action = body.action;

      const route = actionRegistry[action];
      if (!route) {
        return errorResponse('Action غير معروف', corsHeaders, 400);
      }

      // --- المصادقة ---
      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.replace('Bearer ', '');
      const user = token ? await verifyJWT(token, env.APP_SECRET_KEY) : null;

      if (!route.public && !user) {
        return errorResponse('غير مصرح', corsHeaders, 401);
      }

      // --- الصلاحيات (RBAC) ---
      assertAllowed(user, route.roles);

      // --- التحقق من المدخلات ---
      validateAction(action, body, user);

      // --- التنفيذ ---
      const result = await route.handler({ request, env, ctx, user, body, uploadedImageFile });
      return successResponse(result || {}, corsHeaders);
    } catch (error) {
      // ⭐ إصلاح أمني (تسريب معلومات داخلية): كان أي خطأ غير متوقع (غير
      // HttpError - أخطاء قاعدة بيانات، أخطاء برمجية، JSON.parse فاشل..)
      // يُرسل error.message الخام مباشرة للعميل، وهو بالضبط ما يحاول هذا
      // المشروع تفاديه بمواضع أخرى (راجع التعليق بمعالجة أخطاء Gemini في
      // aiAssistantController.js: "لا يُرسل للعميل..حفاظاً على عدم تسريب
      // تفاصيل داخلية للطرف العام"). رسائل HttpError مقصودة وآمنة للعرض
      // (تُستخدم كواجهة أخطاء رئيسية بكل المشروع) فتبقى كما هي؛ أي خطأ آخر
      // غير متوقع يُسجَّل بالسيرفر (لم يكن يُسجَّل إطلاقاً سابقاً - فجوة
      // تشغيلية أيضاً) ويُرجع للعميل رسالة عامة فقط.
      if (error instanceof HttpError) {
        return errorResponse(error.message, corsHeaders, error.status);
      }
      console.error('Unhandled Worker error:', error);
      return errorResponse('حدث خطأ في السيرفر، يرجى المحاولة لاحقاً.', corsHeaders, 500);
    }
  },
};

async function parseRequestBody(request) {
  let body = {};
  let uploadedImageFile = null;
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    // طلبات فيها ملف صورة (FormData) — تأتي من فورم حفظ المنتج
    const formData = await request.formData();
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        if (key === 'image_file' && value.size > 0) uploadedImageFile = value;
      } else {
        body[key] = value;
      }
    }
  } else {
    body = await request.json();
  }
  return { body, uploadedImageFile };
}
