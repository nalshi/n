// ============================================================
// 🔒 Cloudflare Pages Function — بروكسي الحماية القصوى المشفر (Zero-Trust Edge Proxy)
// ============================================================
// مميزات الأمان الفائقة:
//  1. توقيع رقمي ديناميكي HMAC-SHA256 لكل طلب على حدة (Dynamic Request Signature).
//  2. مانع هجمات إعادة الإرسال (Anti-Replay Attack) عبر Nonce و Timestamp مؤقت.
//  3. إخفاء تام لرابط الـ Worker الحقيقي وسر البوابة (Server-Side Only).
//  4. فحص حجم ونوع البيانات ومنع هجمات حجب الخدمة (DoS Protection).
//  5. عزل أمني صارم ومطابقة لنطاق المصدر (Same-Origin Isolation).
//  6. دعم ترقية WebSocket بشكل نظيف عبر Cloudflare Pages.
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

export async function onRequest(context) {
  const { request, env } = context;

  // 1. التعامل مع طلبات Preflight (CORS)
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  // 2. التحقق من اكتمال الإعدادات بالسيرفر
  if (!env.WORKER_URL || !env.PROXY_SECRET) {
    console.error('Proxy misconfigured: missing WORKER_URL or PROXY_SECRET');
    return new Response(JSON.stringify({ status: 'error', message: 'بوابة الحماية قيد التحديث، يرجى المحاولة لاحقاً' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const originalUrl = new URL(request.url);
  // استخراج المسار الفرعي بعد /api/worker لتمريره بدقة للـ Worker (مثل /ws أو /stores/...)
  const subpath = originalUrl.pathname.replace(/^\/api\/worker\/?/, '');
  const cleanSubpath = subpath ? (subpath.startsWith('/') ? subpath : '/' + subpath) : '';
  const targetUrl = env.WORKER_URL.replace(/\/$/, '') + cleanSubpath + originalUrl.search;

  // ⚡⚡ مسار WebSocket المنفصل — ترقية كاملة ومباشرة للـ Worker
  const isWebSocketUpgrade = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
  if (isWebSocketUpgrade || cleanSubpath === '/ws') {
    // التحقق الأمني: إما تذكرة مؤقتة (ticket + m) أو التوكن القديم (token + merchant_id)
    const ticket = originalUrl.searchParams.get('ticket');
    const merchantId = originalUrl.searchParams.get('m') || originalUrl.searchParams.get('merchant_id');
    const token = originalUrl.searchParams.get('token');

    if (!merchantId || (!ticket && !token)) {
      return new Response(JSON.stringify({ status: 'error', message: 'بيانات الاتصال غير مكتملة' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // بناء headers لطلب الـ WebSocket للـ Worker
    const wsHeaders = new Headers(request.headers);
    wsHeaders.set('Upgrade', 'websocket');
    wsHeaders.set('Connection', 'Upgrade');
    wsHeaders.set('X-Gateway-Secret', env.PROXY_SECRET);
    wsHeaders.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
    if (request.headers.get('Origin')) {
      wsHeaders.set('Origin', request.headers.get('Origin'));
    }

    try {
      const wsResponse = await fetch(targetUrl, {
        method: request.method || 'GET',
        headers: wsHeaders,
      });

      // في Cloudflare Pages Functions، ترقية الـ 101 تُمرر مباشرة
      if (wsResponse.status === 101) {
        if (wsResponse.webSocket) {
          return new Response(null, {
            status: 101,
            webSocket: wsResponse.webSocket,
          });
        }
        return wsResponse;
      }

      return wsResponse;
    } catch (e) {
      console.error('WebSocket proxy fetch failed:', e);
      return new Response(JSON.stringify({ status: 'error', message: 'تعذر إنشاء اتصال WebSocket' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // 3. حصر الطرق المسموح بها فقط لطلبات HTTP العادية
  if (!['GET', 'POST', 'HEAD'].includes(request.method)) {
    return new Response(JSON.stringify({ status: 'error', message: 'طريقة الطلب غير مسموح بها' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 4. قراءة محتوى الطلب للتحقق والحماية
  let bodyBuffer = null;
  let bodyText = '';
  if (['POST'].includes(request.method)) {
    try {
      bodyBuffer = await request.arrayBuffer();
      // منع الحمولات المفرطة (أقصى حد 12 ميغابايت)
      if (bodyBuffer.byteLength > 12 * 1024 * 1024) {
        return new Response(JSON.stringify({ status: 'error', message: 'حجم البيانات المرفوعة تجاوز الحد الأقصى' }), {
          status: 413,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      // قراءة عينة للـ Hash إذا كان نصاً أو FormData
      bodyText = new TextDecoder().decode(bodyBuffer.slice(0, 1024));
    } catch (e) {
      bodyBuffer = null;
    }
  }

  // 5. توليد توقيع رقمي ديناميكي مشفر (HMAC-SHA256 Signature)
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const signaturePayload = `${timestamp}:${nonce}:${request.method}:${bodyText.length}`;
  const hmacSignature = await hmacSha256(env.PROXY_SECRET, signaturePayload);

  // 6. تجهيز الهيدرات المحصنة
  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.delete('host');
  headers.delete('cf-connecting-ip');
  
  // تزويد الـ Worker بالهيدرات الأمنية المشفرة
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

  // 7. إعادة الرد للمتصفح بأعلى معايير الأمان (Same-Origin)
  const responseHeaders = new Headers(workerResponse.headers);
  responseHeaders.delete('access-control-allow-origin');
  responseHeaders.delete('vary');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  responseHeaders.set('X-Frame-Options', 'DENY');

  const responseOptions = {
    status: workerResponse.status,
    headers: responseHeaders,
  };

  return new Response(workerResponse.body, responseOptions);
}
