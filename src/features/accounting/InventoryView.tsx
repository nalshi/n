import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Boxes,
  Coins,
  Layers,
  LoaderCircle,
  Package,
  RefreshCw,
  Search,
  Sliders,
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
  fetchInventoryValuation,
  formatMinorUnits,
  recordInventoryAdjustment,
} from './accounting-data'

export function InventoryView() {
  const merchantId = useMerchantIdentity()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  // Modals
  const [isAdjOpen, setIsAdjOpen] = useState(false)

  // Form states - Inventory Adjustment
  const [adjType, setAdjType] = useState<'increase' | 'decrease'>('decrease')
  const [adjAmount, setAdjAmount] = useState('')
  const [adjReason, setAdjReason] = useState('')
  const [adjDate, setAdjDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [adjNumber, setAdjNumber] = useState('')

  // Queries
  const {
    data: valuation,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'inventory-valuation'],
    queryFn: fetchInventoryValuation,
    enabled: Boolean(merchantId),
  })

  // Mutations
  const adjMutation = useMutation({
    mutationFn: recordInventoryAdjustment,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: accountingQueryKeys(merchantId || ''),
      })
      toast.success('تم تسجيل التسوية المخزنية وترحيل القيد المحاسبي بنجاح.')
      setIsAdjOpen(false)
      setAdjAmount('')
      setAdjReason('')
      setAdjNumber('')
    },
    onError: (err) => {
      toast.error(err.message || 'فشل تسجيل التسوية المخزنية.')
    },
  })

  function handleAdjustment(e: FormEvent) {
    e.preventDefault()
    const minorUnits = amountToMinorUnits(adjAmount)
    if (minorUnits <= 0) {
      toast.error('يرجى إدخال مبلغ صالح أكبر من الصفر.')
      return
    }
    if (!adjReason.trim()) {
      toast.error('يرجى توضيح سبب التسوية الجردية.')
      return
    }
    adjMutation.mutate({
      adjustment_number:
        adjNumber.trim() || `ADJ-${Date.now().toString().slice(-6)}`,
      adjustment_type: adjType,
      amount_minor_units: minorUnits,
      reason: adjReason.trim(),
      adjustment_date: adjDate,
    })
  }

  const items = valuation?.items || []
  const filteredItems = items.filter((item) => {
    if (!search.trim()) return true
    return item.name.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className='space-y-6'>
      {/* رأس الصفحة */}
      <div className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>
            المخزون وتكلفة البضاعة المباعة (COGS)
          </h2>
          <p className='text-sm text-muted-foreground'>
            تقييم المخزون بطريقة المتوسط المرجح والتسويات الجردية المباشرة مع
            الحسابات (1140)
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => refetch()}
            disabled={isRefetching}
            className='gap-1.5'
          >
            <RefreshCw
              className={`size-4 ${isRefetching ? 'animate-spin' : ''}`}
            />
            <span>تحديث التقييم</span>
          </Button>

          <Button
            className='gap-1.5'
            onClick={() => {
              setAdjNumber(`ADJ-${Date.now().toString().slice(-6)}`)
              setIsAdjOpen(true)
            }}
          >
            <Sliders className='size-4' />
            <span>تسوية جردية (عجز / زيادة)</span>
          </Button>
        </div>
      </div>

      {/* بطاقات الإحصائيات العامة للمخزون */}
      <div className='grid gap-4 md:grid-cols-4'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>
              إجمالي قيمة المخزون
            </CardTitle>
            <Coins className='size-4 text-primary' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-primary'>
              {valuation
                ? formatMinorUnits(valuation.grand_total_valuation_minor_units)
                : '—'}
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              القيمة الدفترية للأصول المخزنية (1140)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>
              إجمالي المنتجات
            </CardTitle>
            <Layers className='size-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {valuation?.total_products ?? '—'}
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              صنف مسجل بالنظام
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>
              إجمالي الوحدات المتوفرة
            </CardTitle>
            <Package className='size-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {valuation?.total_stock_count ?? '—'}
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              قطعة جاهزة للبيع في المستودع
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>
              طريقة احتساب التكلفة
            </CardTitle>
            <Boxes className='size-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='mt-1 text-sm font-semibold text-foreground'>
              المتوسط المرجح (WAC)
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              معتمدة وفق معايير المحاسبة الدولية
            </p>
          </CardContent>
        </Card>
      </div>

      {/* جدول تقييم المخزون */}
      <Card>
        <CardHeader>
          <div className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
            <div>
              <CardTitle className='text-base'>
                جدول تقييم أصناف المخزون
              </CardTitle>
              <CardDescription>
                تكلفة الوحدة المحتسبة وإجمالي التقييم المخزني لكل منتج
              </CardDescription>
            </div>
            <div className='relative w-full sm:w-64'>
              <Search className='absolute top-2.5 right-2.5 size-4 text-muted-foreground' />
              <Input
                placeholder='بحث باسم المنتج...'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className='h-9 pr-9 text-xs'
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className='flex items-center justify-center gap-2 py-8 text-muted-foreground'>
              <LoaderCircle className='size-4 animate-spin' />
              <span>جاري تحميل تقييم المخزون...</span>
            </div>
          ) : error ? (
            <AccountingQueryError
              error={error}
              onRetry={() => void refetch()}
            />
          ) : filteredItems.length === 0 ? (
            <div className='py-8 text-center text-muted-foreground'>
              لا توجد منتجات مسجلة في المخزون حالياً.
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-right text-sm'>
                <thead className='bg-muted/50 text-xs text-muted-foreground'>
                  <tr>
                    <th className='p-3'>اسم المنتج</th>
                    <th className='p-3'>الكمية بالمخزن</th>
                    <th className='p-3'>متوسط تكلفة الوحدة</th>
                    <th className='p-3'>إجمالي التقييم الدفتري</th>
                    <th className='p-3'>طريقة التقييم</th>
                  </tr>
                </thead>
                <tbody className='divide-y'>
                  {filteredItems.map((item) => (
                    <tr key={item.product_id} className='hover:bg-muted/30'>
                      <td className='flex items-center gap-2 p-3 font-medium'>
                        <Package className='size-4 text-muted-foreground' />
                        <span>{item.name}</span>
                      </td>
                      <td className='p-3 font-mono text-xs'>
                        <Badge
                          variant={
                            item.stock_quantity > 0 ? 'outline' : 'destructive'
                          }
                        >
                          {item.stock_quantity} وحدة
                        </Badge>
                      </td>
                      <td className='p-3 font-mono text-xs font-semibold'>
                        {formatMinorUnits(item.unit_cost_minor_units)}
                      </td>
                      <td className='p-3 font-mono text-xs font-bold text-primary'>
                        {formatMinorUnits(item.total_cost_minor_units)}
                      </td>
                      <td className='p-3 text-xs'>
                        <Badge variant='secondary' className='text-xs'>
                          متوسط مرجح WAC
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* مودال تسوية جردية */}
      <Dialog open={isAdjOpen} onOpenChange={setIsAdjOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>تسجيل تسوية جردية للمخزون</DialogTitle>
            <DialogDescription>
              تسجيل فروقات الجرد الفعلي للمخزون (عجز، تلف، أو زيادة جردية) مع
              ترحيل القيد المحاسبي المزدوج.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdjustment} className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='adj-type'>نوع التسوية الجردية</Label>
              <Select
                value={adjType}
                onValueChange={(val: 'increase' | 'decrease') =>
                  setAdjType(val)
                }
              >
                <SelectTrigger id='adj-type'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='decrease'>
                    عجز أو تلف مخزني (مدين: تكلفة بضاعة / دائن: مخزون)
                  </SelectItem>
                  <SelectItem value='increase'>
                    زيادة جردية (مدين: مخزون / دائن: أرباح تسوية مخزون)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='adj-num'>رقم الإذن</Label>
                <Input
                  id='adj-num'
                  value={adjNumber}
                  onChange={(e) => setAdjNumber(e.target.value)}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='adj-date'>تاريخ التسوية</Label>
                <Input
                  id='adj-date'
                  type='date'
                  value={adjDate}
                  onChange={(e) => setAdjDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='adj-amt'>مبلغ التسوية المالية</Label>
              <Input
                id='adj-amt'
                type='number'
                step='0.01'
                min='0.01'
                placeholder='0.00'
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
                required
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='adj-reason'>السبب / الملاحظات الجردية</Label>
              <Input
                id='adj-reason'
                placeholder='مثال: فرق جرد نهاية الشهر، تلف أثناء النقل، هدايا ترويجية'
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                required
              />
            </div>

            <div className='space-y-1 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground'>
              <div className='font-semibold text-foreground'>
                الأثر المحاسبي للتسوية:
              </div>
              {adjType === 'decrease' ? (
                <div>
                  • مدين: 5100 تكلفة البضاعة المباعة / مصروف الفاقد | دائن: 1140
                  المخزون
                </div>
              ) : (
                <div>
                  • مدين: 1140 المخزون | دائن: 4200 إيرادات وأرباح تسوية أخرى
                </div>
              )}
            </div>

            <DialogFooter className='gap-2 sm:gap-0'>
              <Button
                type='button'
                variant='outline'
                onClick={() => setIsAdjOpen(false)}
              >
                إلغاء
              </Button>
              <Button type='submit' disabled={adjMutation.isPending}>
                {adjMutation.isPending && (
                  <LoaderCircle className='ml-2 size-4 animate-spin' />
                )}
                ترحيل التسوية
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
