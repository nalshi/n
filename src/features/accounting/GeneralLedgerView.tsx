import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookText, Download, Printer } from 'lucide-react'
import { useMerchantIdentity } from '@/hooks/useMerchantRealtime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AccountingQueryError } from './AccountingQueryError'
import {
  accountingQueryKeys,
  fetchAccountingSettings,
  fetchAccounts,
  fetchGeneralLedger,
  formatMinorUnits,
} from './accounting-data'

export function GeneralLedgerView() {
  const merchantId = useMerchantIdentity()
  const [startDate, setStartDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-01-01`
  })
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all')
  const hasValidDateRange = startDate <= endDate

  const settingsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'settings'],
    queryFn: fetchAccountingSettings,
    enabled: Boolean(merchantId),
  })

  const accountsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'accounts'],
    queryFn: fetchAccounts,
    enabled: Boolean(merchantId),
  })

  const ledgerQuery = useQuery({
    queryKey: [
      ...accountingQueryKeys(merchantId || ''),
      'general-ledger',
      startDate,
      endDate,
      selectedAccountId,
    ],
    queryFn: () =>
      fetchGeneralLedger(
        startDate || undefined,
        endDate || undefined,
        selectedAccountId !== 'all' ? selectedAccountId : undefined
      ),
    enabled: Boolean(merchantId) && hasValidDateRange,
  })

  const accounts = accountsQuery.data || []
  const ledgerData = ledgerQuery.data
  const currency = settingsQuery.data?.functional_currency
  const formatAmount = (amount: number) =>
    currency ? formatMinorUnits(amount, currency) : '—'

  const handlePrint = () => {
    window.print()
  }

  const handleExportCsv = () => {
    if (!ledgerData) return
    const rows = [
      [
        'رمز الحساب',
        'اسم الحساب',
        'التاريخ',
        'رقم القيد',
        'البيان',
        'مدين',
        'دائن',
        'الرصيد التراكمي',
      ],
    ]
    for (const acc of ledgerData.accounts) {
      rows.push([
        acc.account.account_code,
        acc.account.name,
        'رصيد افتتاحي',
        '-',
        '-',
        '-',
        '-',
        String(acc.opening_balance),
      ])
      for (const ent of acc.entries) {
        rows.push([
          acc.account.account_code,
          acc.account.name,
          ent.entry_date,
          ent.journal_number,
          `"${(ent.description || '').replace(/"/g, '""')}"`,
          String(ent.debit_minor_units),
          String(ent.credit_minor_units),
          String(ent.running_balance),
        ])
      }
      rows.push([
        acc.account.account_code,
        acc.account.name,
        'رصيد ختامي',
        '-',
        '-',
        String(acc.period_debit),
        String(acc.period_credit),
        String(acc.closing_balance),
      ])
    }
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      rows.map((e) => e.join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `general_ledger_${startDate}_${endDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
        <div>
          <h2 className='text-lg font-bold'>
            دفتر الأستاذ العام (General Ledger)
          </h2>
          <p className='text-sm text-muted-foreground'>
            كشف حركة الحسابات المالية والأرصدة الافتتاحية والختامية خلال الفترة
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
          >
            <Download className='size-4' />
            <span>تصدير CSV</span>
          </Button>
        </div>
      </div>

      {/* شريط الفلاتر */}
      <Card className='shadow-xs'>
        <CardContent className='p-4'>
          <div className='grid grid-cols-1 items-end gap-3 sm:grid-cols-3'>
            <div className='space-y-1.5'>
              <Label>تاريخ البداية</Label>
              <Input
                type='date'
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className='space-y-1.5'>
              <Label>تاريخ النهاية</Label>
              <Input
                type='date'
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div className='space-y-1.5'>
              <Label>تصفية بحساب معين</Label>
              <Select
                value={selectedAccountId}
                onValueChange={setSelectedAccountId}
              >
                <SelectTrigger>
                  <SelectValue placeholder='كافة الحسابات' />
                </SelectTrigger>
                <SelectContent className='max-h-60'>
                  <SelectItem value='all'>كافة الحسابات</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.account_code} - {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {settingsQuery.isError && (
        <AccountingQueryError
          error={settingsQuery.error}
          onRetry={() => void settingsQuery.refetch()}
        />
      )}
      {!settingsQuery.isPending && !settingsQuery.isError && !currency && (
        <p
          role='alert'
          className='rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-200'
        >
          حدد العملة الوظيفية من إعدادات المحاسبة لعرض المبالغ.
        </p>
      )}
      {accountsQuery.isError && (
        <AccountingQueryError
          error={accountsQuery.error}
          onRetry={() => void accountsQuery.refetch()}
        />
      )}

      {/* بطاقات الملخص الإجمالي لدفتر الأستاذ */}
      {ledgerData && (
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
          <div className='rounded-xl border bg-card p-3.5'>
            <div className='text-xs font-medium text-muted-foreground'>
              إجمالي حركات المدين في الفترة
            </div>
            <div className='mt-1 font-mono text-xl font-bold text-blue-600'>
              {formatAmount(ledgerData.grand_period_debit)}
            </div>
          </div>

          <div className='rounded-xl border bg-card p-3.5'>
            <div className='text-xs font-medium text-muted-foreground'>
              إجمالي حركات الدائن في الفترة
            </div>
            <div className='mt-1 font-mono text-xl font-bold text-purple-600'>
              {formatAmount(ledgerData.grand_period_credit)}
            </div>
          </div>

          <div className='rounded-xl border bg-card p-3.5'>
            <div className='text-xs font-medium text-muted-foreground'>
              عدد الحسابات المشمولة في الكشف
            </div>
            <div className='mt-1 font-mono text-xl font-bold text-foreground'>
              {ledgerData.accounts.length} حساب
            </div>
          </div>
        </div>
      )}

      {/* حسابات دفتر الأستاذ وسطورها */}
      {!hasValidDateRange ? (
        <p
          role='alert'
          className='rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'
        >
          تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.
        </p>
      ) : ledgerQuery.isLoading ? (
        <div className='py-12 text-center text-muted-foreground'>
          جاري تحميل دفتر الأستاذ...
        </div>
      ) : ledgerQuery.isError ? (
        <AccountingQueryError
          error={ledgerQuery.error}
          onRetry={() => void ledgerQuery.refetch()}
        />
      ) : !ledgerData || ledgerData.accounts.length === 0 ? (
        <Card>
          <CardContent className='py-12 text-center text-muted-foreground'>
            <BookText className='mx-auto mb-2 size-8 opacity-40' />
            <p>لا توجد حركات مسجلة للحسابات المحددة في هذا النطاق الزمني.</p>
          </CardContent>
        </Card>
      ) : (
        <div className='space-y-6'>
          {ledgerData.accounts.map((accItem) => (
            <Card
              key={accItem.account.id}
              className='overflow-hidden shadow-xs'
            >
              <CardHeader className='flex flex-row items-center justify-between bg-muted/30 pb-3'>
                <div className='flex items-center gap-2'>
                  <span className='rounded bg-primary/10 px-2 py-0.5 font-mono text-sm font-bold text-primary'>
                    {accItem.account.account_code}
                  </span>
                  <CardTitle className='text-base'>
                    {accItem.account.name}
                  </CardTitle>
                  <Badge variant='outline' className='text-xs'>
                    {accItem.account.normal_balance === 'debit'
                      ? 'طبيعة مدينة'
                      : 'طبيعة دائنة'}
                  </Badge>
                </div>

                <div className='font-mono text-xs font-medium'>
                  <span className='ml-1 text-muted-foreground'>
                    الرصيد الافتتاحي:
                  </span>
                  <span className='font-bold'>
                    {' '}
                    {formatAmount(Math.abs(accItem.opening_balance))}
                  </span>
                </div>
              </CardHeader>

              <CardContent className='p-0'>
                <div className='overflow-x-auto'>
                  <table className='w-full text-right text-sm'>
                    <thead className='border-b bg-muted/40 text-xs text-muted-foreground'>
                      <tr>
                        <th className='px-3 py-2'>التاريخ</th>
                        <th className='px-3 py-2'>رقم القيد</th>
                        <th className='px-3 py-2'>البيان</th>
                        <th className='px-3 py-2 text-left'>مدين</th>
                        <th className='px-3 py-2 text-left'>دائن</th>
                        <th className='px-3 py-2 text-left'>
                          الرصيد بعد الحركة
                        </th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-border/60'>
                      {accItem.entries.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className='py-4 text-center text-xs text-muted-foreground'
                          >
                            لا توجد حركات خلال الفترة المحددة.
                          </td>
                        </tr>
                      ) : (
                        accItem.entries.map((entry) => (
                          <tr
                            key={entry.line_id}
                            className='text-xs hover:bg-muted/20'
                          >
                            <td className='px-3 py-2 font-mono text-muted-foreground'>
                              {entry.entry_date}
                            </td>
                            <td className='px-3 py-2 font-mono font-medium text-primary'>
                              {entry.journal_number}
                            </td>
                            <td className='max-w-sm truncate px-3 py-2'>
                              {entry.description}
                            </td>
                            <td className='px-3 py-2 text-left font-mono font-semibold text-blue-600'>
                              {entry.debit_minor_units > 0
                                ? formatAmount(entry.debit_minor_units)
                                : '-'}
                            </td>
                            <td className='px-3 py-2 text-left font-mono font-semibold text-purple-600'>
                              {entry.credit_minor_units > 0
                                ? formatAmount(entry.credit_minor_units)
                                : '-'}
                            </td>
                            <td className='px-3 py-2 text-left font-mono font-bold'>
                              {formatAmount(Math.abs(entry.running_balance))}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className='border-t bg-muted/30 text-xs font-bold'>
                      <tr>
                        <td colSpan={3} className='px-3 py-2.5 text-right'>
                          إجمالي حركة الفترة والرصيد الختامي:
                        </td>
                        <td className='px-3 py-2.5 text-left font-mono text-blue-600'>
                          {formatAmount(accItem.period_debit)}
                        </td>
                        <td className='px-3 py-2.5 text-left font-mono text-purple-600'>
                          {formatAmount(accItem.period_credit)}
                        </td>
                        <td className='px-3 py-2.5 text-left font-mono text-foreground'>
                          {formatAmount(Math.abs(accItem.closing_balance))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
