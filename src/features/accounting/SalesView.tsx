import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  LoaderCircle,
  Plus,
  Search,
  ShoppingBag,
} from 'lucide-react'
import { toast } from 'sonner'
import { useMerchantIdentity } from '@/hooks/useMerchantRealtime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { AccountingQueryError } from './AccountingQueryError'
import {
  accountingQueryKeys,
  amountToMinorUnits,
  fetchAccountingSettings,
  fetchContacts,
  fetchJournalEntries,
  postSalesOrder,
} from './accounting-data'

export function SalesView() {
  const merchantId = useMerchantIdentity()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // Form State
  const [orderNumber, setOrderNumber] = useState(
    () => `ORD-${Date.now().toString().slice(-6)}`
  )
  const [customerName, setCustomerName] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [orderDate, setOrderDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit'>('cash')
  const [totalAmount, setTotalAmount] = useState('')
  const [taxAmount, setTaxAmount] = useState('0')
  const [cogsAmount, setCogsAmount] = useState('')

  const settingsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'settings'],
    queryFn: fetchAccountingSettings,
    enabled: Boolean(merchantId),
  })

  const journalsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'journals'],
    queryFn: fetchJournalEntries,
    enabled: Boolean(merchantId),
  })

  const contactsQuery = useQuery({
    queryKey: [
      ...accountingQueryKeys(merchantId || ''),
      'contacts',
      'customer',
    ],
    queryFn: () => fetchContacts('customer'),
    enabled: Boolean(merchantId),
  })

  const salesJournals = (journalsQuery.data || []).filter(
    (j) => j.source_type === 'sales_invoice'
  )
  const customers = contactsQuery.data || []
  const currency = settingsQuery.data?.functional_currency

  const postMutation = useMutation({
    mutationFn: postSalesOrder,
    onSuccess: () => {
      toast.success('تم تسجيل وترحيل فاتورة المبيعات بنجاح في المحاسبة')
      queryClient.invalidateQueries({
        queryKey: accountingQueryKeys(merchantId || ''),
      })
      setIsCreateOpen(false)
      setOrderNumber(`ORD-${Date.now().toString().slice(-6)}`)
      setCustomerName('')
      setTotalAmount('')
      setTaxAmount('0')
      setCogsAmount('')
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'فشل تسجيل فاتورة المبيعات.'
      )
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!currency) {
      toast.error('حدد العملة الوظيفية في إعدادات المحاسبة قبل تسجيل الفاتورة.')
      return
    }
    if (!orderNumber.trim() || !totalAmount.trim()) {
      toast.error('رقم الفاتورة وإجمالي المبلغ حقول مطلوبة.')
      return
    }

    try {
      const totalMinor = amountToMinorUnits(totalAmount, currency)
      const taxMinor = taxAmount ? amountToMinorUnits(taxAmount, currency) : 0
      const cogsMinor = cogsAmount
        ? amountToMinorUnits(cogsAmount, currency)
        : 0

      postMutation.mutate({
        order_number: orderNumber.trim(),
        customer_name: customerName.trim() || undefined,
        customer_id: customerId || undefined,
        order_date: orderDate,
        payment_method: paymentMethod,
        total_amount_minor_units: totalMinor,
        tax_minor_units: taxMinor,
        cogs_amount_minor_units: cogsMinor,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'المبالغ غير صالحة.')
    }
  }

  const filtered = salesJournals.filter(
    (j) =>
      j.journal_number.toLowerCase().includes(search.toLowerCase()) ||
      j.description.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className='space-y-6'>
      <div className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
        <div>
          <h2 className='text-lg font-bold'>
            المبيعات والفواتير (Sales & Invoicing)
          </h2>
          <p className='text-sm text-muted-foreground'>
            تسجيل فواتير المبيعات النقدية والآجلة والربط الآلي مع المخزون
            والضرائب
          </p>
        </div>

        <Button
          onClick={() => setIsCreateOpen(true)}
          disabled={
            !currency || settingsQuery.isPending || settingsQuery.isError
          }
          className='gap-2 bg-emerald-600 hover:bg-emerald-700'
        >
          <Plus className='size-4' />
          <span>تسجيل فاتورة مبيعات جديدة</span>
        </Button>
      </div>

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
          حدد العملة الوظيفية من إعدادات المحاسبة قبل تسجيل الفواتير.
        </p>
      )}
      {contactsQuery.isError && (
        <AccountingQueryError
          error={contactsQuery.error}
          onRetry={() => void contactsQuery.refetch()}
        />
      )}

      {/* شريط البحث */}
      <div className='relative'>
        <Search className='absolute top-2.5 right-3 size-4 text-muted-foreground' />
        <Input
          placeholder='البحث برقم الفاتورة أو العميل...'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className='pr-9'
        />
      </div>

      {/* جدول فواتير المبيعات المرحّلة */}
      <Card className='shadow-xs'>
        <CardContent className='p-0'>
          {journalsQuery.isLoading ? (
            <div className='flex justify-center gap-2 py-8 text-muted-foreground'>
              <LoaderCircle className='size-4 animate-spin' />
              جاري تحميل فواتير المبيعات...
            </div>
          ) : journalsQuery.isError ? (
            <AccountingQueryError
              error={journalsQuery.error}
              onRetry={() => void journalsQuery.refetch()}
            />
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-right text-sm'>
                <thead className='border-b bg-muted/50 text-xs text-muted-foreground'>
                  <tr>
                    <th className='px-4 py-3'>رقم القيد / الفاتورة</th>
                    <th className='px-4 py-3'>التاريخ</th>
                    <th className='px-4 py-3'>البيان والتفاصيل</th>
                    <th className='px-4 py-3'>طريقة القيد</th>
                    <th className='px-4 py-3'>حالة الترحيل</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-border/60'>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className='py-12 text-center text-muted-foreground'
                      >
                        <ShoppingBag className='mx-auto mb-2 size-8 opacity-40' />
                        <p>لا توجد فواتير مبيعات مسجلة في المحاسبة حتى الآن.</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((sale) => (
                      <tr key={sale.id} className='hover:bg-muted/30'>
                        <td className='px-4 py-3 font-mono font-bold text-primary'>
                          {sale.journal_number}
                        </td>
                        <td className='px-4 py-3 font-mono text-xs text-muted-foreground'>
                          {sale.entry_date}
                        </td>
                        <td className='px-4 py-3 font-medium'>
                          {sale.description}
                        </td>
                        <td className='px-4 py-3'>
                          <Badge variant='outline' className='text-xs'>
                            قيد مبيعات آلي
                          </Badge>
                        </td>
                        <td className='px-4 py-3'>
                          <Badge
                            variant='default'
                            className='gap-1 bg-emerald-600 text-xs'
                          >
                            <CheckCircle2 className='size-3' /> مرحّل
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* نافذة تسجيل فاتورة مبيعات جديدة */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>تسجيل فاتورة مبيعات جديدة</DialogTitle>
            <DialogDescription>
              يولد النظام قيداً مزدوجاً متوازناً يربط الصندوق/العملاء بالمبيعات
              والضرائب وتكلفة المخزون
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className='space-y-4'>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <Label>رقم الفاتورة / الطلب</Label>
                <Input
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  required
                />
              </div>

              <div className='space-y-1.5'>
                <Label>تاريخ الفاتورة</Label>
                <Input
                  type='date'
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className='space-y-1.5'>
              <Label>طريقة البيع والتحصيل</Label>
              <Select
                value={paymentMethod}
                onValueChange={(val) =>
                  setPaymentMethod(val as 'cash' | 'credit')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='cash'>
                    بيع نقدي (مدين: الصندوق 1110)
                  </SelectItem>
                  <SelectItem value='credit'>
                    بيع آجل (مدين: العملاء والذمم 1130)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-1.5'>
              <Label>العميل</Label>
              {customers.length > 0 ? (
                <Select
                  value={customerId}
                  onValueChange={(val) => {
                    setCustomerId(val)
                    const found = customers.find((c) => c.id === val)
                    if (found) setCustomerName(found.name)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='اختر عميلاً مسجلاً أو أدخل اسماً' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=''>عميل نقدي عام</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.phone || 'بدون هاتف'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder='اسم العميل (مثال: عميل نقدي)'
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              )}
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <Label>إجمالي قيمة الفاتورة ({currency || '—'})</Label>
                <Input
                  type='number'
                  step='any'
                  placeholder='1000'
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  required
                  className='font-bold'
                />
              </div>

              <div className='space-y-1.5'>
                <Label>ضريبة المبيعات المستحقة ({currency || '—'})</Label>
                <Input
                  type='number'
                  step='any'
                  placeholder='0'
                  value={taxAmount}
                  onChange={(e) => setTaxAmount(e.target.value)}
                />
              </div>
            </div>

            <div className='space-y-1.5 rounded-lg border bg-muted/40 p-3'>
              <Label>تكلفة البضاعة المباعة ({currency || '—'}) - اختياري</Label>
              <Input
                type='number'
                step='any'
                placeholder='مثال: 600'
                value={cogsAmount}
                onChange={(e) => setCogsAmount(e.target.value)}
              />
              <p className='mt-1 text-xs text-muted-foreground'>
                إذا حُددت، يُخصم المخزون (1140) ويثبت قيد تكلفة البضاعة المباعة
                (5000) آلياً.
              </p>
            </div>

            <DialogFooter className='gap-2 pt-2 sm:gap-0'>
              <Button
                type='button'
                variant='outline'
                onClick={() => setIsCreateOpen(false)}
              >
                إلغاء
              </Button>
              <Button
                type='submit'
                disabled={postMutation.isPending || !currency}
                className='bg-emerald-600 hover:bg-emerald-700'
              >
                {postMutation.isPending
                  ? 'جاري الترحيل...'
                  : 'ترحيل الفاتورة إلى المحاسبة'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
