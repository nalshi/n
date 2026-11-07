import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  Check,
  FolderTree,
  Lock,
  Plus,
  Search,
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
  createAccount,
  fetchAccounts,
  type AccountingAccount,
} from './accounting-data'

const accountTypeLabels: Record<AccountingAccount['account_type'], string> = {
  asset: 'أصل',
  liability: 'التزام',
  equity: 'حقوق ملكية',
  revenue: 'إيراد',
  cost: 'تكلفة مبيعات',
  expense: 'مصروف',
}

export function AccountsView() {
  const merchantId = useMerchantIdentity()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // Form State
  const [accountCode, setAccountCode] = useState('')
  const [accountName, setAccountName] = useState('')
  const [accountType, setAccountType] = useState<AccountingAccount['account_type']>('asset')
  const [normalBalance, setNormalBalance] = useState<'debit' | 'credit'>('debit')
  const [isPostable, setIsPostable] = useState(true)
  const [parentId, setParentId] = useState<string>('')

  const accountsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'accounts'],
    queryFn: fetchAccounts,
    enabled: Boolean(merchantId),
  })

  const accounts = accountsQuery.data || []

  const createMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      toast.success('تمت إضافة الحساب بنجاح إلى دليل الحسابات')
      queryClient.invalidateQueries({
        queryKey: accountingQueryKeys(merchantId || ''),
      })
      setIsCreateOpen(false)
      setAccountCode('')
      setAccountName('')
      setParentId('')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'فشلت إضافة الحساب.')
    },
  })

  const filteredAccounts = accounts.filter((acc) => {
    const matchesSearch =
      acc.account_code.toLowerCase().includes(search.toLowerCase()) ||
      acc.name.toLowerCase().includes(search.toLowerCase())
    const matchesType = typeFilter === 'all' || acc.account_type === typeFilter
    return matchesSearch && matchesType
  })

  const parentOptions = accounts.filter(
    (acc) => !acc.is_postable && acc.account_type === accountType
  )

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!accountCode.trim() || !accountName.trim()) {
      toast.error('رمز الحساب واسم الحساب حقول مطلوبة.')
      return
    }
    createMutation.mutate({
      account_code: accountCode.trim(),
      name: accountName.trim(),
      account_type: accountType,
      normal_balance: normalBalance,
      is_postable: isPostable,
      parent_id: parentId || undefined,
    })
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
        <div>
          <h2 className='text-lg font-bold'>دليل الحسابات الموحد (Chart of Accounts)</h2>
          <p className='text-sm text-muted-foreground'>
            شجرة الحسابات المالية المتوافقة مع معايير المحاسبة العامة
          </p>
        </div>

        <Button onClick={() => setIsCreateOpen(true)} className='gap-2'>
          <Plus className='size-4' />
          <span>إضافة حساب مخصص</span>
        </Button>
      </div>

      {/* شريط البحث والتصفية */}
      <div className='flex flex-col sm:flex-row gap-3'>
        <div className='relative flex-1'>
          <Search className='absolute right-3 top-2.5 size-4 text-muted-foreground' />
          <Input
            placeholder='البحث برمز الحساب أو الاسم...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='pr-9'
          />
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className='w-full sm:w-48'>
            <SelectValue placeholder='نوع الحساب' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>كافة الأنواع</SelectItem>
            <SelectItem value='asset'>أصول (1000)</SelectItem>
            <SelectItem value='liability'>التزامات (2000)</SelectItem>
            <SelectItem value='equity'>حقوق ملكية (3000)</SelectItem>
            <SelectItem value='revenue'>إيرادات (4000)</SelectItem>
            <SelectItem value='cost'>تكلفة مبيعات (5000)</SelectItem>
            <SelectItem value='expense'>مصروفات (6000)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* جدول الحسابات */}
      <Card className='shadow-xs'>
        <CardContent className='p-0'>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm text-right'>
              <thead className='bg-muted/50 text-xs text-muted-foreground border-b'>
                <tr>
                  <th className='py-3 px-4'>رمز الحساب</th>
                  <th className='py-3 px-4'>اسم الحساب</th>
                  <th className='py-3 px-4'>التصنيف</th>
                  <th className='py-3 px-4'>الطبيعة</th>
                  <th className='py-3 px-4'>النوع</th>
                  <th className='py-3 px-4'>الحالة</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-border/60'>
                {filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className='py-8 text-center text-muted-foreground'>
                      لا توجد حسابات مطابقة للبحث أو التصفية.
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map((acc) => (
                    <tr
                      key={acc.id}
                      className={`hover:bg-muted/30 ${
                        !acc.is_postable ? 'bg-muted/15 font-bold' : ''
                      }`}
                    >
                      <td className='py-3 px-4 font-mono text-primary font-semibold'>
                        {acc.account_code}
                      </td>
                      <td className='py-3 px-4'>
                        <div className='flex items-center gap-2'>
                          {!acc.is_postable ? (
                            <FolderTree className='size-4 text-muted-foreground' />
                          ) : (
                            <span className='size-2 rounded-full bg-primary/40 inline-block mr-2' />
                          )}
                          <span>{acc.name}</span>
                          {acc.is_system && (
                            <Badge variant='outline' className='text-[10px] py-0 px-1 gap-1 text-muted-foreground'>
                              <Lock className='size-2.5' />
                              <span>نظامي</span>
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className='py-3 px-4'>
                        <Badge variant='secondary' className='text-xs'>
                          {accountTypeLabels[acc.account_type]}
                        </Badge>
                      </td>
                      <td className='py-3 px-4 text-xs font-mono'>
                        {acc.normal_balance === 'debit' ? (
                          <span className='text-blue-600 dark:text-blue-400 font-semibold'>مدين</span>
                        ) : (
                          <span className='text-purple-600 dark:text-purple-400 font-semibold'>دائن</span>
                        )}
                      </td>
                      <td className='py-3 px-4 text-xs text-muted-foreground'>
                        {acc.is_postable ? 'حساب فرعي قابل للترحيل' : 'حساب تجميعي (رئيسي)'}
                      </td>
                      <td className='py-3 px-4'>
                        {acc.is_active ? (
                          <span className='inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400'>
                            <Check className='size-3' /> نشط
                          </span>
                        ) : (
                          <span className='text-xs text-muted-foreground'>معطل</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* نافذة إضافة حساب جديد */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>إضافة حساب جديد إلى الدليل</DialogTitle>
            <DialogDescription>
              أنشئ حساباً جديداً وقم بربطه بالحساب الرئيسي المناسب في الشجرة
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className='space-y-4'>
            <div className='space-y-1.5'>
              <Label htmlFor='code'>رمز الحساب (Account Code)</Label>
              <Input
                id='code'
                placeholder='مثال: 1115'
                value={accountCode}
                onChange={(e) => setAccountCode(e.target.value)}
                required
              />
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='name'>اسم الحساب بالعربية</Label>
              <Input
                id='name'
                placeholder='مثال: عهدة فرع صنعاء'
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                required
              />
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <Label>تصنيف الحساب</Label>
                <Select
                  value={accountType}
                  onValueChange={(val) => {
                    const t = val as AccountingAccount['account_type']
                    setAccountType(t)
                    setNormalBalance(
                      t === 'asset' || t === 'cost' || t === 'expense'
                        ? 'debit'
                        : 'credit'
                    )
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='asset'>أصل (Asset)</SelectItem>
                    <SelectItem value='liability'>التزام (Liability)</SelectItem>
                    <SelectItem value='equity'>حقوق ملكية (Equity)</SelectItem>
                    <SelectItem value='revenue'>إيراد (Revenue)</SelectItem>
                    <SelectItem value='cost'>تكلفة (Cost)</SelectItem>
                    <SelectItem value='expense'>مصروف (Expense)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1.5'>
                <Label>طبيعة الحساب</Label>
                <Select
                  value={normalBalance}
                  onValueChange={(val) => setNormalBalance(val as 'debit' | 'credit')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='debit'>مدين (Debit)</SelectItem>
                    <SelectItem value='credit'>دائن (Credit)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className='space-y-1.5'>
              <Label>الحساب الأب / الرئيسي (اختياري)</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder='اختر الحساب الرئيسي' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=''>بدون حساب أب (مستوى أعلى)</SelectItem>
                  {parentOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.account_code} - {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className='gap-2 sm:gap-0 pt-2'>
              <Button type='button' variant='outline' onClick={() => setIsCreateOpen(false)}>
                إلغاء
              </Button>
              <Button type='submit' disabled={createMutation.isPending}>
                {createMutation.isPending ? 'جاري الحفظ...' : 'حفظ الحساب'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
