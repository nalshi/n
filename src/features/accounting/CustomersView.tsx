import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Clock,
  FileText,
  Plus,
  Printer,
  Search,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
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
import { useMerchantIdentity } from '@/hooks/useMerchantRealtime'
import {
  accountingQueryKeys,
  amountToMinorUnits,
  createContact,
  fetchAgingReport,
  fetchContacts,
  fetchContactStatement,
  formatMinorUnits,
} from './accounting-data'

export function CustomersView() {
  const merchantId = useMerchantIdentity()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [statementContactId, setStatementContactId] = useState<string | null>(null)
  const [isAgingOpen, setIsAgingOpen] = useState(false)

  // Form State
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [taxNumber, setTaxNumber] = useState('')
  const [address, setAddress] = useState('')
  const [openingBalance, setOpeningBalance] = useState('')

  const customersQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'contacts', 'customer'],
    queryFn: () => fetchContacts('customer'),
    enabled: Boolean(merchantId),
  })

  const statementQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'statement', statementContactId],
    queryFn: () => fetchContactStatement(statementContactId!),
    enabled: Boolean(merchantId && statementContactId),
  })

  const agingQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'aging', 'customer'],
    queryFn: () => fetchAgingReport('customer'),
    enabled: Boolean(merchantId && isAgingOpen),
  })

  const customers = customersQuery.data || []
  const statement = statementQuery.data
  const aging = agingQuery.data
  const currency = 'YER'

  const createMutation = useMutation({
    mutationFn: createContact,
    onSuccess: () => {
      toast.success('تمت إضافة العميل بنجاح وربطه بالذمم المدينة')
      queryClient.invalidateQueries({ queryKey: accountingQueryKeys(merchantId || '') })
      setIsCreateOpen(false)
      setName('')
      setPhone('')
      setEmail('')
      setTaxNumber('')
      setAddress('')
      setOpeningBalance('')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'فشلت إضافة العميل.')
    },
  })

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('اسم العميل مطلوب.')
      return
    }
    const openingMinor = openingBalance ? amountToMinorUnits(openingBalance, currency) : 0
    createMutation.mutate({
      name: name.trim(),
      type: 'customer',
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      tax_number: taxNumber.trim() || undefined,
      address: address.trim() || undefined,
      opening_balance_minor_units: openingMinor,
      opening_balance_type: 'debit',
    })
  }

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search))
  )

  const handlePrintStatement = () => {
    window.print()
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
        <div>
          <h2 className='text-lg font-bold'>العملاء والذمم المدينة (Accounts Receivable)</h2>
          <p className='text-sm text-muted-foreground'>
            متابعة أرصدة العملاء الحقيقية المشتقة من القيود، كشوفات الحسابات وأعمار الديون
          </p>
        </div>

        <div className='flex items-center gap-2'>
          <Button variant='outline' onClick={() => setIsAgingOpen(true)} className='gap-2'>
            <Clock className='size-4' />
            <span>تقرير أعمار الديون</span>
          </Button>

          <Button onClick={() => setIsCreateOpen(true)} className='gap-2'>
            <Plus className='size-4' />
            <span>إضافة عميل جديد</span>
          </Button>
        </div>
      </div>

      {/* شريط البحث */}
      <div className='relative'>
        <Search className='absolute right-3 top-2.5 size-4 text-muted-foreground' />
        <Input
          placeholder='البحث باسم العميل أو رقم الهاتف...'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className='pr-9'
        />
      </div>

      {/* جدول العملاء */}
      <Card className='shadow-xs'>
        <CardContent className='p-0'>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm text-right'>
              <thead className='bg-muted/50 text-xs text-muted-foreground border-b'>
                <tr>
                  <th className='py-3 px-4'>اسم العميل</th>
                  <th className='py-3 px-4'>الهاتف</th>
                  <th className='py-3 px-4'>الرقم الضريبي</th>
                  <th className='py-3 px-4 text-left'>الرصيد الافتتاحي</th>
                  <th className='py-3 px-4 text-left'>إجمالي المبيعات</th>
                  <th className='py-3 px-4 text-left'>إجمالي المسدد</th>
                  <th className='py-3 px-4 text-left'>الرصيد الحالي المستحق</th>
                  <th className='py-3 px-4 text-center'>كشف الحساب</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-border/60'>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className='py-12 text-center text-muted-foreground'>
                      <Users className='size-8 mx-auto mb-2 opacity-40' />
                      <p>لا يوجد عملاء مسجلون حالياً.</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.id} className='hover:bg-muted/30'>
                      <td className='py-3 px-4 font-semibold text-foreground'>{c.name}</td>
                      <td className='py-3 px-4 font-mono text-xs text-muted-foreground'>
                        {c.phone || '-'}
                      </td>
                      <td className='py-3 px-4 font-mono text-xs text-muted-foreground'>
                        {c.tax_number || '-'}
                      </td>
                      <td className='py-3 px-4 text-left font-mono text-xs'>
                        {formatMinorUnits(c.opening_balance_minor_units, currency)}
                      </td>
                      <td className='py-3 px-4 text-left font-mono text-blue-600 text-xs'>
                        {formatMinorUnits(c.total_debit_minor_units, currency)}
                      </td>
                      <td className='py-3 px-4 text-left font-mono text-emerald-600 text-xs'>
                        {formatMinorUnits(c.total_credit_minor_units, currency)}
                      </td>
                      <td className='py-3 px-4 text-left font-mono font-bold text-amber-600 dark:text-amber-400'>
                        {formatMinorUnits(Math.max(0, c.live_balance_minor_units), currency)}
                      </td>
                      <td className='py-3 px-4 text-center'>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() => setStatementContactId(c.id)}
                          className='gap-1.5'
                        >
                          <FileText className='size-4' />
                          <span>كشف حساب</span>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* نافذة إضافة عميل جديد */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>إضافة عميل جديد</DialogTitle>
            <DialogDescription>
              تسجيل بيانات العميل مع الرصيد الافتتاحي وربطه بحساب الذمم المدينة (1130)
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className='space-y-4'>
            <div className='space-y-1.5'>
              <Label>اسم العميل / الشركة</Label>
              <Input
                placeholder='مثال: شركة الأمل للمقاولات'
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <Label>رقم الهاتف</Label>
                <Input
                  placeholder='777123456'
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className='space-y-1.5'>
                <Label>الرقم الضريبي (اختياري)</Label>
                <Input
                  placeholder='123456789'
                  value={taxNumber}
                  onChange={(e) => setTaxNumber(e.target.value)}
                />
              </div>
            </div>

            <div className='space-y-1.5'>
              <Label>العنوان / المدينة</Label>
              <Input
                placeholder='صنعاء - شارع الزبيري'
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className='space-y-1.5'>
              <Label>الرصيد الافتتاحي المستحق على العميل ({currency})</Label>
              <Input
                type='number'
                step='any'
                placeholder='0'
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </div>

            <DialogFooter className='gap-2 sm:gap-0 pt-2'>
              <Button type='button' variant='outline' onClick={() => setIsCreateOpen(false)}>
                إلغاء
              </Button>
              <Button type='submit' disabled={createMutation.isPending}>
                {createMutation.isPending ? 'جاري الحفظ...' : 'حفظ العميل'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* نافذة كشف الحساب (Statement of Account) */}
      <Dialog
        open={Boolean(statementContactId)}
        onOpenChange={(open) => !open && setStatementContactId(null)}
      >
        <DialogContent className='sm:max-w-3xl max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <div className='flex items-center justify-between'>
              <div>
                <DialogTitle>كشف حساب عميل: {statement?.contact?.name}</DialogTitle>
                <DialogDescription>
                  كشف الحركات التفصيلية والرصيد المستخرج مباشرة من سطور القيود المرحّلة
                </DialogDescription>
              </div>
              <Button variant='outline' size='sm' onClick={handlePrintStatement} className='gap-1.5'>
                <Printer className='size-4' /> طباعة
              </Button>
            </div>
          </DialogHeader>

          {statementQuery.isLoading ? (
            <div className='py-12 text-center text-muted-foreground'>جاري تحميل كشف الحساب...</div>
          ) : statement ? (
            <div className='space-y-4'>
              <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-muted/40 rounded-lg text-xs'>
                <div>
                  <span className='text-muted-foreground block'>الرصيد الافتتاحي:</span>
                  <span className='font-mono font-bold'>{formatMinorUnits(statement.opening_balance_minor_units, currency)}</span>
                </div>
                <div>
                  <span className='text-muted-foreground block'>إجمالي فواتير البيع:</span>
                  <span className='font-mono font-bold text-blue-600'>{formatMinorUnits(statement.total_debit_minor_units, currency)}</span>
                </div>
                <div>
                  <span className='text-muted-foreground block'>إجمالي الدفعات المسددة:</span>
                  <span className='font-mono font-bold text-emerald-600'>{formatMinorUnits(statement.total_credit_minor_units, currency)}</span>
                </div>
                <div>
                  <span className='text-muted-foreground block'>الرصيد الختامي المستحق:</span>
                  <span className='font-mono font-bold text-amber-600 text-sm'>
                    {formatMinorUnits(Math.abs(statement.closing_balance_minor_units), currency)}
                  </span>
                </div>
              </div>

              {/* جدول الحركات */}
              <div className='border rounded-lg overflow-hidden'>
                <table className='w-full text-sm text-right'>
                  <thead className='bg-muted/50 text-xs text-muted-foreground border-b'>
                    <tr>
                      <th className='py-2 px-3'>التاريخ</th>
                      <th className='py-2 px-3'>رقم القيد</th>
                      <th className='py-2 px-3'>البيان</th>
                      <th className='py-2 px-3 text-left'>مدين (مبيعات)</th>
                      <th className='py-2 px-3 text-left'>دائن (دفعات)</th>
                      <th className='py-2 px-3 text-left'>الرصيد المستحق</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-border/60 text-xs'>
                    {statement.entries?.length === 0 ? (
                      <tr>
                        <td colSpan={6} className='py-6 text-center text-muted-foreground'>
                          لا توجد حركات مسجلة لهذا العميل.
                        </td>
                      </tr>
                    ) : (
                      statement.entries?.map((ent, i: number) => (
                        <tr key={i} className='hover:bg-muted/20'>
                          <td className='py-2 px-3 font-mono text-muted-foreground'>{ent.entry_date}</td>
                          <td className='py-2 px-3 font-mono text-primary font-medium'>{ent.journal_number}</td>
                          <td className='py-2 px-3'>{ent.description}</td>
                          <td className='py-2 px-3 text-left font-mono font-semibold text-blue-600'>
                            {ent.debit_minor_units > 0 ? formatMinorUnits(ent.debit_minor_units, currency) : '-'}
                          </td>
                          <td className='py-2 px-3 text-left font-mono font-semibold text-emerald-600'>
                            {ent.credit_minor_units > 0 ? formatMinorUnits(ent.credit_minor_units, currency) : '-'}
                          </td>
                          <td className='py-2 px-3 text-left font-mono font-bold text-foreground'>
                            {formatMinorUnits(Math.abs(ent.running_balance_minor_units), currency)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <DialogFooter>
                <Button variant='outline' onClick={() => setStatementContactId(null)}>
                  إغلاق
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* نافذة تقرير أعمار الديون (Aging of Accounts Receivable) */}
      <Dialog open={isAgingOpen} onOpenChange={setIsAgingOpen}>
        <DialogContent className='sm:max-w-3xl'>
          <DialogHeader>
            <DialogTitle>تقرير أعمار ديون العملاء (Aging of Accounts Receivable)</DialogTitle>
            <DialogDescription>
              توزيع الديون المستحقة حسب فترات التأخير الزمني (أيام الاستحقاق)
            </DialogDescription>
          </DialogHeader>

          {agingQuery.isLoading ? (
            <div className='py-8 text-center text-muted-foreground'>جاري حساب أعمار الديون...</div>
          ) : aging ? (
            <div className='space-y-4'>
              {/* ملخص الفئات */}
              <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
                <div className='p-3 rounded-lg border bg-emerald-500/10 border-emerald-500/20'>
                  <div className='text-xs text-emerald-700 dark:text-emerald-300 font-medium'>الحالية (0-30 يوم)</div>
                  <div className='text-lg font-bold font-mono text-emerald-900 dark:text-emerald-100 mt-1'>
                    {formatMinorUnits(aging.total_current, currency)}
                  </div>
                </div>

                <div className='p-3 rounded-lg border bg-blue-500/10 border-blue-500/20'>
                  <div className='text-xs text-blue-700 dark:text-blue-300 font-medium'>31 - 60 يوم</div>
                  <div className='text-lg font-bold font-mono text-blue-900 dark:text-blue-100 mt-1'>
                    {formatMinorUnits(aging.total_30_days, currency)}
                  </div>
                </div>

                <div className='p-3 rounded-lg border bg-amber-500/10 border-amber-500/20'>
                  <div className='text-xs text-amber-700 dark:text-amber-300 font-medium'>61 - 90 يوم</div>
                  <div className='text-lg font-bold font-mono text-amber-900 dark:text-amber-100 mt-1'>
                    {formatMinorUnits(aging.total_60_days, currency)}
                  </div>
                </div>

                <div className='p-3 rounded-lg border bg-destructive/10 border-destructive/20'>
                  <div className='text-xs text-destructive font-medium'>أكثر من 90 يوم</div>
                  <div className='text-lg font-bold font-mono text-destructive mt-1'>
                    {formatMinorUnits(aging.total_90_plus, currency)}
                  </div>
                </div>
              </div>

              {/* جدول تفاصيل العملاء */}
              <div className='border rounded-lg overflow-hidden'>
                <table className='w-full text-sm text-right'>
                  <thead className='bg-muted/50 text-xs text-muted-foreground border-b'>
                    <tr>
                      <th className='py-2.5 px-3'>اسم العميل</th>
                      <th className='py-2.5 px-3 text-left'>إجمالي الدين</th>
                      <th className='py-2.5 px-3 text-left'>0 - 30 يوم</th>
                      <th className='py-2.5 px-3 text-left'>31 - 60 يوم</th>
                      <th className='py-2.5 px-3 text-left'>61 - 90 يوم</th>
                      <th className='py-2.5 px-3 text-left'>+90 يوم</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-border/60 text-xs'>
                    {aging.items.map((item) => (
                      <tr key={item.contact_id} className='hover:bg-muted/20'>
                        <td className='py-2.5 px-3 font-medium'>{item.name}</td>
                        <td className='py-2.5 px-3 text-left font-mono font-bold text-amber-600'>
                          {formatMinorUnits(item.total_balance, currency)}
                        </td>
                        <td className='py-2.5 px-3 text-left font-mono text-emerald-600'>
                          {item.bucket_current > 0 ? formatMinorUnits(item.bucket_current, currency) : '-'}
                        </td>
                        <td className='py-2.5 px-3 text-left font-mono text-blue-600'>
                          {item.bucket_30 > 0 ? formatMinorUnits(item.bucket_30, currency) : '-'}
                        </td>
                        <td className='py-2.5 px-3 text-left font-mono text-amber-600'>
                          {item.bucket_60 > 0 ? formatMinorUnits(item.bucket_60, currency) : '-'}
                        </td>
                        <td className='py-2.5 px-3 text-left font-mono text-destructive font-semibold'>
                          {item.bucket_90_plus > 0 ? formatMinorUnits(item.bucket_90_plus, currency) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <DialogFooter>
                <Button variant='outline' onClick={() => setIsAgingOpen(false)}>
                  إغلاق
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
