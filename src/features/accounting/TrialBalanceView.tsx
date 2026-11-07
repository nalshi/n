import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, CircleAlert, Download, Printer } from 'lucide-react'
import { useMerchantIdentity } from '@/hooks/useMerchantRealtime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  accountingQueryKeys,
  fetchAccountingSettings,
  fetchTrialBalance,
  formatMinorUnits,
} from './accounting-data'

export function TrialBalanceView() {
  const merchantId = useMerchantIdentity()
  const [asOfDate, setAsOfDate] = useState(
    new Date().toISOString().slice(0, 10)
  )

  const settingsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'settings'],
    queryFn: fetchAccountingSettings,
    enabled: Boolean(merchantId),
  })

  const trialBalanceQuery = useQuery({
    queryKey: [
      ...accountingQueryKeys(merchantId || ''),
      'trial-balance-view',
      asOfDate,
    ],
    queryFn: () => fetchTrialBalance(asOfDate),
    enabled:
      Boolean(merchantId) && Boolean(settingsQuery.data?.functional_currency),
  })

  const tb = trialBalanceQuery.data
  const currency = settingsQuery.data?.functional_currency
  const isBalanced = tb?.is_balanced
  const formatAmount = (amount: number | undefined) =>
    amount === undefined || !currency ? '—' : formatMinorUnits(amount, currency)
  const hasError = settingsQuery.isError || trialBalanceQuery.isError
  const queryError = settingsQuery.error ?? trialBalanceQuery.error
  const errorMessage =
    queryError instanceof Error
      ? queryError.message
      : 'تحقق من اتصالك ثم أعد المحاولة.'

  const handlePrint = () => {
    window.print()
  }

  const handleExportCsv = () => {
    if (!tb) return
    const rows = [
      [
        'رمز الحساب',
        'اسم الحساب',
        'التصنيف',
        'الطبيعة',
        'إجمالي المدين',
        'إجمالي الدائن',
        'رصيد مدين',
        'رصيد دائن',
      ],
    ]
    for (const a of tb.accounts) {
      rows.push([
        a.account_code,
        `"${a.name.replace(/"/g, '""')}"`,
        a.account_type,
        a.normal_balance,
        String(a.total_debit),
        String(a.total_credit),
        String(a.ending_debit),
        String(a.ending_credit),
      ])
    }
    rows.push([
      'المجموع العام',
      '-',
      '-',
      '-',
      String(tb.grand_total_debit),
      String(tb.grand_total_credit),
      String(tb.grand_ending_debit),
      String(tb.grand_ending_credit),
    ])
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      rows.map((e) => e.join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `trial_balance_${asOfDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
        <div>
          <h2 className='text-lg font-bold'>
            ميزان المراجعة بالأرصدة والمجاميع (Trial Balance)
          </h2>
          <p className='text-sm text-muted-foreground'>
            تقرير التحقق المحاسبي الشامل لضمان توازن دفتر الأستاذ وصحة القيود
            المرحّلة
          </p>
        </div>

        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={handlePrint}
            className='gap-1.5'
          >
            <Printer className='size-4' />
            <span>طباعة</span>
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={handleExportCsv}
            className='gap-1.5'
            disabled={!tb}
          >
            <Download className='size-4' />
            <span>تصدير CSV</span>
          </Button>
        </div>
      </div>

      {hasError && (
        <div
          role='alert'
          className='flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between'
        >
          <div>
            <p className='font-semibold text-destructive'>
              تعذر تحميل بيانات ميزان المراجعة
            </p>
            <p className='mt-1 text-sm text-muted-foreground'>{errorMessage}</p>
          </div>
          <Button
            variant='outline'
            onClick={() => {
              void Promise.all([
                settingsQuery.refetch(),
                trialBalanceQuery.refetch(),
              ])
            }}
          >
            إعادة المحاولة
          </Button>
        </div>
      )}

      {!settingsQuery.isPending && !settingsQuery.isError && !currency && (
        <p
          role='alert'
          className='rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-200'
        >
          حدد العملة الوظيفية من إعدادات المحاسبة قبل عرض المبالغ المالية.
        </p>
      )}

      {/* تنبيه التوازن الحاسم */}
      <div
        className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${
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
              <CircleAlert className='size-6' />
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
                ? settingsQuery.isPending
                  ? 'جارٍ تحميل إعدادات العملة'
                  : currency && trialBalanceQuery.isPending
                    ? 'جارٍ التحقق من ميزان المراجعة'
                    : 'لم يتم التحقق من توازن الميزان'
                : isBalanced
                  ? 'ميزان المراجعة متوازن تماماً'
                  : 'تحذير: ميزان المراجعة غير متوازن!'}
            </h4>
            <p className='font-mono text-sm opacity-90'>
              {tb
                ? `إجمالي المدين: ${formatAmount(tb.grand_total_debit)} | إجمالي الدائن: ${formatAmount(tb.grand_total_credit)}`
                : 'لن نعرض حالة التوازن قبل استلام ميزان المراجعة من الخادم.'}
            </p>
          </div>
        </div>

        <div className='flex items-center gap-2'>
          <Label htmlFor='asOfDate' className='shrink-0 text-xs'>
            حتى تاريخ:
          </Label>
          <Input
            id='asOfDate'
            type='date'
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className='w-40 text-xs'
          />
        </div>
      </div>

      {/* جدول ميزان المراجعة */}
      <Card className='overflow-hidden shadow-xs'>
        <CardContent className='p-0'>
          <div className='overflow-x-auto'>
            <table className='w-full text-right text-sm'>
              <thead className='border-b bg-muted/60 text-xs text-muted-foreground'>
                <tr>
                  <th rowSpan={2} className='border-l px-3 py-3 align-bottom'>
                    رمز الحساب
                  </th>
                  <th rowSpan={2} className='border-l px-3 py-3 align-bottom'>
                    اسم الحساب
                  </th>
                  <th
                    rowSpan={2}
                    className='border-l px-3 py-3 text-center align-bottom'
                  >
                    التصنيف
                  </th>
                  <th
                    colSpan={2}
                    className='border-b border-l bg-muted/80 px-3 py-2 text-center'
                  >
                    مجاميع الحركات (Totals)
                  </th>
                  <th colSpan={2} className='bg-muted/80 px-3 py-2 text-center'>
                    الأرصدة النهائية (Ending Balances)
                  </th>
                </tr>
                <tr>
                  <th className='border-l px-3 py-2 text-left font-mono text-blue-600'>
                    مدين
                  </th>
                  <th className='border-l px-3 py-2 text-left font-mono text-purple-600'>
                    دائن
                  </th>
                  <th className='border-l px-3 py-2 text-left font-mono text-blue-600'>
                    مدين
                  </th>
                  <th className='px-3 py-2 text-left font-mono text-purple-600'>
                    دائن
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-border/60 text-xs'>
                {trialBalanceQuery.isLoading || settingsQuery.isPending ? (
                  <tr>
                    <td
                      colSpan={7}
                      className='py-12 text-center text-muted-foreground'
                    >
                      جاري تحميل بيانات ميزان المراجعة...
                    </td>
                  </tr>
                ) : trialBalanceQuery.isError || settingsQuery.isError ? (
                  <tr>
                    <td
                      colSpan={7}
                      className='py-12 text-center text-destructive'
                    >
                      تعذر تحميل ميزان المراجعة. أعد المحاولة من التنبيه أعلاه.
                    </td>
                  </tr>
                ) : !tb ? (
                  <tr>
                    <td
                      colSpan={7}
                      className='py-12 text-center text-muted-foreground'
                    >
                      حدد العملة الوظيفية لعرض ميزان المراجعة.
                    </td>
                  </tr>
                ) : tb.accounts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className='py-12 text-center text-muted-foreground'
                    >
                      لا توجد حسابات أو حركات مسجلة.
                    </td>
                  </tr>
                ) : (
                  tb.accounts.map((acc) => (
                    <tr
                      key={acc.id}
                      className={`hover:bg-muted/20 ${
                        !acc.is_postable ? 'bg-muted/15 font-bold' : ''
                      }`}
                    >
                      <td className='border-l px-3 py-2.5 font-mono font-medium text-primary'>
                        {acc.account_code}
                      </td>
                      <td className='border-l px-3 py-2.5 font-medium'>
                        {acc.name}
                      </td>
                      <td className='border-l px-3 py-2.5 text-center'>
                        <Badge variant='outline' className='py-0 text-[10px]'>
                          {acc.account_type}
                        </Badge>
                      </td>
                      <td className='border-l px-3 py-2.5 text-left font-mono text-blue-600'>
                        {acc.total_debit > 0
                          ? formatAmount(acc.total_debit)
                          : '-'}
                      </td>
                      <td className='border-l px-3 py-2.5 text-left font-mono text-purple-600'>
                        {acc.total_credit > 0
                          ? formatAmount(acc.total_credit)
                          : '-'}
                      </td>
                      <td className='border-l px-3 py-2.5 text-left font-mono font-semibold text-blue-700 dark:text-blue-300'>
                        {acc.ending_debit > 0
                          ? formatAmount(acc.ending_debit)
                          : '-'}
                      </td>
                      <td className='px-3 py-2.5 text-left font-mono font-semibold text-purple-700 dark:text-purple-300'>
                        {acc.ending_credit > 0
                          ? formatAmount(acc.ending_credit)
                          : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {tb && (
                <tfoot className='border-t-2 bg-muted/60 text-xs font-bold'>
                  <tr>
                    <td
                      colSpan={3}
                      className='border-l px-3 py-3 text-right font-bold'
                    >
                      المجموع العام (Grand Totals):
                    </td>
                    <td className='border-l px-3 py-3 text-left font-mono text-sm text-blue-600'>
                      {formatAmount(tb.grand_total_debit)}
                    </td>
                    <td className='border-l px-3 py-3 text-left font-mono text-sm text-purple-600'>
                      {formatAmount(tb.grand_total_credit)}
                    </td>
                    <td className='border-l px-3 py-3 text-left font-mono text-sm text-blue-700 dark:text-blue-300'>
                      {formatAmount(tb.grand_ending_debit)}
                    </td>
                    <td className='px-3 py-3 text-left font-mono text-sm text-purple-700 dark:text-purple-300'>
                      {formatAmount(tb.grand_ending_credit)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
