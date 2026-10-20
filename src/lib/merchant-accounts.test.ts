import { beforeEach, describe, expect, it } from 'vitest'
import {
  getSavedMerchantAccounts,
  MAX_SAVED_MERCHANT_ACCOUNTS,
  removeSavedMerchantAccountById,
  saveMerchantAccount,
} from './merchant-accounts'

function makeToken(
  userId: number,
  expiresAt = Math.floor(Date.now() / 1000) + 3600
) {
  const payload = btoa(JSON.stringify({ user_id: userId, exp: expiresAt }))
  return `header.${payload}.signature`
}

describe('saved merchant accounts', () => {
  beforeEach(() => {
    localStorage.removeItem('nalsh_saved_merchant_accounts_v1')
  })

  it('keeps at most three independent sessions and rejects a fourth', () => {
    for (
      let accountId = 1;
      accountId <= MAX_SAVED_MERCHANT_ACCOUNTS;
      accountId += 1
    ) {
      saveMerchantAccount(
        makeToken(accountId),
        `merchant-${accountId}`,
        `متجر ${accountId}`
      )
    }

    expect(() =>
      saveMerchantAccount(makeToken(4), 'merchant-4', 'متجر 4')
    ).toThrow('الحد الأقصى وهو 3')
    expect(getSavedMerchantAccounts()).toHaveLength(3)
  })

  it('updates an existing merchant session without taking another slot', () => {
    saveMerchantAccount(makeToken(1), 'merchant-1', 'متجر أول')
    saveMerchantAccount(makeToken(2), 'merchant-2', 'متجر ثان')
    saveMerchantAccount(makeToken(3), 'merchant-3', 'متجر ثالث')

    saveMerchantAccount(makeToken(1), 'merchant-1', 'متجر محدث')

    expect(getSavedMerchantAccounts()).toHaveLength(3)
    expect(getSavedMerchantAccounts()[0].label).toBe('متجر محدث')
  })

  it('removes a saved session without deleting another account', () => {
    saveMerchantAccount(makeToken(1), 'merchant-1')
    saveMerchantAccount(makeToken(2), 'merchant-2')

    removeSavedMerchantAccountById('1')

    expect(getSavedMerchantAccounts().map((account) => account.id)).toEqual([
      '2',
    ])
  })
})
