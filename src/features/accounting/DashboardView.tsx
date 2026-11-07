import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Boxes,
  CheckCircle2,
  CircleAlert,
  FilePlus2,
  Scale,
  ShoppingBag,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from 'lucide-react'
import { useMerchantIdentity } from '@/hooks/useMerchantRealtime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { AccountingTabId } from './AccountingLayout'
import {
  accountingQueryKeys,
  fetchAccountingSettings,
  fetchBalanceSheet,
  fetchJournalEntries,
  fetchProfitLoss,
  fetchTrialBalance,
  formatMinorUnits,
} from './accounting-data'

export function DashboardView({
  onNavigate,
}: {
  onNavigate?: (tab: AccountingTabId) => void
} = {}) {
  const merchantId = useMerchantIdentity()

  const settingsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'settings'],
    queryFn: fetchAccountingSettings,
    enabled: Boolean(merchantId),
  })

  const plQuery = useQuery({
    queryKey: [
      ...accountingQueryKeys(merchantId || ''),
      'profit-loss-dashboard',
    ],
    queryFn: () => fetchProfitLoss(),
    enabled: Boolean(merchantId),
  })

  const bsQuery = useQuery({
    queryKey: [
      ...accountingQueryKeys(merchantId || ''),
      'balance-sheet-dashboard',
    ],
    queryFn: () => fetchBalanceSheet(),
    enabled: Boolean(merchantId),
  })

  const tbQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'trial-balance'],
    queryFn: () => fetchTrialBalance(),
    enabled: Boolean(merchantId),
  })

  const journalsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'journals-dashboard'],
    queryFn: fetchJournalEntries,
    enabled: Boolean(merchantId),
  })

  const pl = plQuery.data
  const bs = bsQuery.data
  const tb = tbQuery.data
  const journals = journalsQuery.data
  const currency = settingsQuery.data?.functional_currency
  const isBalanced = tb?.is_balanced
  const errors = [
    settingsQuery,
    plQuery,
    bsQuery,
    tbQuery,
    journalsQuery,
  ].filter((query) => query.isError)
  const error = errors.find((query) => query.error instanceof Error)?.error
  const errorMessage =
    error instanceof Error
      ? error.message
      : 'تعذر تحميل بعض بيانات المؤشرات المالية.'

  // حساب النقدية والذمم من ميزان المراجعة
  const cashAccounts =
    tb?.accounts.filter((a) =>
      ['1100', '1110', '1120'].includes(a.account_code)
    ) || []
  const totalCash = cashAccounts.reduce(
    (sum, a) => sum + (a.ending_debit - a.ending_credit),
    0
  )

  const arAccounts =
    tb?.accounts.filter((a) => ['1130', '1200'].includes(a.account_code)) || []
  const totalAR = arAccounts.reduce(
    (sum, a) => sum + (a.ending_debit - a.ending_credit),
    0
  )

  const apAccounts =
    tb?.accounts.filter((a) => ['2100'].includes(a.account_code)) || []
  const totalAP = apAccounts.reduce(
    (sum, a) => sum + (a.ending_credit - a.ending_debit),
    0
  )

  const totalAssets = bs?.total_assets
  const totalLiabilities = bs?.total_liabilities
  const totalEquity = bs?.total_equity

  const totalRevenue = pl?.total_revenue
  const totalCost = pl?.total_cost
  const grossProfit = pl?.gross_profit
  const totalExpense = pl?.total_expense
  const netProfit = pl?.net_profit
  const unavailable = '—'
  const formattedAmount = (value: number | undefined) =>
    value === undefined || !currency
      ? unavailable
      : formatMinorUnits(value, currency)

  return (
    <div className='space-y-6'>
      {errors.length > 0 && (
        <div
          role='alert'
          className='flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between'
        >
          <div>
            <p className='font-semibold text-destructive'>
              تعذر تحميل بعض بيانات المحاسبة
            </p>
            <p className='mt-1 text-sm text-muted-foreground'>{errorMessage}</p>
          </div>
          <Button
            variant='outline'
            onClick={() => {
              void Promise.all([
                settingsQuery.refetch(),
                plQuery.refetch(),
                bsQuery.refetch(),
                tbQuery.refetch(),
                journalsQuery.refetch(),
              ])
            }}
          >
            إعادة المحاولة
          </Button>
        </div>
      )}
      {/* بطاقة تنبيه التوازن المحاسبي */}
      <div
        className={`flex flex-col items-start justify-between gap-4 rounded-xl border p-4 md:flex-row md:items-center ${
          isBalanced === undefined
            ? 'border-border bg-muted/40 text-muted-foreground'
            : isBalanced
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
        }`}
      >
        <div className='flex items-center gap-3'>
          {isBalanced === undefined ? (
            <div className='rounded-lg bg-muted p-2 text-muted-foreground'>
              <Scale className='size-6' />
            </div>
          ) : isBalanced ? (
            <div className='rounded-lg bg-emerald-500/20 p-2 text-emerald-600'>
              <CheckCircle2 className='size-6' />
            </div>
          ) : (
            <div className='rounded-lg bg-destructive/20 p-2 text-destructive'>
              <CircleAlert className='size-6' />
            </div>
          )}
          <div>
            <h4 className='text-base font-bold'>
              {isBalanced === undefined
                ? tbQuery.isPending
                  ? 'جارٍ التحقق من ميزان المراجعة'
                  : 'تعذر التحقق من ميزان المراجعة'
                : isBalanced
                  ? 'النظام المحاسبي متوازن بالكامل (Total Debits = Total Credits)'
                  : 'تحذير: يوجد عدم توازن في إجمالي المدين والدائن'}
            </h4>
            <p className='text-sm opacity-90'>
              {isBalanced === undefined
                ? 'لن نعرض حالة التوازن قبل استلام ميزان المراجعة من الخادم.'
                : isBalanced
                  ? `المعادلة المحاسبية الأساسية متحققة: الأصول (${formattedAmount(totalAssets)}) = الالتزامات (${formattedAmount(totalLiabilities)}) + حقوق الملكية (${formattedAmount(totalEquity)})`
                  : 'يُرجى مراجعة قيود اليومية وميزان المراجعة لمعالجة الفروقات غير المرحّلة.'}
            </p>
          </div>
        </div>

        <div className='flex shrink-0 items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onNavigate?.('trial-balance')}
          >
            <Scale className='ml-1.5 size-4' />
            <span>ميزان المراجعة</span>
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onNavigate?.('reports')}
          >
            <BarChart3 className='ml-1.5 size-4' />
            <span>القوائم المالية</span>
          </Button>
        </div>
      </div>

      {/* المؤشرات المالية الرئيسية (Key Financial KPIs) */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {/* صافي الربح / الخسارة */}
        <Card className='shadow-xs'>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              صافي الأرباح (Net Profit)
            </CardTitle>
            <div
              className={`rounded-lg p-2 ${netProfit === undefined ? 'bg-muted text-muted-foreground' : netProfit >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive'}`}
            >
              {netProfit === undefined ? (
                <TrendingUp className='size-4' />
              ) : netProfit >= 0 ? (
                <TrendingUp className='size-4' />
              ) : (
                <TrendingDown className='size-4' />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${netProfit === undefined ? 'text-muted-foreground' : netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}
            >
              {netProfit === undefined
                ? unavailable
                : formattedAmount(Math.abs(netProfit))}
              {netProfit !== undefined && netProfit < 0 && ' (خسارة)'}
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              إجمالي الإيرادات: {formattedAmount(totalRevenue)}
            </p>
          </CardContent>
        </Card>

        {/* النقدية المتاحة في الصناديق والبنوك */}
        <Card className='shadow-xs'>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              النقدية والبنوك (Available Cash)
            </CardTitle>
            <div className='rounded-lg bg-blue-500/10 p-2 text-blue-600'>
              <Wallet className='size-4' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-foreground'>
              {tb ? formattedAmount(totalCash) : unavailable}
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              الأرصدة الحقيقية المشتقة من سطور القيود
            </p>
          </CardContent>
        </Card>

        {/* ديون العملاء (الذمم المدينة) */}
        <Card className='shadow-xs'>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              الذمم المدينة (Accounts Receivable)
            </CardTitle>
            <div className='rounded-lg bg-amber-500/10 p-2 text-amber-600'>
              <Users className='size-4' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-amber-600 dark:text-amber-400'>
              {tb ? formattedAmount(totalAR) : unavailable}
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              مستحقات على العملاء والبيوع الآجلة
            </p>
          </CardContent>
        </Card>

        {/* مستحقات الموردين (الذمم الدائنة) */}
        <Card className='shadow-xs'>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              الذمم الدائنة (Accounts Payable)
            </CardTitle>
            <div className='rounded-lg bg-purple-500/10 p-2 text-purple-600'>
              <Truck className='size-4' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-purple-600 dark:text-purple-400'>
              {tb ? formattedAmount(totalAP) : unavailable}
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              التزامات قائمة لموردي البضائع
            </p>
          </CardContent>
        </Card>
      </div>

      {/* تفاصيل المبيعات والتكاليف والميزانية */}
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
        {/* قائمة الدخل المختصرة */}
        <Card className='shadow-xs lg:col-span-2'>
          <CardHeader>
            <CardTitle className='flex items-center justify-between text-base'>
              <span>ملخص الأداء المالي (Income Statement Summary)</span>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => onNavigate?.('reports')}
              >
                التفاصيل كاملة
              </Button>
            </CardTitle>
            <CardDescription>
              حساب الإيرادات وتكلفة البضاعة المباعة والمصروفات التشغيلية
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              <div className='flex items-center justify-between border-b py-2'>
                <div className='flex items-center gap-2'>
                  <div className='size-2.5 rounded-full bg-emerald-500' />
                  <span className='text-sm font-medium'>
                    إجمالي الإيرادات والمبيعات
                  </span>
                </div>
                <span className='text-sm font-bold text-emerald-600 dark:text-emerald-400'>
                  {totalRevenue === undefined
                    ? unavailable
                    : `+${formattedAmount(totalRevenue)}`}
                </span>
              </div>

              <div className='flex items-center justify-between border-b py-2'>
                <div className='flex items-center gap-2'>
                  <div className='size-2.5 rounded-full bg-orange-500' />
                  <span className='text-sm font-medium'>
                    تكلفة البضاعة المباعة (COGS)
                  </span>
                </div>
                <span className='text-sm font-bold text-orange-600 dark:text-orange-400'>
                  {totalCost === undefined
                    ? unavailable
                    : `-${formattedAmount(totalCost)}`}
                </span>
              </div>

              <div className='flex items-center justify-between rounded-lg border-b bg-muted/40 px-3 py-2'>
                <span className='text-sm font-semibold'>
                  إجمالي الربح (Gross Profit)
                </span>
                <span className='text-sm font-bold'>
                  {formattedAmount(grossProfit)}
                </span>
              </div>

              <div className='flex items-center justify-between border-b py-2'>
                <div className='flex items-center gap-2'>
                  <div className='size-2.5 rounded-full bg-rose-500' />
                  <span className='text-sm font-medium'>
                    المصروفات التشغيلية والإدارية
                  </span>
                </div>
                <span className='text-sm font-bold text-rose-600 dark:text-rose-400'>
                  {totalExpense === undefined
                    ? unavailable
                    : `-${formattedAmount(totalExpense)}`}
                </span>
              </div>

              <div
                className={`flex items-center justify-between rounded-lg px-3 py-3 text-base font-bold ${
                  netProfit === undefined
                    ? 'bg-muted text-muted-foreground'
                    : netProfit >= 0
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'bg-destructive/10 text-destructive'
                }`}
              >
                <span>صافي الدخل النهائي (Net Income)</span>
                <span>
                  {netProfit === undefined
                    ? unavailable
                    : `${formattedAmount(Math.abs(netProfit))}${netProfit < 0 ? ' (خسارة)' : ''}`}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* الميزانية العمومية والمركز المالي */}
        <Card className='shadow-xs'>
          <CardHeader>
            <CardTitle className='text-base'>
              المركز المالي (Balance Sheet)
            </CardTitle>
            <CardDescription>
              الأصول مقابل الالتزامات وحقوق الملكية
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='rounded-lg border border-blue-500/20 bg-blue-500/10 p-3'>
              <div className='text-xs font-medium text-blue-700 dark:text-blue-300'>
                إجمالي الأصول (Assets)
              </div>
              <div className='mt-0.5 text-xl font-bold text-blue-900 dark:text-blue-100'>
                {formattedAmount(totalAssets)}
              </div>
            </div>

            <div className='rounded-lg border border-purple-500/20 bg-purple-500/10 p-3'>
              <div className='text-xs font-medium text-purple-700 dark:text-purple-300'>
                إجمالي الالتزامات (Liabilities)
              </div>
              <div className='mt-0.5 text-xl font-bold text-purple-900 dark:text-purple-100'>
                {formattedAmount(totalLiabilities)}
              </div>
            </div>

            <div className='rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3'>
              <div className='text-xs font-medium text-emerald-700 dark:text-emerald-300'>
                إجمالي حقوق الملكية (Equity)
              </div>
              <div className='mt-0.5 text-xl font-bold text-emerald-900 dark:text-emerald-100'>
                {formattedAmount(totalEquity)}
              </div>
            </div>

            <div className='pt-2 text-center'>
              <Button
                variant='outline'
                size='sm'
                className='w-full'
                onClick={() => onNavigate?.('reports')}
              >
                عرض الميزانية العمومية كاملة
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* الروابط السريعة لإجراء العمليات */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6'>
        <Button
          variant='outline'
          className='flex h-auto flex-col items-center gap-2 py-3'
          onClick={() => onNavigate?.('sales')}
        >
          <ShoppingBag className='size-5 text-emerald-600' />
          <span className='text-xs font-semibold'>فاتورة مبيعات</span>
        </Button>

        <Button
          variant='outline'
          className='flex h-auto flex-col items-center gap-2 py-3'
          onClick={() => onNavigate?.('purchases')}
        >
          <ShoppingCart className='size-5 text-blue-600' />
          <span className='text-xs font-semibold'>فاتورة مشتريات</span>
        </Button>

        <Button
          variant='outline'
          className='flex h-auto flex-col items-center gap-2 py-3'
          onClick={() => onNavigate?.('cash')}
        >
          <ArrowDownLeft className='size-5 text-emerald-500' />
          <span className='text-xs font-semibold'>سند قبض</span>
        </Button>

        <Button
          variant='outline'
          className='flex h-auto flex-col items-center gap-2 py-3'
          onClick={() => onNavigate?.('cash')}
        >
          <ArrowUpRight className='size-5 text-rose-500' />
          <span className='text-xs font-semibold'>سند صرف</span>
        </Button>

        <Button
          variant='outline'
          className='flex h-auto flex-col items-center gap-2 py-3'
          onClick={() => onNavigate?.('journal-entries')}
        >
          <FilePlus2 className='size-5 text-amber-500' />
          <span className='text-xs font-semibold'>قيد يومية يدوي</span>
        </Button>

        <Button
          variant='outline'
          className='flex h-auto flex-col items-center gap-2 py-3'
          onClick={() => onNavigate?.('inventory')}
        >
          <Boxes className='size-5 text-indigo-500' />
          <span className='text-xs font-semibold'>تقييم المخزون</span>
        </Button>
      </div>

      {/* أحدث القيود المحاسبية */}
      <Card className='shadow-xs'>
        <CardHeader className='flex flex-row items-center justify-between'>
          <div>
            <CardTitle className='text-base'>
              أحدث قيود اليومية (Recent Journals)
            </CardTitle>
            <CardDescription>
              القيود المحاسبية المسجلة والمرحّلة في النظام
            </CardDescription>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onNavigate?.('journal-entries')}
          >
            عرض كافة القيود
            {journals && ` (${journals.length.toLocaleString('ar-YE')})`}
          </Button>
        </CardHeader>
        <CardContent>
          {journalsQuery.isPending ? (
            <div
              className='grid gap-3 py-4'
              role='status'
              aria-label='جارٍ تحميل قيود اليومية'
            >
              <div className='h-9 rounded-md bg-muted/60' />
              <div className='h-9 rounded-md bg-muted/60' />
            </div>
          ) : journalsQuery.isError ? (
            <div className='py-8 text-center' role='alert'>
              <p className='text-sm text-destructive'>
                تعذر تحميل قيود اليومية.
              </p>
              <Button
                className='mt-3'
                variant='outline'
                onClick={() => void journalsQuery.refetch()}
              >
                إعادة المحاولة
              </Button>
            </div>
          ) : journals?.length === 0 ? (
            <div className='py-8 text-center text-muted-foreground'>
              <BookOpen className='mx-auto mb-2 size-8 opacity-50' />
              <p>
                لا توجد قيود مسجلة بعد. ابدأ بتسجيل أول قيد محاسبي أو بيع منتج.
              </p>
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-right text-sm'>
                <thead className='border-b bg-muted/50 text-xs text-muted-foreground uppercase'>
                  <tr>
                    <th className='px-3 py-2.5'>رقم القيد</th>
                    <th className='px-3 py-2.5'>التاريخ</th>
                    <th className='px-3 py-2.5'>البيان والوصف</th>
                    <th className='px-3 py-2.5'>المصدر</th>
                    <th className='px-3 py-2.5'>الحالة</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-border/60'>
                  {journals?.slice(0, 5).map((j) => (
                    <tr key={j.id} className='hover:bg-muted/30'>
                      <td className='px-3 py-2.5 font-mono font-medium'>
                        {j.journal_number}
                      </td>
                      <td className='px-3 py-2.5 text-muted-foreground'>
                        {j.entry_date}
                      </td>
                      <td className='px-3 py-2.5 font-medium'>
                        {j.description}
                      </td>
                      <td className='px-3 py-2.5 text-xs text-muted-foreground'>
                        {j.source_type}
                      </td>
                      <td className='px-3 py-2.5'>
                        <Badge
                          variant={
                            j.status === 'posted' ? 'default' : 'secondary'
                          }
                          className={
                            j.status === 'posted' ? 'bg-emerald-600' : ''
                          }
                        >
                          {j.status === 'posted' ? 'مرحّل' : 'مسودة'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
