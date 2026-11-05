import { describe, expect, it } from 'vitest'
import {
  amountToMinorUnits,
  fiscalYearDates,
  formatMinorUnits,
  parseAccountingSettings,
} from './accounting-data'

describe('accounting data helpers', () => {
  it('creates a complete fiscal year across calendar years', () => {
    expect(fiscalYearDates('2025-07')).toEqual({
      start_date: '2025-07-01',
      end_date: '2026-06-30',
    })
  })

  it('converts money to minor units using the currency precision', () => {
    expect(amountToMinorUnits('12.34', 'USD')).toBe(1234)
    expect(amountToMinorUnits('12', 'JPY')).toBe(12)
    expect(amountToMinorUnits('12.5', 'KWD')).toBe(12500)
  })

  it('rejects invalid and over-precise amounts', () => {
    expect(() => amountToMinorUnits('0', 'USD')).toThrow('المبلغ خارج النطاق')
    expect(() => amountToMinorUnits('-1.00', 'USD')).toThrow(
      'أدخل مبلغًا موجبًا'
    )
    expect(() => amountToMinorUnits('1.001', 'USD')).toThrow(
      'تسمح العملة بحد أقصى 2 منازل عشرية'
    )
    expect(() => amountToMinorUnits('1', '??')).toThrow('رمز العملة غير صالح')
  })

  it('requires explicit boolean accounting policy values', () => {
    expect(
      parseAccountingSettings({
        country_code: null,
        functional_currency: null,
        timezone: null,
        fiscal_year_start_month: null,
        fiscal_year_start_day: null,
        accounting_start_date: null,
        tax_enabled: false,
        tax_settings: {},
        invoice_settings: {},
        inventory_costing_method: null,
        revenue_recognition_policy: null,
        policy_confirmed: false,
      }).policy_confirmed
    ).toBe(false)
    expect(() =>
      parseAccountingSettings({
        tax_enabled: 'false',
      })
    ).toThrow('حقل حالة الضرائب غير صالح')
  })

  it('formats amounts with the currency precision', () => {
    expect(formatMinorUnits(1234, 'USD')).toContain('١٢٫٣٤')
    expect(formatMinorUnits(12, 'JPY')).toContain('١٢')
  })
})
