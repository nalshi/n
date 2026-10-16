// ================================================================
// 📡 مزود إشارة Firebase RTDB للتاجر (Zero-PII Signal — 10 bytes فقط)
//
// الهدف: إخبار المتصفح بوجود طلب جديد، بدون كتابة أي بيانات شخصية
// في Firebase. فقط رقم عداد + timestamp.
//
// الأمان:
//   - الكتابة تتم عبر FIREBASE_DB_SECRET (Admin) من السيرفر فقط
//   - المتصفح لا يكتب في Firebase إطلاقاً (Security Rules تمنعه)
//   - Firebase يقرأ فقط node الخاص بالتاجر بعد مصادقة بـ Custom Token
// ================================================================

/**
 * يكتب إشارة طلب جديد في Firebase RTDB.
 * الحجم: ~30 bytes فقط (seq + ts) — لا اسم عميل، لا هاتف، لا عنوان.
 *
 * @param {object} env    - متغيرات البيئة (FIREBASE_DB_URL, FIREBASE_DB_SECRET)
 * @param {string} merchantId - معرّف التاجر
 * @param {number} seq    - رقم العداد (عدد الطلبات الإجمالي أو timestamp)
 */
export async function signalNewOrderToFirebase(env, merchantId, seq) {
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) return;

  try {
    const base = env.FIREBASE_DB_URL.replace(/\/$/, '');
    const path = `merchants/${merchantId}/new_order_signal`;
    const url = `${base}/${path}.json?auth=${env.FIREBASE_DB_SECRET}`;

    // PUT: يُحدّث القيمة في مكانها دون تراكم — يضمن صغر حجم قاعدة البيانات
    await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seq: Number(seq), ts: Date.now() }),
    });
  } catch (e) {
    // لا نعطّل الطلب الأصلي إذا فشلت الإشارة — المنارة المشفرة تعوّض
    console.warn('[firebase-signal] تعذر كتابة الإشارة:', e?.message);
  }
}

/**
 * ينشئ Firebase Custom Token للتاجر (صلاحية قراءة node خاص به فقط).
 * يُستخدم من مسار /api/firebase/token في index.js
 *
 * الأمان: Token صالح لساعة واحدة فقط، UID = merchantId، لا صلاحيات Admin.
 *
 * ملاحظة: Firebase Custom Token يتطلب توقيع RS256 بـ Service Account Private Key.
 * إذا لم تكن FIREBASE_CREDENTIALS_JSON موجودة، يُرجع null بأمان.
 *
 * @param {object} env - متغيرات البيئة
 * @param {string|number} merchantId - معرّف التاجر
 * @returns {Promise<string|null>} Firebase Custom Token أو null
 */
export async function createFirebaseCustomToken(env, merchantId) {
  if (!env.FIREBASE_CREDENTIALS_JSON) return null;

  try {
    let credentials;
    try {
      credentials = JSON.parse(env.FIREBASE_CREDENTIALS_JSON);
    } catch {
      console.warn('[firebase-token] FIREBASE_CREDENTIALS_JSON غير صالح JSON');
      return null;
    }

    const { client_email, private_key } = credentials;
    if (!client_email || !private_key) return null;

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: client_email,
      sub: client_email,
      aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      iat: now,
      exp: now + 3600,       // ساعة واحدة
      uid: String(merchantId),
      claims: { role: 'merchant', merchantId: String(merchantId) },
    };

    // تشفير JWT بـ RS256 عبر Web Crypto API (متاح في Cloudflare Workers)
    const header = { alg: 'RS256', typ: 'JWT' };
    const enc = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const signingInput = `${enc(header)}.${enc(payload)}`;

    const pemKey = private_key.replace(/\\n/g, '\n');
    const binaryDer = pemToBinary(pemKey);
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryDer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(signingInput)
    );

    const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    return `${signingInput}.${sig}`;
  } catch (e) {
    console.warn('[firebase-token] فشل إنشاء Custom Token:', e?.message);
    return null;
  }
}

// ─── مساعد: تحويل PEM إلى DER binary ────────────────────────────────────────
function pemToBinary(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
