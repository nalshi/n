import { beforeEach, describe, expect, it } from 'vitest'
import {
  removeSavedMerchantAccountById,
  saveMerchantAccount,
} from './merchant-accounts'
import {
  getMerchantDisplayName,
  getMerchantProfile,
  saveMerchantProfile,
} from './merchant-profiles'

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
      storeUrl: '',
    })
    saveMerchantProfile('merchant-2', {
      storeName: 'متجر الثاني',
      phone: '+967 700 000 002',
      location: 'عدن، خور مكسر',
      storeUrl: '',
    })

    expect(getMerchantProfile('merchant-1')).toEqual({
      storeName: 'متجر الأول',
      phone: '+967 700 000 001',
      location: 'صنعاء، شارع الزبيري',
      storeUrl: '',
    })
    expect(getMerchantProfile('merchant-2')).toEqual({
      storeName: 'متجر الثاني',
      phone: '+967 700 000 002',
      location: 'عدن، خور مكسر',
      storeUrl: '',
    })
    expect(getMerchantDisplayName('merchant-1')).toBe('متجر الأول')
    expect(getMerchantDisplayName('merchant-2')).toBe('متجر الثاني')
  })

  it('updates only provided fields and keeps data after saved-login removal', () => {
    saveMerchantProfile('merchant-1', {
      storeName: 'متجر محفوظ',
      phone: '+967 700 000 001',
      location: 'صنعاء',
      storeUrl: '',
    })
    saveMerchantAccount(makeToken(1), 'merchant-1', 'متجر محفوظ')
    removeSavedMerchantAccountById('1')
    saveMerchantProfile('merchant-1', { location: 'تعز، شارع جمال' })

    expect(getMerchantProfile('merchant-1')).toEqual({
      storeName: 'متجر محفوظ',
      phone: '+967 700 000 001',
      location: 'تعز، شارع جمال',
      storeUrl: '',
    })
  })

  it('uses the real store name instead of generic placeholders', () => {
    localStorage.setItem('merchant_store_name:merchant-1', 'متجري')
    saveMerchantProfile('merchant-1', { storeName: 'متجري' })

    expect(getMerchantDisplayName('merchant-1', 'متجر الأصيل')).toBe(
      'متجر الأصيل'
    )

    saveMerchantProfile('merchant-1', { storeName: 'متجر الأصيل' })
    expect(getMerchantDisplayName('merchant-1')).toBe('متجر الأصيل')
  })

  it('does not use a generic label as a store-name fallback', () => {
    expect(getMerchantDisplayName('merchant-1', 'متجري')).toBe('')
    expect(getMerchantDisplayName('', 'اسم المتجر')).toBe('')
  })

  it('stores a merchant storefront link and migrates older saved profiles', () => {
    localStorage.setItem(
      'nalsh_merchant_profiles_v1',
      JSON.stringify({
        'merchant:merchant-old': {
          storeName: 'متجر قديم',
          phone: '+967 700 000 003',
          location: '',
        },
      })
    )
    expect(getMerchantProfile('merchant-old').storeUrl).toBe('')

    saveMerchantProfile('merchant-old', {
      storeUrl: 'https://appi.dpdns.org/merchant-old',
    })

    expect(getMerchantProfile('merchant-old').storeUrl).toBe(
      'https://appi.dpdns.org/merchant-old'
    )
  })

  it('rejects missing merchant IDs and oversized profile fields', () => {
    expect(() => getMerchantProfile(' ')).toThrow('معرّف حساب صالح')
    expect(() =>
      saveMerchantProfile('merchant-1', { location: 'م'.repeat(201) })
    ).toThrow('الحد المسموح به')
    expect(() =>
      saveMerchantProfile('merchant-1', { storeUrl: 'x'.repeat(513) })
    ).toThrow('الحد المسموح به')
    expect(() =>
      saveMerchantProfile('merchant-1', {
        storeUrl: 'javascript:alert(1)',
      })
    ).toThrow('رابط المتجر غير صالح')
  })
})
