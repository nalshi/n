import { afterEach, describe, expect, it } from 'vitest'
import type { DashboardOrder } from '@/features/dashboard/dashboard-data'
import {
  getMerchantLocalDB,
  hydrateFromSnapshot,
  type MerchantLocalDB,
} from './db'
import { removeSavedMerchantAccount } from './merchant-accounts'

const openedDatabases: MerchantLocalDB[] = []

function makeOrder(id: string, customerName: string): DashboardOrder {
  return {
    id,
    customerName,
    customerPhone: '',
    deliveryAddress: '',
    deliveryMapUrl: '',
    total: 0,
    deliveryFee: 0,
    currency: 'YER',
    status: 'pending_merchant_approval',
    createdAt: '2026-10-20T00:00:00.000Z',
    items: [],
  }
}

async function saveSnapshot(
  merchantId: string,
  orders: DashboardOrder[],
  lastEventId: number
) {
  await hydrateFromSnapshot({
    merchantId,
    orders,
    products: [],
    categories: [],
    lastEventId,
    lastTimestamp: lastEventId,
  })
  const database = getMerchantLocalDB(merchantId)
  if (!openedDatabases.includes(database)) openedDatabases.push(database)
}

describe('per-merchant local databases', () => {
  afterEach(async () => {
    await Promise.all(
      openedDatabases.splice(0).map((database) => database.delete())
    )
  })

  it('keeps orders and sync cursors isolated when merchant IDs overlap', async () => {
    const firstMerchant = `merchant-a-${crypto.randomUUID()}`
    const secondMerchant = `merchant-b-${crypto.randomUUID()}`
    await saveSnapshot(firstMerchant, [makeOrder('same-order', 'تاجر أول')], 11)
    await saveSnapshot(
      secondMerchant,
      [makeOrder('same-order', 'تاجر ثان')],
      27
    )

    const firstDatabase = getMerchantLocalDB(firstMerchant)
    const secondDatabase = getMerchantLocalDB(secondMerchant)
    expect(await firstDatabase.orders.get('same-order')).toMatchObject({
      customerName: 'تاجر أول',
    })
    expect(await secondDatabase.orders.get('same-order')).toMatchObject({
      customerName: 'تاجر ثان',
    })
    expect(await firstDatabase.syncState.get('cursor')).toMatchObject({
      lastEventId: 11,
      merchantId: firstMerchant,
    })
    expect(await secondDatabase.syncState.get('cursor')).toMatchObject({
      lastEventId: 27,
      merchantId: secondMerchant,
    })

    await saveSnapshot(firstMerchant, [], 12)
    expect(await firstDatabase.orders.count()).toBe(0)
    expect(await secondDatabase.orders.count()).toBe(1)
  })

  it('preserves the merchant database when a saved session is removed', async () => {
    const merchantId = `merchant-${crypto.randomUUID()}`
    const payload = btoa(
      JSON.stringify({
        user_id: merchantId,
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    )
    const token = `header.${payload}.signature`
    await saveSnapshot(
      merchantId,
      [makeOrder('kept-order', 'بيانات محفوظة')],
      31
    )
    localStorage.setItem(
      'nalsh_saved_merchant_accounts_v1',
      JSON.stringify([
        {
          id: merchantId,
          identifier: merchantId,
          label: 'حساب التاجر',
          token,
          expiresAt: (Math.floor(Date.now() / 1000) + 3600) * 1000,
        },
      ])
    )

    removeSavedMerchantAccount(token)

    expect(
      await getMerchantLocalDB(merchantId).orders.get('kept-order')
    ).toMatchObject({
      customerName: 'بيانات محفوظة',
    })
  })
})
