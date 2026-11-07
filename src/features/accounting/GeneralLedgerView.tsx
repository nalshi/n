import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BookText,
  Download,
  Printer,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
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
  fetchAccounts,
  fetchGeneralLedger,
  formatMinorUnits,
} from './accounting-data'

export function GeneralLedgerView() {
  const merchantId = useMerchantIdentity()
  const [startDate, setStartDate] = useState('2026-01-01')
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all')

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
    enabled: Boolean(merchantId),
  })

  const accounts = accountsQuery.data || []
  const ledgerData = ledgerQuery.data
  const currency = 'YER'

  const handlePrint = () => {
    window.print()
  }

  const handleExportCsv = () => {
    if (!ledgerData) return
    const rows = [
      ['رمز الحساب', 'اسم الحساب', 'التاريخ', 'رقم القيد', 'البيان', 'مدين', 'دائن', 'الرصيد التراكمي'],
    ]
    for (const acc of ledgerData.accounts) {
      rows.push([acc.account.account_code, acc.account.name, 'رصيد افتتاحي', '-', '-', '-', '-', String(acc.opening_balance)])
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
      rows.push([acc.account.account_code, acc.account.name, 'رصيد ختامي', '-', '-', String(acc.period_debit), String(acc.period_credit), String(acc.closing_balance)])
    }
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map((e) => e.join(',')).join('\n')
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
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
        <div>
          <h2 className='text-lg font-bold'>دفتر الأستاذ العام (General Ledger)</h2>
          <p className='text-sm text-muted-foreground'>
            كشف حركة الحسابات المالية والأرصدة الافتتاحية والختامية خلال الفترة
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

      {/* شريط الفلاتر */}
      <Card className='shadow-xs'>
        <CardContent className='p-4'>
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-3 items-end'>
            <div className='space-y-1.5'>
              <Label>تاريخ البداية</Label>
              <Input
                type='date'
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className='space-y-1.5'>
              <Label>تاريخ النهاية</Label>
              <Input
                type='date'
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div className='space-y-1.5'>
              <Label>تصفية بحساب معين</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
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

      {/* بطاقات الملخص الإجمالي لدفتر الأستاذ */}
      {ledgerData && (
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
          <div className='p-3.5 rounded-xl border bg-card'>
            <div className='text-xs text-muted-foreground font-medium'>إجمالي حركات المدين في الفترة</div>
            <div className='text-xl font-bold font-mono text-blue-600 mt-1'>
              {formatMinorUnits(ledgerData.grand_period_debit, currency)}
            </div>
          </div>

          <div className='p-3.5 rounded-xl border bg-card'>
            <div className='text-xs text-muted-foreground font-medium'>إجمالي حركات الدائن في الفترة</div>
            <div className='text-xl font-bold font-mono text-purple-600 mt-1'>
              {formatMinorUnits(ledgerData.grand_period_credit, currency)}
            </div>
          </div>

          <div className='p-3.5 rounded-xl border bg-card'>
            <div className='text-xs text-muted-foreground font-medium'>عدد الحسابات المشمولة في الكشف</div>
            <div className='text-xl font-bold font-mono text-foreground mt-1'>
              {ledgerData.accounts.length} حساب
            </div>
          </div>
        </div>
      )}

      {/* حسابات دفتر الأستاذ وسطورها */}
      {ledgerQuery.isLoading ? (
        <div className='py-12 text-center text-muted-foreground'>جاري تحميل دفتر الأستاذ...</div>
      ) : !ledgerData || ledgerData.accounts.length === 0 ? (
        <Card>
          <CardContent className='py-12 text-center text-muted-foreground'>
            <BookText className='size-8 mx-auto mb-2 opacity-40' />
            <p>لا توجد حركات مسجلة للحسابات المحددة في هذا النطاق الزمني.</p>
          </CardContent>
        </Card>
      ) : (
        <div className='space-y-6'>
          {ledgerData.accounts.map((accItem) => (
            <Card key={accItem.account.id} className='shadow-xs overflow-hidden'>
              <CardHeader className='bg-muted/30 pb-3 flex flex-row items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <span className='font-mono font-bold text-primary px-2 py-0.5 rounded bg-primary/10 text-sm'>
                    {accItem.account.account_code}
                  </span>
                  <CardTitle className='text-base'>{accItem.account.name}</CardTitle>
                  <Badge variant='outline' className='text-xs'>
                    {accItem.account.normal_balance === 'debit' ? 'طبيعة مدينة' : 'طبيعة دائنة'}
                  </Badge>
                </div>

                <div className='text-xs font-mono font-medium'>
                  <span className='text-muted-foreground ml-1'>الرصيد الافتتاحي:</span>
                  <span className='font-bold'>{formatMinorUnits(Math.abs(accItem.opening_balance), currency)}</span>
                </div>
              </CardHeader>

              <CardContent className='p-0'>
                <div className='overflow-x-auto'>
                  <table className='w-full text-sm text-right'>
                    <thead className='bg-muted/40 text-xs text-muted-foreground border-b'>
                      <tr>
                        <th className='py-2 px-3'>التاريخ</th>
                        <th className='py-2 px-3'>رقم القيد</th>
                        <th className='py-2 px-3'>البيان</th>
                        <th className='py-2 px-3 text-left'>مدين</th>
                        <th className='py-2 px-3 text-left'>دائن</th>
                        <th className='py-2 px-3 text-left'>الرصيد بعد الحركة</th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-border/60'>
                      {accItem.entries.length === 0 ? (
                        <tr>
                          <td colSpan={6} className='py-4 text-center text-xs text-muted-foreground'>
                            لا توجد حركات خلال الفترة المحددة.
                          </td>
                        </tr>
                      ) : (
                        accItem.entries.map((entry) => (
                          <tr key={entry.line_id} className='hover:bg-muted/20 text-xs'>
                            <td className='py-2 px-3 font-mono text-muted-foreground'>{entry.entry_date}</td>
                            <td className='py-2 px-3 font-mono font-medium text-primary'>{entry.journal_number}</td>
                            <td className='py-2 px-3 max-w-sm truncate'>{entry.description}</td>
                            <td className='py-2 px-3 text-left font-mono font-semibold text-blue-600'>
                              {entry.debit_minor_units > 0 ? formatMinorUnits(entry.debit_minor_units, currency) : '-'}
                            </td>
                            <td className='py-2 px-3 text-left font-mono font-semibold text-purple-600'>
                              {entry.credit_minor_units > 0 ? formatMinorUnits(entry.credit_minor_units, currency) : '-'}
                            </td>
                            <td className='py-2 px-3 text-left font-mono font-bold'>
                              {formatMinorUnits(Math.abs(entry.running_balance), currency)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className='bg-muted/30 text-xs font-bold border-t'>
                      <tr>
                        <td colSpan={3} className='py-2.5 px-3 text-right'>
                          إجمالي حركة الفترة والرصيد الختامي:
                        </td>
                        <td className='py-2.5 px-3 text-left font-mono text-blue-600'>
                          {formatMinorUnits(accItem.period_debit, currency)}
                        </td>
                        <td className='py-2.5 px-3 text-left font-mono text-purple-600'>
                          {formatMinorUnits(accItem.period_credit, currency)}
                        </td>
                        <td className='py-2.5 px-3 text-left font-mono text-foreground'>
                          {formatMinorUnits(Math.abs(accItem.closing_balance), currency)}
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
