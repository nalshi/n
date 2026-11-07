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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useMerchantIdentity } from '@/hooks/useMerchantRealtime'
import {
  accountingQueryKeys,
  fetchBalanceSheet,
  fetchJournalEntries,
  fetchProfitLoss,
  fetchTrialBalance,
  formatMinorUnits,
} from './accounting-data'
import type { AccountingTabId } from './AccountingLayout'

export function DashboardView({
  onNavigate,
}: {
  onNavigate?: (tab: AccountingTabId) => void
} = {}) {
  const merchantId = useMerchantIdentity()

  const plQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'profit-loss-dashboard'],
    queryFn: () => fetchProfitLoss(),
    enabled: Boolean(merchantId),
  })

  const bsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'balance-sheet-dashboard'],
    queryFn: () => fetchBalanceSheet(),
    enabled: Boolean(merchantId),
  })

  const tbQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'trial-balance-dashboard'],
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
  const journals = journalsQuery.data || []

  const currency = 'YER'
  const isBalanced = tb?.is_balanced ?? true

  // حساب النقدية والذمم من ميزان المراجعة
  const cashAccounts = tb?.accounts.filter((a) => ['1100', '1110', '1120'].includes(a.account_code)) || []
  const totalCash = cashAccounts.reduce((sum, a) => sum + (a.ending_debit - a.ending_credit), 0)

  const arAccounts = tb?.accounts.filter((a) => ['1130', '1200'].includes(a.account_code)) || []
  const totalAR = arAccounts.reduce((sum, a) => sum + (a.ending_debit - a.ending_credit), 0)

  const apAccounts = tb?.accounts.filter((a) => ['2100'].includes(a.account_code)) || []
  const totalAP = apAccounts.reduce((sum, a) => sum + (a.ending_credit - a.ending_debit), 0)

  const totalAssets = bs?.total_assets ?? 0
  const totalLiabilities = bs?.total_liabilities ?? 0
  const totalEquity = bs?.total_equity ?? 0

  const totalRevenue = pl?.total_revenue ?? 0
  const totalCost = pl?.total_cost ?? 0
  const grossProfit = pl?.gross_profit ?? 0
  const totalExpense = pl?.total_expense ?? 0
  const netProfit = pl?.net_profit ?? 0

  return (
    <div className='space-y-6'>
      {/* بطاقة تنبيه التوازن المحاسبي */}
      <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
        isBalanced
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-100'
          : 'bg-destructive/10 border-destructive/30 text-destructive'
      }`}>
        <div className='flex items-center gap-3'>
          {isBalanced ? (
            <div className='p-2 bg-emerald-500/20 text-emerald-600 rounded-lg'>
              <CheckCircle2 className='size-6' />
            </div>
          ) : (
            <div className='p-2 bg-destructive/20 text-destructive rounded-lg'>
              <CircleAlert className='size-6' />
            </div>
          )}
          <div>
            <h4 className='font-bold text-base'>
              {isBalanced
                ? 'النظام المحاسبي متوازن بالكامل (Total Debits = Total Credits)'
                : 'تحذير: يوجد عدم توازن في إجمالي المدين والدائن'}
            </h4>
            <p className='text-sm opacity-90'>
              {isBalanced
                ? `المعادلة المحاسبية الأساسية متحققة: الأصول (${formatMinorUnits(totalAssets, currency)}) = الالتزامات (${formatMinorUnits(totalLiabilities, currency)}) + حقوق الملكية (${formatMinorUnits(totalEquity, currency)})`
                : 'يُرجى مراجعة قيود اليومية وميزان المراجعة لمعالجة الفروقات غير المرحّلة.'}
            </p>
          </div>
        </div>

        <div className='flex items-center gap-2 shrink-0'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onNavigate?.('trial-balance')}
          >
            <Scale className='size-4 ml-1.5' />
            <span>ميزان المراجعة</span>
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onNavigate?.('reports')}
          >
            <BarChart3 className='size-4 ml-1.5' />
            <span>القوائم المالية</span>
          </Button>
        </div>
      </div>

      {/* المؤشرات المالية الرئيسية (Key Financial KPIs) */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
        {/* صافي الربح / الخسارة */}
        <Card className='shadow-xs'>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              صافي الأرباح (Net Profit)
            </CardTitle>
            <div className={`p-2 rounded-lg ${netProfit >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive'}`}>
              {netProfit >= 0 ? <TrendingUp className='size-4' /> : <TrendingDown className='size-4' />}
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
              {formatMinorUnits(Math.abs(netProfit), currency)}
              {netProfit < 0 && ' (خسارة)'}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              إجمالي الإيرادات: {formatMinorUnits(totalRevenue, currency)}
            </p>
          </CardContent>
        </Card>

        {/* النقدية المتاحة في الصناديق والبنوك */}
        <Card className='shadow-xs'>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              النقدية والبنوك (Available Cash)
            </CardTitle>
            <div className='p-2 bg-blue-500/10 text-blue-600 rounded-lg'>
              <Wallet className='size-4' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-foreground'>
              {formatMinorUnits(Math.max(0, totalCash), currency)}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
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
            <div className='p-2 bg-amber-500/10 text-amber-600 rounded-lg'>
              <Users className='size-4' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-amber-600 dark:text-amber-400'>
              {formatMinorUnits(Math.max(0, totalAR), currency)}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
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
            <div className='p-2 bg-purple-500/10 text-purple-600 rounded-lg'>
              <Truck className='size-4' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-purple-600 dark:text-purple-400'>
              {formatMinorUnits(Math.max(0, totalAP), currency)}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              التزامات قائمة لموردي البضائع
            </p>
          </CardContent>
        </Card>
      </div>

      {/* تفاصيل المبيعات والتكاليف والميزانية */}
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        {/* قائمة الدخل المختصرة */}
        <Card className='lg:col-span-2 shadow-xs'>
          <CardHeader>
            <CardTitle className='text-base flex items-center justify-between'>
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
              <div className='flex items-center justify-between py-2 border-b'>
                <div className='flex items-center gap-2'>
                  <div className='size-2.5 rounded-full bg-emerald-500' />
                  <span className='font-medium text-sm'>إجمالي الإيرادات والمبيعات</span>
                </div>
                <span className='font-bold text-sm text-emerald-600 dark:text-emerald-400'>
                  +{formatMinorUnits(totalRevenue, currency)}
                </span>
              </div>

              <div className='flex items-center justify-between py-2 border-b'>
                <div className='flex items-center gap-2'>
                  <div className='size-2.5 rounded-full bg-orange-500' />
                  <span className='font-medium text-sm'>تكلفة البضاعة المباعة (COGS)</span>
                </div>
                <span className='font-bold text-sm text-orange-600 dark:text-orange-400'>
                  -{formatMinorUnits(totalCost, currency)}
                </span>
              </div>

              <div className='flex items-center justify-between py-2 border-b bg-muted/40 px-3 rounded-lg'>
                <span className='font-semibold text-sm'>إجمالي الربح (Gross Profit)</span>
                <span className='font-bold text-sm'>
                  {formatMinorUnits(grossProfit, currency)}
                </span>
              </div>

              <div className='flex items-center justify-between py-2 border-b'>
                <div className='flex items-center gap-2'>
                  <div className='size-2.5 rounded-full bg-rose-500' />
                  <span className='font-medium text-sm'>المصروفات التشغيلية والإدارية</span>
                </div>
                <span className='font-bold text-sm text-rose-600 dark:text-rose-400'>
                  -{formatMinorUnits(totalExpense, currency)}
                </span>
              </div>

              <div className={`flex items-center justify-between py-3 px-3 rounded-lg font-bold text-base ${
                netProfit >= 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-destructive/10 text-destructive'
              }`}>
                <span>صافي الدخل النهائي (Net Income)</span>
                <span>{formatMinorUnits(Math.abs(netProfit), currency)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* الميزانية العمومية والمركز المالي */}
        <Card className='shadow-xs'>
          <CardHeader>
            <CardTitle className='text-base'>المركز المالي (Balance Sheet)</CardTitle>
            <CardDescription>الأصول مقابل الالتزامات وحقوق الملكية</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='p-3 rounded-lg bg-blue-500/10 border border-blue-500/20'>
              <div className='text-xs text-blue-700 dark:text-blue-300 font-medium'>
                إجمالي الأصول (Assets)
              </div>
              <div className='text-xl font-bold text-blue-900 dark:text-blue-100 mt-0.5'>
                {formatMinorUnits(totalAssets, currency)}
              </div>
            </div>

            <div className='p-3 rounded-lg bg-purple-500/10 border border-purple-500/20'>
              <div className='text-xs text-purple-700 dark:text-purple-300 font-medium'>
                إجمالي الالتزامات (Liabilities)
              </div>
              <div className='text-xl font-bold text-purple-900 dark:text-purple-100 mt-0.5'>
                {formatMinorUnits(totalLiabilities, currency)}
              </div>
            </div>

            <div className='p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20'>
              <div className='text-xs text-emerald-700 dark:text-emerald-300 font-medium'>
                إجمالي حقوق الملكية (Equity)
              </div>
              <div className='text-xl font-bold text-emerald-900 dark:text-emerald-100 mt-0.5'>
                {formatMinorUnits(totalEquity, currency)}
              </div>
            </div>

            <div className='text-center pt-2'>
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
      <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3'>
        <Button
          variant='outline'
          className='h-auto py-3 flex flex-col items-center gap-2'
          onClick={() => onNavigate?.('sales')}
        >
          <ShoppingBag className='size-5 text-emerald-600' />
          <span className='text-xs font-semibold'>فاتورة مبيعات</span>
        </Button>

        <Button
          variant='outline'
          className='h-auto py-3 flex flex-col items-center gap-2'
          onClick={() => onNavigate?.('purchases')}
        >
          <ShoppingCart className='size-5 text-blue-600' />
          <span className='text-xs font-semibold'>فاتورة مشتريات</span>
        </Button>

        <Button
          variant='outline'
          className='h-auto py-3 flex flex-col items-center gap-2'
          onClick={() => onNavigate?.('cash')}
        >
          <ArrowDownLeft className='size-5 text-emerald-500' />
          <span className='text-xs font-semibold'>سند قبض</span>
        </Button>

        <Button
          variant='outline'
          className='h-auto py-3 flex flex-col items-center gap-2'
          onClick={() => onNavigate?.('cash')}
        >
          <ArrowUpRight className='size-5 text-rose-500' />
          <span className='text-xs font-semibold'>سند صرف</span>
        </Button>

        <Button
          variant='outline'
          className='h-auto py-3 flex flex-col items-center gap-2'
          onClick={() => onNavigate?.('journal-entries')}
        >
          <FilePlus2 className='size-5 text-amber-500' />
          <span className='text-xs font-semibold'>قيد يومية يدوي</span>
        </Button>

        <Button
          variant='outline'
          className='h-auto py-3 flex flex-col items-center gap-2'
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
            <CardTitle className='text-base'>أحدث قيود اليومية (Recent Journals)</CardTitle>
            <CardDescription>القيود المحاسبية المسجلة والمرحّلة في النظام</CardDescription>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onNavigate?.('journal-entries')}
          >
            عرض كافة القيود ({journals.length})
          </Button>
        </CardHeader>
        <CardContent>
          {journals.length === 0 ? (
            <div className='text-center py-8 text-muted-foreground'>
              <BookOpen className='size-8 mx-auto mb-2 opacity-50' />
              <p>لا توجد قيود مسجلة بعد. ابدأ بتسجيل أول قيد محاسبي أو بيع منتج.</p>
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm text-right'>
                <thead className='bg-muted/50 text-xs text-muted-foreground uppercase border-b'>
                  <tr>
                    <th className='py-2.5 px-3'>رقم القيد</th>
                    <th className='py-2.5 px-3'>التاريخ</th>
                    <th className='py-2.5 px-3'>البيان والوصف</th>
                    <th className='py-2.5 px-3'>المصدر</th>
                    <th className='py-2.5 px-3'>الحالة</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-border/60'>
                  {journals.slice(0, 5).map((j) => (
                    <tr key={j.id} className='hover:bg-muted/30'>
                      <td className='py-2.5 px-3 font-mono font-medium'>{j.journal_number}</td>
                      <td className='py-2.5 px-3 text-muted-foreground'>{j.entry_date}</td>
                      <td className='py-2.5 px-3 font-medium'>{j.description}</td>
                      <td className='py-2.5 px-3 text-xs text-muted-foreground'>{j.source_type}</td>
                      <td className='py-2.5 px-3'>
                        <Badge variant={j.status === 'posted' ? 'default' : 'secondary'} className={j.status === 'posted' ? 'bg-emerald-600' : ''}>
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
