import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CheckCircle2,
  LoaderCircle,
  Plus,
  Search,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
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
  createCashDesk,
  createPayment,
  fetchAccountingSettings,
  fetchAccounts,
  fetchCashDesks,
  fetchPayments,
  formatMinorUnits,
  recordTransfer,
} from './accounting-data'

export function CashView() {
  const merchantId = useMerchantIdentity()
  const queryClient = useQueryClient()
  const [filterType, setFilterType] = useState<string>('all')
  const [search, setSearch] = useState('')

  // Modals state
  const [isAddDeskOpen, setIsAddDeskOpen] = useState(false)
  const [isPaymentOpen, setIsPaymentOpen] = useState(false)
  const [paymentType, setPaymentType] = useState<'receipt' | 'voucher'>(
    'receipt'
  )
  const [isTransferOpen, setIsTransferOpen] = useState(false)

  // Form states - Add Cash Desk
  const [deskName, setDeskName] = useState('')

  // Form states - Payment (Receipt / Voucher)
  const [paymentNumber, setPaymentNumber] = useState('')
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDescription, setPaymentDescription] = useState('')
  const [paymentBeneficiary, setPaymentBeneficiary] = useState('')
  const [selectedCashAccountId, setSelectedCashAccountId] = useState('')

  // Form states - Transfer
  const [sourceAccountId, setSourceAccountId] = useState('')
  const [destAccountId, setDestAccountId] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [transferDate, setTransferDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [transferDesc, setTransferDesc] = useState('')

  const settingsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'settings'],
    queryFn: fetchAccountingSettings,
    enabled: Boolean(merchantId),
  })
  const currency = settingsQuery.data?.functional_currency
  const formatAmount = (amount: number) =>
    currency ? formatMinorUnits(amount, currency) : '—'

  // Queries
  const {
    data: desks = [],
    isLoading: isLoadingDesks,
    isError: isDesksError,
    error: desksError,
    refetch: refetchDesks,
  } = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'cash-desks'],
    queryFn: fetchCashDesks,
    enabled: Boolean(merchantId),
  })

  const {
    data: paymentsData,
    isLoading: isLoadingPayments,
    isError: isPaymentsError,
    error: paymentsError,
    refetch: refetchPayments,
  } = useQuery({
    queryKey: [
      ...accountingQueryKeys(merchantId || ''),
      'payments',
      filterType,
    ],
    queryFn: () => fetchPayments(filterType === 'all' ? undefined : filterType),
    enabled: Boolean(merchantId),
  })

  const {
    data: accounts = [],
    isError: isAccountsError,
    error: accountsError,
    refetch: refetchAccounts,
  } = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'accounts'],
    queryFn: fetchAccounts,
    enabled: Boolean(merchantId),
  })

  const cashDesks = desks.filter((d) => d.type === 'cash')
  const payments = paymentsData?.payments || []

  // Mutations
  const createDeskMutation = useMutation({
    mutationFn: createCashDesk,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: accountingQueryKeys(merchantId || ''),
      })
      toast.success('تم إنشاء الصندوق بنجاح وربطه بدليل الحسابات.')
      setIsAddDeskOpen(false)
      setDeskName('')
    },
    onError: (err) => {
      toast.error(err.message || 'فشل إنشاء الصندوق.')
    },
  })

  const createPaymentMutation = useMutation({
    mutationFn: createPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: accountingQueryKeys(merchantId || ''),
      })
      toast.success(
        paymentType === 'receipt'
          ? 'تم تسجيل سند القبض وترحيل القيد المحاسبي بنجاح.'
          : 'تم تسجيل سند الصرف وترحيل القيد المحاسبي بنجاح.'
      )
      setIsPaymentOpen(false)
      resetPaymentForm()
    },
    onError: (err) => {
      toast.error(err.message || 'فشل حفظ السند.')
    },
  })

  const recordTransferMutation = useMutation({
    mutationFn: recordTransfer,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: accountingQueryKeys(merchantId || ''),
      })
      toast.success('تم تسجيل التحويل وترحيل القيد المحاسبي بنجاح.')
      setIsTransferOpen(false)
      resetTransferForm()
    },
    onError: (err) => {
      toast.error(err.message || 'فشل تسجيل التحويل.')
    },
  })

  function resetPaymentForm() {
    setPaymentNumber('')
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setPaymentAmount('')
    setPaymentDescription('')
    setPaymentBeneficiary('')
    setSelectedCashAccountId('')
  }

  function resetTransferForm() {
    setSourceAccountId('')
    setDestAccountId('')
    setTransferAmount('')
    setTransferDate(new Date().toISOString().slice(0, 10))
    setTransferDesc('')
  }

  function handleCreateDesk(e: FormEvent) {
    e.preventDefault()
    if (!deskName.trim()) {
      toast.error('يرجى إدخال اسم الصندوق.')
      return
    }
    createDeskMutation.mutate({
      name: deskName.trim(),
      type: 'cash',
    })
  }

  function handleCreatePayment(e: FormEvent) {
    e.preventDefault()
    if (!currency) {
      toast.error('حدد العملة الوظيفية في إعدادات المحاسبة قبل تسجيل السند.')
      return
    }
    const minorUnits = amountToMinorUnits(paymentAmount, currency)
    if (minorUnits <= 0) {
      toast.error('يرجى إدخال مبلغ صالح أكبر من الصفر.')
      return
    }
    if (!paymentNumber.trim()) {
      toast.error('يرجى إدخال رقم السند.')
      return
    }
    createPaymentMutation.mutate({
      payment_number: paymentNumber.trim(),
      payment_type: paymentType,
      payment_date: paymentDate,
      amount_minor_units: minorUnits,
      description:
        paymentDescription.trim() ||
        (paymentType === 'receipt' ? 'سند قبض نقدي' : 'سند صرف نقدي'),
      beneficiary_name: paymentBeneficiary.trim() || undefined,
      cash_account_id: selectedCashAccountId || undefined,
    })
  }

  function handleRecordTransfer(e: FormEvent) {
    e.preventDefault()
    if (!sourceAccountId || !destAccountId) {
      toast.error('يرجى اختيار الحساب المصدر وحساب الاستلام.')
      return
    }
    if (sourceAccountId === destAccountId) {
      toast.error('لا يمكن التحويل من وإلى نفس الحساب.')
      return
    }
    if (!currency) {
      toast.error('حدد العملة الوظيفية في إعدادات المحاسبة قبل تسجيل التحويل.')
      return
    }
    const minorUnits = amountToMinorUnits(transferAmount, currency)
    if (minorUnits <= 0) {
      toast.error('يرجى إدخال مبلغ تحويل صالح أكبر من الصفر.')
      return
    }
    recordTransferMutation.mutate({
      source_account_id: sourceAccountId,
      destination_account_id: destAccountId,
      amount_minor_units: minorUnits,
      transfer_date: transferDate,
      description: transferDesc.trim() || 'تحويل نقدي بين حسابات الخزينة',
    })
  }

  const filteredPayments = payments.filter((p) => {
    if (!search.trim()) return true
    const term = search.toLowerCase()
    return (
      p.payment_number.toLowerCase().includes(term) ||
      (p.beneficiary_name && p.beneficiary_name.toLowerCase().includes(term)) ||
      p.description.toLowerCase().includes(term)
    )
  })

  const totalReceipts = payments
    .filter((p) => p.payment_type === 'receipt')
    .reduce((sum, p) => sum + p.amount_minor_units, 0)
  const totalVouchers = payments
    .filter((p) => p.payment_type === 'voucher')
    .reduce((sum, p) => sum + p.amount_minor_units, 0)

  return (
    <div className='space-y-6'>
      {/* رأس الصفحة وأزرار الإجراءات */}
      <div className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>
            الصناديق والخزينة
          </h2>
          <p className='text-sm text-muted-foreground'>
            إدارة الصناديق النقدية، سندات القبض والصرف، والتحويلات النقدية وفق
            الدفتر العام
          </p>
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          <Button
            variant='outline'
            className='gap-1.5'
            onClick={() => {
              setPaymentType('receipt')
              setPaymentNumber(`REC-${Date.now().toString().slice(-6)}`)
              setIsPaymentOpen(true)
            }}
          >
            <ArrowDownLeft className='size-4 text-emerald-600' />
            <span>سند قبض</span>
          </Button>

          <Button
            variant='outline'
            className='gap-1.5'
            onClick={() => {
              setPaymentType('voucher')
              setPaymentNumber(`PAY-${Date.now().toString().slice(-6)}`)
              setIsPaymentOpen(true)
            }}
          >
            <ArrowUpRight className='size-4 text-rose-600' />
            <span>سند صرف</span>
          </Button>

          <Button
            variant='outline'
            className='gap-1.5'
            onClick={() => setIsTransferOpen(true)}
          >
            <ArrowRightLeft className='size-4 text-blue-600' />
            <span>تحويل بين الخزائن</span>
          </Button>

          <Button className='gap-1.5' onClick={() => setIsAddDeskOpen(true)}>
            <Plus className='size-4' />
            <span>إضافة صندوق</span>
          </Button>
        </div>
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
          حدد العملة الوظيفية من إعدادات المحاسبة لعرض المبالغ وتسجيل السندات.
        </p>
      )}
      {isAccountsError && (
        <AccountingQueryError
          error={accountsError}
          onRetry={() => void refetchAccounts()}
        />
      )}

      {/* بطاقات الإحصائيات */}
      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>
              الصناديق النقدية
            </CardTitle>
            <Wallet className='size-4 text-primary' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {isDesksError ? '—' : cashDesks.length}
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              صناديق نقدية معرفة ومربوطة بشجرة الحسابات
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>
              إجمالي المقبوضات (سندات القبض)
            </CardTitle>
            <ArrowDownLeft className='size-4 text-emerald-600' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-emerald-600'>
              {isPaymentsError ? '—' : formatAmount(totalReceipts)}
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              متحصلات مقبوضة ومرحلة بالحسابات
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>
              إجمالي المصروفات (سندات الصرف)
            </CardTitle>
            <ArrowUpRight className='size-4 text-rose-600' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-rose-600'>
              {isPaymentsError ? '—' : formatAmount(totalVouchers)}
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              مدفوعات صادرة ومرحلة بالدفتر
            </p>
          </CardContent>
        </Card>
      </div>

      {/* قائمة الصناديق الحالية */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>الصناديق المسجلة</CardTitle>
          <CardDescription>
            الصناديق النقدية التابعة للمنشأة المربوطة بحساب 1110 (الصندوق)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingDesks ? (
            <div className='flex items-center justify-center gap-2 py-8 text-muted-foreground'>
              <LoaderCircle className='size-4 animate-spin' />
              <span>جاري تحميل الصناديق...</span>
            </div>
          ) : isDesksError ? (
            <AccountingQueryError
              error={desksError}
              onRetry={() => void refetchDesks()}
            />
          ) : cashDesks.length === 0 ? (
            <div className='py-8 text-center text-muted-foreground'>
              لا توجد صناديق نقدية مضافة حالياً. انقر على &quot;إضافة
              صندوق&quot; للبدء.
            </div>
          ) : (
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              {cashDesks.map((desk) => (
                <div
                  key={desk.id}
                  className='flex flex-col justify-between space-y-3 rounded-xl border bg-muted/20 p-4'
                >
                  <div className='flex items-start justify-between'>
                    <div className='flex items-center gap-2'>
                      <div className='rounded-lg bg-primary/10 p-2 text-primary'>
                        <Wallet className='size-5' />
                      </div>
                      <div>
                        <h4 className='text-sm font-semibold'>{desk.name}</h4>
                        <span className='text-xs text-muted-foreground'>
                          {desk.is_default ? 'صندوق افتراضي' : 'نشط'}
                        </span>
                      </div>
                    </div>
                    <Badge variant='outline' className='text-xs'>
                      صندوق نقدي
                    </Badge>
                  </div>
                  <div className='flex items-center justify-between border-t pt-2 text-xs text-muted-foreground'>
                    <span>معرف الحساب:</span>
                    <span className='font-mono text-foreground'>
                      {desk.account_id
                        ? desk.account_id.slice(0, 8)
                        : 'نظامي (1110)'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* جدول سندات القبض والصرف */}
      <Card>
        <CardHeader>
          <div className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
            <div>
              <CardTitle className='text-base'>سندات القبض والصرف</CardTitle>
              <CardDescription>
                سجل كافة المقبوضات والمدفوعات النقدية مع قيودها المحاسبية الآلية
              </CardDescription>
            </div>
            <div className='flex w-full flex-wrap items-center gap-2 sm:w-auto'>
              <div className='relative flex-1 sm:w-60'>
                <Search className='absolute top-2.5 right-2.5 size-4 text-muted-foreground' />
                <Input
                  placeholder='بحث برقم السند أو المستفيد...'
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className='h-9 pr-9 text-xs'
                />
              </div>

              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className='h-9 w-32 text-xs'>
                  <SelectValue placeholder='نوع السند' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>كافة السندات</SelectItem>
                  <SelectItem value='receipt'>سندات قبض</SelectItem>
                  <SelectItem value='voucher'>سندات صرف</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingPayments ? (
            <div className='flex items-center justify-center gap-2 py-8 text-muted-foreground'>
              <LoaderCircle className='size-4 animate-spin' />
              <span>جاري تحميل السندات...</span>
            </div>
          ) : isPaymentsError ? (
            <AccountingQueryError
              error={paymentsError}
              onRetry={() => void refetchPayments()}
            />
          ) : filteredPayments.length === 0 ? (
            <div className='py-8 text-center text-muted-foreground'>
              لا توجد سندات مسجلة تطابق معايير البحث.
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-right text-sm'>
                <thead className='bg-muted/50 text-xs text-muted-foreground'>
                  <tr>
                    <th className='p-3'>رقم السند</th>
                    <th className='p-3'>النوع</th>
                    <th className='p-3'>التاريخ</th>
                    <th className='p-3'>المستفيد / العميل</th>
                    <th className='p-3'>الوصف</th>
                    <th className='p-3'>المبلغ</th>
                    <th className='p-3'>القيد المحاسبي</th>
                  </tr>
                </thead>
                <tbody className='divide-y'>
                  {filteredPayments.map((p) => {
                    const isReceipt = p.payment_type === 'receipt'
                    return (
                      <tr key={p.id} className='hover:bg-muted/30'>
                        <td className='p-3 font-mono font-medium'>
                          {p.payment_number}
                        </td>
                        <td className='p-3'>
                          <Badge
                            variant={isReceipt ? 'default' : 'secondary'}
                            className={
                              isReceipt
                                ? 'bg-emerald-600 text-xs hover:bg-emerald-700'
                                : 'border border-rose-500/30 text-xs text-rose-600 dark:text-rose-400'
                            }
                          >
                            {isReceipt ? 'سند قبض' : 'سند صرف'}
                          </Badge>
                        </td>
                        <td className='p-3 text-xs'>{p.payment_date}</td>
                        <td className='p-3 text-xs'>
                          {p.beneficiary_name || '—'}
                        </td>
                        <td
                          className='max-w-xs truncate p-3 text-xs'
                          title={p.description}
                        >
                          {p.description}
                        </td>
                        <td className='p-3 text-xs font-bold tabular-nums'>
                          <span
                            className={
                              isReceipt ? 'text-emerald-600' : 'text-rose-600'
                            }
                          >
                            {isReceipt ? '+' : '-'}
                            {formatAmount(p.amount_minor_units)}
                          </span>
                        </td>
                        <td className='p-3 font-mono text-xs text-muted-foreground'>
                          {p.journal_id ? (
                            <span className='inline-flex items-center gap-1 text-emerald-600'>
                              <CheckCircle2 className='size-3.5' />
                              <span>مرحل #{p.journal_id.slice(0, 8)}</span>
                            </span>
                          ) : (
                            'غير مرتبط'
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* مودال إضافة صندوق */}
      <Dialog open={isAddDeskOpen} onOpenChange={setIsAddDeskOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>إضافة صندوق نقدي جديد</DialogTitle>
            <DialogDescription>
              يتم إنشاء الصندوق وربطه مباشرة بحسابات الأصول النقدية المتداولة في
              الدفتر.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateDesk} className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='desk-name'>اسم الصندوق</Label>
              <Input
                id='desk-name'
                placeholder='مثال: صندوق الفرع الرئيسي، صندوق المبيعات النقدية'
                value={deskName}
                onChange={(e) => setDeskName(e.target.value)}
                required
              />
            </div>
            <DialogFooter className='gap-2 sm:gap-0'>
              <Button
                type='button'
                variant='outline'
                onClick={() => setIsAddDeskOpen(false)}
              >
                إلغاء
              </Button>
              <Button type='submit' disabled={createDeskMutation.isPending}>
                {createDeskMutation.isPending && (
                  <LoaderCircle className='ml-2 size-4 animate-spin' />
                )}
                حفظ الصندوق
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* مودال سند قبض / سند صرف */}
      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {paymentType === 'receipt'
                ? 'إنشاء سند قبض نقدي'
                : 'إنشاء سند صرف نقدي'}
            </DialogTitle>
            <DialogDescription>
              {paymentType === 'receipt'
                ? 'تسجيل تحصيل نقدي وترحيل قيد (مدين: الصندوق / دائن: الحساب المعني)'
                : 'تسجيل صرف نقدي وترحيل قيد (مدين: الحساب المعني / دائن: الصندوق)'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreatePayment} className='space-y-4'>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='p-num'>رقم السند</Label>
                <Input
                  id='p-num'
                  value={paymentNumber}
                  onChange={(e) => setPaymentNumber(e.target.value)}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='p-date'>التاريخ</Label>
                <Input
                  id='p-date'
                  type='date'
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='p-amt'>المبلغ ({currency || '—'})</Label>
                <Input
                  id='p-amt'
                  type='number'
                  step='0.01'
                  min='0.01'
                  placeholder='0.00'
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='p-ben'>
                  {paymentType === 'receipt' ? 'المستلم منه' : 'المستفيد'}
                </Label>
                <Input
                  id='p-ben'
                  placeholder='اسم الشخص أو الجهة'
                  value={paymentBeneficiary}
                  onChange={(e) => setPaymentBeneficiary(e.target.value)}
                />
              </div>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='p-desc'>البيان / الوصف</Label>
              <Input
                id='p-desc'
                placeholder='شرح العملية وأسباب الصرف أو التحصيل'
                value={paymentDescription}
                onChange={(e) => setPaymentDescription(e.target.value)}
                required
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='p-cash-acc'>
                حساب الصندوق (اختياري - افتراضياً الصندوق العام)
              </Label>
              <Select
                value={selectedCashAccountId}
                onValueChange={setSelectedCashAccountId}
              >
                <SelectTrigger id='p-cash-acc'>
                  <SelectValue placeholder='اختر الصندوق المطلوب' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=''>
                    الصندوق العام الافتراضي (1110)
                  </SelectItem>
                  {accounts
                    .filter(
                      (a) => a.account_code.startsWith('111') && a.is_postable
                    )
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.account_code} - {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className='gap-2 sm:gap-0'>
              <Button
                type='button'
                variant='outline'
                onClick={() => setIsPaymentOpen(false)}
              >
                إلغاء
              </Button>
              <Button
                type='submit'
                disabled={createPaymentMutation.isPending || !currency}
              >
                {createPaymentMutation.isPending && (
                  <LoaderCircle className='ml-2 size-4 animate-spin' />
                )}
                حفظ وترحيل السند
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* مودال التحويل النقدي */}
      <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>تحويل نقدي بين الحسابات والخزائن</DialogTitle>
            <DialogDescription>
              تسجيل تحويل أموال بين الصناديق أو البنوك مع إنشاء قيد محاسبي مزدوج
              ومتوازن فوراً.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecordTransfer} className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='source-acc'>من حساب (المصدر - دائن)</Label>
              <Select
                value={sourceAccountId}
                onValueChange={setSourceAccountId}
              >
                <SelectTrigger id='source-acc'>
                  <SelectValue placeholder='اختر الحساب المحول منه' />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter(
                      (a) =>
                        (a.account_code.startsWith('111') ||
                          a.account_code.startsWith('112')) &&
                        a.is_postable
                    )
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.account_code} - {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='dest-acc'>إلى حساب (المستلم - مدين)</Label>
              <Select value={destAccountId} onValueChange={setDestAccountId}>
                <SelectTrigger id='dest-acc'>
                  <SelectValue placeholder='اختر الحساب المحول إليه' />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter(
                      (a) =>
                        (a.account_code.startsWith('111') ||
                          a.account_code.startsWith('112')) &&
                        a.is_postable
                    )
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.account_code} - {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='tr-amt'>المبلغ ({currency || '—'})</Label>
                <Input
                  id='tr-amt'
                  type='number'
                  step='0.01'
                  min='0.01'
                  placeholder='0.00'
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='tr-date'>التاريخ</Label>
                <Input
                  id='tr-date'
                  type='date'
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='tr-desc'>الوصف</Label>
              <Input
                id='tr-desc'
                placeholder='تحويل نقدي بين الصناديق'
                value={transferDesc}
                onChange={(e) => setTransferDesc(e.target.value)}
              />
            </div>

            <DialogFooter className='gap-2 sm:gap-0'>
              <Button
                type='button'
                variant='outline'
                onClick={() => setIsTransferOpen(false)}
              >
                إلغاء
              </Button>
              <Button
                type='submit'
                disabled={recordTransferMutation.isPending || !currency}
              >
                {recordTransferMutation.isPending && (
                  <LoaderCircle className='ml-2 size-4 animate-spin' />
                )}
                تنفيذ التحويل
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
