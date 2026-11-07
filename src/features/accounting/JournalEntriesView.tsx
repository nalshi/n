import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  Plus,
  RotateCcw,
  Search,
  Trash2,
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
  createJournalEntry,
  fetchAccounts,
  fetchJournalEntries,
  fetchJournalEntry,
  fetchPeriods,
  formatMinorUnits,
  postJournalEntry,
  reverseJournalEntry,
} from './accounting-data'

type LineFormItem = {
  account_id: string
  description: string
  debit: string
  credit: string
}

export function JournalEntriesView() {
  const merchantId = useMerchantIdentity()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null)
  const [isReverseOpen, setIsReverseOpen] = useState(false)
  const [reverseReason, setReverseReason] = useState('')

  // Create Form State
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [periodId] = useState('')
  const [postImmediately] = useState(true)
  const [lines, setLines] = useState<LineFormItem[]>([
    { account_id: '', description: '', debit: '', credit: '' },
    { account_id: '', description: '', debit: '', credit: '' },
  ])

  const journalsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'journals'],
    queryFn: fetchJournalEntries,
    enabled: Boolean(merchantId),
  })

  const accountsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'accounts'],
    queryFn: fetchAccounts,
    enabled: Boolean(merchantId),
  })

  const periodsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'periods'],
    queryFn: fetchPeriods,
    enabled: Boolean(merchantId),
  })

  const journalDetailsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'journal', selectedJournalId],
    queryFn: () => fetchJournalEntry(selectedJournalId!),
    enabled: Boolean(merchantId && selectedJournalId),
  })

  const journals = journalsQuery.data || []
  const accounts = accountsQuery.data?.filter((a) => a.is_postable && a.is_active) || []
  const periods = periodsQuery.data?.filter((p) => p.status === 'open') || []

  // حساب المجاميع المباشرة للنموذج
  let totalDebitMinor = 0
  let totalCreditMinor = 0
  for (const l of lines) {
    if (l.debit) {
      try {
        totalDebitMinor += amountToMinorUnits(l.debit, 'YER')
      } catch {
        // ignore parsing error during typing
      }
    }
    if (l.credit) {
      try {
        totalCreditMinor += amountToMinorUnits(l.credit, 'YER')
      } catch {
        // ignore
      }
    }
  }
  const isFormBalanced = totalDebitMinor > 0 && totalDebitMinor === totalCreditMinor
  const formDifference = Math.abs(totalDebitMinor - totalCreditMinor)

  const createMutation = useMutation({
    mutationFn: createJournalEntry,
    onSuccess: () => {
      toast.success(postImmediately ? 'تم إنشاء وترحيل القيد بنجاح' : 'تم حفظ مسودة القيد بنجاح')
      queryClient.invalidateQueries({ queryKey: accountingQueryKeys(merchantId || '') })
      setIsCreateOpen(false)
      setDescription('')
      setLines([
        { account_id: '', description: '', debit: '', credit: '' },
        { account_id: '', description: '', debit: '', credit: '' },
      ])
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'فشل إنشاء القيد.')
    },
  })

  const postMutation = useMutation({
    mutationFn: postJournalEntry,
    onSuccess: () => {
      toast.success('تم ترحيل القيد بنجاح إلى دفتر الأستاذ')
      queryClient.invalidateQueries({ queryKey: accountingQueryKeys(merchantId || '') })
      setSelectedJournalId(null)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'فشل ترحيل القيد.')
    },
  })

  const reverseMutation = useMutation({
    mutationFn: reverseJournalEntry,
    onSuccess: () => {
      toast.success('تم إنشاء القيد العكسي وإلغاء أثر القيد الأصلي بنجاح')
      queryClient.invalidateQueries({ queryKey: accountingQueryKeys(merchantId || '') })
      setIsReverseOpen(false)
      setSelectedJournalId(null)
      setReverseReason('')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'فشل عكس القيد.')
    },
  })

  const handleAddLine = () => {
    setLines([...lines, { account_id: '', description: '', debit: '', credit: '' }])
  }

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 2) {
      toast.error('يجب أن يحتوي القيد على سطرين على الأقل.')
      return
    }
    setLines(lines.filter((_, i) => i !== index))
  }

  const handleLineChange = (index: number, field: keyof LineFormItem, value: string) => {
    const updated = [...lines]
    updated[index][field] = value
    // إذا أدخل مدين، يتم مسح الدائن والعكس
    if (field === 'debit' && value) updated[index].credit = ''
    if (field === 'credit' && value) updated[index].debit = ''
    setLines(updated)
  }

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!description.trim()) {
      toast.error('البيان والوصف مطلوب.')
      return
    }
    if (!isFormBalanced) {
      toast.error('لا يمكن حفظ القيد: مجموع المدين يجب أن يساوي مجموع الدائن.')
      return
    }

    const payloadLines: Array<{
      account_id: string
      description?: string
      debit_minor_units: number
      credit_minor_units: number
    }> = []

    for (const l of lines) {
      if (!l.account_id) {
        toast.error('يرجى تحديد الحساب لجميع سطور القيد.')
        return
      }
      const debitMinor = l.debit ? amountToMinorUnits(l.debit, 'YER') : 0
      const creditMinor = l.credit ? amountToMinorUnits(l.credit, 'YER') : 0
      payloadLines.push({
        account_id: l.account_id,
        description: l.description.trim() || undefined,
        debit_minor_units: debitMinor,
        credit_minor_units: creditMinor,
      })
    }

    createMutation.mutate({
      period_id: periodId || periods[0]?.id || '',
      entry_date: entryDate,
      description: description.trim(),
      currency: 'YER',
      idempotency_key: `manual:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
      lines: payloadLines,
    })
  }

  const filteredJournals = journals.filter((j) => {
    const matchesSearch =
      j.journal_number.toLowerCase().includes(search.toLowerCase()) ||
      j.description.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || j.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className='space-y-6'>
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
        <div>
          <h2 className='text-lg font-bold'>قيود اليومية العامة (Journal Entries)</h2>
          <p className='text-sm text-muted-foreground'>
            سجل العمليات والقيود المحاسبية بنظام القيد المزدوج مع سجل التدقيق
          </p>
        </div>

        <Button onClick={() => setIsCreateOpen(true)} className='gap-2'>
          <Plus className='size-4' />
          <span>إنشاء قيد يدوي</span>
        </Button>
      </div>

      {/* شريط البحث والتصفية */}
      <div className='flex flex-col sm:flex-row gap-3'>
        <div className='relative flex-1'>
          <Search className='absolute right-3 top-2.5 size-4 text-muted-foreground' />
          <Input
            placeholder='البحث برقم القيد أو البيان...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='pr-9'
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className='w-full sm:w-48'>
            <SelectValue placeholder='حالة القيد' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>كافة الحالات</SelectItem>
            <SelectItem value='posted'>مرحّل (POSTED)</SelectItem>
            <SelectItem value='draft'>مسودة (DRAFT)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* جدول القيود */}
      <Card className='shadow-xs'>
        <CardContent className='p-0'>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm text-right'>
              <thead className='bg-muted/50 text-xs text-muted-foreground border-b'>
                <tr>
                  <th className='py-3 px-4'>رقم القيد</th>
                  <th className='py-3 px-4'>التاريخ</th>
                  <th className='py-3 px-4'>البيان والوصف</th>
                  <th className='py-3 px-4'>المصدر</th>
                  <th className='py-3 px-4'>الحالة</th>
                  <th className='py-3 px-4 text-center'>الإجراءات</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-border/60'>
                {filteredJournals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className='py-8 text-center text-muted-foreground'>
                      لا توجد قيود يومية مسجلة.
                    </td>
                  </tr>
                ) : (
                  filteredJournals.map((j) => (
                    <tr key={j.id} className='hover:bg-muted/30'>
                      <td className='py-3 px-4 font-mono font-semibold text-primary'>
                        {j.journal_number}
                      </td>
                      <td className='py-3 px-4 text-muted-foreground font-mono text-xs'>
                        {j.entry_date}
                      </td>
                      <td className='py-3 px-4 font-medium max-w-md truncate'>
                        {j.description}
                      </td>
                      <td className='py-3 px-4 text-xs font-mono text-muted-foreground'>
                        {j.source_type}
                      </td>
                      <td className='py-3 px-4'>
                        <Badge
                          variant={j.status === 'posted' ? 'default' : 'secondary'}
                          className={j.status === 'posted' ? 'bg-emerald-600 gap-1' : 'gap-1'}
                        >
                          {j.status === 'posted' ? (
                            <>
                              <Check className='size-3' /> مرحّل
                            </>
                          ) : (
                            <>
                              <Clock className='size-3' /> مسودة
                            </>
                          )}
                        </Badge>
                      </td>
                      <td className='py-3 px-4 text-center'>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() => setSelectedJournalId(j.id)}
                          className='gap-1.5'
                        >
                          <Eye className='size-4' />
                          <span>عرض السطور</span>
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

      {/* نافذة إنشاء قيد يومية يدوي */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className='sm:max-w-3xl max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>إنشاء قيد يومية يدوي (Double-Entry Journal)</DialogTitle>
            <DialogDescription>
              أدخل سطور القيد المحاسبي. يشترط النظام توازن مجموع المدين مع مجموع الدائن تماماً.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className='space-y-4'>
            <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
              <div className='space-y-1.5'>
                <Label>تاريخ القيد</Label>
                <Input
                  type='date'
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  required
                />
              </div>

              <div className='space-y-1.5 sm:col-span-2'>
                <Label>البيان العام للقيد</Label>
                <Input
                  placeholder='مثال: إثبات إيجار شهر يناير نقداً'
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* جدول سطور القيد */}
            <div className='border rounded-lg p-3 space-y-3 bg-muted/20'>
              <div className='flex items-center justify-between'>
                <h4 className='font-semibold text-sm'>سطور الحسابات (مدينة ودائنة)</h4>
                <Button type='button' variant='outline' size='sm' onClick={handleAddLine} className='gap-1'>
                  <Plus className='size-3.5' /> إضافة سطر
                </Button>
              </div>

              <div className='space-y-2'>
                {lines.map((line, idx) => (
                  <div key={idx} className='grid grid-cols-12 gap-2 items-center bg-card p-2 rounded-md border'>
                    <div className='col-span-4'>
                      <Select
                        value={line.account_id}
                        onValueChange={(val) => handleLineChange(idx, 'account_id', val)}
                      >
                        <SelectTrigger className='text-xs'>
                          <SelectValue placeholder='اختر الحساب' />
                        </SelectTrigger>
                        <SelectContent className='max-h-60'>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.account_code} - {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className='col-span-3'>
                      <Input
                        placeholder='شرح السطر'
                        value={line.description}
                        onChange={(e) => handleLineChange(idx, 'description', e.target.value)}
                        className='text-xs'
                      />
                    </div>

                    <div className='col-span-2'>
                      <Input
                        placeholder='مدين'
                        type='number'
                        step='any'
                        value={line.debit}
                        onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                        className='text-xs font-mono font-bold text-blue-600'
                      />
                    </div>

                    <div className='col-span-2'>
                      <Input
                        placeholder='دائن'
                        type='number'
                        step='any'
                        value={line.credit}
                        onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                        className='text-xs font-mono font-bold text-purple-600'
                      />
                    </div>

                    <div className='col-span-1 text-center'>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        onClick={() => handleRemoveLine(idx)}
                        className='size-7 text-muted-foreground hover:text-destructive'
                      >
                        <Trash2 className='size-3.5' />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* شريط التحقق من توازن القيد */}
              <div className='flex flex-wrap items-center justify-between p-3 rounded-lg border bg-card'>
                <div className='flex items-center gap-4 text-sm font-mono'>
                  <div>
                    <span className='text-muted-foreground ml-1'>إجمالي المدين:</span>
                    <span className='font-bold text-blue-600'>{formatMinorUnits(totalDebitMinor, 'YER')}</span>
                  </div>
                  <div>
                    <span className='text-muted-foreground ml-1'>إجمالي الدائن:</span>
                    <span className='font-bold text-purple-600'>{formatMinorUnits(totalCreditMinor, 'YER')}</span>
                  </div>
                </div>

                <div>
                  {isFormBalanced ? (
                    <Badge variant='default' className='bg-emerald-600 gap-1.5 py-1 px-3'>
                      <CheckCircle2 className='size-4' />
                      <span>القيد متوازن وجاهز للترحيل</span>
                    </Badge>
                  ) : (
                    <Badge variant='destructive' className='gap-1.5 py-1 px-3'>
                      <AlertTriangle className='size-4' />
                      <span>غير متوازن (الفارق: {formatMinorUnits(formDifference, 'YER')})</span>
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className='gap-2 sm:gap-0 pt-2'>
              <Button type='button' variant='outline' onClick={() => setIsCreateOpen(false)}>
                إلغاء
              </Button>
              <Button type='submit' disabled={!isFormBalanced || createMutation.isPending}>
                {createMutation.isPending ? 'جاري الحفظ...' : 'حفظ القيد المحاسبي'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* نافذة تفاصيل القيد وعرض السطور */}
      <Dialog
        open={Boolean(selectedJournalId && !isReverseOpen)}
        onOpenChange={(open) => !open && setSelectedJournalId(null)}
      >
        <DialogContent className='sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle className='flex items-center justify-between'>
              <span>تفاصيل القيد المحاسبي</span>
              {journalDetailsQuery.data && (
                <Badge variant={journalDetailsQuery.data.status === 'posted' ? 'default' : 'secondary'} className={journalDetailsQuery.data.status === 'posted' ? 'bg-emerald-600' : ''}>
                  {journalDetailsQuery.data.status === 'posted' ? 'مرحّل' : 'مسودة'}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {journalDetailsQuery.data?.journal_number} - {journalDetailsQuery.data?.description}
            </DialogDescription>
          </DialogHeader>

          {journalDetailsQuery.isLoading ? (
            <div className='py-8 text-center text-muted-foreground'>جاري تحميل السطور...</div>
          ) : journalDetailsQuery.data ? (
            <div className='space-y-4'>
              <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-muted/30 rounded-lg text-xs'>
                <div>
                  <span className='text-muted-foreground block'>تاريخ القيد:</span>
                  <span className='font-mono font-semibold'>{journalDetailsQuery.data.entry_date}</span>
                </div>
                <div>
                  <span className='text-muted-foreground block'>نوع المصدر:</span>
                  <span className='font-mono font-semibold'>{journalDetailsQuery.data.source_type}</span>
                </div>
                <div>
                  <span className='text-muted-foreground block'>العملة:</span>
                  <span className='font-mono font-semibold'>{journalDetailsQuery.data.currency}</span>
                </div>
                <div>
                  <span className='text-muted-foreground block'>حالة القيد:</span>
                  <span className='font-semibold'>{journalDetailsQuery.data.status === 'posted' ? 'مرحّل ونهائي' : 'مسودة'}</span>
                </div>
              </div>

              {/* جدول السطور */}
              <div className='border rounded-lg overflow-hidden'>
                <table className='w-full text-sm text-right'>
                  <thead className='bg-muted/50 text-xs text-muted-foreground border-b'>
                    <tr>
                      <th className='py-2 px-3'>#</th>
                      <th className='py-2 px-3'>الحساب</th>
                      <th className='py-2 px-3'>البيان</th>
                      <th className='py-2 px-3 text-left'>مدين</th>
                      <th className='py-2 px-3 text-left'>دائن</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-border/60'>
                    {journalDetailsQuery.data.lines?.map((line, idx) => (
                      <tr key={idx} className='hover:bg-muted/20'>
                        <td className='py-2 px-3 font-mono text-xs text-muted-foreground'>{idx + 1}</td>
                        <td className='py-2 px-3 font-medium font-mono text-xs'>{line.account_id}</td>
                        <td className='py-2 px-3 text-muted-foreground text-xs'>{line.description || '-'}</td>
                        <td className='py-2 px-3 text-left font-mono font-semibold text-blue-600'>
                          {line.debit_minor_units > 0 ? formatMinorUnits(line.debit_minor_units, 'YER') : '-'}
                        </td>
                        <td className='py-2 px-3 text-left font-mono font-semibold text-purple-600'>
                          {line.credit_minor_units > 0 ? formatMinorUnits(line.credit_minor_units, 'YER') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <DialogFooter className='gap-2 sm:gap-0 pt-2'>
                {journalDetailsQuery.data.status === 'draft' && (
                  <Button
                    onClick={() => postMutation.mutate(journalDetailsQuery.data!.id)}
                    disabled={postMutation.isPending}
                    className='bg-emerald-600 hover:bg-emerald-700 gap-1.5'
                  >
                    <Check className='size-4' />
                    <span>ترحيل القيد الآن</span>
                  </Button>
                )}

                {journalDetailsQuery.data.status === 'posted' && (
                  <Button
                    variant='destructive'
                    onClick={() => setIsReverseOpen(true)}
                    className='gap-1.5'
                  >
                    <RotateCcw className='size-4' />
                    <span>إلغاء وعكس القيد</span>
                  </Button>
                )}

                <Button variant='outline' onClick={() => setSelectedJournalId(null)}>
                  إغلاق
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* نافذة تأكيد عكس القيد المرحل */}
      <Dialog open={isReverseOpen} onOpenChange={setIsReverseOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>عكس القيد المحاسبي (Reversal Entry)</DialogTitle>
            <DialogDescription>
              وفقاً لقواعد المحاسبة، لا يتم حذف القيد المرحّل بل يُنشأ قيد عكسي متوازن يلغي أثره المالي.
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-3 py-2'>
            <Label htmlFor='reason'>سبب عكس القيد (Audit Reason)</Label>
            <Input
              id='reason'
              placeholder='مثال: خطأ في تاريخ الاستحقاق / إلغاء المعاملة'
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
                if (journalDetailsQuery.data) {
                  reverseMutation.mutate({
                    journal_id: journalDetailsQuery.data.id,
                    period_id: journalDetailsQuery.data.period_id,
                    entry_date: new Date().toISOString().slice(0, 10),
                    reason: reverseReason.trim(),
                  })
                }
              }}
            >
              {reverseMutation.isPending ? 'جاري العكس...' : 'تأكيد إنشاء القيد العكسي'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
