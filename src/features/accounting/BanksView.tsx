import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  CreditCard,
  Landmark,
  LoaderCircle,
  Plus,
  Search,
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

export function BanksView() {
  const merchantId = useMerchantIdentity()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  // Modals
  const [isAddBankOpen, setIsAddBankOpen] = useState(false)
  const [isTransferOpen, setIsTransferOpen] = useState(false)
  const [isBankPaymentOpen, setIsBankPaymentOpen] = useState(false)
  const [paymentType, setPaymentType] = useState<'receipt' | 'voucher'>(
    'voucher'
  )

  // Form states - Add Bank
  const [bankName, setBankName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')

  // Form states - Transfer
  const [sourceAccountId, setSourceAccountId] = useState('')
  const [destAccountId, setDestAccountId] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [transferDate, setTransferDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [transferDesc, setTransferDesc] = useState('')

  // Form states - Bank Payment / Receipt
  const [payNumber, setPayNumber] = useState('')
  const [payDate, setPayDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [payAmount, setPayAmount] = useState('')
  const [payDesc, setPayDesc] = useState('')
  const [payBeneficiary, setPayBeneficiary] = useState('')
  const [payBankAccountId, setPayBankAccountId] = useState('')

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
      'bank-view',
    ],
    queryFn: () => fetchPayments(),
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

  const bankAccounts = desks.filter((d) => d.type === 'bank')
  const payments = paymentsData?.payments || []

  // Mutations
  const createBankMutation = useMutation({
    mutationFn: createCashDesk,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: accountingQueryKeys(merchantId || ''),
      })
      toast.success('تمت إضافة الحساب البنكي وربطه بشجرة الحسابات بنجاح.')
      setIsAddBankOpen(false)
      setBankName('')
      setAccountName('')
      setAccountNumber('')
    },
    onError: (err) => {
      toast.error(err.message || 'فشل إضافة الحساب البنكي.')
    },
  })

  const recordTransferMutation = useMutation({
    mutationFn: recordTransfer,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: accountingQueryKeys(merchantId || ''),
      })
      toast.success('تم تسجيل التحويل البنكي وترحيل القيد المحاسبي بنجاح.')
      setIsTransferOpen(false)
      setSourceAccountId('')
      setDestAccountId('')
      setTransferAmount('')
      setTransferDesc('')
    },
    onError: (err) => {
      toast.error(err.message || 'فشل تسجيل التحويل.')
    },
  })

  const createPaymentMutation = useMutation({
    mutationFn: createPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: accountingQueryKeys(merchantId || ''),
      })
      toast.success('تم حفظ الحركة البنكية وترحيل قيدها المحاسبي بنجاح.')
      setIsBankPaymentOpen(false)
      setPayNumber('')
      setPayAmount('')
      setPayDesc('')
      setPayBeneficiary('')
    },
    onError: (err) => {
      toast.error(err.message || 'فشل حفظ الحركة.')
    },
  })

  function handleCreateBank(e: FormEvent) {
    e.preventDefault()
    if (!accountName.trim() || !bankName.trim()) {
      toast.error('يرجى ملء اسم البنك واسم الحساب.')
      return
    }
    createBankMutation.mutate({
      name: `${bankName.trim()} - ${accountName.trim()}`,
      type: 'bank',
      bank_name: bankName.trim(),
      account_number: accountNumber.trim() || undefined,
    })
  }

  function handleTransfer(e: FormEvent) {
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
      description: transferDesc.trim() || 'تحويل بنكي',
    })
  }

  function handleBankPayment(e: FormEvent) {
    e.preventDefault()
    if (!currency) {
      toast.error('حدد العملة الوظيفية في إعدادات المحاسبة قبل تسجيل الحركة.')
      return
    }
    const minorUnits = amountToMinorUnits(payAmount, currency)
    if (minorUnits <= 0) {
      toast.error('يرجى إدخال مبلغ صالح أكبر من الصفر.')
      return
    }
    if (!payNumber.trim()) {
      toast.error('يرجى إدخال رقم الإشعار البنكي.')
      return
    }
    createPaymentMutation.mutate({
      payment_number: payNumber.trim(),
      payment_type: paymentType,
      payment_date: payDate,
      amount_minor_units: minorUnits,
      description:
        payDesc.trim() ||
        (paymentType === 'receipt' ? 'إيداع بنكي' : 'سحب / تحويل بنكي صادر'),
      beneficiary_name: payBeneficiary.trim() || undefined,
      cash_account_id: payBankAccountId || undefined,
    })
  }

  return (
    <div className='space-y-6'>
      {/* رأس الصفحة */}
      <div className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>
            الحسابات البنكية
          </h2>
          <p className='text-sm text-muted-foreground'>
            إدارة الحسابات البنكية، الإيداعات والسحوبات، والتحويلات المصرفية مع
            قيود القيد المزدوج الآلية
          </p>
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          <Button
            variant='outline'
            className='gap-1.5'
            onClick={() => {
              setPaymentType('receipt')
              setPayNumber(`DEP-${Date.now().toString().slice(-6)}`)
              setIsBankPaymentOpen(true)
            }}
          >
            <ArrowDownLeft className='size-4 text-emerald-600' />
            <span>إيداع بنكي</span>
          </Button>

          <Button
            variant='outline'
            className='gap-1.5'
            onClick={() => {
              setPaymentType('voucher')
              setPayNumber(`WT-${Date.now().toString().slice(-6)}`)
              setIsBankPaymentOpen(true)
            }}
          >
            <ArrowUpRight className='size-4 text-rose-600' />
            <span>سحب / حوالة صادرة</span>
          </Button>

          <Button
            variant='outline'
            className='gap-1.5'
            onClick={() => setIsTransferOpen(true)}
          >
            <ArrowRightLeft className='size-4 text-blue-600' />
            <span>تحويل بين الحسابات</span>
          </Button>

          <Button className='gap-1.5' onClick={() => setIsAddBankOpen(true)}>
            <Plus className='size-4' />
            <span>إضافة حساب بنكي</span>
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
          حدد العملة الوظيفية من إعدادات المحاسبة لعرض المبالغ وتسجيل الحركات.
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
              الحسابات البنكية المسجلة
            </CardTitle>
            <Landmark className='size-4 text-primary' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {isDesksError ? '—' : bankAccounts.length}
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              حسابات مصرفية مربوطة بالدفتر تحت كود 1120
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>
              الحساب الرئيسي للعمليات
            </CardTitle>
            <Building2 className='size-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='truncate text-lg font-bold'>
              {bankAccounts[0]?.name || 'حساب البنوك العام (1120)'}
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              حساب التسويات المصرفية المعتمد
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>
              إجمالي الحركات البنكية
            </CardTitle>
            <CreditCard className='size-4 text-primary' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {isPaymentsError ? '—' : payments.length}
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              عملية مسجلة ومرحلة بالدفتر المحاسبي
            </p>
          </CardContent>
        </Card>
      </div>

      {/* قائمة الحسابات البنكية */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>الحسابات البنكية النشطة</CardTitle>
          <CardDescription>
            كافة الحسابات البنكية المسجلة للمنشأة مع أرقام الحسابات المرتبطة
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingDesks ? (
            <div className='flex items-center justify-center gap-2 py-8 text-muted-foreground'>
              <LoaderCircle className='size-4 animate-spin' />
              <span>جاري تحميل الحسابات البنكية...</span>
            </div>
          ) : isDesksError ? (
            <AccountingQueryError
              error={desksError}
              onRetry={() => void refetchDesks()}
            />
          ) : bankAccounts.length === 0 ? (
            <div className='py-8 text-center text-muted-foreground'>
              لا توجد حسابات بنكية مضافة بعد. انقر على &quot;إضافة حساب
              بنكي&quot; للبدء.
            </div>
          ) : (
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              {bankAccounts.map((b) => (
                <div
                  key={b.id}
                  className='flex flex-col justify-between space-y-3 rounded-xl border bg-muted/20 p-4'
                >
                  <div className='flex items-start justify-between'>
                    <div className='flex items-center gap-2'>
                      <div className='rounded-lg bg-blue-500/10 p-2 text-blue-600'>
                        <Landmark className='size-5' />
                      </div>
                      <div>
                        <h4 className='text-sm font-semibold'>{b.name}</h4>
                        <span className='text-xs text-muted-foreground'>
                          {b.bank_name || 'مصرف معتمد'}
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant='outline'
                      className='border-blue-500/30 text-xs text-blue-700 dark:text-blue-400'
                    >
                      حساب بنكي
                    </Badge>
                  </div>
                  <div className='space-y-1 border-t pt-2 text-xs text-muted-foreground'>
                    <div className='flex items-center justify-between'>
                      <span>رقم الحساب / IBAN:</span>
                      <span className='font-mono font-medium text-foreground'>
                        {b.account_number || '—'}
                      </span>
                    </div>
                    <div className='flex items-center justify-between'>
                      <span>معرف الدفتر:</span>
                      <span className='font-mono'>
                        {b.account_id ? b.account_id.slice(0, 8) : 'حساب 1120'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* الحركات الأخيرة */}
      <Card>
        <CardHeader>
          <div className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
            <div>
              <CardTitle className='text-base'>
                الحركات البنكية والقيود
              </CardTitle>
              <CardDescription>
                سجل العمليات المصرفية ومطابقتها مع القيود اليومية
              </CardDescription>
            </div>
            <div className='relative w-full sm:w-64'>
              <Search className='absolute top-2.5 right-2.5 size-4 text-muted-foreground' />
              <Input
                placeholder='بحث في الحركات البنكية...'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className='h-9 pr-9 text-xs'
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingPayments ? (
            <div className='flex items-center justify-center gap-2 py-8 text-muted-foreground'>
              <LoaderCircle className='size-4 animate-spin' />
              <span>جاري التحميل...</span>
            </div>
          ) : isPaymentsError ? (
            <AccountingQueryError
              error={paymentsError}
              onRetry={() => void refetchPayments()}
            />
          ) : payments.length === 0 ? (
            <div className='py-8 text-center text-muted-foreground'>
              لا توجد حركات مسجلة حالياً.
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-right text-sm'>
                <thead className='bg-muted/50 text-xs text-muted-foreground'>
                  <tr>
                    <th className='p-3'>رقم المرجع</th>
                    <th className='p-3'>نوع الحركة</th>
                    <th className='p-3'>التاريخ</th>
                    <th className='p-3'>المستفيد / الجهة</th>
                    <th className='p-3'>البيان</th>
                    <th className='p-3'>المبلغ</th>
                    <th className='p-3'>حالة القيد</th>
                  </tr>
                </thead>
                <tbody className='divide-y'>
                  {payments
                    .filter((p) => {
                      if (!search.trim()) return true
                      const term = search.toLowerCase()
                      return (
                        p.payment_number.toLowerCase().includes(term) ||
                        p.description.toLowerCase().includes(term)
                      )
                    })
                    .map((p) => (
                      <tr key={p.id} className='hover:bg-muted/30'>
                        <td className='p-3 font-mono font-medium'>
                          {p.payment_number}
                        </td>
                        <td className='p-3'>
                          <Badge
                            variant='outline'
                            className={
                              p.payment_type === 'receipt'
                                ? 'border-emerald-500/30 text-xs text-emerald-600'
                                : 'border-rose-500/30 text-xs text-rose-600'
                            }
                          >
                            {p.payment_type === 'receipt'
                              ? 'إيداع بنكي'
                              : 'حوالة / سحب'}
                          </Badge>
                        </td>
                        <td className='p-3 text-xs'>{p.payment_date}</td>
                        <td className='p-3 text-xs'>
                          {p.beneficiary_name || '—'}
                        </td>
                        <td className='max-w-xs truncate p-3 text-xs'>
                          {p.description}
                        </td>
                        <td className='p-3 text-xs font-bold tabular-nums'>
                          <span
                            className={
                              p.payment_type === 'receipt'
                                ? 'text-emerald-600'
                                : 'text-rose-600'
                            }
                          >
                            {p.payment_type === 'receipt' ? '+' : '-'}
                            {formatAmount(p.amount_minor_units)}
                          </span>
                        </td>
                        <td className='p-3 font-mono text-xs'>
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
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* مودال إضافة حساب بنكي */}
      <Dialog open={isAddBankOpen} onOpenChange={setIsAddBankOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>إضافة حساب بنكي جديد</DialogTitle>
            <DialogDescription>
              يتم إنشاء الحساب وربطه بشجرة الحسابات تحت حساب البنوك (1120).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateBank} className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='b-bank-name'>اسم البنك</Label>
              <Input
                id='b-bank-name'
                placeholder='مثال: بنك التضامن، بنك الكريمي، البنك الأهلي'
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                required
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='b-acc-name'>مسمى الحساب</Label>
              <Input
                id='b-acc-name'
                placeholder='مثال: الحساب الجاري بالريال، حساب المبيعات'
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                required
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='b-acc-num'>رقم الحساب أو الآيبان (IBAN)</Label>
              <Input
                id='b-acc-num'
                placeholder='رقم الحساب المصرفي'
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </div>
            <DialogFooter className='gap-2 sm:gap-0'>
              <Button
                type='button'
                variant='outline'
                onClick={() => setIsAddBankOpen(false)}
              >
                إلغاء
              </Button>
              <Button type='submit' disabled={createBankMutation.isPending}>
                {createBankMutation.isPending && (
                  <LoaderCircle className='ml-2 size-4 animate-spin' />
                )}
                حفظ الحساب البنكي
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* مودال حركة بنكية (إيداع / سحب) */}
      <Dialog open={isBankPaymentOpen} onOpenChange={setIsBankPaymentOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>
              {paymentType === 'receipt'
                ? 'تسجيل إيداع بنكي'
                : 'تسجيل سحب / حوالة صادرة'}
            </DialogTitle>
            <DialogDescription>
              إنهاء العملية وترحيل القيد المحاسبي المزدوج فوراً إلى الدفتر
              العام.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBankPayment} className='space-y-4'>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='bp-num'>رقم الإشعار / المرجع</Label>
                <Input
                  id='bp-num'
                  value={payNumber}
                  onChange={(e) => setPayNumber(e.target.value)}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='bp-date'>التاريخ</Label>
                <Input
                  id='bp-date'
                  type='date'
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='bp-amt'>المبلغ ({currency || '—'})</Label>
                <Input
                  id='bp-amt'
                  type='number'
                  step='0.01'
                  min='0.01'
                  placeholder='0.00'
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='bp-ben'>المستفيد / المودع</Label>
                <Input
                  id='bp-ben'
                  placeholder='اسم الجهة'
                  value={payBeneficiary}
                  onChange={(e) => setPayBeneficiary(e.target.value)}
                />
              </div>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='bp-bank-sel'>الحساب البنكي</Label>
              <Select
                value={payBankAccountId}
                onValueChange={setPayBankAccountId}
              >
                <SelectTrigger id='bp-bank-sel'>
                  <SelectValue placeholder='اختر الحساب البنكي' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=''>
                    حساب البنوك العام الافتراضي (1120)
                  </SelectItem>
                  {accounts
                    .filter(
                      (a) => a.account_code.startsWith('112') && a.is_postable
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
              <Label htmlFor='bp-desc'>البيان</Label>
              <Input
                id='bp-desc'
                placeholder='شرح العملية البنكية'
                value={payDesc}
                onChange={(e) => setPayDesc(e.target.value)}
                required
              />
            </div>

            <DialogFooter className='gap-2 sm:gap-0'>
              <Button
                type='button'
                variant='outline'
                onClick={() => setIsBankPaymentOpen(false)}
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
                ترحيل الحركة
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* مودال تحويل بين الحسابات */}
      <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>تحويل مصرفي بين الحسابات</DialogTitle>
            <DialogDescription>
              تسجيل تحويل أموال بين الحسابات البنكية والصناديق مع ترحيل قيد
              متوازن.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTransfer} className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='tr-src'>من حساب (المصدر - دائن)</Label>
              <Select
                value={sourceAccountId}
                onValueChange={setSourceAccountId}
              >
                <SelectTrigger id='tr-src'>
                  <SelectValue placeholder='اختر حساب المصدر' />
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
              <Label htmlFor='tr-dst'>إلى حساب (المستلم - مدين)</Label>
              <Select value={destAccountId} onValueChange={setDestAccountId}>
                <SelectTrigger id='tr-dst'>
                  <SelectValue placeholder='اختر حساب الاستلام' />
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
                <Label htmlFor='tr-amt2'>المبلغ ({currency || '—'})</Label>
                <Input
                  id='tr-amt2'
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
                <Label htmlFor='tr-date2'>التاريخ</Label>
                <Input
                  id='tr-date2'
                  type='date'
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='tr-desc2'>البيان</Label>
              <Input
                id='tr-desc2'
                placeholder='تحويل مصرفي'
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
