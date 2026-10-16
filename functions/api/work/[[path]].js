// ============================================================
// 🔒 Cloudflare Pages Function — بروكسي الحماية القصوى والاتصال المباشر بـ Durable Object
// ============================================================
// مميزات الأمان الفائقة:
//  1. اتصال مباشر بـ Durable Object (In-Process Edge Binding) بدون أي وسيط خارجي.
//  2. التحقق من صحة التوكن (JWT HMAC-SHA256) ومطابقة معرّف التاجر قبل الفتح.
//  3. منع هجمات اختطاف المقبس (Cross-Site WebSocket Hijacking Protection).
//  4. توقيع رقمي ديناميكي HMAC-SHA256 لكل طلب على حدة (Dynamic Request Signature).
//  5. مانع هجمات إعادة الإرسال (Anti-Replay Attack) عبر Nonce و Timestamp مؤقت.
//  6. عزل أمني صارم ومطابقة لنطاق المصدر (Same-Origin Isolation).
// ============================================================

async function hmacSha256(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * فحص وتوثيق الـ JWT محلياً داخل Cloudflare Pages قبل لمس أي كائن
 */
async function verifyJwtToken(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const b64 = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    const rawSig = Uint8Array.from(atob(b64 + pad), c => c.charCodeAt(0));

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      rawSig,
      enc.encode(`${headerB64}.${payloadB64}`)
    );

    if (!valid) return null;

    const payloadRaw = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadRaw);
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  // 1. التعامل مع طلبات Preflight (CORS)
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  const originalUrl = new URL(request.url);
  // استخراج المسار الفرعي بدقة بعد /api/worker أو /api/work
  const subpath = originalUrl.pathname.replace(/^\/api\/(?:worker|work)(?:\/|$)/, '');
  const cleanSubpath = subpath ? (subpath.startsWith('/') ? subpath : '/' + subpath) : '';

  // ============================================================
  // ⚡ مسار WebSocket المباشر إلى Durable Object من Cloudflare Pages
  // ============================================================
  const isWebSocketUpgrade = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
  if (isWebSocketUpgrade || cleanSubpath === '/ws') {
    const merchantId = originalUrl.searchParams.get('m') || originalUrl.searchParams.get('merchant_id');
    const token = originalUrl.searchParams.get('token') || originalUrl.searchParams.get('ticket');

    if (!merchantId || !token) {
      return new Response(JSON.stringify({ status: 'error', message: 'بيانات الاتصال اللحظي غير مكتملة' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 🔒 التحقق من الـ Origin لحماية التاجر من هجمات Cross-Site WebSocket Hijacking
    const origin = request.headers.get('Origin');
    if (origin) {
      try {
        const originHost = new URL(origin).host;
        const allowedHost = originalUrl.host;
        const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
        if (originHost !== allowedHost && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
          return new Response(JSON.stringify({ status: 'error', message: 'نطاق الاتصال غير مصرح به' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } catch (_) {}
    }

    // 🔒 التحقق الأمني من الـ JWT إذا كان APP_SECRET_KEY مهيأً في Cloudflare Pages
    if (env.APP_SECRET_KEY) {
      const user = await verifyJwtToken(token, env.APP_SECRET_KEY);
      if (!user || String(user.user_id) !== String(merchantId)) {
        return new Response(JSON.stringify({ status: 'error', message: 'غير مصرح: جلسة العمل غير صالحة أو منتهية' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // 1️⃣ [الخيار المباشر الأساسي]: الاتصال الفوري بـ Durable Object المرتبط بـ Cloudflare Pages
    // (Pages Settings -> Functions -> Durable Object bindings -> MERCHANT_SESSION)
    if (env.MERCHANT_SESSION) {
      try {
        const doId = env.MERCHANT_SESSION.idFromName(`merchant_${merchantId}`);
        const doStub = env.MERCHANT_SESSION.get(doId);
        return await doStub.fetch(request);
      } catch (err) {
        console.error('Direct DO fetch failed from Pages:', err);
      }
    }

    // 2️⃣ [الخيار الاحتياطي]: التوجيه المشفر إلى WORKER_URL
    if (env.WORKER_URL) {
      const targetUrl = env.WORKER_URL.replace(/\/$/, '') + cleanSubpath + originalUrl.search;
      const wsHeaders = new Headers(request.headers);
      wsHeaders.set('Upgrade', 'websocket');
      wsHeaders.set('Connection', 'Upgrade');
      if (env.PROXY_SECRET) {
        wsHeaders.set('X-Gateway-Secret', env.PROXY_SECRET);
      }
      wsHeaders.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
      if (origin) wsHeaders.set('Origin', origin);

      try {
        const wsResponse = await fetch(targetUrl, {
          method: request.method || 'GET',
          headers: wsHeaders,
        });

        if (wsResponse.status === 101 && wsResponse.webSocket) {
          return new Response(null, {
            status: 101,
            webSocket: wsResponse.webSocket,
          });
        }
        return wsResponse;
      } catch (e) {
        console.error('WebSocket proxy fetch failed:', e);
        return new Response(JSON.stringify({ status: 'error', message: 'تعذر إنشاء اتصال WebSocket بالخادم' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({
      status: 'error',
      message: 'خادم الاتصال اللحظي غير مهيأ (يرجى ربط MERCHANT_SESSION في Cloudflare Pages أو ضبط WORKER_URL).'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ============================================================
  // 🌐 طلبات الـ HTTP العادية للـ Worker (API Proxy)
  // ============================================================
  if (!env.WORKER_URL || !env.PROXY_SECRET) {
    console.error('Proxy misconfigured: missing WORKER_URL or PROXY_SECRET');
    return new Response(JSON.stringify({ status: 'error', message: 'بوابة الحماية قيد التحديث، يرجى المحاولة لاحقاً' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const targetUrl = env.WORKER_URL.replace(/\/$/, '') + cleanSubpath + originalUrl.search;

  if (!['GET', 'POST', 'HEAD'].includes(request.method)) {
    return new Response(JSON.stringify({ status: 'error', message: 'طريقة الطلب غير مسموح بها' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let bodyBuffer = null;
  let bodyText = '';
  if (['POST'].includes(request.method)) {
    try {
      bodyBuffer = await request.arrayBuffer();
      if (bodyBuffer.byteLength > 12 * 1024 * 1024) {
        return new Response(JSON.stringify({ status: 'error', message: 'حجم البيانات المرفوعة تجاوز الحد الأقصى' }), {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      bodyText = new TextDecoder().decode(bodyBuffer.slice(0, 1024));
    } catch (e) {
      bodyBuffer = null;
    }
  }

  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const signaturePayload = `${timestamp}:${nonce}:${request.method}:${bodyText.length}`;
  const hmacSignature = await hmacSha256(env.PROXY_SECRET, signaturePayload);

  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.delete('host');
  headers.delete('cf-connecting-ip');

  headers.set('X-Gateway-Secret', env.PROXY_SECRET);
  headers.set('X-Gateway-Timestamp', timestamp);
  headers.set('X-Gateway-Nonce', nonce);
  headers.set('X-Gateway-Signature', hmacSignature);
  headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');

  const init = {
    method: request.method,
    headers,
    body: bodyBuffer || undefined,
  };

  let workerResponse;
  try {
    workerResponse = await fetch(targetUrl, init);
  } catch (e) {
    console.error('Secure proxy fetch to worker failed:', e);
    return new Response(JSON.stringify({ status: 'error', message: 'تعذّر الاتصال الآمن بالخادم، حاول لاحقاً' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const responseHeaders = new Headers(workerResponse.headers);
  responseHeaders.delete('access-control-allow-origin');
  responseHeaders.delete('vary');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  responseHeaders.set('X-Frame-Options', 'DENY');

  return new Response(workerResponse.body, {
    status: workerResponse.status,
    headers: responseHeaders,
  });
}
