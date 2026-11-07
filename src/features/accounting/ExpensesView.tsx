import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  CheckCircle2,
  Clock,
  LoaderCircle,
  Plus,
  Receipt,
  RotateCcw,
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
  createExpense,
  fetchExpenses,
  formatMinorUnits,
  postExpense,
  reverseExpense,
  type ExpenseItem,
} from './accounting-data'

const EXPENSE_CATEGORIES = [
  { id: 'operational', label: 'مصروفات تشغيلية (6100)' },
  { id: 'salaries', label: 'رواتب وأجور (6200)' },
  { id: 'rent', label: 'إيجارات ومرافق (6300)' },
  { id: 'marketing', label: 'تسويق وإعلانات (6400)' },
  { id: 'other', label: 'مصروفات أخرى متنوعة (6500)' },
]

export function ExpensesView() {
  const merchantId = useMerchantIdentity()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedExpense, setSelectedExpense] = useState<ExpenseItem | null>(
    null
  )
  const [isReverseOpen, setIsReverseOpen] = useState(false)
  const [reverseReason, setReverseReason] = useState('')

  // Form states - Create Expense
  const [expenseNumber, setExpenseNumber] = useState('')
  const [expenseDate, setExpenseDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [category, setCategory] = useState('operational')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [taxAmount, setTaxAmount] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<
    'cash' | 'bank' | 'accrued'
  >('cash')
  const [postImmediately, setPostImmediately] = useState(true)

  // Queries
  const {
    data: expensesData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      ...accountingQueryKeys(merchantId || ''),
      'expenses',
      statusFilter,
      categoryFilter,
    ],
    queryFn: () =>
      fetchExpenses(
        statusFilter === 'all' ? undefined : statusFilter,
        categoryFilter === 'all' ? undefined : categoryFilter
      ),
    enabled: Boolean(merchantId),
  })

  const expenses = expensesData?.expenses || []

  // Mutations
  const createMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: accountingQueryKeys(merchantId || ''),
      })
      toast.success('تم تسجيل المصروف بنجاح وترحيله بالدفتر المحاسبي.')
      setIsCreateOpen(false)
      resetForm()
    },
    onError: (err) => {
      toast.error(err.message || 'فشل تسجيل المصروف.')
    },
  })

  const postMutation = useMutation({
    mutationFn: postExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: accountingQueryKeys(merchantId || ''),
      })
      toast.success('تم ترحيل المصروف وإنشاء القيد المحاسبي بنجاح.')
      setSelectedExpense(null)
    },
    onError: (err) => {
      toast.error(err.message || 'فشل ترحيل المصروف.')
    },
  })

  const reverseMutation = useMutation({
    mutationFn: ({
      expenseId,
      reason,
    }: {
      expenseId: string
      reason: string
    }) => reverseExpense(expenseId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: accountingQueryKeys(merchantId || ''),
      })
      toast.success('تم إلغاء المصروف وإنشاء القيد العكسي المتوازن بنجاح.')
      setIsReverseOpen(false)
      setSelectedExpense(null)
      setReverseReason('')
    },
    onError: (err) => {
      toast.error(err.message || 'فشل عكس المصروف.')
    },
  })

  function resetForm() {
    setExpenseNumber('')
    setExpenseDate(new Date().toISOString().slice(0, 10))
    setCategory('operational')
    setDescription('')
    setAmount('')
    setTaxAmount('')
    setVendorName('')
    setPaymentMethod('cash')
    setPostImmediately(true)
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault()
    const minorUnits = amountToMinorUnits(amount)
    if (minorUnits <= 0) {
      toast.error('يرجى إدخال مبلغ مصروف صالح أكبر من الصفر.')
      return
    }
    const taxMinorUnits = taxAmount ? amountToMinorUnits(taxAmount) : 0
    createMutation.mutate({
      expense_number:
        expenseNumber.trim() || `EXP-${Date.now().toString().slice(-6)}`,
      expense_date: expenseDate,
      category,
      description: description.trim(),
      amount_minor_units: minorUnits,
      tax_minor_units: taxMinorUnits,
      vendor_name: vendorName.trim() || undefined,
      payment_method: paymentMethod,
      post_immediately: postImmediately,
    })
  }

  const filteredExpenses = expenses.filter((exp) => {
    if (!search.trim()) return true
    const term = search.toLowerCase()
    return (
      exp.expense_number.toLowerCase().includes(term) ||
      exp.description.toLowerCase().includes(term) ||
      (exp.vendor_name && exp.vendor_name.toLowerCase().includes(term))
    )
  })

  const totalPostedAmount = expenses
    .filter((e) => e.status === 'posted')
    .reduce((sum, e) => sum + e.amount_minor_units, 0)

  return (
    <div className='space-y-6'>
      {/* رأس الصفحة وأزرار الإجراء */}
      <div className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>
            إدارة المصروفات التشغيلية
          </h2>
          <p className='text-sm text-muted-foreground'>
            تسجيل وتصنيف المصروفات، سدادها نقداً أو عبر البنك أو استحقاقاً، مع
            قيود محاسبية تلقائية
          </p>
        </div>
        <Button
          className='gap-1.5'
          onClick={() => {
            setExpenseNumber(`EXP-${Date.now().toString().slice(-6)}`)
            setIsCreateOpen(true)
          }}
        >
          <Plus className='size-4' />
          <span>تسجيل مصروف جديد</span>
        </Button>
      </div>

      {/* بطاقات المؤشرات */}
      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>
              إجمالي المصروفات المرحّلة
            </CardTitle>
            <Receipt className='size-4 text-primary' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-rose-600'>
              {isError ? '—' : formatMinorUnits(totalPostedAmount)}
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              محملة على حسابات الأرباح والخسائر (المصروفات 6000)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>
              المصروفات المرحّلة
            </CardTitle>
            <CheckCircle2 className='size-4 text-emerald-600' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {expenses.filter((e) => e.status === 'posted').length}
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              بند مصروف معتمد ومرحل
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>
              المسودات المعلقة
            </CardTitle>
            <Clock className='size-4 text-amber-500' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-amber-600'>
              {expenses.filter((e) => e.status === 'draft').length}
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              بانتظار المراجعة والترحيل النهائي
            </p>
          </CardContent>
        </Card>
      </div>

      {/* جدول المصروفات */}
      <Card>
        <CardHeader>
          <div className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
            <div>
              <CardTitle className='text-base'>سجل المصروفات</CardTitle>
              <CardDescription>
                كافة سندات وفواتير الصرف التشغيلية وبيانات ترحيلها
              </CardDescription>
            </div>
            <div className='flex w-full flex-wrap items-center gap-2 sm:w-auto'>
              <div className='relative flex-1 sm:w-60'>
                <Search className='absolute top-2.5 right-2.5 size-4 text-muted-foreground' />
                <Input
                  placeholder='بحث برقم المصروف أو البيان...'
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className='h-9 pr-9 text-xs'
                />
              </div>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className='h-9 w-36 text-xs'>
                  <SelectValue placeholder='التصنيف' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>كافة التصنيفات</SelectItem>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className='h-9 w-28 text-xs'>
                  <SelectValue placeholder='الحالة' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>كافة الحالات</SelectItem>
                  <SelectItem value='posted'>مرحل</SelectItem>
                  <SelectItem value='draft'>مسودة</SelectItem>
                  <SelectItem value='reversed'>ملغى</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className='flex items-center justify-center gap-2 py-8 text-muted-foreground'>
              <LoaderCircle className='size-4 animate-spin' />
              <span>جاري تحميل المصروفات...</span>
            </div>
          ) : isError ? (
            <AccountingQueryError
              error={error}
              onRetry={() => void refetch()}
            />
          ) : filteredExpenses.length === 0 ? (
            <div className='py-8 text-center text-muted-foreground'>
              لا توجد مصروفات مسجلة تطابق الفلتر الحالي.
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-right text-sm'>
                <thead className='bg-muted/50 text-xs text-muted-foreground'>
                  <tr>
                    <th className='p-3'>رقم المصروف</th>
                    <th className='p-3'>التاريخ</th>
                    <th className='p-3'>التصنيف</th>
                    <th className='p-3'>البيان</th>
                    <th className='p-3'>الجهة / المورد</th>
                    <th className='p-3'>طريقة الدفع</th>
                    <th className='p-3'>المبلغ</th>
                    <th className='p-3'>الحالة</th>
                    <th className='p-3'>الإجراءات</th>
                  </tr>
                </thead>
                <tbody className='divide-y'>
                  {filteredExpenses.map((exp) => (
                    <tr key={exp.id} className='hover:bg-muted/30'>
                      <td className='p-3 font-mono font-medium'>
                        {exp.expense_number}
                      </td>
                      <td className='p-3 text-xs'>{exp.expense_date}</td>
                      <td className='p-3 text-xs'>
                        <Badge variant='outline' className='text-xs'>
                          {EXPENSE_CATEGORIES.find((c) => c.id === exp.category)
                            ?.label || exp.category}
                        </Badge>
                      </td>
                      <td
                        className='max-w-xs truncate p-3 text-xs'
                        title={exp.description}
                      >
                        {exp.description}
                      </td>
                      <td className='p-3 text-xs'>{exp.vendor_name || '—'}</td>
                      <td className='p-3 text-xs'>
                        {exp.payment_method === 'cash'
                          ? 'نقدي'
                          : exp.payment_method === 'bank'
                            ? 'بنكي'
                            : 'مستحق'}
                      </td>
                      <td className='p-3 text-xs font-bold text-rose-600 tabular-nums'>
                        {formatMinorUnits(exp.amount_minor_units)}
                      </td>
                      <td className='p-3 text-xs'>
                        {exp.status === 'posted' ? (
                          <Badge className='gap-1 bg-emerald-600 text-xs'>
                            <CheckCircle2 className='size-3' />
                            <span>مرحل</span>
                          </Badge>
                        ) : exp.status === 'reversed' ? (
                          <Badge
                            variant='outline'
                            className='border-rose-500/30 text-xs text-rose-600'
                          >
                            ملغى بقيد عكسي
                          </Badge>
                        ) : (
                          <Badge variant='secondary' className='text-xs'>
                            مسودة
                          </Badge>
                        )}
                      </td>
                      <td className='p-3 text-xs'>
                        <div className='flex items-center gap-1.5'>
                          {exp.status === 'draft' && (
                            <Button
                              size='sm'
                              variant='outline'
                              className='h-7 gap-1 text-xs text-emerald-600'
                              onClick={() => postMutation.mutate(exp.id)}
                              disabled={postMutation.isPending}
                            >
                              <Check className='size-3' />
                              <span>ترحيل</span>
                            </Button>
                          )}
                          {exp.status === 'posted' && (
                            <Button
                              size='sm'
                              variant='ghost'
                              className='h-7 gap-1 text-xs text-rose-600 hover:text-rose-700'
                              onClick={() => {
                                setSelectedExpense(exp)
                                setIsReverseOpen(true)
                              }}
                            >
                              <RotateCcw className='size-3' />
                              <span>إلغاء</span>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* مودال تسجيل مصروف */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>تسجيل مصروف جديد</DialogTitle>
            <DialogDescription>
              تسجيل فاتورة أو سند مصروف مع إنشاء القيد المحاسبي المزدوج
              تلقائياً.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className='space-y-4'>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='exp-num'>رقم السند / الفاتورة</Label>
                <Input
                  id='exp-num'
                  value={expenseNumber}
                  onChange={(e) => setExpenseNumber(e.target.value)}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='exp-date'>التاريخ</Label>
                <Input
                  id='exp-date'
                  type='date'
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='exp-cat'>تصنيف المصروف</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id='exp-cat'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='exp-pay'>طريقة السداد</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v: 'cash' | 'bank' | 'accrued') =>
                    setPaymentMethod(v)
                  }
                >
                  <SelectTrigger id='exp-pay'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='cash'>
                      نقداً من الصندوق (1110)
                    </SelectItem>
                    <SelectItem value='bank'>تحويل من البنك (1120)</SelectItem>
                    <SelectItem value='accrued'>
                      أجل / التزام مستحق (2300)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='exp-desc'>البيان / تفاصيل المصروف</Label>
              <Input
                id='exp-desc'
                placeholder='شرح المصروف والغرض منه'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='exp-amt'>المبلغ الإجمالي</Label>
                <Input
                  id='exp-amt'
                  type='number'
                  step='0.01'
                  min='0.01'
                  placeholder='0.00'
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='exp-ven'>الجهة أو المستفيد (اختياري)</Label>
                <Input
                  id='exp-ven'
                  placeholder='اسم المورد أو مقدم الخدمة'
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                />
              </div>
            </div>

            <div className='flex items-center gap-2 pt-2'>
              <input
                type='checkbox'
                id='exp-post-now'
                checked={postImmediately}
                onChange={(e) => setPostImmediately(e.target.checked)}
                className='size-4 rounded accent-primary'
              />
              <Label htmlFor='exp-post-now' className='cursor-pointer text-xs'>
                ترحيل القيد المحاسبي فوراً إلى الدفتر العام
              </Label>
            </div>

            <DialogFooter className='gap-2 sm:gap-0'>
              <Button
                type='button'
                variant='outline'
                onClick={() => setIsCreateOpen(false)}
              >
                إلغاء
              </Button>
              <Button type='submit' disabled={createMutation.isPending}>
                {createMutation.isPending && (
                  <LoaderCircle className='ml-2 size-4 animate-spin' />
                )}
                حفظ المصروف
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* مودال إلغاء وعكس مصروف */}
      <Dialog open={isReverseOpen} onOpenChange={setIsReverseOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>إلغاء وعكس قيد المصروف</DialogTitle>
            <DialogDescription>
              وفقاً لقواعد المحاسبة المالية، لا يتم حذف السجلات المرحّلة، بل يتم
              إنشاء قيد عكسي متوازن يصحح الحسابات.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='rounded-lg bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-400'>
              المصروف المطلوب إلغاؤه: #{selectedExpense?.expense_number} بمبلغ{' '}
              {formatMinorUnits(selectedExpense?.amount_minor_units ?? 0)}
            </div>

            <div className='space-y-2'>
              <Label htmlFor='rev-reason'>سبب الإلغاء والعكس</Label>
              <Input
                id='rev-reason'
                placeholder='مثال: خطأ في التسجيل، تم استرداد المبلغ، فاتورة مكررة'
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                required
              />
            </div>

            <DialogFooter className='gap-2 sm:gap-0'>
              <Button
                type='button'
                variant='outline'
                onClick={() => setIsReverseOpen(false)}
              >
                تراجع
              </Button>
              <Button
                variant='destructive'
                onClick={() => {
                  if (!reverseReason.trim()) {
                    toast.error('يرجى كتابة سبب الإلغاء.')
                    return
                  }
                  if (selectedExpense) {
                    reverseMutation.mutate({
                      expenseId: selectedExpense.id,
                      reason: reverseReason.trim(),
                    })
                  }
                }}
                disabled={reverseMutation.isPending}
              >
                {reverseMutation.isPending && (
                  <LoaderCircle className='ml-2 size-4 animate-spin' />
                )}
                تأكيد الإلغاء والقيد العكسي
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
