import { authApiRequest } from '@/lib/auth-api'
import type { ApiResult } from '@/lib/merchant-api'

type ApiRecord = Record<string, unknown>

export type AccountingSettings = {
  country_code: string | null
  functional_currency: string | null
  timezone: string | null
  fiscal_year_start_month: number | null
  fiscal_year_start_day: number | null
  accounting_start_date: string | null
  tax_enabled: boolean
  tax_settings: ApiRecord
  invoice_settings: ApiRecord
  inventory_costing_method: string | null
  revenue_recognition_policy: string | null
  policy_confirmed: boolean
}

export type AccountingAccount = {
  id: string
  parent_id: string | null
  account_code: string
  name: string
  account_type:
    | 'asset'
    | 'liability'
    | 'equity'
    | 'revenue'
    | 'cost'
    | 'expense'
  normal_balance: 'debit' | 'credit'
  is_postable: boolean
  is_active: boolean
  is_system: boolean
}

const ACCOUNT_TYPES = [
  'asset',
  'liability',
  'equity',
  'revenue',
  'cost',
  'expense',
] as const

function isAccountType(
  value: string
): value is AccountingAccount['account_type'] {
  return ACCOUNT_TYPES.some((type) => type === value)
}

export type AccountingPeriod = {
  id: string
  fiscal_year_id: string
  period_number: number
  name: string
  start_date: string
  end_date: string
  status: 'open' | 'closed'
  closed_by: string | null
  closed_at: number | null
}

export type JournalLine = {
  id?: string
  line_number?: number
  account_id: string
  description?: string | null
  debit_minor_units: number
  credit_minor_units: number
}

export type JournalEntry = {
  id: string
  journal_number: string
  period_id: string
  entry_date: string
  description: string
  source_type: 'manual' | 'reversal'
  currency: string
  status: 'draft' | 'posted'
  created_at: number
  posted_at: number | null
  lines?: JournalLine[]
}

export type AccountingAuditEvent = {
  id: string
  entity_type: string
  entity_id: string
  action: string
  actor_user_id: string
  details: ApiRecord
  created_at: number
}

export const accountingQueryKeys = (merchantId: string) =>
  ['accounting', merchantId] as const

function asRecord(value: unknown, label: string): ApiRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`صيغة ${label} غير متوقعة.`)
  }
  return value as ApiRecord
}

function requiredString(record: ApiRecord, key: string, label: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`حقل ${label} مفقود أو غير صالح.`)
  }
  return value
}

function nullableString(
  record: ApiRecord,
  key: string,
  label: string
): string | null {
  const value = record[key]
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') {
    throw new Error(`حقل ${label} غير صالح.`)
  }
  return value
}

function requiredInteger(record: ApiRecord, key: string, label: string) {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`حقل ${label} غير صالح.`)
  }
  return value
}

function nullableInteger(
  record: ApiRecord,
  key: string,
  label: string
): number | null {
  const value = record[key]
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`حقل ${label} غير صالح.`)
  }
  return value
}

function booleanValue(record: ApiRecord, key: string, label: string) {
  const value = record[key]
  if (value === true || value === 1) return true
  if (value === false || value === 0) return false
  throw new Error(`حقل ${label} غير صالح.`)
}

function optionalSettingsObject(record: ApiRecord, key: string): ApiRecord {
  const value = record[key]
  if (value === undefined || value === null) return {}
  return asRecord(value, key)
}

export function parseAccountingSettings(value: unknown): AccountingSettings {
  const record = asRecord(value, 'إعدادات المحاسبة')
  const month = nullableInteger(
    record,
    'fiscal_year_start_month',
    'شهر بداية السنة المالية'
  )
  const day = nullableInteger(
    record,
    'fiscal_year_start_day',
    'يوم بداية السنة المالية'
  )
  if (month !== null && (month < 1 || month > 12)) {
    throw new Error('شهر بداية السنة المالية غير صالح.')
  }
  if (day !== null && (day < 1 || day > 31)) {
    throw new Error('يوم بداية السنة المالية غير صالح.')
  }

  return {
    country_code: nullableString(record, 'country_code', 'الدولة'),
    functional_currency: nullableString(
      record,
      'functional_currency',
      'العملة الوظيفية'
    ),
    timezone: nullableString(record, 'timezone', 'المنطقة الزمنية'),
    fiscal_year_start_month: month,
    fiscal_year_start_day: day,
    accounting_start_date: nullableString(
      record,
      'accounting_start_date',
      'تاريخ بداية المحاسبة'
    ),
    tax_enabled: booleanValue(record, 'tax_enabled', 'حالة الضرائب'),
    tax_settings: optionalSettingsObject(record, 'tax_settings'),
    invoice_settings: optionalSettingsObject(record, 'invoice_settings'),
    inventory_costing_method: nullableString(
      record,
      'inventory_costing_method',
      'طريقة تقييم المخزون'
    ),
    revenue_recognition_policy: nullableString(
      record,
      'revenue_recognition_policy',
      'سياسة الاعتراف بالإيراد'
    ),
    policy_confirmed: booleanValue(
      record,
      'policy_confirmed',
      'اعتماد السياسة المحاسبية'
    ),
  }
}

function assertSuccess(result: ApiResult, action: string): ApiResult {
  if (result.status !== 'success' && result.status !== 'ok') {
    throw new Error(result.message || `تعذر تنفيذ ${action}.`)
  }
  return result
}

async function request(action: string, payload: ApiRecord = {}) {
  return assertSuccess(await authApiRequest(action, payload), action)
}

function rowsFromResult(result: ApiResult, field: string, label: string) {
  const record = asRecord(result, label)
  const rows = record[field]
  if (!Array.isArray(rows)) {
    throw new Error(`صيغة ${label} غير متوقعة.`)
  }
  return rows.map((row) => asRecord(row, label))
}

function parseAccount(value: unknown): AccountingAccount {
  const record = asRecord(value, 'الحساب')
  const accountType = requiredString(record, 'account_type', 'نوع الحساب')
  const normalBalance = requiredString(
    record,
    'normal_balance',
    'طبيعة رصيد الحساب'
  )
  if (
    !isAccountType(accountType) ||
    (normalBalance !== 'debit' && normalBalance !== 'credit')
  ) {
    throw new Error('نوع الحساب أو طبيعته غير صالح.')
  }
  return {
    id: requiredString(record, 'id', 'معرف الحساب'),
    parent_id: nullableString(record, 'parent_id', 'الحساب الرئيسي'),
    account_code: requiredString(record, 'account_code', 'رمز الحساب'),
    name: requiredString(record, 'name', 'اسم الحساب'),
    account_type: accountType,
    normal_balance: normalBalance,
    is_postable: booleanValue(record, 'is_postable', 'قابلية الترحيل'),
    is_active: booleanValue(record, 'is_active', 'حالة الحساب'),
    is_system: booleanValue(record, 'is_system', 'الحساب النظامي'),
  }
}

function parsePeriod(value: unknown): AccountingPeriod {
  const record = asRecord(value, 'الفترة المحاسبية')
  const status = requiredString(record, 'status', 'حالة الفترة')
  if (status !== 'open' && status !== 'closed') {
    throw new Error('حالة الفترة المحاسبية غير صالحة.')
  }
  return {
    id: requiredString(record, 'id', 'معرف الفترة'),
    fiscal_year_id: requiredString(record, 'fiscal_year_id', 'السنة المالية'),
    period_number: requiredInteger(record, 'period_number', 'رقم الفترة'),
    name: requiredString(record, 'name', 'اسم الفترة'),
    start_date: requiredString(record, 'start_date', 'بداية الفترة'),
    end_date: requiredString(record, 'end_date', 'نهاية الفترة'),
    status,
    closed_by: nullableString(record, 'closed_by', 'مغلق الفترة'),
    closed_at: nullableInteger(record, 'closed_at', 'وقت إغلاق الفترة'),
  }
}

function parseJournal(value: unknown): JournalEntry {
  const record = asRecord(value, 'القيد المحاسبي')
  const status = requiredString(record, 'status', 'حالة القيد')
  const sourceType = requiredString(record, 'source_type', 'مصدر القيد')
  if (
    (status !== 'draft' && status !== 'posted') ||
    (sourceType !== 'manual' && sourceType !== 'reversal')
  ) {
    throw new Error('حالة القيد أو مصدره غير صالح.')
  }
  const lines = record.lines
  return {
    id: requiredString(record, 'id', 'معرف القيد'),
    journal_number: requiredString(record, 'journal_number', 'رقم القيد'),
    period_id: requiredString(record, 'period_id', 'الفترة'),
    entry_date: requiredString(record, 'entry_date', 'تاريخ القيد'),
    description: requiredString(record, 'description', 'وصف القيد'),
    source_type: sourceType,
    currency: requiredString(record, 'currency', 'عملة القيد'),
    status,
    created_at: requiredInteger(record, 'created_at', 'وقت إنشاء القيد'),
    posted_at: nullableInteger(record, 'posted_at', 'وقت ترحيل القيد'),
    ...(Array.isArray(lines)
      ? {
          lines: lines.map((line) => {
            const parsed = asRecord(line, 'سطر القيد')
            return {
              id: nullableString(parsed, 'id', 'معرف السطر') ?? undefined,
              line_number:
                nullableInteger(parsed, 'line_number', 'رقم السطر') ??
                undefined,
              account_id: requiredString(parsed, 'account_id', 'الحساب'),
              description: nullableString(parsed, 'description', 'وصف السطر'),
              debit_minor_units: requiredInteger(
                parsed,
                'debit_minor_units',
                'المدين'
              ),
              credit_minor_units: requiredInteger(
                parsed,
                'credit_minor_units',
                'الدائن'
              ),
            }
          }),
        }
      : {}),
  }
}

export async function fetchAccountingSettings() {
  const result = await request('get_accounting_settings')
  return parseAccountingSettings(result.data)
}

export async function saveAccountingSettings(
  settings: Partial<AccountingSettings>
) {
  return request('save_accounting_settings', { settings })
}

export async function initializeAccounting() {
  return request('initialize_accounting')
}

export async function fetchAccounts() {
  const result = await request('list_accounts')
  return rowsFromResult(result, 'accounts', 'الحسابات').map(parseAccount)
}

export async function createAccount(payload: {
  account_code: string
  name: string
  account_type: AccountingAccount['account_type']
  normal_balance: AccountingAccount['normal_balance']
  is_postable: boolean
  parent_id?: string
}) {
  return request('create_account', payload)
}

export async function fetchPeriods() {
  const result = await request('list_accounting_periods')
  return rowsFromResult(result, 'periods', 'الفترات').map(parsePeriod)
}

export async function createFiscalYear(payload: {
  name: string
  start_date: string
  end_date: string
}) {
  return request('create_fiscal_year', payload)
}

export async function closeAccountingPeriod(periodId: string) {
  return request('close_accounting_period', { period_id: periodId })
}

export async function fetchJournalEntries() {
  const result = await request('list_journal_entries')
  return rowsFromResult(result, 'journals', 'القيود').map(parseJournal)
}

export async function fetchJournalEntry(journalId: string) {
  const result = await request('get_journal_entry', { journal_id: journalId })
  return parseJournal(result.data)
}

export async function createJournalEntry(payload: {
  period_id: string
  entry_date: string
  description: string
  idempotency_key: string
  currency: string
  lines: Array<{
    account_id: string
    description?: string
    debit_minor_units: number
    credit_minor_units: number
  }>
}) {
  return request('create_journal_entry', payload)
}

export async function postJournalEntry(journalId: string) {
  return request('post_journal_entry', { journal_id: journalId })
}

export async function reverseJournalEntry(payload: {
  journal_id: string
  period_id: string
  entry_date: string
  reason: string
}) {
  return request('reverse_journal_entry', payload)
}

export async function fetchAccountingAuditLog() {
  const result = await request('list_accounting_audit_log')
  return rowsFromResult(result, 'events', 'سجل التدقيق').map((value) => {
    const detailsValue = value.details_json
    const details = asRecord(
      typeof detailsValue === 'string'
        ? (JSON.parse(detailsValue) as unknown)
        : detailsValue,
      'تفاصيل سجل التدقيق'
    )
    return {
      id: requiredString(value, 'id', 'معرف حدث التدقيق'),
      entity_type: requiredString(value, 'entity_type', 'نوع العنصر'),
      entity_id: requiredString(value, 'entity_id', 'معرف العنصر'),
      action: requiredString(value, 'action', 'الإجراء'),
      actor_user_id: requiredString(value, 'actor_user_id', 'المستخدم'),
      details,
      created_at: requiredInteger(value, 'created_at', 'وقت الحدث'),
    }
  })
}

export function fiscalYearDates(startMonth: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(startMonth)
  if (!match) throw new Error('اختر شهر بداية السنة المالية.')
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) {
    throw new Error('شهر بداية السنة المالية غير صالح.')
  }
  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month + 11, 0))
  return {
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
  }
}

export function currencyFractionDigits(currency: string) {
  try {
    const digits = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits
    if (typeof digits !== 'number')
      throw new Error('Currency precision unavailable.')
    return digits
  } catch {
    throw new Error('رمز العملة غير صالح.')
  }
}

export function amountToMinorUnits(amount: string, currency: string) {
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(amount.trim())
  if (!match) throw new Error('أدخل مبلغًا موجبًا بصيغة رقمية صحيحة.')

  const fractionDigits = currencyFractionDigits(currency)
  const fractional = match[2] ?? ''
  if (fractional.length > fractionDigits) {
    throw new Error(`تسمح العملة بحد أقصى ${fractionDigits} منازل عشرية.`)
  }

  const factor = 10n ** BigInt(fractionDigits)
  const minorUnits =
    BigInt(match[1]) * factor +
    BigInt(fractional.padEnd(fractionDigits, '0') || '0')
  if (minorUnits <= 0n || minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('المبلغ خارج النطاق المسموح.')
  }
  return Number(minorUnits)
}

export function formatMinorUnits(amount: number, currency: string) {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error('المبلغ المخزن غير صالح.')
  }
  const digits = currencyFractionDigits(currency)
  const formatter = new Intl.NumberFormat('ar-YE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  const parts = formatter.formatToParts(BigInt(amount) / 10n ** BigInt(digits))
  if (digits === 0) return parts.map((part) => part.value).join('')

  const fraction = String(BigInt(amount) % 10n ** BigInt(digits)).padStart(
    digits,
    '0'
  )
  const localizedFraction = [...fraction]
    .map((digit) =>
      new Intl.NumberFormat('ar-YE', { useGrouping: false }).format(
        Number(digit)
      )
    )
    .join('')
  const decimal = new Intl.NumberFormat('ar-YE')
    .formatToParts(1.1)
    .find((part) => part.type === 'decimal')?.value
  if (!decimal) throw new Error('تعذر تنسيق العملة.')

  let lastIntegerIndex = -1
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index].type === 'integer') lastIntegerIndex = index
  }
  if (lastIntegerIndex < 0) throw new Error('تعذر تنسيق المبلغ.')
  return parts
    .map(
      (part, index) =>
        part.value +
        (index === lastIntegerIndex ? `${decimal}${localizedFraction}` : '')
    )
    .join('')
}
