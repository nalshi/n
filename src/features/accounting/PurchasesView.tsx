import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Clock,
  Plus,
  RotateCcw,
  Search,
  ShoppingCart,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
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
  createPurchase,
  fetchContacts,
  fetchPurchases,
  formatMinorUnits,
  postPurchase,
  reversePurchase,
  type PurchaseItem,
} from './accounting-data'

export function PurchasesView() {
  const merchantId = useMerchantIdentity()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseItem | null>(null)
  const [isReverseOpen, setIsReverseOpen] = useState(false)
  const [reverseReason, setReverseReason] = useState('')

  // Form State
  const [billNumber, setBillNumber] = useState(`BILL-${Date.now().toString().slice(-6)}`)
  const [supplierName, setSupplierName] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [paymentType, setPaymentType] = useState<'cash' | 'credit' | 'bank'>('credit')
  const [subtotal, setSubtotal] = useState('')
  const [tax, setTax] = useState('0')
  const [discount, setDiscount] = useState('0')
  const [notes, setNotes] = useState('')
  const [postImmediately] = useState(true)

  const purchasesQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'purchases', statusFilter],
    queryFn: () => fetchPurchases(statusFilter !== 'all' ? statusFilter : undefined),
    enabled: Boolean(merchantId),
  })

  const suppliersQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'contacts', 'supplier'],
    queryFn: () => fetchContacts('supplier'),
    enabled: Boolean(merchantId),
  })

  const purchases = purchasesQuery.data?.purchases || []
  const suppliers = suppliersQuery.data || []
  const currency = 'YER'

  const createMutation = useMutation({
    mutationFn: createPurchase,
    onSuccess: () => {
      toast.success(postImmediately ? 'تم تسجيل وترحيل فاتورة الشراء بنجاح' : 'تم حفظ مسودة فاتورة الشراء')
      queryClient.invalidateQueries({ queryKey: accountingQueryKeys(merchantId || '') })
      setIsCreateOpen(false)
      setBillNumber(`BILL-${Date.now().toString().slice(-6)}`)
      setSupplierName('')
      setSubtotal('')
      setTax('0')
      setDiscount('0')
      setNotes('')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'فشل تسجيل فاتورة الشراء.')
    },
  })

  const postMutation = useMutation({
    mutationFn: postPurchase,
    onSuccess: () => {
      toast.success('تم ترحيل فاتورة المشتريات وإثبات المخزون والذمم')
      queryClient.invalidateQueries({ queryKey: accountingQueryKeys(merchantId || '') })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'فشل ترحيل الفاتورة.')
    },
  })

  const reverseMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => reversePurchase(id, reason),
    onSuccess: () => {
      toast.success('تم إلغاء وعكس فاتورة الشراء بنجاح')
      queryClient.invalidateQueries({ queryKey: accountingQueryKeys(merchantId || '') })
      setIsReverseOpen(false)
      setSelectedPurchase(null)
      setReverseReason('')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'فشل عكس الفاتورة.')
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!billNumber.trim() || !subtotal.trim()) {
      toast.error('رقم الفاتورة والمبلغ حقول مطلوبة.')
      return
    }

    try {
      const subtotalMinor = amountToMinorUnits(subtotal, currency)
      const taxMinor = tax ? amountToMinorUnits(tax, currency) : 0
      const discountMinor = discount ? amountToMinorUnits(discount, currency) : 0

      createMutation.mutate({
        bill_number: billNumber.trim(),
        supplier_name: supplierName.trim() || 'مورد بضائع عام',
        supplier_id: supplierId || undefined,
        invoice_date: invoiceDate,
        due_date: dueDate || undefined,
        payment_type: paymentType,
        subtotal_minor_units: subtotalMinor,
        tax_minor_units: taxMinor,
        discount_minor_units: discountMinor,
        notes: notes.trim() || undefined,
        post_immediately: postImmediately,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'المبالغ غير صالحة.')
    }
  }

  const filtered = purchases.filter(
    (p) =>
      p.bill_number.toLowerCase().includes(search.toLowerCase()) ||
      p.supplier_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className='space-y-6'>
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
        <div>
          <h2 className='text-lg font-bold'>فواتير المشتريات والموردين (Purchases & Bills)</h2>
          <p className='text-sm text-muted-foreground'>
            تسجيل مشتريات البضائع، فواتير الموردين، وإثبات قيود المخزون والضريبة
          </p>
        </div>

        <Button onClick={() => setIsCreateOpen(true)} className='gap-2 bg-blue-600 hover:bg-blue-700'>
          <Plus className='size-4' />
          <span>تسجيل فاتورة شراء جديدة</span>
        </Button>
      </div>

      {/* شريط البحث والتصفية */}
      <div className='flex flex-col sm:flex-row gap-3'>
        <div className='relative flex-1'>
          <Search className='absolute right-3 top-2.5 size-4 text-muted-foreground' />
          <Input
            placeholder='البحث برقم الفاتورة أو اسم المورد...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='pr-9'
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className='w-full sm:w-48'>
            <SelectValue placeholder='حالة الفاتورة' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>كافة الحالات</SelectItem>
            <SelectItem value='posted'>مرحّلة (POSTED)</SelectItem>
            <SelectItem value='draft'>مسودة (DRAFT)</SelectItem>
            <SelectItem value='reversed'>معكوسة (REVERSED)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* جدول فواتير المشتريات */}
      <Card className='shadow-xs'>
        <CardContent className='p-0'>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm text-right'>
              <thead className='bg-muted/50 text-xs text-muted-foreground border-b'>
                <tr>
                  <th className='py-3 px-4'>رقم الفاتورة</th>
                  <th className='py-3 px-4'>اسم المورد</th>
                  <th className='py-3 px-4'>تاريخ الفاتورة</th>
                  <th className='py-3 px-4'>طريقة السداد</th>
                  <th className='py-3 px-4 text-left'>إجمالي المبلغ</th>
                  <th className='py-3 px-4'>الحالة</th>
                  <th className='py-3 px-4 text-center'>الإجراءات</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-border/60'>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className='py-12 text-center text-muted-foreground'>
                      <ShoppingCart className='size-8 mx-auto mb-2 opacity-40' />
                      <p>لا توجد فواتير مشتريات مسجلة.</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item.id} className='hover:bg-muted/30'>
                      <td className='py-3 px-4 font-mono font-bold text-primary'>
                        {item.bill_number}
                      </td>
                      <td className='py-3 px-4 font-medium'>{item.supplier_name}</td>
                      <td className='py-3 px-4 font-mono text-xs text-muted-foreground'>
                        {item.invoice_date}
                      </td>
                      <td className='py-3 px-4 text-xs'>
                        {item.payment_type === 'cash' ? 'نقدي' : item.payment_type === 'bank' ? 'بنكي' : 'آجل (ذمم)'}
                      </td>
                      <td className='py-3 px-4 text-left font-mono font-bold text-foreground'>
                        {formatMinorUnits(item.total_minor_units, currency)}
                      </td>
                      <td className='py-3 px-4'>
                        <Badge
                          variant={item.status === 'posted' ? 'default' : item.status === 'reversed' ? 'destructive' : 'secondary'}
                          className={item.status === 'posted' ? 'bg-emerald-600 gap-1' : 'gap-1'}
                        >
                          {item.status === 'posted' ? (
                            <>
                              <Check className='size-3' /> مرحّلة
                            </>
                          ) : item.status === 'reversed' ? (
                            <>
                              <RotateCcw className='size-3' /> ملغاة
                            </>
                          ) : (
                            <>
                              <Clock className='size-3' /> مسودة
                            </>
                          )}
                        </Badge>
                      </td>
                      <td className='py-3 px-4 text-center'>
                        <div className='flex items-center justify-center gap-1.5'>
                          {item.status === 'draft' && (
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => postMutation.mutate(item.id)}
                              disabled={postMutation.isPending}
                              className='text-emerald-600 gap-1 text-xs'
                            >
                              <Check className='size-3.5' /> ترحيل
                            </Button>
                          )}
                          {item.status === 'posted' && (
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => {
                                setSelectedPurchase(item)
                                setIsReverseOpen(true)
                              }}
                              className='text-destructive hover:bg-destructive/10 gap-1 text-xs'
                            >
                              <RotateCcw className='size-3.5' /> إلغاء
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* نافذة تسجيل فاتورة شراء جديدة */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>تسجيل فاتورة مشتريات جديدة</DialogTitle>
            <DialogDescription>
              إثبات بضاعة مشتراة بالمخزون وربطها بالمورد أو الصندوق نقداً
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className='space-y-4'>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <Label>رقم فاتورة المورد</Label>
                <Input
                  value={billNumber}
                  onChange={(e) => setBillNumber(e.target.value)}
                  required
                />
              </div>

              <div className='space-y-1.5'>
                <Label>تاريخ الفاتورة</Label>
                <Input
                  type='date'
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className='space-y-1.5'>
              <Label>المورد</Label>
              {suppliers.length > 0 ? (
                <Select
                  value={supplierId}
                  onValueChange={(val) => {
                    setSupplierId(val)
                    const found = suppliers.find((s) => s.id === val)
                    if (found) setSupplierName(found.name)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='اختر مورداً أو أدخل اسماً جديداً' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=''>مورد بضائع عام</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.phone || 'بدون هاتف'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder='اسم المورد'
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                />
              )}
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <Label>طريقة الشراء والدفع</Label>
                <Select
                  value={paymentType}
                  onValueChange={(val) => setPaymentType(val as 'cash' | 'credit' | 'bank')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='credit'>شراء آجل (دائن: الموردون 2100)</SelectItem>
                    <SelectItem value='cash'>شراء نقدي (دائن: الصندوق 1110)</SelectItem>
                    <SelectItem value='bank'>تحويل بنكي (دائن: البنك 1120)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1.5'>
                <Label>تاريخ الاستحقاق (اختياري)</Label>
                <Input
                  type='date'
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            <div className='grid grid-cols-3 gap-2.5'>
              <div className='space-y-1.5'>
                <Label>قيمة البضاعة</Label>
                <Input
                  type='number'
                  step='any'
                  placeholder='1000'
                  value={subtotal}
                  onChange={(e) => setSubtotal(e.target.value)}
                  required
                />
              </div>

              <div className='space-y-1.5'>
                <Label>ضريبة المدخلات</Label>
                <Input
                  type='number'
                  step='any'
                  placeholder='0'
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                />
              </div>

              <div className='space-y-1.5'>
                <Label>الخصم المكتسب</Label>
                <Input
                  type='number'
                  step='any'
                  placeholder='0'
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className='gap-2 sm:gap-0 pt-2'>
              <Button type='button' variant='outline' onClick={() => setIsCreateOpen(false)}>
                إلغاء
              </Button>
              <Button type='submit' disabled={createMutation.isPending} className='bg-blue-600 hover:bg-blue-700'>
                {createMutation.isPending ? 'جاري الحفظ...' : 'حفظ وترحيل الفاتورة'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* نافذة تأكيد إلغاء وعكس فاتورة الشراء */}
      <Dialog open={isReverseOpen} onOpenChange={setIsReverseOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>إلغاء وعكس فاتورة المشتريات</DialogTitle>
            <DialogDescription>
              سيتم إنشاء قيد عكسي يلغي أثر الفاتورة رقم {selectedPurchase?.bill_number} من المخزون وحساب المورد.
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-3 py-2'>
            <Label>سبب الإلغاء والمرتجع</Label>
            <Input
              placeholder='مثال: إرجاع بضاعة غير مطابقة للمواصفات'
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              required
            />
          </div>

          <DialogFooter className='gap-2 sm:gap-0'>
            <Button variant='outline' onClick={() => setIsReverseOpen(false)}>
              تراجع
            </Button>
            <Button
              variant='destructive'
              disabled={!reverseReason.trim() || reverseMutation.isPending}
              onClick={() => {
                if (selectedPurchase) {
                  reverseMutation.mutate({
                    id: selectedPurchase.id,
                    reason: reverseReason.trim(),
                  })
                }
              }}
            >
              {reverseMutation.isPending ? 'جاري الإلغاء...' : 'تأكيد عكس الفاتورة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
