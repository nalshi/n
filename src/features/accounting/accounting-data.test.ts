import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  amountToMinorUnits,
  fetchContactStatement,
  fiscalYearDates,
  formatMinorUnits,
  parseAccountingSettings,
  summarizeAccountingOverview,
} from './accounting-data'

const { authApiRequest } = vi.hoisted(() => ({
  authApiRequest: vi.fn(),
}))

vi.mock('@/lib/auth-api', () => ({ authApiRequest }))

describe('accounting data helpers', () => {
  beforeEach(() => {
    authApiRequest.mockReset()
  })

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

  it('summarizes the accounting readiness state from actual records', () => {
    const summary = summarizeAccountingOverview({
      settings: {
        policy_confirmed: true,
        functional_currency: 'USD',
        accounting_start_date: '2026-01-01',
      },
      accounts: [{ id: 'a1' }, { id: 'a2' }],
      periods: [{ status: 'open' }, { status: 'open' }, { status: 'closed' }],
      journals: [{ status: 'draft' }, { status: 'posted' }, { status: 'posted' }],
    })

    expect(summary).toMatchObject({
      policy_confirmed: true,
      accounts_count: 2,
      open_periods: 2,
      closed_periods: 1,
      draft_journals: 1,
      posted_journals: 2,
      readiness_label: 'جاهز للتشغيل المحاسبي',
      needs_attention: 'هناك قيود مسودة تحتاج إلى مراجعة أو ترحيل.',
    })
  })

  it('validates and types contact statement data from the accounting API', async () => {
    authApiRequest.mockResolvedValueOnce({
      status: 'success',
      data: {
        contact: { name: 'عميل' },
        opening_balance_minor_units: 100,
        total_debit_minor_units: 50,
        total_credit_minor_units: 25,
        closing_balance_minor_units: 125,
        entries: [
          {
            entry_date: '2026-01-02',
            journal_number: 'JE-001',
            description: 'فاتورة بيع',
            debit_minor_units: 50,
            credit_minor_units: 0,
            running_balance_minor_units: 150,
          },
        ],
      },
    })

    await expect(fetchContactStatement('customer-1')).resolves.toMatchObject({
      contact: { name: 'عميل' },
      opening_balance_minor_units: 100,
      closing_balance_minor_units: 125,
      entries: [{ journal_number: 'JE-001', debit_minor_units: 50 }],
    })
    expect(authApiRequest).toHaveBeenCalledWith('get_contact_statement', {
      contact_id: 'customer-1',
      start_date: undefined,
      end_date: undefined,
    })
  })

  it('rejects malformed contact statement data instead of returning success-shaped defaults', async () => {
    authApiRequest.mockResolvedValueOnce({
      status: 'success',
      data: { entries: [] },
    })

    await expect(fetchContactStatement('customer-1')).rejects.toThrow(
      'حقل الرصيد الافتتاحي غير صالح.'
    )
  })
})
