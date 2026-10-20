import { beforeEach, describe, expect, it } from 'vitest'
import {
  removeSavedMerchantAccountById,
  saveMerchantAccount,
} from './merchant-accounts'
import { getMerchantProfile, saveMerchantProfile } from './merchant-profiles'

function makeToken(userId: number) {
  const payload = btoa(
    JSON.stringify({
      user_id: userId,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  )
  return `header.${payload}.signature`
}

describe('merchant profiles', () => {
  beforeEach(() => {
    localStorage.removeItem('nalsh_merchant_profiles_v1')
    localStorage.removeItem('nalsh_saved_merchant_accounts_v1')
  })

  it('stores contact and location details independently for each merchant', () => {
    saveMerchantProfile('merchant-1', {
      storeName: 'متجر الأول',
      phone: '+967 700 000 001',
      location: 'صنعاء، شارع الزبيري',
    })
    saveMerchantProfile('merchant-2', {
      storeName: 'متجر الثاني',
      phone: '+967 700 000 002',
      location: 'عدن، خور مكسر',
    })

    expect(getMerchantProfile('merchant-1')).toEqual({
      storeName: 'متجر الأول',
      phone: '+967 700 000 001',
      location: 'صنعاء، شارع الزبيري',
    })
    expect(getMerchantProfile('merchant-2')).toEqual({
      storeName: 'متجر الثاني',
      phone: '+967 700 000 002',
      location: 'عدن، خور مكسر',
    })
  })

  it('updates only provided fields and keeps data after saved-login removal', () => {
    saveMerchantProfile('merchant-1', {
      storeName: 'متجر محفوظ',
      phone: '+967 700 000 001',
      location: 'صنعاء',
    })
    saveMerchantAccount(makeToken(1), 'merchant-1', 'متجر محفوظ')
    removeSavedMerchantAccountById('1')
    saveMerchantProfile('merchant-1', { location: 'تعز، شارع جمال' })

    expect(getMerchantProfile('merchant-1')).toEqual({
      storeName: 'متجر محفوظ',
      phone: '+967 700 000 001',
      location: 'تعز، شارع جمال',
    })
  })

  it('rejects missing merchant IDs and oversized profile fields', () => {
    expect(() => getMerchantProfile(' ')).toThrow('معرّف حساب صالح')
    expect(() =>
      saveMerchantProfile('merchant-1', { location: 'م'.repeat(201) })
    ).toThrow('الحد المسموح به')
  })
})
