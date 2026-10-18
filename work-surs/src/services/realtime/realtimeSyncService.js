import { writeToRealtimeDb } from './providers/firebaseRtdbProvider.js';

// ========================================================
// 📡 خدمة مزامنة تتبع الطلب اللحظي
// ========================================================

async function encryptOrderSignal(secret, merchantId, ticketId) {
  if (!secret) throw new Error('APP_SECRET_KEY is not configured.');
  const revision = Date.now();
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  const key = await crypto.subtle.importKey(
    'raw',
    digest,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = encoder.encode(
    JSON.stringify({
      merchantId: String(merchantId),
      ticketId: String(ticketId),
      timestamp: revision,
    })
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    payload
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  let binary = '';
  for (const byte of combined) binary += String.fromCharCode(byte);
  return { signal: btoa(binary), revision };
}

export async function syncMerchantOrderSignal(env, merchantId, ticketId) {
  const { signal, revision } = await encryptOrderSignal(
    env.APP_SECRET_KEY,
    merchantId,
    ticketId
  );
  await writeToRealtimeDb(
    env,
    `merchant_order_signals/${encodeURIComponent(String(merchantId))}`,
    { signal, revision }
  );
}

export async function syncOrderTracking(env, ticketId, status, merchantUsername) {
  await writeToRealtimeDb(env, `tracking/${ticketId}`, {
    status,
    merchant_username: merchantUsername,
    updated_at: Date.now(),
  });
}
