import { toast } from 'sonner'
import { create } from 'zustand'

const MAX_NOTIFICATIONS = 30

export type MerchantOrderNotification = {
  id: string
  merchantId: string
  orderId: string
  customerName: string
  createdAt: string
  readAt: number | null
}

type NewOrderNotification = Pick<
  MerchantOrderNotification,
  'merchantId' | 'orderId' | 'customerName' | 'createdAt'
>

type MerchantOrderNotificationState = {
  notificationsByMerchant: Record<string, MerchantOrderNotification[]>
  hydratedMerchantIds: string[]
  announcement: MerchantOrderNotification | null
  hydrate: (merchantId: string, announceExternal?: boolean) => void
  add: (notification: NewOrderNotification) => boolean
  markRead: (merchantId: string, notificationId: string) => void
  markAllRead: (merchantId: string) => void
  dismissAnnouncement: (merchantId: string, notificationId: string) => void
}

export const merchantOrderNotificationStorageKey = (merchantId: string) =>
  `merchant_order_notifications:${merchantId}`

function readNotifications(merchantId: string): MerchantOrderNotification[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = localStorage.getItem(
      merchantOrderNotificationStorageKey(merchantId)
    )
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error('تخزين تنبيهات الطلبات ليس قائمة صالحة.')
    }

    return parsed
      .filter(
        (item): item is MerchantOrderNotification =>
          typeof item === 'object' &&
          item !== null &&
          'id' in item &&
          typeof item.id === 'string' &&
          'merchantId' in item &&
          item.merchantId === merchantId &&
          'orderId' in item &&
          typeof item.orderId === 'string' &&
          'customerName' in item &&
          typeof item.customerName === 'string' &&
          'createdAt' in item &&
          typeof item.createdAt === 'string' &&
          'readAt' in item &&
          (typeof item.readAt === 'number' || item.readAt === null)
      )
      .slice(0, MAX_NOTIFICATIONS)
  } catch (error) {
    toast.error('تعذر قراءة التنبيهات المحفوظة.', {
      description:
        error instanceof Error ? error.message : 'خطأ تخزين غير معروف.',
    })
    return []
  }
}

function persistNotifications(
  merchantId: string,
  notifications: MerchantOrderNotification[]
) {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(
      merchantOrderNotificationStorageKey(merchantId),
      JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS))
    )
  } catch (error) {
    toast.error('تعذر حفظ التنبيهات على هذا الجهاز.', {
      description:
        error instanceof Error ? error.message : 'خطأ تخزين غير معروف.',
    })
  }
}

export const useMerchantOrderNotificationStore =
  create<MerchantOrderNotificationState>((set, get) => ({
    notificationsByMerchant: {},
    hydratedMerchantIds: [],
    announcement: null,
    hydrate: (merchantId, announceExternal = false) => {
      if (!merchantId) return
      const current = get().notificationsByMerchant[merchantId] || []
      const currentIds = new Set(current.map((item) => item.id))
      const notifications = readNotifications(merchantId)
      const externalNotification = announceExternal
        ? notifications.find((item) => !currentIds.has(item.id))
        : undefined

      set((state) => ({
        notificationsByMerchant: {
          ...state.notificationsByMerchant,
          [merchantId]: notifications,
        },
        hydratedMerchantIds: state.hydratedMerchantIds.includes(merchantId)
          ? state.hydratedMerchantIds
          : [...state.hydratedMerchantIds, merchantId],
        announcement: externalNotification ?? state.announcement,
      }))
    },
    add: (input) => {
      if (!input.merchantId || !input.orderId) return false
      const state = get()
      const existing = state.hydratedMerchantIds.includes(input.merchantId)
        ? state.notificationsByMerchant[input.merchantId] || []
        : readNotifications(input.merchantId)
      if (existing.some((item) => item.id === input.orderId)) return false

      const notification: MerchantOrderNotification = {
        ...input,
        id: input.orderId,
        readAt: null,
      }
      const notifications = [notification, ...existing].slice(
        0,
        MAX_NOTIFICATIONS
      )
      persistNotifications(input.merchantId, notifications)
      set((current) => ({
        notificationsByMerchant: {
          ...current.notificationsByMerchant,
          [input.merchantId]: notifications,
        },
        hydratedMerchantIds: current.hydratedMerchantIds.includes(
          input.merchantId
        )
          ? current.hydratedMerchantIds
          : [...current.hydratedMerchantIds, input.merchantId],
        announcement: notification,
      }))
      return true
    },
    markRead: (merchantId, notificationId) => {
      const notifications = (
        get().notificationsByMerchant[merchantId] || []
      ).map((item) =>
        item.id === notificationId && item.readAt === null
          ? { ...item, readAt: Date.now() }
          : item
      )
      persistNotifications(merchantId, notifications)
      set((state) => ({
        notificationsByMerchant: {
          ...state.notificationsByMerchant,
          [merchantId]: notifications,
        },
      }))
    },
    markAllRead: (merchantId) => {
      const readAt = Date.now()
      const notifications = (
        get().notificationsByMerchant[merchantId] || []
      ).map((item) => (item.readAt === null ? { ...item, readAt } : item))
      persistNotifications(merchantId, notifications)
      set((state) => ({
        notificationsByMerchant: {
          ...state.notificationsByMerchant,
          [merchantId]: notifications,
        },
      }))
    },
    dismissAnnouncement: (merchantId, notificationId) =>
      set((state) => ({
        announcement:
          state.announcement?.merchantId === merchantId &&
          state.announcement.id === notificationId
            ? null
            : state.announcement,
      })),
  }))

export function addMerchantOrderNotification(
  merchantId: string,
  order: { id: string; customerName: string; createdAt: string }
) {
  return useMerchantOrderNotificationStore.getState().add({
    merchantId,
    orderId: order.id,
    customerName: order.customerName,
    createdAt: order.createdAt,
  })
}
