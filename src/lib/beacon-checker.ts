/**
 * beacon-checker.ts — فاحص المنارة المشفرة الخارقة (Zero-PII Encrypted Beacon)
 *
 * يقوم بقراءة ملف منارة التاجر الثابت من دومين المتجر https://nalsh.dpdns.org
 * الملف يحتوي فقط على رقم تسلسلي مشفر (لا يحتوي على أي بيانات للطلب أو العميل)
 * إذا كان الرقم مساوياً لرقم الذاكرة المحلية -> لا يتم تنفيذ أي استعلام (0 طلبات شبكة)
 */

import { localDB } from '@/lib/db'
import { authApiRequest } from '@/lib/auth-api'
import { normalizeRealtimeOrders } from '@/features/dashboard/dashboard-data'
import { toast } from 'sonner'

/**
 * اشتقاق مفتاح فك التشفير المتماثل
 */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const hash = await crypto.subtle.digest(
    'SHA-256',
    enc.encode(secret || 'nalsh-default-secure-sync-key-2026')
  )
  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )
}

/**
 * فحص منارة التاجر المشفرة ومطابقة الأرقام في أجزاء من الثانية
 */
export async function checkSyncBeacon(merchantId: string): Promise<boolean> {
  if (!merchantId) return false

  try {
    // 1. استخراج آخر رقم تسلسلي مسجل في ذاكرة التاجر المحلية (IndexedDB)
    const lastSeqRecord = await localDB.syncState.get('last_order_seq')
    const localSeq = lastSeqRecord ? Number(lastSeqRecord.value) : 0

    // 2. قراءة المنارة الثابتة من دومين المتجر (ملف كاش من الـ CDN ينزل في 10ms)
    // المسار مطابق لما ينشره السيرفر على GitHub
    const beaconUrl = `https://nalsh.dpdns.org/sync/beacon_${merchantId}.enc`
    const res = await fetch(beaconUrl, {
      method: 'GET',
      headers: { Accept: 'text/plain' },
      cache: 'no-cache', // لضمان معرفة التحديث الجديد فوراً
    })

    if (!res.ok) {
      // إذا لم يكن الملف موجوداً بعد، لا توجد مشكلة
      return false
    }

    const base64Beacon = (await res.text()).trim()
    if (!base64Beacon) return false

    // 3. فك التشفير بمفتاح الأمان العالي
    const rawBinary = atob(base64Beacon)
    const combined = new Uint8Array(rawBinary.length)
    for (let i = 0; i < rawBinary.length; i++) {
      combined[i] = rawBinary.charCodeAt(i)
    }

    if (combined.length < 13) return false // ملف تالف أو قصير جداً

    const iv = combined.slice(0, 12)
    const ciphertext = combined.slice(12)

    // استخدام المفتاح السري المخصص
    const secret =
      localStorage.getItem('merchant_secret_key') ||
      'nalsh-default-secure-sync-key-2026'
    const key = await deriveKey(secret)

    let beacon: { m: string; seq: number; ts: number }
    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      )
      beacon = JSON.parse(new TextDecoder().decode(decrypted))
    } catch {
      // فشل فك التشفير (تلاعب أو مفتاح غير مطابق) -> تجاهل بأمان
      return false
    }

    // 4. المقارنة السحرية: هل رقم المنارة أكبر من رقم الذاكرة؟
    if (beacon.seq > localSeq) {
      console.log(
        `🔔 [منارة التزامن] تم رصد طلبات جديدة! الرقم المسجل محلياً: ${localSeq}، رقم المنارة: ${beacon.seq}`
      )

      // استخراج آخر تاريخ طلب مسجل محلياً لجلب الفروقات فقط
      const lastOrder = await localDB.orders.orderBy('createdAt').last()
      const sinceTimestamp = lastOrder?.createdAt || ''

      const deltaRes = await authApiRequest('get_orders_delta', {
        since: sinceTimestamp,
      })

      const rawOrders = (deltaRes as { data?: unknown[] })?.data
      if (Array.isArray(rawOrders) && rawOrders.length > 0) {
        const allNormalized = normalizeRealtimeOrders(rawOrders)
        if (allNormalized.length > 0) {
          // حقن الطلبات الجديدة فوراً في IndexedDB
          await localDB.orders.bulkPut(allNormalized)
          // تحديث رقم التسلسل في الذاكرة ليتطابق مع المنارة
          await localDB.syncState.put({
            key: 'last_order_seq',
            value: beacon.seq,
          })

          toast.info(
            `وصلتك ${allNormalized.length} طلبات جديدة أثناء إغلاق اللوحة!`,
            { duration: 8000 }
          )
          return true
        }
      }

      // حتى لو لم تكن هناك طلبات، نطابق العداد
      await localDB.syncState.put({
        key: 'last_order_seq',
        value: beacon.seq,
      })
    } else {
      console.log('✅ [منارة التزامن] الذاكرة مطابقة تماماً، لا توجد طلبات جديدة.')
    }

    return false
  } catch (err) {
    console.warn('[منارة التزامن] تعذر فحص المنارة:', err)
    return false
  }
}
