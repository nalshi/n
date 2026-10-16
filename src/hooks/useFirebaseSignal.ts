/**
 * useFirebaseSignal.ts
 *
 * طبقة الاستماع اللحظي عبر Firebase RTDB — بديل WebSocket/Durable Objects.
 *
 * كيف يعمل:
 *  1. يطلب Firebase Custom Token من Worker (ساعة واحدة، يتجدد تلقائياً).
 *  2. يفتح اتصال SSE (EventSource) مع Firebase RTDB يستمع لـ:
 *       /merchants/{merchantId}/new_order_signal
 *  3. عندما يتغير الرقم التسلسلي (seq) ⟹ يجلب الفروقات من Worker ويحقنها.
 *
 * الأمان:
 *  - Custom Token صالح ساعة واحدة فقط، UID = merchantId.
 *  - التاجر لا يرى بيانات تاجر آخر إطلاقاً (Firebase Security Rules).
 *  - المتصفح لا يكتب في Firebase أبداً.
 *
 * الاقتصاد:
 *  - Firebase RTDB يُرسل ~30 bytes فقط للمتصفح عند كل طلب جديد.
 *  - EventSource يُعيد الاتصال تلقائياً بدون أي كود إضافي.
 *  - لا Heartbeat Ping مطلوب.
 */

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  localDB,
  injectOrder,
} from '@/lib/db'
import {
  normalizeRealtimeOrders,
  type DashboardOrder,
} from '@/features/dashboard/dashboard-data'
import { authApiRequest } from '@/lib/auth-api'
import { useRealtimeStore } from '@/stores/realtime-store'
import { merchantQueryKeys } from './useMerchantRealtime'

const _localBus = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('merchant_tab_mesh_v1')
  : null

// ─── ثوابت ───────────────────────────────────────────────────────────────────
const FIREBASE_DB_URL =
  (import.meta.env.VITE_FIREBASE_DB_URL as string | undefined) ||
  'https://shiban-a2757-default-rtdb.europe-west1.firebasedatabase.app'
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000  // تجديد قبل 5 دقائق من انتهاء الصلاحية
const TOKEN_TTL_MS            = 55 * 60 * 1000  // نجدد كل 55 دقيقة (قبل انتهاء الساعة)

// ─── جلب Firebase Custom Token من Worker ─────────────────────────────────────
async function fetchFirebaseToken(): Promise<string | null> {
  try {
    const merchantToken =
      localStorage.getItem('merchant_token') ||
      sessionStorage.getItem('merchant_token') ||
      ''
    if (!merchantToken) return null

    const res = await fetch('/api/worker/firebase/token', {
      method: 'GET',
      headers: { Authorization: `Bearer ${merchantToken}` },
    })
    if (!res.ok) return null

    const data = (await res.json()) as { token?: string }
    return data?.token ?? null
  } catch {
    return null
  }
}

// ─── قراءة آخر رقم تسلسلي من الذاكرة المحلية ─────────────────────────────────
async function getLocalSeq(): Promise<number> {
  try {
    const row = await localDB.syncState.get('last_order_seq')
    return row?.seq ?? row?.value as number ?? 0
  } catch {
    return 0
  }
}

// ─── حقن الطلبات الفائتة في الذاكرة المحلية وإعلام الـ UI ───────────────────
async function fetchAndInjectMissingOrders(
  queryClient: ReturnType<typeof useQueryClient>,
  merchantId: string,
  remoteSeq: number
) {
  try {
    const lastOrder = await localDB.orders.orderBy('createdAt').last()
    const sinceTimestamp = lastOrder?.createdAt || ''

    const res = await authApiRequest('get_orders_delta', { since: sinceTimestamp })
    const rawOrders = (res as { data?: unknown[] })?.data

    if (Array.isArray(rawOrders) && rawOrders.length > 0) {
      const normalized = normalizeRealtimeOrders(rawOrders)
      if (normalized.length > 0) {
        // حقن في Dexie
        await localDB.orders.bulkPut(normalized)

        // تحديث TanStack Query cache فوراً
        const allOrders = await localDB.orders.toArray()
        const active   = allOrders.filter((o: DashboardOrder) => o.status !== 'completed' && o.status !== 'cancelled')
        const archived = allOrders.filter((o: DashboardOrder) => o.status === 'completed' || o.status === 'cancelled')
        queryClient.setQueryData(merchantQueryKeys.orders(merchantId, 'active'),   active)
        queryClient.setQueryData(merchantQueryKeys.orders(merchantId, 'archived'), archived)

        // صوت + إشعار
        toast.info(`🛍️ وصل ${normalized.length} طلب جديد!`, { duration: 8_000 })

        // بث محلي لبقية التبويبات (0 طلبات شبكة)
        _localBus?.postMessage({
          type: 'ORDER_MUTATED',
          merchantId,
          action: 'created',
        })

        // inject كل طلب منفرداً لضمان تحديث الـ cache الدقيق
        for (const order of normalized) await injectOrder(order)
      }
    }

    // تحديث العداد المحلي
    await localDB.syncState.put({ key: 'last_order_seq', seq: remoteSeq })
  } catch (err) {
    console.warn('[firebase-signal] تعذر جلب الطلبات الجديدة:', err)
  }
}

// ─── الـ Hook الرئيسي ─────────────────────────────────────────────────────────
export function useFirebaseSignal(merchantId: string, enabled: boolean) {
  const queryClient  = useQueryClient()
  const esRef        = useRef<EventSource | null>(null)
  const tokenRef     = useRef<string | null>(null)
  const refreshTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!enabled || !merchantId || !FIREBASE_DB_URL) return

    let stopped = false
    const setStatus = useRealtimeStore.getState().setStatus

    // ─── تجديد التوكن دورياً ──────────────────────────────────────────
    async function refreshToken() {
      const t = await fetchFirebaseToken()
      if (stopped) return null
      tokenRef.current = t
      return t
    }

    // ─── فتح اتصال SSE مع Firebase RTDB ──────────────────────────────
    async function startListening() {
      if (stopped) return
      setStatus('connecting', 'جاري إنشاء الاتصال اللحظي بجوجل...')

      const token = await refreshToken()
      if (stopped) return

      // أغلق الاتصال القديم إن وُجد
      esRef.current?.close()

      const path = `merchants/${merchantId}/new_order_signal`
      const base = FIREBASE_DB_URL!.replace(/\/$/, '')
      const url  = token ? `${base}/${path}.json?auth=${token}` : `${base}/${path}.json`

      const es = new EventSource(url)
      esRef.current = es

      es.onopen = () => {
        if (stopped) return
        setStatus('connected', 'متصل لحظياً (Google Firebase)')
      }

      es.addEventListener('put', async (event: MessageEvent) => {
        if (stopped) return
        try {
          const payload = JSON.parse(event.data) as { data?: { seq?: number; ts?: number } | null }
          const signal  = payload?.data
          if (!signal || typeof signal.seq !== 'number') return

          const localSeq = await getLocalSeq()
          if (signal.seq > localSeq) {
            console.log(`[firebase-signal] طلبات جديدة: local=${localSeq}, remote=${signal.seq}`)
            await fetchAndInjectMissingOrders(queryClient, merchantId, signal.seq)
          } else {
            console.log('✅ [firebase-signal] الذاكرة مطابقة، لا طلبات جديدة.')
          }
        } catch (err) {
          console.warn('[firebase-signal] خطأ في معالجة الإشارة:', err)
        }
      })

      es.onerror = () => {
        if (stopped) return
        setStatus('disconnected', 'جاري إعادة الاتصال بجوجل...')
      }

      // جدوِل تجديد التوكن قبل انتهاء صلاحيته
      if (token) {
        if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
        refreshTimer.current = window.setTimeout(async () => {
          if (stopped) return
          console.log('[firebase-signal] تجديد Firebase Custom Token...')
          await startListening() // يُعيد الاتصال بتوكن جديد
        }, TOKEN_TTL_MS - TOKEN_REFRESH_BUFFER_MS)
      }
    }

    void startListening()

    return () => {
      stopped = true
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
      esRef.current?.close()
      esRef.current = null
      setStatus('disconnected', 'تم قطع الاتصال')
    }
  }, [enabled, merchantId, queryClient])
}
