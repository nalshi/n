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

export type AccountingOverview = {
  policy_confirmed: boolean
  accounts_count: number
  open_periods: number
  closed_periods: number
  draft_journals: number
  posted_journals: number
  readiness_label: string
  needs_attention: string | null
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
  source_type: string
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
  if (status !== 'draft' && status !== 'posted') {
    throw new Error('حالة القيد غير صالحة.')
  }
  if (!sourceType.trim()) {
    throw new Error('مصدر القيد غير صالح.')
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

export function summarizeAccountingOverview({
  settings,
  accounts,
  periods,
  journals,
}: {
  settings?: Pick<
    AccountingSettings,
    'policy_confirmed' | 'functional_currency' | 'accounting_start_date'
  > | null
  accounts?: Array<Pick<AccountingAccount, 'id'>> | null
  periods?: Array<Pick<AccountingPeriod, 'status'>> | null
  journals?: Array<Pick<JournalEntry, 'status'>> | null
}): AccountingOverview {
  const accountCount = accounts?.length ?? 0
  const openPeriods = periods?.filter((period) => period.status === 'open').length ?? 0
  const closedPeriods = periods?.filter((period) => period.status === 'closed').length ?? 0
  const draftJournals = journals?.filter((journal) => journal.status === 'draft').length ?? 0
  const postedJournals = journals?.filter((journal) => journal.status === 'posted').length ?? 0
  const policyConfirmed = Boolean(settings?.policy_confirmed)

  let needsAttention: string | null = null
  if (!policyConfirmed) {
    needsAttention = 'تحتاج إلى اعتماد سياسة المحاسبة قبل ترحيل القيود.'
  } else if (accountCount === 0) {
    needsAttention = 'لم يتم تهيئة دليل الحسابات بعد.'
  } else if (openPeriods === 0) {
    needsAttention = 'لا توجد فترات مالية مفتوحة لتسجيل القيود.'
  } else if (draftJournals > 0) {
    needsAttention = 'هناك قيود مسودة تحتاج إلى مراجعة أو ترحيل.'
  }

  let readinessLabel = 'في انتظار التهيئة'
  if (policyConfirmed && accountCount > 0 && openPeriods > 0) {
    readinessLabel = 'جاهز للتشغيل المحاسبي'
  } else if (policyConfirmed || accountCount > 0 || openPeriods > 0) {
    readinessLabel = 'يحتاج إلى إكمال إعدادات أساسية'
  }

  return {
    policy_confirmed: policyConfirmed,
    accounts_count: accountCount,
    open_periods: openPeriods,
    closed_periods: closedPeriods,
    draft_journals: draftJournals,
    posted_journals: postedJournals,
    readiness_label: readinessLabel,
    needs_attention: needsAttention,
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

export function amountToMinorUnits(amount: string, currency = 'YER') {
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

export function formatMinorUnits(amount: number, currency = 'YER') {
  const isNegative = amount < 0
  const absAmount = Math.abs(amount)
  if (!Number.isSafeInteger(absAmount)) {
    throw new Error('المبلغ المخزن غير صالح.')
  }
  const digits = currencyFractionDigits(currency)
  const formatter = new Intl.NumberFormat('ar-YE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  const parts = formatter.formatToParts(BigInt(absAmount) / 10n ** BigInt(digits))
  if (digits === 0) {
    const res = parts.map((part) => part.value).join('')
    return isNegative ? `(${res})` : res
  }

  const fraction = String(BigInt(absAmount) % 10n ** BigInt(digits)).padStart(
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
  const formatted = parts
    .map(
      (part, index) =>
        part.value +
        (index === lastIntegerIndex ? `${decimal}${localizedFraction}` : '')
    )
    .join('')
  return isNegative ? `(${formatted})` : formatted
}

// ==============================================================================
// ENTERPRISE ACCOUNTING MODULES API CLIENT
// ==============================================================================

export type ContactItem = {
  id: string
  type: 'customer' | 'supplier' | 'both'
  name: string
  phone: string | null
  email: string | null
  tax_number: string | null
  address: string | null
  opening_balance_minor_units: number
  opening_balance_type: 'debit' | 'credit'
  live_balance_minor_units: number
  total_debit_minor_units: number
  total_credit_minor_units: number
}

export type PurchaseItem = {
  id: string
  bill_number: string
  supplier_id: string | null
  supplier_name: string
  invoice_date: string
  due_date: string | null
  payment_type: 'cash' | 'credit' | 'bank'
  subtotal_minor_units: number
  tax_minor_units: number
  discount_minor_units: number
  total_minor_units: number
  paid_minor_units: number
  status: 'draft' | 'posted' | 'paid' | 'partially_paid' | 'reversed'
  notes: string | null
  journal_id: string | null
  created_at: number
}

export type ExpenseItem = {
  id: string
  expense_number: string
  expense_date: string
  expense_account_id: string
  payment_account_id: string
  payment_method: 'cash' | 'bank' | 'accrued'
  amount_minor_units: number
  tax_minor_units: number
  vendor_name: string | null
  description: string
  category: string
  receipt_url: string | null
  status: 'draft' | 'posted' | 'reversed'
  journal_id: string | null
  expense_account_name?: string
  payment_account_name?: string
}

export type CashDeskItem = {
  id: string
  name: string
  type: 'cash' | 'bank'
  account_id: string
  account_number: string | null
  bank_name: string | null
  currency: string
  is_default: boolean
  current_balance_minor_units: number
  total_debit_minor_units: number
  total_credit_minor_units: number
}

export type PaymentItem = {
  id: string
  payment_number: string
  payment_type: 'receipt' | 'voucher' | 'transfer'
  payment_date: string
  source_account_id: string
  destination_account_id: string
  amount_minor_units: number
  currency: string
  beneficiary_name: string | null
  description: string
  status: 'draft' | 'posted' | 'reversed'
  journal_id: string | null
  created_at: number
}

export async function fetchContacts(type?: string, search?: string) {
  const result = await request('list_contacts', { type, search })
  return (asRecord(result, 'جهات الاتصال').data as ContactItem[]) || []
}

export async function createContact(payload: {
  name: string
  type: 'customer' | 'supplier' | 'both'
  phone?: string
  email?: string
  tax_number?: string
  address?: string
  opening_balance_minor_units?: number
  opening_balance_type?: 'debit' | 'credit'
}) {
  return request('create_contact', payload)
}

export async function fetchContactStatement(
  contactId: string,
  startDate?: string,
  endDate?: string
) {
  const result = await request('get_contact_statement', {
    contact_id: contactId,
    start_date: startDate,
    end_date: endDate,
  })
  return asRecord(result, 'كشف الحساب').data as Record<string, unknown>
}

export async function fetchPurchases(status?: string, page = 1, limit = 50) {
  const result = await request('list_purchases', { status, page, limit })
  return (
    (asRecord(result, 'المشتريات').data as {
      purchases: PurchaseItem[]
      total: number
      page: number
      limit: number
    }) || { purchases: [], total: 0, page: 1, limit: 50 }
  )
}

export async function createPurchase(payload: {
  bill_number: string
  supplier_name: string
  supplier_id?: string
  invoice_date: string
  due_date?: string
  payment_type: 'cash' | 'credit' | 'bank'
  subtotal_minor_units: number
  tax_minor_units?: number
  discount_minor_units?: number
  notes?: string
  post_immediately?: boolean
}) {
  return request('create_purchase', payload)
}

export async function postPurchase(purchaseId: string) {
  return request('post_purchase', { purchase_id: purchaseId })
}

export async function reversePurchase(purchaseId: string, reason: string) {
  return request('reverse_purchase', { purchase_id: purchaseId, reason })
}

export async function fetchExpenses(
  status?: string,
  category?: string,
  page = 1,
  limit = 50
) {
  const result = await request('list_expenses', {
    status,
    category,
    page,
    limit,
  })
  return (
    (asRecord(result, 'المصروفات').data as {
      expenses: ExpenseItem[]
      total: number
      page: number
      limit: number
    }) || { expenses: [], total: 0, page: 1, limit: 50 }
  )
}

export async function createExpense(payload: {
  expense_number: string
  expense_date: string
  category: string
  description: string
  amount_minor_units: number
  tax_minor_units?: number
  vendor_name?: string
  payment_method?: 'cash' | 'bank' | 'accrued'
  receipt_url?: string
  post_immediately?: boolean
}) {
  return request('create_expense', payload)
}

export async function postExpense(expenseId: string) {
  return request('post_expense', { expense_id: expenseId })
}

export async function reverseExpense(expenseId: string, reason: string) {
  return request('reverse_expense', { expense_id: expenseId, reason })
}

export async function fetchCashDesks() {
  const result = await request('list_cash_desks')
  return (asRecord(result, 'الصناديق والبنوك').data as CashDeskItem[]) || []
}

export async function createCashDesk(payload: {
  name: string
  type: 'cash' | 'bank'
  account_number?: string
  bank_name?: string
}) {
  return request('create_cash_desk', payload)
}

export async function recordTransfer(payload: {
  source_account_id: string
  destination_account_id: string
  amount_minor_units: number
  transfer_date?: string
  description?: string
}) {
  return request('record_transfer', payload)
}

export async function fetchPayments(type?: string, page = 1, limit = 50) {
  const result = await request('list_payments', { type, page, limit })
  return (
    (asRecord(result, 'السندات').data as {
      payments: PaymentItem[]
      page: number
      limit: number
    }) || { payments: [], page: 1, limit: 50 }
  )
}

export async function createPayment(payload: {
  payment_number: string
  payment_type: 'receipt' | 'voucher'
  payment_date: string
  amount_minor_units: number
  description: string
  beneficiary_name?: string
  reference_id?: string
  cash_account_id?: string
  contact_account_id?: string
}) {
  return request('create_payment', payload)
}

export async function postSalesOrder(payload: {
  order_number: string
  customer_name?: string
  customer_id?: string
  order_date?: string
  payment_method?: 'cash' | 'credit'
  total_amount_minor_units: number
  tax_minor_units?: number
  cogs_amount_minor_units?: number
}) {
  return request('post_sales_order', payload)
}

export async function fetchInventoryValuation() {
  const result = await request('get_inventory_valuation')
  return asRecord(result, 'تقييم المخزون').data as {
    total_products: number
    total_stock_count: number
    grand_total_valuation_minor_units: number
    costing_method: string
    items: Array<{
      product_id: string
      name: string
      stock_quantity: number
      unit_cost_minor_units: number
      total_cost_minor_units: number
      costing_method: string
    }>
  }
}

export async function recordInventoryAdjustment(payload: {
  adjustment_number?: string
  adjustment_type: 'increase' | 'decrease'
  amount_minor_units: number
  reason: string
  adjustment_date?: string
}) {
  return request('record_inventory_adjustment', payload)
}

export async function closeFiscalYear(fiscalYearId: string) {
  return request('close_fiscal_year', { fiscal_year_id: fiscalYearId })
}

export async function fetchGeneralLedger(
  startDate?: string,
  endDate?: string,
  accountId?: string
) {
  const result = await request('get_general_ledger', {
    start_date: startDate,
    end_date: endDate,
    account_id: accountId,
  })
  return asRecord(result, 'دفتر الأستاذ').data as {
    start_date: string | null
    end_date: string | null
    grand_opening_debit: number
    grand_opening_credit: number
    grand_period_debit: number
    grand_period_credit: number
    grand_closing_debit: number
    grand_closing_credit: number
    accounts: Array<{
      account: {
        id: string
        account_code: string
        name: string
        account_type: string
        normal_balance: string
        parent_id: string | null
      }
      opening_debit: number
      opening_credit: number
      opening_balance: number
      period_debit: number
      period_credit: number
      closing_balance: number
      entries_count: number
      entries: Array<{
        line_id: string
        line_number: number
        journal_id: string
        journal_number: string
        entry_date: string
        description: string
        source_type: string
        debit_minor_units: number
        credit_minor_units: number
        running_balance: number
        posted_at: number | null
      }>
    }>
  }
}

export async function fetchTrialBalance(
  asOfDate?: string,
  fromDate?: string,
  periodId?: string
) {
  const result = await request('get_trial_balance', {
    as_of_date: asOfDate,
    from_date: fromDate,
    period_id: periodId,
  })
  return asRecord(result, 'ميزان المراجعة').data as {
    as_of_date: string | null
    from_date: string | null
    period_id: string | null
    grand_total_debit: number
    grand_total_credit: number
    grand_ending_debit: number
    grand_ending_credit: number
    is_balanced: boolean
    accounts: Array<{
      id: string
      account_code: string
      name: string
      account_type: string
      normal_balance: string
      is_postable: boolean
      parent_id: string | null
      total_debit: number
      total_credit: number
      net_balance: number
      ending_debit: number
      ending_credit: number
    }>
  }
}

export async function fetchProfitLoss(startDate?: string, endDate?: string) {
  const result = await request('get_profit_loss', {
    start_date: startDate,
    end_date: endDate,
  })
  return asRecord(result, 'قائمة الدخل').data as {
    start_date: string | null
    end_date: string | null
    revenues: Array<{
      id: string
      account_code: string
      name: string
      amount_minor_units: number
    }>
    total_revenue: number
    costs: Array<{
      id: string
      account_code: string
      name: string
      amount_minor_units: number
    }>
    total_cost: number
    gross_profit: number
    expenses: Array<{
      id: string
      account_code: string
      name: string
      amount_minor_units: number
    }>
    total_expense: number
    net_profit: number
    is_profitable: boolean
  }
}

export async function fetchBalanceSheet(asOfDate?: string) {
  const result = await request('get_balance_sheet', { as_of_date: asOfDate })
  return asRecord(result, 'الميزانية العمومية').data as {
    as_of_date: string | null
    assets: Array<{
      id: string
      account_code: string
      name: string
      amount_minor_units: number
    }>
    total_assets: number
    liabilities: Array<{
      id: string
      account_code: string
      name: string
      amount_minor_units: number
    }>
    total_liabilities: number
    equity: Array<{
      id: string
      account_code: string
      name: string
      amount_minor_units: number
    }>
    current_period_net_income: number
    total_equity: number
    total_liabilities_and_equity: number
    is_balanced: boolean
    difference: number
  }
}

export async function fetchCashFlow(startDate?: string, endDate?: string) {
  const result = await request('get_cash_flow', {
    start_date: startDate,
    end_date: endDate,
  })
  return asRecord(result, 'قائمة التدفقات النقدية').data as {
    start_date: string | null
    end_date: string | null
    opening_cash: number
    operating_cash_in: number
    operating_cash_out: number
    net_operating_cash_flow: number
    financing_cash_in: number
    financing_cash_out: number
    net_financing_cash_flow: number
    net_change_in_cash: number
    closing_cash: number
  }
}

export async function fetchTaxReport(startDate?: string, endDate?: string) {
  const result = await request('get_tax_report', {
    start_date: startDate,
    end_date: endDate,
  })
  return asRecord(result, 'الإقرار الضريبي').data as {
    start_date: string | null
    end_date: string | null
    taxable_sales_minor_units: number
    output_tax_minor_units: number
    input_tax_minor_units: number
    net_tax_payable_minor_units: number
    status: 'payable' | 'refundable'
  }
}

export async function fetchAgingReport(
  type: 'customer' | 'supplier',
  asOfDate?: string
) {
  const result = await request('get_aging_report', {
    type,
    as_of_date: asOfDate,
  })
  return asRecord(result, 'تقرير أعمار الديون').data as {
    type: 'customer' | 'supplier'
    as_of_date: string
    total_current: number
    total_30_days: number
    total_60_days: number
    total_90_plus: number
    grand_total_debt: number
    items: Array<{
      contact_id: string
      name: string
      phone: string | null
      total_balance: number
      bucket_current: number
      bucket_30: number
      bucket_60: number
      bucket_90_plus: number
    }>
  }
}

