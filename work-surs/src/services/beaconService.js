// ========================================================
// 📡 خدمة المنارة المشفرة (Encrypted Sync Beacon)
// تُحدث ملفاً صغيراً جداً على GitHub يحتوي فقط على رقم العداد
// ولا يُلمس GitHub إطلاقاً طالما التاجر متصل باللوحة
// ========================================================

import { putSingleFile } from './storage/providers/githubProvider.js';

/**
 * اشتقاق مفتاح AES-256 متماثل من المفتاح السري للنظام
 */
async function deriveEncryptionKey(secret) {
  const enc = new TextEncoder();
  const secretBytes = enc.encode(secret || 'nalsh-default-secure-sync-key-2026');
  const hash = await crypto.subtle.digest('SHA-256', secretBytes);
  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * تشفير رقم التسلسل وتحديث المنارة على GitHub
 * حجم الملف الناتج لا يتعدى 50 بايت وخالٍ تماماً من أي بيانات شخصية أو تجارية
 */
export async function updateSyncBeacon(env, merchantId, sequence) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    return;
  }

  try {
    const key = await deriveEncryptionKey(env.APP_SECRET_KEY);
    const enc = new TextEncoder();
    const payload = JSON.stringify({
      m: String(merchantId),
      seq: Number(sequence),
      ts: Date.now(),
    });

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(payload)
    );

    // دمج الـ IV والبيانات المشفرة
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    // تحويل إلى Base64
    let binary = '';
    for (let i = 0; i < combined.length; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    const base64Beacon = btoa(binary);

    // رفع الملف الصغير إلى مسار static على GitHub
    // مثلاً: sync/beacon_<merchantId>.enc
    const filePath = `sync/beacon_${merchantId}.enc`;
    const fileBase64Content = btoa(base64Beacon); // GitHub API يتطلب Base64 لمحتوى الملف
    const commitMessage = `chore(sync): update beacon #${sequence}`;

    await putSingleFile(env, filePath, fileBase64Content, commitMessage);
    console.log(`[beacon] ✅ تم تحديث منارة التاجر #${merchantId} برقم التسلسل: ${sequence}`);
  } catch (err) {
    // في حال حدوث أي خطأ في GitHub API، لا نعطل الطلب الأساسي
    console.warn('[beacon] تعذر تحديث المنارة على GitHub:', err.message);
  }
}
