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
import { useMerchantIdentity } from '@/hooks/useMerchantRealtime'
import {
  accountingQueryKeys,
  amountToMinorUnits,
  createCashDesk,
  createPayment,
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
  const [paymentType, setPaymentType] = useState<'receipt' | 'voucher'>('receipt')
  const [isTransferOpen, setIsTransferOpen] = useState(false)

  // Form states - Add Cash Desk
  const [deskName, setDeskName] = useState('')

  // Form states - Payment (Receipt / Voucher)
  const [paymentNumber, setPaymentNumber] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDescription, setPaymentDescription] = useState('')
  const [paymentBeneficiary, setPaymentBeneficiary] = useState('')
  const [selectedCashAccountId, setSelectedCashAccountId] = useState('')

  // Form states - Transfer
  const [sourceAccountId, setSourceAccountId] = useState('')
  const [destAccountId, setDestAccountId] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [transferDesc, setTransferDesc] = useState('')

  // Queries
  const { data: desks = [], isLoading: isLoadingDesks } = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'cash-desks'],
    queryFn: fetchCashDesks,
    enabled: Boolean(merchantId),
  })

  const { data: paymentsData, isLoading: isLoadingPayments } = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'payments', filterType],
    queryFn: () => fetchPayments(filterType === 'all' ? undefined : filterType),
    enabled: Boolean(merchantId),
  })

  const { data: accounts = [] } = useQuery({
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
      queryClient.invalidateQueries({ queryKey: accountingQueryKeys(merchantId || '') })
      toast.success('تم إنشاء الصندوق بنجاح وربطه بدليل الحسابات.')
      setIsAddDeskOpen(false)
      setDeskName('')
    },
    onError: (err: any) => {
      toast.error(err.message || 'فشل إنشاء الصندوق.')
    },
  })

  const createPaymentMutation = useMutation({
    mutationFn: createPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountingQueryKeys(merchantId || '') })
      toast.success(
        paymentType === 'receipt'
          ? 'تم تسجيل سند القبض وترحيل القيد المحاسبي بنجاح.'
          : 'تم تسجيل سند الصرف وترحيل القيد المحاسبي بنجاح.'
      )
      setIsPaymentOpen(false)
      resetPaymentForm()
    },
    onError: (err: any) => {
      toast.error(err.message || 'فشل حفظ السند.')
    },
  })

  const recordTransferMutation = useMutation({
    mutationFn: recordTransfer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountingQueryKeys(merchantId || '') })
      toast.success('تم تسجيل التحويل وترحيل القيد المحاسبي بنجاح.')
      setIsTransferOpen(false)
      resetTransferForm()
    },
    onError: (err: any) => {
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
    const minorUnits = amountToMinorUnits(paymentAmount)
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
      description: paymentDescription.trim() || (paymentType === 'receipt' ? 'سند قبض نقدي' : 'سند صرف نقدي'),
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
    const minorUnits = amountToMinorUnits(transferAmount)
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
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>الصناديق والخزينة</h2>
          <p className='text-muted-foreground text-sm'>
            إدارة الصناديق النقدية، سندات القبض والصرف، والتحويلات النقدية وفق الدفتر العام
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

          <Button
            className='gap-1.5'
            onClick={() => setIsAddDeskOpen(true)}
          >
            <Plus className='size-4' />
            <span>إضافة صندوق</span>
          </Button>
        </div>
      </div>

      {/* بطاقات الإحصائيات */}
      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>الصناديق النقدية</CardTitle>
            <Wallet className='size-4 text-primary' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{cashDesks.length}</div>
            <p className='text-xs text-muted-foreground mt-1'>
              صناديق نقدية معرفة ومربوطة بشجرة الحسابات
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>إجمالي المقبوضات (سندات القبض)</CardTitle>
            <ArrowDownLeft className='size-4 text-emerald-600' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-emerald-600'>
              {formatMinorUnits(totalReceipts)}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              متحصلات مقبوضة ومرحلة بالحسابات
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>إجمالي المصروفات (سندات الصرف)</CardTitle>
            <ArrowUpRight className='size-4 text-rose-600' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-rose-600'>
              {formatMinorUnits(totalVouchers)}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
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
            <div className='flex items-center justify-center py-8 text-muted-foreground gap-2'>
              <LoaderCircle className='size-4 animate-spin' />
              <span>جاري تحميل الصناديق...</span>
            </div>
          ) : cashDesks.length === 0 ? (
            <div className='py-8 text-center text-muted-foreground'>
              لا توجد صناديق نقدية مضافة حالياً. انقر على &quot;إضافة صندوق&quot; للبدء.
            </div>
          ) : (
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              {cashDesks.map((desk) => (
                <div
                  key={desk.id}
                  className='rounded-xl border p-4 bg-muted/20 flex flex-col justify-between space-y-3'
                >
                  <div className='flex items-start justify-between'>
                    <div className='flex items-center gap-2'>
                      <div className='p-2 rounded-lg bg-primary/10 text-primary'>
                        <Wallet className='size-5' />
                      </div>
                      <div>
                        <h4 className='font-semibold text-sm'>{desk.name}</h4>
                        <span className='text-xs text-muted-foreground'>
                          {desk.is_default ? 'صندوق افتراضي' : 'نشط'}
                        </span>
                      </div>
                    </div>
                    <Badge variant='outline' className='text-xs'>
                      صندوق نقدي
                    </Badge>
                  </div>
                  <div className='border-t pt-2 flex items-center justify-between text-xs text-muted-foreground'>
                    <span>معرف الحساب:</span>
                    <span className='font-mono text-foreground'>
                      {desk.account_id ? desk.account_id.slice(0, 8) : 'نظامي (1110)'}
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
          <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
            <div>
              <CardTitle className='text-base'>سندات القبض والصرف</CardTitle>
              <CardDescription>
                سجل كافة المقبوضات والمدفوعات النقدية مع قيودها المحاسبية الآلية
              </CardDescription>
            </div>
            <div className='flex flex-wrap items-center gap-2 w-full sm:w-auto'>
              <div className='relative flex-1 sm:w-60'>
                <Search className='absolute right-2.5 top-2.5 size-4 text-muted-foreground' />
                <Input
                  placeholder='بحث برقم السند أو المستفيد...'
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className='pr-9 h-9 text-xs'
                />
              </div>

              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className='w-32 h-9 text-xs'>
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
            <div className='flex items-center justify-center py-8 text-muted-foreground gap-2'>
              <LoaderCircle className='size-4 animate-spin' />
              <span>جاري تحميل السندات...</span>
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className='py-8 text-center text-muted-foreground'>
              لا توجد سندات مسجلة تطابق معايير البحث.
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm text-right'>
                <thead className='bg-muted/50 text-muted-foreground text-xs'>
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
                        <td className='p-3 font-mono font-medium'>{p.payment_number}</td>
                        <td className='p-3'>
                          <Badge
                            variant={isReceipt ? 'default' : 'secondary'}
                            className={
                              isReceipt
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-xs'
                                : 'text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs'
                            }
                          >
                            {isReceipt ? 'سند قبض' : 'سند صرف'}
                          </Badge>
                        </td>
                        <td className='p-3 text-xs'>{p.payment_date}</td>
                        <td className='p-3 text-xs'>
                          {p.beneficiary_name || '—'}
                        </td>
                        <td className='p-3 text-xs max-w-xs truncate' title={p.description}>
                          {p.description}
                        </td>
                        <td className='p-3 font-bold tabular-nums text-xs'>
                          <span className={isReceipt ? 'text-emerald-600' : 'text-rose-600'}>
                            {isReceipt ? '+' : '-'}{formatMinorUnits(p.amount_minor_units)}
                          </span>
                        </td>
                        <td className='p-3 text-xs font-mono text-muted-foreground'>
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
              يتم إنشاء الصندوق وربطه مباشرة بحسابات الأصول النقدية المتداولة في الدفتر.
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
                  <LoaderCircle className='size-4 animate-spin ml-2' />
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
              {paymentType === 'receipt' ? 'إنشاء سند قبض نقدي' : 'إنشاء سند صرف نقدي'}
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
                <Label htmlFor='p-amt'>المبلغ</Label>
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
              <Label htmlFor='p-cash-acc'>حساب الصندوق (اختياري - افتراضياً الصندوق العام)</Label>
              <Select
                value={selectedCashAccountId}
                onValueChange={setSelectedCashAccountId}
              >
                <SelectTrigger id='p-cash-acc'>
                  <SelectValue placeholder='اختر الصندوق المطلوب' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=''>الصندوق العام الافتراضي (1110)</SelectItem>
                  {accounts
                    .filter((a) => a.account_code.startsWith('111') && a.is_postable)
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
              <Button type='submit' disabled={createPaymentMutation.isPending}>
                {createPaymentMutation.isPending && (
                  <LoaderCircle className='size-4 animate-spin ml-2' />
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
              تسجيل تحويل أموال بين الصناديق أو البنوك مع إنشاء قيد محاسبي مزدوج ومتوازن فوراً.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecordTransfer} className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='source-acc'>من حساب (المصدر - دائن)</Label>
              <Select value={sourceAccountId} onValueChange={setSourceAccountId}>
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
                <Label htmlFor='tr-amt'>المبلغ</Label>
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
              <Button type='submit' disabled={recordTransferMutation.isPending}>
                {recordTransferMutation.isPending && (
                  <LoaderCircle className='size-4 animate-spin ml-2' />
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
