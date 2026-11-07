import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle2,
  CircleAlert,
  Download,
  Printer,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMerchantIdentity } from '@/hooks/useMerchantRealtime'
import {
  accountingQueryKeys,
  fetchTrialBalance,
  formatMinorUnits,
} from './accounting-data'

export function TrialBalanceView() {
  const merchantId = useMerchantIdentity()
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10))

  const trialBalanceQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'trial-balance-view', asOfDate],
    queryFn: () => fetchTrialBalance(asOfDate),
    enabled: Boolean(merchantId),
  })

  const tb = trialBalanceQuery.data
  const currency = 'YER'
  const isBalanced = tb?.is_balanced ?? true

  const handlePrint = () => {
    window.print()
  }

  const handleExportCsv = () => {
    if (!tb) return
    const rows = [
      ['رمز الحساب', 'اسم الحساب', 'التصنيف', 'الطبيعة', 'إجمالي المدين', 'إجمالي الدائن', 'رصيد مدين', 'رصيد دائن'],
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
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map((e) => e.join(',')).join('\n')
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
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
        <div>
          <h2 className='text-lg font-bold'>ميزان المراجعة بالأرصدة والمجاميع (Trial Balance)</h2>
          <p className='text-sm text-muted-foreground'>
            تقرير التحقق المحاسبي الشامل لضمان توازن دفتر الأستاذ وصحة القيود المرحّلة
          </p>
        </div>

        <div className='flex items-center gap-2'>
          <Button variant='outline' size='sm' onClick={handlePrint} className='gap-1.5'>
            <Printer className='size-4' />
            <span>طباعة</span>
          </Button>
          <Button variant='outline' size='sm' onClick={handleExportCsv} className='gap-1.5'>
            <Download className='size-4' />
            <span>تصدير CSV</span>
          </Button>
        </div>
      </div>

      {/* تنبيه التوازن الحاسم */}
      <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
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
              {isBalanced ? 'ميزان المراجعة متوازن تماماً' : 'تحذير: ميزان المراجعة غير متوازن!'}
            </h4>
            <p className='text-sm opacity-90 font-mono'>
              إجمالي المدين: {formatMinorUnits(tb?.grand_total_debit ?? 0, currency)} | إجمالي الدائن: {formatMinorUnits(tb?.grand_total_credit ?? 0, currency)}
            </p>
          </div>
        </div>

        <div className='flex items-center gap-2'>
          <Label htmlFor='asOfDate' className='text-xs shrink-0'>حتى تاريخ:</Label>
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
      <Card className='shadow-xs overflow-hidden'>
        <CardContent className='p-0'>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm text-right'>
              <thead className='bg-muted/60 text-xs text-muted-foreground border-b'>
                <tr>
                  <th rowSpan={2} className='py-3 px-3 align-bottom border-l'>رمز الحساب</th>
                  <th rowSpan={2} className='py-3 px-3 align-bottom border-l'>اسم الحساب</th>
                  <th rowSpan={2} className='py-3 px-3 align-bottom border-l text-center'>التصنيف</th>
                  <th colSpan={2} className='py-2 px-3 text-center border-b border-l bg-muted/80'>
                    مجاميع الحركات (Totals)
                  </th>
                  <th colSpan={2} className='py-2 px-3 text-center bg-muted/80'>
                    الأرصدة النهائية (Ending Balances)
                  </th>
                </tr>
                <tr>
                  <th className='py-2 px-3 text-left border-l font-mono text-blue-600'>مدين</th>
                  <th className='py-2 px-3 text-left border-l font-mono text-purple-600'>دائن</th>
                  <th className='py-2 px-3 text-left border-l font-mono text-blue-600'>مدين</th>
                  <th className='py-2 px-3 text-left font-mono text-purple-600'>دائن</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-border/60 text-xs'>
                {trialBalanceQuery.isLoading ? (
                  <tr>
                    <td colSpan={7} className='py-12 text-center text-muted-foreground'>
                      جاري تحميل بيانات ميزان المراجعة...
                    </td>
                  </tr>
                ) : !tb || tb.accounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className='py-12 text-center text-muted-foreground'>
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
                      <td className='py-2.5 px-3 font-mono font-medium text-primary border-l'>
                        {acc.account_code}
                      </td>
                      <td className='py-2.5 px-3 border-l font-medium'>{acc.name}</td>
                      <td className='py-2.5 px-3 border-l text-center'>
                        <Badge variant='outline' className='text-[10px] py-0'>
                          {acc.account_type}
                        </Badge>
                      </td>
                      <td className='py-2.5 px-3 text-left font-mono border-l text-blue-600'>
                        {acc.total_debit > 0 ? formatMinorUnits(acc.total_debit, currency) : '-'}
                      </td>
                      <td className='py-2.5 px-3 text-left font-mono border-l text-purple-600'>
                        {acc.total_credit > 0 ? formatMinorUnits(acc.total_credit, currency) : '-'}
                      </td>
                      <td className='py-2.5 px-3 text-left font-mono border-l font-semibold text-blue-700 dark:text-blue-300'>
                        {acc.ending_debit > 0 ? formatMinorUnits(acc.ending_debit, currency) : '-'}
                      </td>
                      <td className='py-2.5 px-3 text-left font-mono font-semibold text-purple-700 dark:text-purple-300'>
                        {acc.ending_credit > 0 ? formatMinorUnits(acc.ending_credit, currency) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {tb && (
                <tfoot className='bg-muted/60 text-xs font-bold border-t-2'>
                  <tr>
                    <td colSpan={3} className='py-3 px-3 text-right border-l font-bold'>
                      المجموع العام (Grand Totals):
                    </td>
                    <td className='py-3 px-3 text-left font-mono text-blue-600 border-l text-sm'>
                      {formatMinorUnits(tb.grand_total_debit, currency)}
                    </td>
                    <td className='py-3 px-3 text-left font-mono text-purple-600 border-l text-sm'>
                      {formatMinorUnits(tb.grand_total_credit, currency)}
                    </td>
                    <td className='py-3 px-3 text-left font-mono text-blue-700 dark:text-blue-300 border-l text-sm'>
                      {formatMinorUnits(tb.grand_ending_debit, currency)}
                    </td>
                    <td className='py-3 px-3 text-left font-mono text-purple-700 dark:text-purple-300 text-sm'>
                      {formatMinorUnits(tb.grand_ending_credit, currency)}
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
