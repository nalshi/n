import { beforeEach, describe, expect, it } from 'vitest'
import {
  merchantOrderNotificationStorageKey,
  useMerchantOrderNotificationStore,
} from './merchant-order-notifications'

describe('merchant order notifications', () => {
  beforeEach(() => {
    localStorage.removeItem(merchantOrderNotificationStorageKey('merchant-1'))
    localStorage.removeItem(merchantOrderNotificationStorageKey('merchant-2'))
    useMerchantOrderNotificationStore.setState({
      notificationsByMerchant: {},
      hydratedMerchantIds: [],
      announcement: null,
    })
  })

  it('stores notifications separately per merchant and ignores duplicates', () => {
    const store = useMerchantOrderNotificationStore.getState()
    store.hydrate('merchant-1')
    store.hydrate('merchant-2')

    const notification = {
      merchantId: 'merchant-1',
      orderId: 'order-1',
      customerName: 'عميل',
      createdAt: '2026-10-20T12:00:00.000Z',
    }

    expect(store.add(notification)).toBe(true)
    expect(store.add(notification)).toBe(false)
    expect(
      useMerchantOrderNotificationStore.getState().notificationsByMerchant[
        'merchant-1'
      ]
    ).toHaveLength(1)
    expect(
      useMerchantOrderNotificationStore.getState().notificationsByMerchant[
        'merchant-2'
      ]
    ).toEqual([])
    expect(
      localStorage.getItem(merchantOrderNotificationStorageKey('merchant-1'))
    ).toContain('order-1')
    expect(
      localStorage.getItem(merchantOrderNotificationStorageKey('merchant-2'))
    ).toBeNull()
  })

  it('marks notifications as read and restores them from local storage', () => {
    const store = useMerchantOrderNotificationStore.getState()
    store.hydrate('merchant-1')
    store.add({
      merchantId: 'merchant-1',
      orderId: 'order-2',
      customerName: 'عميل ثان',
      createdAt: '2026-10-20T12:00:00.000Z',
    })
    store.markRead('merchant-1', 'order-2')
    useMerchantOrderNotificationStore.setState({
      notificationsByMerchant: {},
      hydratedMerchantIds: [],
      announcement: null,
    })

    useMerchantOrderNotificationStore.getState().hydrate('merchant-1')

    expect(
      useMerchantOrderNotificationStore.getState().notificationsByMerchant[
        'merchant-1'
      ][0]?.readAt
    ).toEqual(expect.any(Number))
    expect(useMerchantOrderNotificationStore.getState().announcement).toBeNull()
  })
})
