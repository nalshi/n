import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Coins,
  Download,
  LoaderCircle,
  Percent,
  Printer,
  Scale,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMerchantIdentity } from '@/hooks/useMerchantRealtime'
import {
  accountingQueryKeys,
  fetchAgingReport,
  fetchBalanceSheet,
  fetchCashFlow,
  fetchProfitLoss,
  fetchTaxReport,
  formatMinorUnits,
} from './accounting-data'

type ReportType = 'profit_loss' | 'balance_sheet' | 'cash_flow' | 'tax' | 'aging'

export function ReportsView() {
  const merchantId = useMerchantIdentity()
  const [activeReport, setActiveReport] = useState<ReportType>('profit_loss')

  // Date filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-01-01`
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10))

  // Aging sub-type
  const [agingType, setAgingType] = useState<'customer' | 'supplier'>('customer')

  // Queries
  const plQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'pl-report', startDate, endDate],
    queryFn: () => fetchProfitLoss(startDate, endDate),
    enabled: Boolean(merchantId) && activeReport === 'profit_loss',
  })

  const bsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'bs-report', asOfDate],
    queryFn: () => fetchBalanceSheet(asOfDate),
    enabled: Boolean(merchantId) && activeReport === 'balance_sheet',
  })

  const cfQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'cf-report', startDate, endDate],
    queryFn: () => fetchCashFlow(startDate, endDate),
    enabled: Boolean(merchantId) && activeReport === 'cash_flow',
  })

  const taxQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'tax-report', startDate, endDate],
    queryFn: () => fetchTaxReport(startDate, endDate),
    enabled: Boolean(merchantId) && activeReport === 'tax',
  })

  const agingQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'aging-report', agingType, asOfDate],
    queryFn: () => fetchAgingReport(agingType, asOfDate),
    enabled: Boolean(merchantId) && activeReport === 'aging',
  })

  function handlePrint() {
    window.print()
  }

  function exportCSV(filename: string, rows: (string | number)[][]) {
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `${filename}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('تم تصدير ملف CSV بنجاح.')
  }

  return (
    <div className='space-y-6'>
      {/* رأس الصفحة وأزرار التصدير والطباعة */}
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>التقارير والقوائم المالية</h2>
          <p className='text-muted-foreground text-sm'>
            قائمة الدخل، الميزانية العمومية، التدفقات النقدية، الإقرار الضريبي، وأعمار الديون
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button variant='outline' size='sm' onClick={handlePrint} className='gap-1.5'>
            <Printer className='size-4' />
            <span>طباعة التقرير</span>
          </Button>
        </div>
      </div>

      {/* تبويبات التقارير الخمسة */}
      <div className='flex flex-wrap gap-2 border-b pb-3'>
        <Button
          variant={activeReport === 'profit_loss' ? 'default' : 'outline'}
          size='sm'
          onClick={() => setActiveReport('profit_loss')}
          className='gap-1.5'
        >
          <BarChart3 className='size-4' />
          <span>قائمة الدخل (الأرباح والخسائر)</span>
        </Button>

        <Button
          variant={activeReport === 'balance_sheet' ? 'default' : 'outline'}
          size='sm'
          onClick={() => setActiveReport('balance_sheet')}
          className='gap-1.5'
        >
          <Scale className='size-4' />
          <span>الميزانية العمومية (المركز المالي)</span>
        </Button>

        <Button
          variant={activeReport === 'cash_flow' ? 'default' : 'outline'}
          size='sm'
          onClick={() => setActiveReport('cash_flow')}
          className='gap-1.5'
        >
          <Coins className='size-4' />
          <span>قائمة التدفقات النقدية</span>
        </Button>

        <Button
          variant={activeReport === 'tax' ? 'default' : 'outline'}
          size='sm'
          onClick={() => setActiveReport('tax')}
          className='gap-1.5'
        >
          <Percent className='size-4' />
          <span>الإقرار الضريبي</span>
        </Button>

        <Button
          variant={activeReport === 'aging' ? 'default' : 'outline'}
          size='sm'
          onClick={() => setActiveReport('aging')}
          className='gap-1.5'
        >
          <Users className='size-4' />
          <span>أعمار الديون (AR / AP)</span>
        </Button>
      </div>

      {/* شريط الفلاتر بحسب نوع التقرير */}
      <Card className='bg-muted/30'>
        <CardContent className='pt-4 pb-4'>
          <div className='flex flex-wrap items-center gap-4'>
            {activeReport === 'balance_sheet' ? (
              <div className='flex items-center gap-2'>
                <Label htmlFor='as-of-date' className='text-xs font-medium'>
                  كما في تاريخ:
                </Label>
                <Input
                  id='as-of-date'
                  type='date'
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className='w-40 h-8 text-xs'
                />
              </div>
            ) : activeReport === 'aging' ? (
              <>
                <div className='flex items-center gap-2'>
                  <Label htmlFor='aging-type-sel' className='text-xs font-medium'>
                    الجهة:
                  </Label>
                  <Select
                    value={agingType}
                    onValueChange={(val: 'customer' | 'supplier') => setAgingType(val)}
                  >
                    <SelectTrigger id='aging-type-sel' className='w-36 h-8 text-xs'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='customer'>ديون العملاء (AR)</SelectItem>
                      <SelectItem value='supplier'>مستحقات الموردين (AP)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className='flex items-center gap-2'>
                  <Label htmlFor='aging-date' className='text-xs font-medium'>
                    كما في تاريخ:
                  </Label>
                  <Input
                    id='aging-date'
                    type='date'
                    value={asOfDate}
                    onChange={(e) => setAsOfDate(e.target.value)}
                    className='w-40 h-8 text-xs'
                  />
                </div>
              </>
            ) : (
              <>
                <div className='flex items-center gap-2'>
                  <Label htmlFor='start-date' className='text-xs font-medium'>
                    من تاريخ:
                  </Label>
                  <Input
                    id='start-date'
                    type='date'
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className='w-40 h-8 text-xs'
                  />
                </div>
                <div className='flex items-center gap-2'>
                  <Label htmlFor='end-date' className='text-xs font-medium'>
                    إلى تاريخ:
                  </Label>
                  <Input
                    id='end-date'
                    type='date'
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className='w-40 h-8 text-xs'
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 1. تقرير قائمة الدخل */}
      {activeReport === 'profit_loss' && (
        <div className='space-y-4'>
          {plQuery.isLoading ? (
            <div className='flex justify-center py-12 gap-2 text-muted-foreground'>
              <LoaderCircle className='size-5 animate-spin' />
              <span>جاري استخراج قائمة الدخل...</span>
            </div>
          ) : plQuery.data ? (
            <>
              <div className='grid gap-4 md:grid-cols-4'>
                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-xs text-muted-foreground'>إجمالي الإيرادات</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold text-emerald-600'>
                      {formatMinorUnits(plQuery.data.total_revenue)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-xs text-muted-foreground'>تكلفة المبيعات (COGS)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold text-muted-foreground'>
                      {formatMinorUnits(plQuery.data.total_cost)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-xs text-muted-foreground'>إجمالي المصروفات</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold text-rose-600'>
                      {formatMinorUnits(plQuery.data.total_expense)}
                    </div>
                  </CardContent>
                </Card>

                <Card className={plQuery.data.is_profitable ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-rose-500/40 bg-rose-500/5'}>
                  <CardHeader className='pb-2'>
                    <div className='flex items-center justify-between'>
                      <CardTitle className='text-xs font-bold'>صافي الربح / الخسارة</CardTitle>
                      {plQuery.data.is_profitable ? (
                        <TrendingUp className='size-4 text-emerald-600' />
                      ) : (
                        <TrendingDown className='size-4 text-rose-600' />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-black ${plQuery.data.is_profitable ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                      {formatMinorUnits(plQuery.data.net_profit)}
                    </div>
                    <Badge variant='outline' className='mt-1 text-xs'>
                      {plQuery.data.is_profitable ? 'صافي ربح الفترة' : 'صافي خسارة الفترة'}
                    </Badge>
                  </CardContent>
                </Card>
              </div>

              {/* تفاصيل قائمة الدخل */}
              <Card>
                <CardHeader className='flex flex-row items-center justify-between pb-3'>
                  <div>
                    <CardTitle className='text-base'>قائمة الدخل المفصلة</CardTitle>
                    <CardDescription>
                      للفترة من {startDate} إلى {endDate}
                    </CardDescription>
                  </div>
                  <Button
                    variant='outline'
                    size='sm'
                    className='gap-1.5'
                    onClick={() => {
                      const rows = [
                        ['البند', 'رقم الحساب', 'المبلغ'],
                        ['--- الإيرادات ---', '', ''],
                        ...plQuery.data!.revenues.map((r) => [r.name, r.account_code, formatMinorUnits(r.amount_minor_units)]),
                        ['إجمالي الإيرادات', '', formatMinorUnits(plQuery.data!.total_revenue)],
                        ['--- تكلفة المبيعات ---', '', ''],
                        ...plQuery.data!.costs.map((c) => [c.name, c.account_code, formatMinorUnits(c.amount_minor_units)]),
                        ['مجمل الربح', '', formatMinorUnits(plQuery.data!.gross_profit)],
                        ['--- المصروفات التشغيلية ---', '', ''],
                        ...plQuery.data!.expenses.map((e) => [e.name, e.account_code, formatMinorUnits(e.amount_minor_units)]),
                        ['صافي الربح / الخسارة', '', formatMinorUnits(plQuery.data!.net_profit)],
                      ]
                      exportCSV('Income_Statement', rows)
                    }}
                  >
                    <Download className='size-3.5' />
                    <span>تصدير CSV</span>
                  </Button>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div className='border rounded-lg overflow-hidden'>
                    <table className='w-full text-sm text-right'>
                      <tbody>
                        <tr className='bg-muted/70 font-bold'>
                          <td className='p-3' colSpan={2}>الإيرادات (4000)</td>
                          <td className='p-3 text-left font-mono'>{formatMinorUnits(plQuery.data.total_revenue)}</td>
                        </tr>
                        {plQuery.data.revenues.map((r) => (
                          <tr key={r.id} className='border-t hover:bg-muted/20'>
                            <td className='p-2 pr-6 font-mono text-xs text-muted-foreground'>{r.account_code}</td>
                            <td className='p-2 text-xs'>{r.name}</td>
                            <td className='p-2 text-left font-mono text-xs'>{formatMinorUnits(r.amount_minor_units)}</td>
                          </tr>
                        ))}

                        <tr className='bg-muted/50 font-bold border-t'>
                          <td className='p-3' colSpan={2}>تكلفة البضاعة المباعة (5000)</td>
                          <td className='p-3 text-left font-mono text-rose-600'>({formatMinorUnits(plQuery.data.total_cost)})</td>
                        </tr>
                        {plQuery.data.costs.map((c) => (
                          <tr key={c.id} className='border-t hover:bg-muted/20'>
                            <td className='p-2 pr-6 font-mono text-xs text-muted-foreground'>{c.account_code}</td>
                            <td className='p-2 text-xs'>{c.name}</td>
                            <td className='p-2 text-left font-mono text-xs text-rose-600'>({formatMinorUnits(c.amount_minor_units)})</td>
                          </tr>
                        ))}

                        <tr className='bg-primary/5 font-black border-t text-primary'>
                          <td className='p-3' colSpan={2}>مجمل الربح (Gross Profit)</td>
                          <td className='p-3 text-left font-mono'>{formatMinorUnits(plQuery.data.gross_profit)}</td>
                        </tr>

                        <tr className='bg-muted/50 font-bold border-t'>
                          <td className='p-3' colSpan={2}>المصروفات التشغيلية (6000)</td>
                          <td className='p-3 text-left font-mono text-rose-600'>({formatMinorUnits(plQuery.data.total_expense)})</td>
                        </tr>
                        {plQuery.data.expenses.map((e) => (
                          <tr key={e.id} className='border-t hover:bg-muted/20'>
                            <td className='p-2 pr-6 font-mono text-xs text-muted-foreground'>{e.account_code}</td>
                            <td className='p-2 text-xs'>{e.name}</td>
                            <td className='p-2 text-left font-mono text-xs text-rose-600'>({formatMinorUnits(e.amount_minor_units)})</td>
                          </tr>
                        ))}

                        <tr className='bg-emerald-500/10 dark:bg-emerald-950/40 font-black border-t-2 text-base'>
                          <td className='p-4' colSpan={2}>صافي الدخل / الربح للفترة</td>
                          <td className={`p-4 text-left font-mono ${plQuery.data.is_profitable ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700'}`}>
                            {formatMinorUnits(plQuery.data.net_profit)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      )}

      {/* 2. تقرير الميزانية العمومية */}
      {activeReport === 'balance_sheet' && (
        <div className='space-y-4'>
          {bsQuery.isLoading ? (
            <div className='flex justify-center py-12 gap-2 text-muted-foreground'>
              <LoaderCircle className='size-5 animate-spin' />
              <span>جاري استخراج الميزانية العمومية والتحقق من التوازن...</span>
            </div>
          ) : bsQuery.data ? (
            <>
              {/* شريط التحقق من معادلة الميزانية: الأصول = الالتزامات + حقوق الملكية */}
              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  bsQuery.data.is_balanced
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
                }`}
              >
                <div className='flex items-center gap-2'>
                  {bsQuery.data.is_balanced ? (
                    <CheckCircle2 className='size-5 text-emerald-600' />
                  ) : (
                    <CircleAlert className='size-5 text-rose-600' />
                  )}
                  <span className='font-bold'>
                    {bsQuery.data.is_balanced
                      ? 'الميزانية العمومية متوازنة تماماً: الأصول = الالتزامات + حقوق الملكية'
                      : 'تحذير: الميزانية غير متوازنة! الفارق: ' + formatMinorUnits(bsQuery.data.difference)}
                  </span>
                </div>
                <div className='flex items-center gap-4 text-xs font-mono font-semibold'>
                  <span>الأصول: {formatMinorUnits(bsQuery.data.total_assets)}</span>
                  <span>=</span>
                  <span>الخصوم والملكية: {formatMinorUnits(bsQuery.data.total_liabilities_and_equity)}</span>
                </div>
              </div>

              {/* تفاصيل الميزانية بجانبين */}
              <div className='grid gap-6 md:grid-cols-2'>
                {/* الأصول */}
                <Card>
                  <CardHeader className='pb-3'>
                    <div className='flex items-center justify-between'>
                      <CardTitle className='text-base text-primary'>الأصول (Assets - 1000)</CardTitle>
                      <Badge variant='outline' className='font-mono font-bold text-primary'>
                        {formatMinorUnits(bsQuery.data.total_assets)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <table className='w-full text-xs text-right'>
                      <tbody className='divide-y'>
                        {bsQuery.data.assets.map((a) => (
                          <tr key={a.id} className='hover:bg-muted/20'>
                            <td className='py-2 font-mono text-muted-foreground'>{a.account_code}</td>
                            <td className='py-2 font-medium'>{a.name}</td>
                            <td className='py-2 text-left font-mono font-semibold'>{formatMinorUnits(a.amount_minor_units)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {/* الالتزامات وحقوق الملكية */}
                <div className='space-y-6'>
                  <Card>
                    <CardHeader className='pb-3'>
                      <div className='flex items-center justify-between'>
                        <CardTitle className='text-base text-rose-600'>الالتزامات (Liabilities - 2000)</CardTitle>
                        <Badge variant='outline' className='font-mono font-bold text-rose-600'>
                          {formatMinorUnits(bsQuery.data.total_liabilities)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <table className='w-full text-xs text-right'>
                        <tbody className='divide-y'>
                          {bsQuery.data.liabilities.map((l) => (
                            <tr key={l.id} className='hover:bg-muted/20'>
                              <td className='py-2 font-mono text-muted-foreground'>{l.account_code}</td>
                              <td className='py-2 font-medium'>{l.name}</td>
                              <td className='py-2 text-left font-mono font-semibold'>{formatMinorUnits(l.amount_minor_units)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className='pb-3'>
                      <div className='flex items-center justify-between'>
                        <CardTitle className='text-base text-blue-600'>حقوق الملكية (Equity - 3000)</CardTitle>
                        <Badge variant='outline' className='font-mono font-bold text-blue-600'>
                          {formatMinorUnits(bsQuery.data.total_equity)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className='space-y-3'>
                      <table className='w-full text-xs text-right'>
                        <tbody className='divide-y'>
                          {bsQuery.data.equity.map((eq) => (
                            <tr key={eq.id} className='hover:bg-muted/20'>
                              <td className='py-2 font-mono text-muted-foreground'>{eq.account_code}</td>
                              <td className='py-2 font-medium'>{eq.name}</td>
                              <td className='py-2 text-left font-mono font-semibold'>{formatMinorUnits(eq.amount_minor_units)}</td>
                            </tr>
                          ))}
                          <tr className='bg-muted/30 font-bold'>
                            <td className='py-2 font-mono text-muted-foreground'>—</td>
                            <td className='py-2 text-primary'>أرباح / (خسائر) الفترة الحالية</td>
                            <td className='py-2 text-left font-mono'>{formatMinorUnits(bsQuery.data.current_period_net_income)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* 3. تقرير قائمة التدفقات النقدية */}
      {activeReport === 'cash_flow' && (
        <div className='space-y-4'>
          {cfQuery.isLoading ? (
            <div className='flex justify-center py-12 gap-2 text-muted-foreground'>
              <LoaderCircle className='size-5 animate-spin' />
              <span>جاري استخراج قائمة التدفقات النقدية...</span>
            </div>
          ) : cfQuery.data ? (
            <Card>
              <CardHeader className='flex flex-row items-center justify-between pb-3'>
                <div>
                  <CardTitle className='text-base'>قائمة التدفقات النقدية</CardTitle>
                  <CardDescription>
                    حركة النقدية من الأنشطة التشغيلية والتمويلية من {startDate} إلى {endDate}
                  </CardDescription>
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    const rows = [
                      ['البند', 'المبلغ'],
                      ['رصيد النقدية أول المدة', formatMinorUnits(cfQuery.data!.opening_cash)],
                      ['التدفقات الداخلة من العمليات', formatMinorUnits(cfQuery.data!.operating_cash_in)],
                      ['التدفقات الخارجة للعمليات والمصروفات', formatMinorUnits(cfQuery.data!.operating_cash_out)],
                      ['صافي التدفق النقدي التشغيلي', formatMinorUnits(cfQuery.data!.net_operating_cash_flow)],
                      ['صافي التدفق النقدي التمويلي', formatMinorUnits(cfQuery.data!.net_financing_cash_flow)],
                      ['صافي التغير في النقدية', formatMinorUnits(cfQuery.data!.net_change_in_cash)],
                      ['رصيد النقدية نهاية المدة', formatMinorUnits(cfQuery.data!.closing_cash)],
                    ]
                    exportCSV('Cash_Flow_Statement', rows)
                  }}
                  className='gap-1.5'
                >
                  <Download className='size-3.5' />
                  <span>تصدير CSV</span>
                </Button>
              </CardHeader>
              <CardContent>
                <div className='border rounded-lg overflow-hidden'>
                  <table className='w-full text-sm text-right'>
                    <tbody className='divide-y'>
                      <tr className='bg-muted/40 font-bold'>
                        <td className='p-3'>رصيد النقدية وما في حكمها في بداية المدة</td>
                        <td className='p-3 text-left font-mono'>{formatMinorUnits(cfQuery.data.opening_cash)}</td>
                      </tr>
                      <tr>
                        <td className='p-3 pr-6 text-xs text-muted-foreground'>المقبوضات النقدية من المبيعات والعملاء</td>
                        <td className='p-3 text-left font-mono text-xs text-emerald-600'>+{formatMinorUnits(cfQuery.data.operating_cash_in)}</td>
                      </tr>
                      <tr>
                        <td className='p-3 pr-6 text-xs text-muted-foreground'>المدفوعات النقدية للمشتريات والموردين والمصروفات</td>
                        <td className='p-3 text-left font-mono text-xs text-rose-600'>-{formatMinorUnits(cfQuery.data.operating_cash_out)}</td>
                      </tr>
                      <tr className='bg-muted/20 font-semibold'>
                        <td className='p-3'>صافي التدفقات النقدية من الأنشطة التشغيلية</td>
                        <td className='p-3 text-left font-mono'>{formatMinorUnits(cfQuery.data.net_operating_cash_flow)}</td>
                      </tr>
                      <tr className='bg-muted/20 font-semibold'>
                        <td className='p-3'>صافي التدفقات النقدية من الأنشطة التمويلية والرأسمالية</td>
                        <td className='p-3 text-left font-mono'>{formatMinorUnits(cfQuery.data.net_financing_cash_flow)}</td>
                      </tr>
                      <tr className='bg-primary/10 font-bold'>
                        <td className='p-3'>صافي الزيادة / (الانخفاض) في النقدية خلال المدة</td>
                        <td className='p-3 text-left font-mono text-primary'>{formatMinorUnits(cfQuery.data.net_change_in_cash)}</td>
                      </tr>
                      <tr className='bg-muted/70 font-black text-base'>
                        <td className='p-4'>رصيد النقدية وما في حكمها في نهاية المدة</td>
                        <td className='p-4 text-left font-mono'>{formatMinorUnits(cfQuery.data.closing_cash)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      {/* 4. تقرير الإقرار الضريبي */}
      {activeReport === 'tax' && (
        <div className='space-y-4'>
          {taxQuery.isLoading ? (
            <div className='flex justify-center py-12 gap-2 text-muted-foreground'>
              <LoaderCircle className='size-5 animate-spin' />
              <span>جاري استخراج بيانات الإقرار الضريبي...</span>
            </div>
          ) : taxQuery.data ? (
            <>
              <div className='grid gap-4 md:grid-cols-4'>
                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-xs text-muted-foreground'>المبيعات الخاضعة للضريبة</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold font-mono'>
                      {formatMinorUnits(taxQuery.data.taxable_sales_minor_units)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-xs text-muted-foreground'>ضريبة المخرجات (المحصلة من البيع)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold font-mono text-emerald-600'>
                      {formatMinorUnits(taxQuery.data.output_tax_minor_units)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-xs text-muted-foreground'>ضريبة المدخلات (المدفوعة على الشراء)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold font-mono text-rose-600'>
                      {formatMinorUnits(taxQuery.data.input_tax_minor_units)}
                    </div>
                  </CardContent>
                </Card>

                <Card className={taxQuery.data.status === 'payable' ? 'border-rose-500/40 bg-rose-500/5' : 'border-emerald-500/40 bg-emerald-500/5'}>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-xs font-bold'>صافي الضريبة المستحقة</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-black font-mono ${taxQuery.data.status === 'payable' ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                      {formatMinorUnits(taxQuery.data.net_tax_payable_minor_units)}
                    </div>
                    <Badge variant='outline' className='mt-1 text-xs'>
                      {taxQuery.data.status === 'payable' ? 'مستحقة للسداد للهيئة' : 'مستحقة للاسترداد'}
                    </Badge>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>ملخص الإقرار الضريبي للقيمة المضافة</CardTitle>
                  <CardDescription>
                    وفقاً لحسابات الضرائب المستحقة (2200) بالدفتر العام
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <table className='w-full text-sm text-right border rounded-lg overflow-hidden'>
                    <tbody className='divide-y'>
                      <tr>
                        <td className='p-3 font-medium'>إجمالي المبيعات والخدمات الخاضعة لضريبة القيمة المضافة</td>
                        <td className='p-3 text-left font-mono'>{formatMinorUnits(taxQuery.data.taxable_sales_minor_units)}</td>
                      </tr>
                      <tr>
                        <td className='p-3 font-medium'>ضريبة المبيعات المستحقة (ضريبة المخرجات)</td>
                        <td className='p-3 text-left font-mono text-emerald-600 font-bold'>{formatMinorUnits(taxQuery.data.output_tax_minor_units)}</td>
                      </tr>
                      <tr>
                        <td className='p-3 font-medium'>ضريبة المشتريات القابلة للخصم (ضريبة المدخلات)</td>
                        <td className='p-3 text-left font-mono text-rose-600 font-bold'>({formatMinorUnits(taxQuery.data.input_tax_minor_units)})</td>
                      </tr>
                      <tr className='bg-muted/70 font-black text-base'>
                        <td className='p-4'>صافي الضريبة الواجبة السداد / (الاسترداد)</td>
                        <td className='p-4 text-left font-mono'>{formatMinorUnits(taxQuery.data.net_tax_payable_minor_units)}</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      )}

      {/* 5. تقرير أعمار الديون */}
      {activeReport === 'aging' && (
        <div className='space-y-4'>
          {agingQuery.isLoading ? (
            <div className='flex justify-center py-12 gap-2 text-muted-foreground'>
              <LoaderCircle className='size-5 animate-spin' />
              <span>جاري استخراج تقرير أعمار الديون...</span>
            </div>
          ) : agingQuery.data ? (
            <>
              <div className='grid gap-4 md:grid-cols-5'>
                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-xs text-muted-foreground'>إجمالي المديونية</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-xl font-bold font-mono text-primary'>
                      {formatMinorUnits(agingQuery.data.grand_total_debt)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-xs text-muted-foreground'>جاري (أقل من 30 يوم)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-xl font-bold font-mono text-emerald-600'>
                      {formatMinorUnits(agingQuery.data.total_current)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-xs text-muted-foreground'>31 - 60 يوم</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-xl font-bold font-mono text-blue-600'>
                      {formatMinorUnits(agingQuery.data.total_30_days)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-xs text-muted-foreground'>61 - 90 يوم</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-xl font-bold font-mono text-amber-600'>
                      {formatMinorUnits(agingQuery.data.total_60_days)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-xs text-muted-foreground'>أكثر من 90 يوم</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-xl font-bold font-mono text-rose-600'>
                      {formatMinorUnits(agingQuery.data.total_90_plus)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className='flex flex-row items-center justify-between pb-3'>
                  <div>
                    <CardTitle className='text-base'>
                      جدول أعمار ديون {agingType === 'customer' ? 'العملاء' : 'الموردين'}
                    </CardTitle>
                    <CardDescription>
                      توزيع المديونية حسب فترات الاستحقاق والتأخير
                    </CardDescription>
                  </div>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      const rows = [
                        ['الاسم', 'الهاتف', 'إجمالي الرصيد', 'جاري', '31-60 يوم', '61-90 يوم', '+90 يوم'],
                        ...agingQuery.data!.items.map((i) => [
                          i.name,
                          i.phone || '',
                          formatMinorUnits(i.total_balance),
                          formatMinorUnits(i.bucket_current),
                          formatMinorUnits(i.bucket_30),
                          formatMinorUnits(i.bucket_60),
                          formatMinorUnits(i.bucket_90_plus),
                        ]),
                      ]
                      exportCSV(`Aging_${agingType}`, rows)
                    }}
                    className='gap-1.5'
                  >
                    <Download className='size-3.5' />
                    <span>تصدير CSV</span>
                  </Button>
                </CardHeader>
                <CardContent>
                  {agingQuery.data.items.length === 0 ? (
                    <div className='py-8 text-center text-muted-foreground'>
                      لا توجد ديون مستحقة مسجلة.
                    </div>
                  ) : (
                    <div className='overflow-x-auto'>
                      <table className='w-full text-xs text-right'>
                        <thead className='bg-muted/50 text-muted-foreground'>
                          <tr>
                            <th className='p-3'>الاسم</th>
                            <th className='p-3'>الهاتف</th>
                            <th className='p-3'>إجمالي الرصيد</th>
                            <th className='p-3'>جاري (&lt; 30)</th>
                            <th className='p-3'>31 - 60 يوم</th>
                            <th className='p-3'>61 - 90 يوم</th>
                            <th className='p-3'>+90 يوم</th>
                          </tr>
                        </thead>
                        <tbody className='divide-y'>
                          {agingQuery.data.items.map((item) => (
                            <tr key={item.contact_id} className='hover:bg-muted/20'>
                              <td className='p-3 font-semibold'>{item.name}</td>
                              <td className='p-3 text-muted-foreground font-mono'>{item.phone || '—'}</td>
                              <td className='p-3 font-mono font-bold text-primary'>{formatMinorUnits(item.total_balance)}</td>
                              <td className='p-3 font-mono text-emerald-600'>{formatMinorUnits(item.bucket_current)}</td>
                              <td className='p-3 font-mono text-blue-600'>{formatMinorUnits(item.bucket_30)}</td>
                              <td className='p-3 font-mono text-amber-600'>{formatMinorUnits(item.bucket_60)}</td>
                              <td className='p-3 font-mono text-rose-600 font-bold'>{formatMinorUnits(item.bucket_90_plus)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
