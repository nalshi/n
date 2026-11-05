import { useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  CalendarRange,
  CircleAlert,
  FilePlus2,
  History,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { useMerchantIdentity } from '@/hooks/useMerchantRealtime'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Main } from '@/components/layout/main'
import {
  MerchantPageHeading,
  MerchantWorkspaceHeader,
} from '@/components/layout/merchant-workspace'
import {
  amountToMinorUnits,
  accountingQueryKeys,
  closeAccountingPeriod,
  createAccount,
  createFiscalYear,
  createJournalEntry,
  fetchAccountingAuditLog,
  fetchAccountingSettings,
  fetchAccounts,
  fetchJournalEntries,
  fetchJournalEntry,
  fetchPeriods,
  fiscalYearDates,
  formatMinorUnits,
  initializeAccounting,
  postJournalEntry,
  reverseJournalEntry,
  saveAccountingSettings,
  type AccountingAccount,
  type AccountingAuditEvent,
  type AccountingPeriod,
  type AccountingSettings,
  type JournalEntry,
} from './accounting-data'

type SectionId = 'settings' | 'accounts' | 'periods' | 'journals' | 'audit'

const sections: Array<{
  id: SectionId
  label: string
  icon: typeof BookOpen
}> = [
  { id: 'settings', label: 'الإعدادات', icon: ShieldCheck },
  { id: 'accounts', label: 'دليل الحسابات', icon: BookOpen },
  { id: 'periods', label: 'الفترات المالية', icon: CalendarRange },
  { id: 'journals', label: 'القيود اليومية', icon: FilePlus2 },
  { id: 'audit', label: 'سجل التدقيق', icon: History },
]

const accountTypeLabels: Record<AccountingAccount['account_type'], string> = {
  asset: 'أصل',
  liability: 'التزام',
  equity: 'حقوق ملكية',
  revenue: 'إيراد',
  cost: 'تكلفة',
  expense: 'مصروف',
}

const auditActionLabels: Record<string, string> = {
  initialized: 'تهيئة دليل الحسابات',
  updated: 'تحديث الإعدادات',
  created: 'إنشاء',
  closed: 'إقفال فترة',
  posted: 'ترحيل قيد',
  reversed: 'عكس قيد',
}

const auditEntityLabels: Record<string, string> = {
  chart: 'دليل الحسابات',
  settings: 'الإعدادات',
  fiscal_year: 'السنة المالية',
  period: 'الفترة',
  account: 'الحساب',
  journal: 'القيد',
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'حدث خطأ غير متوقع.'
}

function localDateToday() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('ar-YE', {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(date)
}

function formatTimestamp(value: number) {
  return new Intl.DateTimeFormat('ar-YE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

function FormField({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: ReactNode
}) {
  return (
    <div className='grid gap-2'>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

function PanelHeading({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className='flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between'>
      <div>
        <h2 className='text-lg font-semibold'>{title}</h2>
        <p className='mt-1 text-sm leading-6 text-muted-foreground'>
          {description}
        </p>
      </div>
      {action}
    </div>
  )
}

function QueryError({
  error,
  onRetry,
}: {
  error: unknown
  onRetry: () => void
}) {
  return (
    <div
      role='alert'
      className='flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between'
    >
      <div className='flex items-start gap-2 text-sm'>
        <CircleAlert className='mt-0.5 size-4 shrink-0 text-destructive' />
        <p>{errorMessage(error)}</p>
      </div>
      <Button type='button' variant='outline' size='sm' onClick={onRetry}>
        <RefreshCw />
        إعادة المحاولة
      </Button>
    </div>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div
      role='status'
      className='flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground'
    >
      <LoaderCircle className='size-4 animate-spin' />
      {label}
    </div>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className='px-4 py-10 text-center text-sm text-muted-foreground'>
      {children}
    </p>
  )
}

function AccountingSettingsPanel({
  settings,
  saving,
  initializing,
  onSave,
  onInitialize,
}: {
  settings: AccountingSettings
  saving: boolean
  initializing: boolean
  onSave: (settings: Partial<AccountingSettings>) => void
  onInitialize: () => void
}) {
  const [country, setCountry] = useState(settings.country_code ?? '')
  const [currency, setCurrency] = useState(settings.functional_currency ?? '')
  const [timezone, setTimezone] = useState(settings.timezone ?? '')
  const [startDate, setStartDate] = useState(
    settings.accounting_start_date ?? ''
  )
  const [startMonth, setStartMonth] = useState(
    settings.fiscal_year_start_month?.toString() ?? ''
  )
  const [startDay, setStartDay] = useState(
    settings.fiscal_year_start_day?.toString() ?? ''
  )
  const [policyConfirmed, setPolicyConfirmed] = useState(
    settings.policy_confirmed
  )
  const [formError, setFormError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    const month = startMonth ? Number(startMonth) : null
    const day = startDay ? Number(startDay) : null
    if (
      month !== null &&
      (!Number.isInteger(month) || month < 1 || month > 12)
    ) {
      setFormError('أدخل شهرًا بين 1 و12.')
      return
    }
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) {
      setFormError('أدخل يومًا بين 1 و31.')
      return
    }
    onSave({
      country_code: country.trim() ? country.trim().toUpperCase() : null,
      functional_currency: currency.trim()
        ? currency.trim().toUpperCase()
        : null,
      timezone: timezone.trim() || null,
      accounting_start_date: startDate || null,
      fiscal_year_start_month: month,
      fiscal_year_start_day: day,
      policy_confirmed: policyConfirmed,
    })
  }

  return (
    <div className='grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]'>
      <form
        onSubmit={submit}
        className='grid content-start gap-5 rounded-xl border bg-card p-4 sm:p-6'
      >
        <PanelHeading
          title='سياسة المحاسبة'
          description='أدخل القرارات التي اعتمدها نشاطك قبل تسجيل القيود وترحيلها.'
        />
        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField id='accounting-country' label='رمز الدولة (حرفان)'>
            <Input
              id='accounting-country'
              autoComplete='country'
              maxLength={2}
              value={country}
              onChange={(event) => setCountry(event.target.value.toUpperCase())}
              placeholder='مثال: YE'
            />
          </FormField>
          <FormField id='accounting-currency' label='العملة الوظيفية (3 أحرف)'>
            <Input
              id='accounting-currency'
              maxLength={3}
              value={currency}
              onChange={(event) =>
                setCurrency(event.target.value.toUpperCase())
              }
              placeholder='رمز العملة'
              required={policyConfirmed}
            />
          </FormField>
          <FormField id='accounting-start-date' label='تاريخ بداية المحاسبة'>
            <Input
              id='accounting-start-date'
              type='date'
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required={policyConfirmed}
            />
          </FormField>
          <FormField id='accounting-timezone' label='المنطقة الزمنية'>
            <Input
              id='accounting-timezone'
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder='مثال: Asia/Aden'
            />
          </FormField>
          <FormField
            id='fiscal-year-start-month'
            label='شهر بداية السنة المالية'
          >
            <Input
              id='fiscal-year-start-month'
              type='number'
              min={1}
              max={12}
              value={startMonth}
              onChange={(event) => setStartMonth(event.target.value)}
              placeholder='1–12'
            />
          </FormField>
          <FormField id='fiscal-year-start-day' label='يوم بداية السنة المالية'>
            <Input
              id='fiscal-year-start-day'
              type='number'
              min={1}
              max={31}
              value={startDay}
              onChange={(event) => setStartDay(event.target.value)}
              placeholder='1–31'
            />
          </FormField>
        </div>

        <label className='flex items-start gap-3 rounded-lg border p-3 text-sm leading-6'>
          <input
            type='checkbox'
            className='mt-1 size-4 accent-primary'
            checked={policyConfirmed}
            onChange={(event) => setPolicyConfirmed(event.target.checked)}
          />
          <span>
            أؤكد أنني راجعت العملة الوظيفية وتاريخ البداية والسياسات المحاسبية
            الخاصة بنشاطي.
          </span>
        </label>

        {formError && (
          <p role='alert' className='text-sm text-destructive'>
            {formError}
          </p>
        )}
        <div className='flex flex-wrap gap-2'>
          <Button type='submit' disabled={saving}>
            {saving && <LoaderCircle className='animate-spin' />}
            حفظ الإعدادات
          </Button>
        </div>
      </form>

      <aside className='grid content-start gap-4 rounded-xl border bg-muted/30 p-4 sm:p-6'>
        <div>
          <h3 className='font-semibold'>جاهزية الدفتر</h3>
          <p className='mt-1 text-sm leading-6 text-muted-foreground'>
            {settings.policy_confirmed
              ? 'تم اعتماد السياسة. يمكن إنشاء القيود بالعملة الوظيفية.'
              : 'يلزم حفظ العملة وتاريخ البداية واعتماد السياسة قبل ترحيل أي قيد.'}
          </p>
        </div>
        <dl className='grid gap-3 border-y py-4 text-sm sm:grid-cols-2 xl:grid-cols-1'>
          <div className='flex justify-between gap-3'>
            <dt className='text-muted-foreground'>العملة</dt>
            <dd className='font-medium'>
              {settings.functional_currency || 'غير محددة'}
            </dd>
          </div>
          <div className='flex justify-between gap-3'>
            <dt className='text-muted-foreground'>بداية المحاسبة</dt>
            <dd className='font-medium'>
              {settings.accounting_start_date
                ? formatDate(settings.accounting_start_date)
                : 'غير محددة'}
            </dd>
          </div>
          <div className='flex justify-between gap-3'>
            <dt className='text-muted-foreground'>اعتماد السياسة</dt>
            <dd className='font-medium'>
              {settings.policy_confirmed ? 'معتمدة' : 'بانتظار الاعتماد'}
            </dd>
          </div>
          <div className='flex justify-between gap-3'>
            <dt className='text-muted-foreground'>الضرائب</dt>
            <dd className='font-medium'>
              {settings.tax_enabled ? 'مفعلة في الإعدادات' : 'غير مفعلة'}
            </dd>
          </div>
        </dl>
        <p className='text-xs leading-5 text-muted-foreground'>
          لا تتوفر بعد معالجة الضرائب أو الترحيل الآلي للمبيعات. لا تعتمد على
          الشاشة لتحديد سياسات الدولة.
        </p>
        <div className='grid gap-2'>
          <Button
            type='button'
            variant='outline'
            onClick={onInitialize}
            disabled={initializing}
          >
            {initializing ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <BookOpen />
            )}
            تهيئة دليل الحسابات القياسي
          </Button>
          <p className='text-xs leading-5 text-muted-foreground'>
            الإجراء آمن عند التكرار، ويضيف الحسابات النظامية دون حذف الحسابات
            المخصصة.
          </p>
        </div>
      </aside>
    </div>
  )
}

function AccountsPanel({
  accounts,
  loading,
  error,
  onRetry,
  creating,
  onCreate,
}: {
  accounts: AccountingAccount[]
  loading: boolean
  error: unknown
  onRetry: () => void
  creating: boolean
  onCreate: (payload: {
    account_code: string
    name: string
    account_type: AccountingAccount['account_type']
    normal_balance: AccountingAccount['normal_balance']
    is_postable: boolean
    parent_id?: string
  }) => Promise<void>
}) {
  const [accountCode, setAccountCode] = useState('')
  const [name, setName] = useState('')
  const [accountType, setAccountType] =
    useState<AccountingAccount['account_type']>('asset')
  const [normalBalance, setNormalBalance] =
    useState<AccountingAccount['normal_balance']>('debit')
  const [parentId, setParentId] = useState('')
  const [isPostable, setIsPostable] = useState(true)
  const [formError, setFormError] = useState('')
  const parents = accounts.filter(
    (account) =>
      account.account_type === accountType &&
      !account.is_postable &&
      account.is_active
  )
  const parentById = new Map(accounts.map((account) => [account.id, account]))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    try {
      await onCreate({
        account_code: accountCode.trim(),
        name: name.trim(),
        account_type: accountType,
        normal_balance: normalBalance,
        is_postable: isPostable,
        ...(parentId ? { parent_id: parentId } : {}),
      })
      setAccountCode('')
      setName('')
      setParentId('')
      setIsPostable(true)
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  return (
    <div className='grid gap-6 xl:grid-cols-[minmax(18rem,0.7fr)_minmax(0,1.3fr)]'>
      <form
        onSubmit={submit}
        className='grid content-start gap-4 rounded-xl border bg-card p-4 sm:p-5'
      >
        <PanelHeading
          title='إضافة حساب'
          description='أنشئ حسابًا مخصصًا ضمن نوعه المناسب.'
        />
        <FormField id='account-code' label='رمز الحساب'>
          <Input
            id='account-code'
            value={accountCode}
            onChange={(event) => setAccountCode(event.target.value)}
            maxLength={32}
            required
          />
        </FormField>
        <FormField id='account-name' label='اسم الحساب'>
          <Input
            id='account-name'
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
        </FormField>
        <FormField id='account-type' label='نوع الحساب'>
          <select
            id='account-type'
            className='h-9 rounded-md border border-input bg-background px-3 text-sm'
            value={accountType}
            onChange={(event) => {
              const nextType = ACCOUNT_TYPE_VALUES.find(
                (value) => value === event.target.value
              )
              if (nextType) setAccountType(nextType)
              setParentId('')
            }}
          >
            {ACCOUNT_TYPE_VALUES.map((type) => (
              <option key={type} value={type}>
                {accountTypeLabels[type]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id='normal-balance' label='طبيعة الرصيد'>
          <select
            id='normal-balance'
            className='h-9 rounded-md border border-input bg-background px-3 text-sm'
            value={normalBalance}
            onChange={(event) =>
              setNormalBalance(
                event.target.value === 'credit' ? 'credit' : 'debit'
              )
            }
          >
            <option value='debit'>مدين</option>
            <option value='credit'>دائن</option>
          </select>
        </FormField>
        <FormField id='account-parent' label='الحساب الرئيسي (اختياري)'>
          <select
            id='account-parent'
            className='h-9 rounded-md border border-input bg-background px-3 text-sm'
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value=''>بدون حساب رئيسي</option>
            {parents.map((account) => (
              <option key={account.id} value={account.id}>
                {account.account_code} — {account.name}
              </option>
            ))}
          </select>
        </FormField>
        <label className='flex items-center gap-2 text-sm'>
          <input
            type='checkbox'
            className='size-4 accent-primary'
            checked={isPostable}
            onChange={(event) => setIsPostable(event.target.checked)}
          />
          قابل للترحيل
        </label>
        {formError && (
          <p role='alert' className='text-sm text-destructive'>
            {formError}
          </p>
        )}
        <Button type='submit' disabled={creating}>
          {creating ? <LoaderCircle className='animate-spin' /> : <Plus />}
          إضافة الحساب
        </Button>
      </form>

      <section className='min-w-0 rounded-xl border bg-card'>
        <div className='p-4 sm:p-5'>
          <PanelHeading
            title='شجرة الحسابات'
            description='الحسابات التابعة لمساحة التاجر الحالية فقط.'
          />
        </div>
        {error ? (
          <div className='px-4 pb-4'>
            <QueryError error={error} onRetry={onRetry} />
          </div>
        ) : loading ? (
          <LoadingState label='جاري تحميل الحسابات...' />
        ) : accounts.length === 0 ? (
          <EmptyState>
            لم تتم تهيئة دليل الحسابات بعد. استخدم الإجراء من تبويب الإعدادات.
          </EmptyState>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-muted/50 text-muted-foreground'>
                <tr>
                  <th className='px-3 py-3 text-start font-medium'>الرمز</th>
                  <th className='px-3 py-3 text-start font-medium'>الحساب</th>
                  <th className='px-3 py-3 text-start font-medium'>النوع</th>
                  <th className='px-3 py-3 text-start font-medium'>الرصيد</th>
                  <th className='px-3 py-3 text-start font-medium'>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => {
                  const parent = account.parent_id
                    ? parentById.get(account.parent_id)
                    : null
                  return (
                    <tr key={account.id} className='border-t align-top'>
                      <td className='px-3 py-3 font-medium tabular-nums'>
                        {account.account_code}
                      </td>
                      <td className='min-w-40 px-3 py-3'>
                        <span>{account.name}</span>
                        {parent && (
                          <span className='mt-1 block text-xs text-muted-foreground'>
                            ضمن {parent.name}
                          </span>
                        )}
                      </td>
                      <td className='px-3 py-3'>
                        {accountTypeLabels[account.account_type]}
                      </td>
                      <td className='px-3 py-3'>
                        {account.normal_balance === 'debit' ? 'مدين' : 'دائن'}
                      </td>
                      <td className='px-3 py-3'>
                        <span className='inline-flex rounded-full bg-muted px-2 py-1 text-xs'>
                          {account.is_system
                            ? 'نظامي'
                            : account.is_postable
                              ? 'قابل للترحيل'
                              : 'تجميعي'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

const ACCOUNT_TYPE_VALUES: AccountingAccount['account_type'][] = [
  'asset',
  'liability',
  'equity',
  'revenue',
  'cost',
  'expense',
]

function PeriodsPanel({
  periods,
  loading,
  error,
  onRetry,
  creating,
  closing,
  onCreate,
  onClose,
}: {
  periods: AccountingPeriod[]
  loading: boolean
  error: unknown
  onRetry: () => void
  creating: boolean
  closing: boolean
  onCreate: (payload: {
    name: string
    start_date: string
    end_date: string
  }) => Promise<void>
  onClose: (periodId: string) => Promise<void>
}) {
  const [yearName, setYearName] = useState('')
  const [startMonth, setStartMonth] = useState('')
  const [formError, setFormError] = useState('')
  const [periodToClose, setPeriodToClose] = useState<AccountingPeriod | null>(
    null
  )
  const [closeError, setCloseError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    try {
      const dates = fiscalYearDates(startMonth)
      await onCreate({
        name: yearName.trim(),
        ...dates,
      })
      setYearName('')
      setStartMonth('')
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  async function confirmClose() {
    if (!periodToClose) return
    setCloseError('')
    try {
      await onClose(periodToClose.id)
      setPeriodToClose(null)
    } catch (error) {
      setCloseError(errorMessage(error))
    }
  }

  return (
    <>
      <div className='grid gap-6 xl:grid-cols-[minmax(18rem,0.7fr)_minmax(0,1.3fr)]'>
        <form
          onSubmit={submit}
          className='grid content-start gap-4 rounded-xl border bg-card p-4 sm:p-5'
        >
          <PanelHeading
            title='إنشاء سنة مالية'
            description='تنشئ العملية اثنتي عشرة فترة شهرية كاملة من الشهر المحدد.'
          />
          <FormField id='fiscal-year-name' label='اسم السنة المالية'>
            <Input
              id='fiscal-year-name'
              value={yearName}
              onChange={(event) => setYearName(event.target.value)}
              maxLength={64}
              required
            />
          </FormField>
          <FormField id='fiscal-year-month' label='شهر البداية'>
            <Input
              id='fiscal-year-month'
              type='month'
              value={startMonth}
              onChange={(event) => setStartMonth(event.target.value)}
              required
            />
          </FormField>
          {startMonth && (
            <p className='text-sm text-muted-foreground'>
              المدة: {formatDate(fiscalYearDates(startMonth).start_date)} —{' '}
              {formatDate(fiscalYearDates(startMonth).end_date)}
            </p>
          )}
          {formError && (
            <p role='alert' className='text-sm text-destructive'>
              {formError}
            </p>
          )}
          <Button type='submit' disabled={creating}>
            {creating ? <LoaderCircle className='animate-spin' /> : <Plus />}
            إنشاء السنة والفترات
          </Button>
        </form>

        <section className='min-w-0 rounded-xl border bg-card'>
          <div className='p-4 sm:p-5'>
            <PanelHeading
              title='الفترات المحاسبية'
              description='تُقفل الفترة بعد ترحيل قيودها المسودة.'
            />
          </div>
          {error ? (
            <div className='px-4 pb-4'>
              <QueryError error={error} onRetry={onRetry} />
            </div>
          ) : loading ? (
            <LoadingState label='جاري تحميل الفترات...' />
          ) : periods.length === 0 ? (
            <EmptyState>لم تُنشأ سنوات مالية أو فترات بعد.</EmptyState>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead className='bg-muted/50 text-muted-foreground'>
                  <tr>
                    <th className='px-3 py-3 text-start font-medium'>الفترة</th>
                    <th className='px-3 py-3 text-start font-medium'>من</th>
                    <th className='px-3 py-3 text-start font-medium'>إلى</th>
                    <th className='px-3 py-3 text-start font-medium'>الحالة</th>
                    <th className='px-3 py-3 text-start font-medium'>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((period) => (
                    <tr key={period.id} className='border-t'>
                      <td className='px-3 py-3 font-medium'>{period.name}</td>
                      <td className='px-3 py-3'>
                        {formatDate(period.start_date)}
                      </td>
                      <td className='px-3 py-3'>
                        {formatDate(period.end_date)}
                      </td>
                      <td className='px-3 py-3'>
                        <span
                          className={
                            period.status === 'open'
                              ? 'inline-flex rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300'
                              : 'inline-flex rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground'
                          }
                        >
                          {period.status === 'open' ? 'مفتوحة' : 'مغلقة'}
                        </span>
                      </td>
                      <td className='px-3 py-3'>
                        {period.status === 'open' && (
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            onClick={() => setPeriodToClose(period)}
                          >
                            إقفال
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <AlertDialog
        open={Boolean(periodToClose)}
        onOpenChange={(open) => {
          if (!open && !closing) {
            setPeriodToClose(null)
            setCloseError('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إقفال الفترة المحاسبية؟</AlertDialogTitle>
            <AlertDialogDescription>
              {periodToClose?.name} — لن يمكن ترحيل قيود جديدة إلى فترة مغلقة.
              يجب ترحيل المسودات أو حذفها أولًا.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {closeError && (
            <p role='alert' className='text-sm text-destructive'>
              {closeError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closing}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={closing}
              onClick={(event) => {
                event.preventDefault()
                void confirmClose()
              }}
            >
              {closing && <LoaderCircle className='animate-spin' />}
              تأكيد الإقفال
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

type JournalLineDraft = {
  account_id: string
  description: string
  debit: string
  credit: string
}

type JournalPayload = Parameters<typeof createJournalEntry>[0]

function emptyJournalLine(): JournalLineDraft {
  return { account_id: '', description: '', debit: '', credit: '' }
}

function JournalCreateDialog({
  open,
  onOpenChange,
  accounts,
  periods,
  currency,
  creating,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: AccountingAccount[]
  periods: AccountingPeriod[]
  currency: string
  creating: boolean
  onCreate: (payload: JournalPayload) => Promise<void>
}) {
  const [periodId, setPeriodId] = useState('')
  const [entryDate, setEntryDate] = useState(localDateToday())
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<JournalLineDraft[]>([
    emptyJournalLine(),
    emptyJournalLine(),
  ])
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [formError, setFormError] = useState('')
  const openPeriods = periods.filter((period) => period.status === 'open')
  const postableAccounts = accounts.filter(
    (account) => account.is_active && account.is_postable
  )

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      setIdempotencyKey(crypto.randomUUID())
      setPeriodId(openPeriods[0]?.id ?? '')
      setEntryDate(localDateToday())
      setDescription('')
      setLines([emptyJournalLine(), emptyJournalLine()])
      setFormError('')
    }
    onOpenChange(nextOpen)
  }

  function updateLine(
    index: number,
    field: keyof JournalLineDraft,
    value: string
  ) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line
      )
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    try {
      if (!idempotencyKey) throw new Error('أعد فتح نموذج القيد وحاول مجددًا.')
      if (lines.length < 2)
        throw new Error('يجب أن يحتوي القيد على سطرين على الأقل.')
      const normalizedLines = lines.map((line) => {
        if (!line.account_id) throw new Error('اختر حسابًا لكل سطر.')
        const debit = line.debit.trim()
          ? amountToMinorUnits(line.debit, currency)
          : 0
        const credit = line.credit.trim()
          ? amountToMinorUnits(line.credit, currency)
          : 0
        if (Boolean(debit) === Boolean(credit)) {
          throw new Error('أدخل مدينًا أو دائنًا واحدًا فقط لكل سطر.')
        }
        return {
          account_id: line.account_id,
          ...(line.description.trim()
            ? { description: line.description.trim() }
            : {}),
          debit_minor_units: debit,
          credit_minor_units: credit,
        }
      })
      const debitTotal = normalizedLines.reduce(
        (total, line) => total + BigInt(line.debit_minor_units),
        0n
      )
      const creditTotal = normalizedLines.reduce(
        (total, line) => total + BigInt(line.credit_minor_units),
        0n
      )
      if (debitTotal !== creditTotal) {
        throw new Error('إجمالي المدين يجب أن يساوي إجمالي الدائن.')
      }
      await onCreate({
        period_id: periodId,
        entry_date: entryDate,
        description: description.trim(),
        idempotency_key: idempotencyKey,
        currency,
        lines: normalizedLines,
      })
      onOpenChange(false)
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>قيد يومية جديد</DialogTitle>
          <DialogDescription>
            يُحفظ القيد كمسودة. الترحيل خطوة منفصلة بعد اعتماد السياسة.
          </DialogDescription>
        </DialogHeader>
        {openPeriods.length === 0 || postableAccounts.length === 0 ? (
          <div
            role='alert'
            className='rounded-lg border bg-muted/40 p-4 text-sm leading-6'
          >
            {openPeriods.length === 0
              ? 'أنشئ فترة مالية مفتوحة قبل تسجيل القيد.'
              : 'هيّئ دليل الحسابات وأضف حسابًا قابلًا للترحيل قبل تسجيل القيد.'}
          </div>
        ) : (
          <form onSubmit={submit} className='grid gap-4'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <FormField id='journal-period' label='الفترة المفتوحة'>
                <Select value={periodId} onValueChange={setPeriodId}>
                  <SelectTrigger id='journal-period' className='w-full'>
                    <SelectValue placeholder='اختر فترة' />
                  </SelectTrigger>
                  <SelectContent>
                    {openPeriods.map((period) => (
                      <SelectItem key={period.id} value={period.id}>
                        {period.name} ({period.start_date} – {period.end_date})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField id='journal-date' label='تاريخ القيد'>
                <Input
                  id='journal-date'
                  type='date'
                  value={entryDate}
                  onChange={(event) => setEntryDate(event.target.value)}
                  required
                />
              </FormField>
            </div>
            <FormField id='journal-description' label='وصف القيد'>
              <Input
                id='journal-description'
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
                required
              />
            </FormField>
            <div className='grid gap-3'>
              <div className='flex items-center justify-between gap-3'>
                <h3 className='text-sm font-semibold'>أسطر القيد</h3>
                <span className='text-xs text-muted-foreground'>
                  المبالغ بعملة {currency}
                </span>
              </div>
              {lines.map((line, index) => (
                <div
                  key={index}
                  className='grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(10rem,1.3fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)_auto]'
                >
                  <FormField
                    id={`journal-account-${index}`}
                    label={`الحساب ${index + 1}`}
                  >
                    <Select
                      value={line.account_id || 'unselected'}
                      onValueChange={(value) =>
                        updateLine(
                          index,
                          'account_id',
                          value === 'unselected' ? '' : value
                        )
                      }
                    >
                      <SelectTrigger
                        id={`journal-account-${index}`}
                        className='w-full'
                      >
                        <SelectValue placeholder='اختر حسابًا' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='unselected'>اختر حسابًا</SelectItem>
                        {postableAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.account_code} — {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField id={`journal-debit-${index}`} label='مدين'>
                    <Input
                      id={`journal-debit-${index}`}
                      inputMode='decimal'
                      value={line.debit}
                      onChange={(event) =>
                        updateLine(index, 'debit', event.target.value)
                      }
                      placeholder='0'
                    />
                  </FormField>
                  <FormField id={`journal-credit-${index}`} label='دائن'>
                    <Input
                      id={`journal-credit-${index}`}
                      inputMode='decimal'
                      value={line.credit}
                      onChange={(event) =>
                        updateLine(index, 'credit', event.target.value)
                      }
                      placeholder='0'
                    />
                  </FormField>
                  <div className='flex items-end'>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      disabled={lines.length <= 2}
                      aria-label={`حذف السطر ${index + 1}`}
                      onClick={() =>
                        setLines((current) =>
                          current.filter((_, lineIndex) => lineIndex !== index)
                        )
                      }
                    >
                      حذف
                    </Button>
                  </div>
                  <div className='sm:col-span-4'>
                    <FormField
                      id={`journal-line-description-${index}`}
                      label='وصف السطر (اختياري)'
                    >
                      <Input
                        id={`journal-line-description-${index}`}
                        value={line.description}
                        onChange={(event) =>
                          updateLine(index, 'description', event.target.value)
                        }
                        maxLength={500}
                      />
                    </FormField>
                  </div>
                </div>
              ))}
              <Button
                type='button'
                variant='outline'
                className='w-fit'
                onClick={() =>
                  setLines((current) => [...current, emptyJournalLine()])
                }
              >
                <Plus />
                إضافة سطر
              </Button>
            </div>
            {formError && (
              <p role='alert' className='text-sm text-destructive'>
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => onOpenChange(false)}
              >
                إلغاء
              </Button>
              <Button type='submit' disabled={creating || !periodId}>
                {creating && <LoaderCircle className='animate-spin' />}
                حفظ كمسودة
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function JournalsPanel({
  journals,
  periods,
  accounts,
  settings,
  loading,
  error,
  onRetry,
  creating,
  onCreate,
  onPost,
  onReverse,
  merchantScope,
}: {
  journals: JournalEntry[]
  periods: AccountingPeriod[]
  accounts: AccountingAccount[]
  settings: AccountingSettings
  loading: boolean
  error: unknown
  onRetry: () => void
  creating: boolean
  onCreate: (payload: JournalPayload) => Promise<void>
  onPost: (journalId: string) => Promise<void>
  onReverse: (payload: {
    journal_id: string
    period_id: string
    entry_date: string
    reason: string
  }) => Promise<void>
  merchantScope: string
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedJournal, setSelectedJournal] = useState<JournalEntry | null>(
    null
  )
  const [postTarget, setPostTarget] = useState<JournalEntry | null>(null)
  const [reverseTarget, setReverseTarget] = useState<JournalEntry | null>(null)
  const [actionError, setActionError] = useState('')
  const [reversePeriodId, setReversePeriodId] = useState('')
  const [reverseDate, setReverseDate] = useState(localDateToday())
  const [reverseReason, setReverseReason] = useState('')
  const detailsQuery = useQuery({
    queryKey: [
      ...accountingQueryKeys(merchantScope),
      'journal-detail',
      selectedJournal?.id,
    ],
    queryFn: () => fetchJournalEntry(selectedJournal!.id),
    enabled: Boolean(selectedJournal),
  })
  const openPeriods = periods.filter((period) => period.status === 'open')
  const accountsById = new Map(accounts.map((account) => [account.id, account]))

  async function confirmPost() {
    if (!postTarget) return
    setActionError('')
    try {
      await onPost(postTarget.id)
      setPostTarget(null)
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  function openReverse(entry: JournalEntry) {
    setActionError('')
    setReversePeriodId(openPeriods[0]?.id ?? '')
    setReverseDate(localDateToday())
    setReverseReason('')
    setReverseTarget(entry)
  }

  async function submitReverse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reverseTarget) return
    setActionError('')
    try {
      await onReverse({
        journal_id: reverseTarget.id,
        period_id: reversePeriodId,
        entry_date: reverseDate,
        reason: reverseReason.trim(),
      })
      setReverseTarget(null)
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  return (
    <>
      <section className='rounded-xl border bg-card'>
        <div className='p-4 sm:p-5'>
          <PanelHeading
            title='دفتر القيود'
            description='تُنشأ القيود كمسودات متوازنة، ثم تُرحّل صراحةً إلى فترة مفتوحة.'
            action={
              <Button
                type='button'
                onClick={() => setCreateOpen(true)}
                disabled={!settings.functional_currency}
              >
                <Plus />
                قيد جديد
              </Button>
            }
          />
          {!settings.functional_currency && (
            <p className='mt-3 text-sm text-amber-700 dark:text-amber-300'>
              حدد العملة الوظيفية في الإعدادات قبل إنشاء القيود.
            </p>
          )}
        </div>
        {error ? (
          <div className='px-4 pb-4'>
            <QueryError error={error} onRetry={onRetry} />
          </div>
        ) : loading ? (
          <LoadingState label='جاري تحميل القيود...' />
        ) : journals.length === 0 ? (
          <EmptyState>لا توجد قيود محاسبية بعد.</EmptyState>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-muted/50 text-muted-foreground'>
                <tr>
                  <th className='px-3 py-3 text-start font-medium'>الرقم</th>
                  <th className='px-3 py-3 text-start font-medium'>التاريخ</th>
                  <th className='px-3 py-3 text-start font-medium'>الوصف</th>
                  <th className='px-3 py-3 text-start font-medium'>العملة</th>
                  <th className='px-3 py-3 text-start font-medium'>الحالة</th>
                  <th className='px-3 py-3 text-start font-medium'>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {journals.map((entry) => (
                  <tr key={entry.id} className='border-t'>
                    <td className='px-3 py-3 font-medium tabular-nums'>
                      {entry.journal_number}
                    </td>
                    <td className='px-3 py-3'>
                      {formatDate(entry.entry_date)}
                    </td>
                    <td className='max-w-64 truncate px-3 py-3'>
                      {entry.description}
                    </td>
                    <td className='px-3 py-3'>{entry.currency}</td>
                    <td className='px-3 py-3'>
                      <span className='inline-flex rounded-full bg-muted px-2 py-1 text-xs'>
                        {entry.status === 'posted' ? 'مرحّل' : 'مسودة'}
                      </span>
                    </td>
                    <td className='px-3 py-3'>
                      <div className='flex flex-wrap gap-1'>
                        <Button
                          type='button'
                          size='sm'
                          variant='ghost'
                          onClick={() => setSelectedJournal(entry)}
                        >
                          عرض
                        </Button>
                        {entry.status === 'draft' && (
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={!settings.policy_confirmed}
                            onClick={() => {
                              setActionError('')
                              setPostTarget(entry)
                            }}
                          >
                            ترحيل
                          </Button>
                        )}
                        {entry.status === 'posted' && (
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={openPeriods.length === 0}
                            onClick={() => openReverse(entry)}
                          >
                            عكس
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <JournalCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        accounts={accounts}
        periods={periods}
        currency={settings.functional_currency ?? ''}
        creating={creating}
        onCreate={onCreate}
      />

      <Dialog
        open={Boolean(selectedJournal)}
        onOpenChange={(open) => {
          if (!open) setSelectedJournal(null)
        }}
      >
        <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>
              {detailsQuery.data?.journal_number ??
                selectedJournal?.journal_number ??
                'تفاصيل القيد'}
            </DialogTitle>
            <DialogDescription>
              {detailsQuery.data?.description ?? selectedJournal?.description}
            </DialogDescription>
          </DialogHeader>
          {detailsQuery.error ? (
            <QueryError
              error={detailsQuery.error}
              onRetry={() => void detailsQuery.refetch()}
            />
          ) : detailsQuery.isPending ? (
            <LoadingState label='جاري تحميل تفاصيل القيد...' />
          ) : detailsQuery.data ? (
            <div className='grid gap-4'>
              <dl className='grid gap-2 text-sm sm:grid-cols-3'>
                <div>
                  <dt className='text-muted-foreground'>التاريخ</dt>
                  <dd>{formatDate(detailsQuery.data.entry_date)}</dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>الحالة</dt>
                  <dd>
                    {detailsQuery.data.status === 'posted' ? 'مرحّل' : 'مسودة'}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>العملة</dt>
                  <dd>{detailsQuery.data.currency}</dd>
                </div>
              </dl>
              <div className='overflow-x-auto rounded-lg border'>
                <table className='w-full text-sm'>
                  <thead className='bg-muted/50'>
                    <tr>
                      <th className='px-3 py-2 text-start font-medium'>
                        الحساب
                      </th>
                      <th className='px-3 py-2 text-start font-medium'>مدين</th>
                      <th className='px-3 py-2 text-start font-medium'>دائن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailsQuery.data.lines?.map((line) => {
                      const account = accountsById.get(line.account_id)
                      return (
                        <tr
                          key={line.id ?? line.line_number}
                          className='border-t'
                        >
                          <td className='px-3 py-2'>
                            {account
                              ? `${account.account_code} — ${account.name}`
                              : line.account_id}
                            {line.description && (
                              <span className='mt-1 block text-xs text-muted-foreground'>
                                {line.description}
                              </span>
                            )}
                          </td>
                          <td className='px-3 py-2 tabular-nums'>
                            {formatMinorUnits(
                              line.debit_minor_units,
                              detailsQuery.data.currency
                            )}
                          </td>
                          <td className='px-3 py-2 tabular-nums'>
                            {formatMinorUnits(
                              line.credit_minor_units,
                              detailsQuery.data.currency
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(postTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setPostTarget(null)
            setActionError('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ترحيل القيد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيصبح القيد نهائيًا وغير قابل للتعديل أو الحذف. التصحيح لاحقًا
              يكون بقيد عكسي.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && (
            <p role='alert' className='text-sm text-destructive'>
              {actionError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void confirmPost()
              }}
            >
              تأكيد الترحيل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={Boolean(reverseTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setReverseTarget(null)
            setActionError('')
          }
        }}
      >
        <DialogContent>
          <form onSubmit={submitReverse} className='grid gap-4'>
            <DialogHeader>
              <DialogTitle>عكس قيد مرحّل</DialogTitle>
              <DialogDescription>
                سينشأ قيد عكسي مرحّل فورًا. اختر فترة مفتوحة وتاريخًا مناسبًا،
                واكتب سبب العكس.
              </DialogDescription>
            </DialogHeader>
            {openPeriods.length === 0 ? (
              <p role='alert' className='text-sm text-destructive'>
                لا توجد فترة مفتوحة يمكن تسجيل القيد العكسي فيها.
              </p>
            ) : (
              <>
                <FormField id='reverse-period' label='الفترة المفتوحة'>
                  <Select
                    value={reversePeriodId}
                    onValueChange={setReversePeriodId}
                  >
                    <SelectTrigger id='reverse-period' className='w-full'>
                      <SelectValue placeholder='اختر فترة' />
                    </SelectTrigger>
                    <SelectContent>
                      {openPeriods.map((period) => (
                        <SelectItem key={period.id} value={period.id}>
                          {period.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField id='reverse-date' label='تاريخ القيد العكسي'>
                  <Input
                    id='reverse-date'
                    type='date'
                    value={reverseDate}
                    onChange={(event) => setReverseDate(event.target.value)}
                    required
                  />
                </FormField>
                <FormField id='reverse-reason' label='سبب العكس'>
                  <Input
                    id='reverse-reason'
                    value={reverseReason}
                    onChange={(event) => setReverseReason(event.target.value)}
                    maxLength={500}
                    required
                  />
                </FormField>
              </>
            )}
            {actionError && (
              <p role='alert' className='text-sm text-destructive'>
                {actionError}
              </p>
            )}
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setReverseTarget(null)}
              >
                إلغاء
              </Button>
              <Button
                type='submit'
                disabled={!openPeriods.length || !reversePeriodId}
              >
                إنشاء القيد العكسي
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function AuditPanel({
  events,
  loading,
  error,
  onRetry,
}: {
  events: AccountingAuditEvent[]
  loading: boolean
  error: unknown
  onRetry: () => void
}) {
  return (
    <section className='rounded-xl border bg-card'>
      <div className='p-4 sm:p-5'>
        <PanelHeading
          title='سجل التدقيق'
          description='أحدث الإجراءات المحاسبية المسجلة لمساحة التاجر.'
        />
      </div>
      {error ? (
        <div className='px-4 pb-4'>
          <QueryError error={error} onRetry={onRetry} />
        </div>
      ) : loading ? (
        <LoadingState label='جاري تحميل سجل التدقيق...' />
      ) : events.length === 0 ? (
        <EmptyState>لا توجد أحداث محاسبية مسجلة بعد.</EmptyState>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 text-muted-foreground'>
              <tr>
                <th className='px-3 py-3 text-start font-medium'>الوقت</th>
                <th className='px-3 py-3 text-start font-medium'>العنصر</th>
                <th className='px-3 py-3 text-start font-medium'>الإجراء</th>
                <th className='px-3 py-3 text-start font-medium'>التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className='border-t align-top'>
                  <td className='px-3 py-3 tabular-nums'>
                    {formatTimestamp(event.created_at)}
                  </td>
                  <td className='px-3 py-3'>
                    {auditEntityLabels[event.entity_type] ?? event.entity_type}
                  </td>
                  <td className='px-3 py-3'>
                    {auditActionLabels[event.action] ?? event.action}
                  </td>
                  <td className='min-w-48 px-3 py-3'>
                    <pre className='max-w-xl overflow-x-auto font-sans text-xs break-all whitespace-pre-wrap text-muted-foreground'>
                      {JSON.stringify(event.details)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function Accounting() {
  const merchantId = useMerchantIdentity()
  const merchantScope = merchantId || 'unavailable'
  const queryClient = useQueryClient()
  const [activeSection, setActiveSection] = useState<SectionId>('settings')
  const enabled = Boolean(merchantId)
  const settingsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantScope), 'settings'],
    queryFn: fetchAccountingSettings,
    enabled,
  })
  const accountsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantScope), 'accounts'],
    queryFn: fetchAccounts,
    enabled: enabled && ['accounts', 'journals'].includes(activeSection),
  })
  const periodsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantScope), 'periods'],
    queryFn: fetchPeriods,
    enabled: enabled && ['periods', 'journals'].includes(activeSection),
  })
  const journalsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantScope), 'journals'],
    queryFn: fetchJournalEntries,
    enabled: enabled && activeSection === 'journals',
  })
  const auditQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantScope), 'audit'],
    queryFn: fetchAccountingAuditLog,
    enabled: enabled && activeSection === 'audit',
  })

  async function refreshAccounting() {
    await queryClient.invalidateQueries({
      queryKey: accountingQueryKeys(merchantScope),
    })
  }

  const saveSettingsMutation = useMutation({
    mutationFn: saveAccountingSettings,
    onSuccess: async () => {
      await refreshAccounting()
      toast.success('تم حفظ إعدادات المحاسبة.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const initializeMutation = useMutation({
    mutationFn: initializeAccounting,
    onSuccess: async () => {
      await refreshAccounting()
      toast.success('تمت تهيئة دليل الحسابات.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const createAccountMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: async () => {
      await refreshAccounting()
      toast.success('تم إنشاء الحساب.')
    },
  })
  const createFiscalYearMutation = useMutation({
    mutationFn: createFiscalYear,
    onSuccess: async () => {
      await refreshAccounting()
      toast.success('تم إنشاء السنة المالية وفتراتها.')
    },
  })
  const closePeriodMutation = useMutation({
    mutationFn: closeAccountingPeriod,
    onSuccess: async () => {
      await refreshAccounting()
      toast.success('تم إقفال الفترة.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const createJournalMutation = useMutation({
    mutationFn: createJournalEntry,
    onSuccess: async () => {
      await refreshAccounting()
      toast.success('تم حفظ القيد كمسودة.')
    },
  })
  const postJournalMutation = useMutation({
    mutationFn: postJournalEntry,
    onSuccess: async () => {
      await refreshAccounting()
      toast.success('تم ترحيل القيد.')
    },
  })
  const reverseJournalMutation = useMutation({
    mutationFn: reverseJournalEntry,
    onSuccess: async () => {
      await refreshAccounting()
      toast.success('تم إنشاء القيد العكسي وترحيله.')
    },
  })

  const settings = settingsQuery.data
  const sectionContent = () => {
    if (settingsQuery.isPending) {
      return <LoadingState label='جاري تحميل إعدادات المحاسبة...' />
    }
    if (settingsQuery.error || !settings) {
      return (
        <QueryError
          error={
            settingsQuery.error ?? new Error('تعذر تحميل إعدادات المحاسبة.')
          }
          onRetry={() => void settingsQuery.refetch()}
        />
      )
    }

    switch (activeSection) {
      case 'settings':
        return (
          <AccountingSettingsPanel
            settings={settings}
            saving={saveSettingsMutation.isPending}
            initializing={initializeMutation.isPending}
            onSave={(payload) => saveSettingsMutation.mutate(payload)}
            onInitialize={() => initializeMutation.mutate()}
          />
        )
      case 'accounts':
        return (
          <AccountsPanel
            accounts={accountsQuery.data ?? []}
            loading={accountsQuery.isPending}
            error={accountsQuery.error}
            onRetry={() => void accountsQuery.refetch()}
            creating={createAccountMutation.isPending}
            onCreate={(payload) =>
              createAccountMutation.mutateAsync(payload).then(() => undefined)
            }
          />
        )
      case 'periods':
        return (
          <PeriodsPanel
            periods={periodsQuery.data ?? []}
            loading={periodsQuery.isPending}
            error={periodsQuery.error}
            onRetry={() => void periodsQuery.refetch()}
            creating={createFiscalYearMutation.isPending}
            closing={closePeriodMutation.isPending}
            onCreate={(payload) =>
              createFiscalYearMutation.mutateAsync(payload).then(() => undefined)
            }
            onClose={(periodId) =>
              closePeriodMutation.mutateAsync(periodId).then(() => undefined)
            }
          />
        )
      case 'journals':
        return (
          <JournalsPanel
            journals={journalsQuery.data ?? []}
            periods={periodsQuery.data ?? []}
            accounts={accountsQuery.data ?? []}
            settings={settings}
            loading={
              accountsQuery.isPending ||
              periodsQuery.isPending ||
              journalsQuery.isPending
            }
            error={
              accountsQuery.error || periodsQuery.error || journalsQuery.error
            }
            onRetry={() => {
              void accountsQuery.refetch()
              void periodsQuery.refetch()
              void journalsQuery.refetch()
            }}
            creating={createJournalMutation.isPending}
            onCreate={(payload) =>
              createJournalMutation.mutateAsync(payload).then(() => undefined)
            }
            onPost={(journalId) =>
              postJournalMutation.mutateAsync(journalId).then(() => undefined)
            }
            onReverse={(payload) =>
              reverseJournalMutation.mutateAsync(payload).then(() => undefined)
            }
            merchantScope={merchantScope}
          />
        )
      case 'audit':
        return (
          <AuditPanel
            events={auditQuery.data ?? []}
            loading={auditQuery.isPending}
            error={auditQuery.error}
            onRetry={() => void auditQuery.refetch()}
          />
        )
    }
  }

  return (
    <>
      <MerchantWorkspaceHeader />
      <Main className='merchant-content'>
        <div className='space-y-6'>
          <MerchantPageHeading
            title='المحاسبة'
            description='إعداد الدفتر العام، وإدارة الفترات والقيود بسجل واضح للتغييرات.'
          />

          {!settingsQuery.isPending && settingsQuery.data && (
            <section
              aria-label='حالة جاهزية المحاسبة'
              className='flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5'
            >
              <div className='flex items-start gap-3'>
                <span className='grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary'>
                  <ShieldCheck className='size-5' aria-hidden='true' />
                </span>
                <div>
                  <h2 className='font-semibold'>
                    {settingsQuery.data.policy_confirmed
                      ? 'السياسة المحاسبية معتمدة'
                      : 'أكمل إعداد السياسة المحاسبية'}
                  </h2>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    العملة الوظيفية:{' '}
                    {settingsQuery.data.functional_currency || 'غير محددة'}
                    {' · '}
                    بداية النظام:{' '}
                    {settingsQuery.data.accounting_start_date
                      ? formatDate(settingsQuery.data.accounting_start_date)
                      : 'غير محددة'}
                  </p>
                </div>
              </div>
              {!settingsQuery.data.policy_confirmed && (
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setActiveSection('settings')}
                >
                  مراجعة الإعدادات
                </Button>
              )}
            </section>
          )}

          <nav
            aria-label='أقسام المحاسبة'
            className='flex gap-1 overflow-x-auto border-b'
          >
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type='button'
                aria-current={activeSection === id ? 'page' : undefined}
                onClick={() => setActiveSection(id)}
                className={
                  activeSection === id
                    ? 'flex shrink-0 items-center gap-2 border-b-2 border-primary px-3 py-3 text-sm font-semibold text-foreground'
                    : 'flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground'
                }
              >
                <Icon className='size-4' aria-hidden='true' />
                {label}
              </button>
            ))}
          </nav>

          <div>{sectionContent()}</div>
        </div>
      </Main>
    </>
  )
}
