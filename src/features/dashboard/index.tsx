import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  Bell,
  ExternalLink,
  Package,
  Palette,
  Phone,
  Plus,
  QrCode,
  ShoppingBag,
  Store,
} from 'lucide-react'
import { toast } from 'sonner'
import { authApiRequest } from '@/lib/auth-api'
import {
  merchantQueryKeys,
  refreshMerchantSnapshot,
  useMerchantData,
  useMerchantIdentity,
} from '@/hooks/useMerchantRealtime'
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
import { Main } from '@/components/layout/main'
import {
  MerchantPageHeading,
  MerchantWorkspaceHeader,
} from '@/components/layout/merchant-workspace'
import {
  fetchDashboardData,
  summarizeDashboardOrders,
  type DashboardOrder,
} from './dashboard-data'

const statusLabels: Record<string, string> = {
  pending_merchant_approval: 'بانتظار الموافقة',
  confirmed_by_store: 'قيد التجهيز',
  out_for_delivery: 'في الطريق',
  completed: 'مكتمل',
  cancelled: 'ملغي',
}

function formatAmount(amount: number, currency: string) {
  return `${amount.toLocaleString('ar-YE')} ${currency}`
}

function pendingOrdersMessage(count: number) {
  const localizedCount = count.toLocaleString('ar-YE')
  if (count === 1) return 'لديك طلب واحد جديد ينتظر موافقتك.'
  if (count === 2) return 'لديك طلبان جديدان ينتظران موافقتك.'
  if (count <= 10) {
    return `لديك ${localizedCount} طلبات جديدة تنتظر موافقتك.`
  }
  return `لديك ${localizedCount} طلبًا جديدًا ينتظر موافقتك.`
}

function StatCard({
  title,
  value,
  note,
  icon: Icon,
  iconClassName,
  onClick,
}: {
  title: string
  value: number
  note: string
  icon: typeof Package
  iconClassName?: string
  onClick?: () => void
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='group min-w-0 text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
    >
      <Card className='h-full gap-0 py-0 transition-colors group-hover:bg-muted/40'>
        <CardHeader className='flex flex-row items-center justify-between gap-3 px-4 pt-4 pb-2 sm:px-5 sm:pt-5'>
          <CardTitle className='text-sm font-medium text-muted-foreground'>
            {title}
          </CardTitle>
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-lg ${
              iconClassName || 'bg-primary/10 text-primary'
            }`}
          >
            <Icon className='size-4' aria-hidden='true' />
          </span>
        </CardHeader>
        <CardContent className='px-4 pb-4 sm:px-5 sm:pb-5'>
          <div className='text-2xl font-bold tabular-nums sm:text-3xl'>
            {value.toLocaleString('ar-YE')}
          </div>
          <p className='mt-1 text-xs text-muted-foreground'>{note}</p>
        </CardContent>
      </Card>
    </button>
  )
}

function EmptyList({ children }: { children: string }) {
  return (
    <p className='rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground'>
      {children}
    </p>
  )
}

export function Dashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const merchantId = useMerchantIdentity()
  const bootstrapQuery = useMerchantData(merchantId)
  const [selectedOrder, setSelectedOrder] = useState<DashboardOrder | null>(
    null
  )
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false)
  const [deliveryOrderId, setDeliveryOrderId] = useState('')
  const [deliveryCode, setDeliveryCode] = useState('')
  const dashboardQuery = useQuery({
    queryKey: merchantQueryKeys.dashboard(merchantId),
    queryFn: fetchDashboardData,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const deliveryMutation = useMutation({
    mutationFn: async () => {
      if (!deliveryOrderId) throw new Error('يرجى اختيار الطلب المراد تسليمه.')
      if (!/^\d{4}$/.test(deliveryCode)) {
        throw new Error('أدخل كود تسليم صحيحاً من 4 أرقام.')
      }

      const result = await authApiRequest('confirm_delivery_code', {
        ticket_id: deliveryOrderId,
        code: deliveryCode,
      })
      if (result.status !== 'success') {
        throw new Error(result.message || 'تعذر تأكيد تسليم الطلب.')
      }
      return result
    },
    onSuccess: async (result) => {
      toast.success(result.message || 'تم تأكيد تسليم الطلب بنجاح.')
      try {
        await refreshMerchantSnapshot(queryClient, merchantId)
      } catch (error) {
        toast.error(
          `تم تأكيد التسليم، لكن تعذر تحديث بيانات اللوحة: ${
            error instanceof Error ? error.message : 'خطأ غير معروف.'
          }`
        )
      }
      setDeliveryDialogOpen(false)
      setDeliveryCode('')
      setDeliveryOrderId('')
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'تعذر تأكيد التسليم.'
      )
    },
  })

  const data = dashboardQuery.data
  const orderSummary = useMemo(
    () =>
      data
        ? summarizeDashboardOrders(data.activeOrders, data.archivedOrders)
        : { awaitingOrders: 0, deliveryOrders: [], recentOrders: [] },
    [data]
  )
  const { awaitingOrders, deliveryOrders, recentOrders } = orderSummary
  const storeUrl =
    data?.username && typeof window !== 'undefined'
      ? `${window.location.origin}/${encodeURIComponent(data.username)}`
      : ''
  const callablePhone = data?.phone.replace(/[^\d+#*]/g, '') || ''
  const phoneHref = callablePhone ? `tel:${callablePhone}` : ''

  const openDeliveryDialog = () => {
    if (!deliveryOrders.length) {
      toast.info('لا توجد طلبات خرجت للتوصيل وتنتظر تأكيد الاستلام.')
      return
    }
    setDeliveryOrderId(deliveryOrders[0].id)
    setDeliveryCode('')
    setDeliveryDialogOpen(true)
  }

  const submitDeliveryCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!deliveryOrders.some((order) => order.id === deliveryOrderId)) {
      toast.error('اختر طلباً خرج للتوصيل قبل تأكيد رمز الاستلام.')
      return
    }
    deliveryMutation.mutate()
  }

  return (
    <>
      <MerchantWorkspaceHeader />

      <Main className='merchant-content'>
        <div className='mb-6'>
          <MerchantPageHeading
            title='الرئيسية'
            description='متابعة الطلبات والمنتجات وحالة متجرك من مكان واحد.'
            actions={
              <Button
                onClick={() => {
                  void bootstrapQuery.refetch()
                }}
                variant='outline'
                disabled={bootstrapQuery.isFetching}
              >
                <Bell aria-hidden='true' />
                تحديث البيانات
              </Button>
            }
          />
        </div>

        {dashboardQuery.isPending ? (
          <div
            className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'
            role='status'
            aria-label='جارٍ تحميل بيانات المتجر'
          >
            {Array.from({ length: 4 }, (_, index) => (
              <Card key={index} className='h-28 bg-muted/50' />
            ))}
          </div>
        ) : dashboardQuery.isError && !data ? (
          <Card>
            <CardHeader>
              <CardTitle>تعذر تحميل بيانات الرئيسية</CardTitle>
              <CardDescription>
                {dashboardQuery.error instanceof Error
                  ? dashboardQuery.error.message
                  : 'تحقق من اتصالك ثم أعد المحاولة.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => {
                  void bootstrapQuery.refetch()
                }}
              >
                إعادة المحاولة
              </Button>
            </CardContent>
          </Card>
        ) : data ? (
          <div className='space-y-6'>
            <section
              aria-labelledby='order-attention-title'
              className={`flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${
                awaitingOrders
                  ? 'border-amber-500/30 bg-amber-500/5'
                  : 'border-emerald-500/25 bg-emerald-500/5'
              }`}
            >
              <div className='flex min-w-0 items-center gap-3'>
                <span
                  className={`grid size-11 shrink-0 place-items-center rounded-lg ${
                    awaitingOrders
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  <Bell className='size-5' aria-hidden='true' />
                </span>
                <div className='min-w-0'>
                  <h2 id='order-attention-title' className='font-semibold'>
                    طلبات بانتظار موافقتك
                  </h2>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {awaitingOrders
                      ? pendingOrdersMessage(awaitingOrders)
                      : 'ستظهر الطلبات الجديدة هنا فور وصولها.'}
                  </p>
                </div>
              </div>
              <Button
                variant={awaitingOrders ? 'default' : 'outline'}
                className='w-full shrink-0 sm:w-auto'
                onClick={() => void navigate({ to: '/orders' })}
              >
                متابعة الطلبات <ArrowLeft aria-hidden='true' />
              </Button>
            </section>

            <Card className='overflow-hidden border-border/70'>
              <CardContent className='grid gap-5 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-6'>
                <div className='min-w-0'>
                  <p className='mb-1 text-sm font-medium text-muted-foreground'>
                    متجرك على نالش
                  </p>
                  <h2 className='truncate text-xl font-bold sm:text-2xl'>
                    {data.storeName}
                  </h2>
                  <p className='mt-2 text-sm text-muted-foreground'>
                    بيانات المتجر وروابطه وأحدث نشاطاته في مكان واحد.
                  </p>
                </div>
                <div className='grid min-w-0 gap-2 sm:grid-cols-2 md:min-w-[24rem]'>
                  <a
                    href={phoneHref || undefined}
                    aria-disabled={!phoneHref}
                    className='flex min-w-0 items-center gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-accent aria-disabled:pointer-events-none aria-disabled:opacity-60'
                  >
                    <Phone className='size-4 shrink-0 text-muted-foreground' />
                    <span className='grid min-w-0'>
                      <span className='text-xs text-muted-foreground'>
                        رقم المتجر
                      </span>
                      <span className='truncate text-sm font-medium' dir='ltr'>
                        {data.phone || 'غير مضاف'}
                      </span>
                    </span>
                  </a>
                  <a
                    href={storeUrl || undefined}
                    target='_blank'
                    rel='noopener noreferrer'
                    aria-disabled={!storeUrl}
                    className='flex min-w-0 items-center gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-accent aria-disabled:pointer-events-none aria-disabled:opacity-60'
                  >
                    <Store className='size-4 shrink-0 text-muted-foreground' />
                    <span className='grid min-w-0'>
                      <span className='text-xs text-muted-foreground'>
                        رابط المتجر
                      </span>
                      <span className='truncate text-sm font-medium' dir='ltr'>
                        {storeUrl || 'غير متاح'}
                      </span>
                    </span>
                    {storeUrl && (
                      <ExternalLink className='size-3 shrink-0 text-muted-foreground' />
                    )}
                  </a>
                </div>
              </CardContent>
            </Card>

            <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
              <StatCard
                title='بانتظار الموافقة'
                value={awaitingOrders}
                note='طلبات جديدة بانتظارك'
                icon={Bell}
                iconClassName='bg-amber-500/10 text-amber-700 dark:text-amber-300'
                onClick={() => void navigate({ to: '/orders' })}
              />
              <StatCard
                title='الطلبات النشطة'
                value={data.activeOrders.length}
                note='طلبات تحتاج إلى متابعة'
                icon={ShoppingBag}
                onClick={() => void navigate({ to: '/orders' })}
              />
              <StatCard
                title='في الطريق'
                value={deliveryOrders.length}
                note='طلبات خرجت للتوصيل'
                icon={Store}
                iconClassName='bg-blue-500/10 text-blue-700 dark:text-blue-300'
                onClick={() => void navigate({ to: '/orders' })}
              />
              <StatCard
                title='المنتجات'
                value={data.products.length}
                note='إجمالي المنتجات في متجرك'
                icon={Package}
                onClick={() => void navigate({ to: '/product-catalog' })}
              />
            </div>

            <div className='grid gap-4 lg:grid-cols-7'>
              <Card className='order-2 gap-0 py-0 lg:order-2 lg:col-span-3'>
                <CardHeader className='flex flex-row items-center justify-between gap-3 px-5 pt-5 pb-4'>
                  <div>
                    <CardTitle>أحدث المنتجات</CardTitle>
                    <CardDescription className='mt-1'>
                      آخر المنتجات المضافة إلى متجرك
                    </CardDescription>
                  </div>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => void navigate({ to: '/product-catalog' })}
                  >
                    عرض الكل <ArrowLeft aria-hidden='true' />
                  </Button>
                </CardHeader>
                <CardContent className='grid gap-2 px-5 pb-5'>
                  {data.products.length ? (
                    data.products.slice(0, 4).map((product) => (
                      <button
                        key={product.id}
                        type='button'
                        onClick={() =>
                          void navigate({ to: '/product-catalog' })
                        }
                        className='flex min-w-0 items-center gap-3 rounded-lg border border-transparent bg-muted/40 p-2 text-start transition-colors hover:border-border hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-ring'
                      >
                        {product.image ? (
                          <img
                            src={product.image}
                            alt=''
                            loading='lazy'
                            className='size-11 shrink-0 rounded-md border object-cover'
                          />
                        ) : (
                          <span className='grid size-11 shrink-0 place-items-center rounded-md border bg-background text-muted-foreground'>
                            <Package className='size-5' aria-hidden='true' />
                          </span>
                        )}
                        <span className='grid min-w-0 flex-1'>
                          <span className='truncate text-sm font-semibold'>
                            {product.name}
                          </span>
                          <span className='truncate text-xs text-muted-foreground'>
                            {product.type}
                          </span>
                        </span>
                        <bdi className='shrink-0 text-xs font-semibold text-muted-foreground'>
                          {formatAmount(product.price, product.currency)}
                        </bdi>
                      </button>
                    ))
                  ) : (
                    <EmptyList>لا توجد منتجات لعرضها بعد.</EmptyList>
                  )}
                </CardContent>
              </Card>

              <Card className='order-1 gap-0 py-0 lg:order-1 lg:col-span-4'>
                <CardHeader className='flex flex-row items-center justify-between gap-3 px-5 pt-5 pb-4'>
                  <div>
                    <CardTitle>آخر الطلبات</CardTitle>
                    <CardDescription className='mt-1'>
                      أحدث خمسة طلبات وصلتك
                    </CardDescription>
                  </div>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => void navigate({ to: '/orders' })}
                  >
                    عرض الكل <ArrowLeft aria-hidden='true' />
                  </Button>
                </CardHeader>
                <CardContent className='grid gap-2 px-5 pb-5'>
                  {recentOrders.length ? (
                    recentOrders.map((order) => (
                      <button
                        key={order.id}
                        type='button'
                        onClick={() => setSelectedOrder(order)}
                        className='flex min-w-0 items-center gap-2 rounded-lg border border-transparent bg-muted/40 p-3 text-start transition-colors hover:border-border hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-ring'
                      >
                        <span className='grid min-w-0 flex-1'>
                          <bdi className='text-sm font-semibold'>
                            #{order.id.slice(0, 8)}
                          </bdi>
                          <span className='truncate text-xs text-muted-foreground'>
                            {order.customerName}
                          </span>
                        </span>
                        <span className='shrink-0 rounded-full bg-background px-2 py-1 text-[11px] text-muted-foreground'>
                          {statusLabels[order.status] || 'قيد المتابعة'}
                        </span>
                        <bdi className='shrink-0 text-xs font-semibold'>
                          {formatAmount(order.total, order.currency)}
                        </bdi>
                      </button>
                    ))
                  ) : (
                    <EmptyList>لا توجد طلبات لعرضها بعد.</EmptyList>
                  )}
                </CardContent>
              </Card>
            </div>

            <section
              aria-labelledby='quick-actions-title'
              className='space-y-3'
            >
              <div>
                <h2 id='quick-actions-title' className='text-lg font-semibold'>
                  إجراءات سريعة
                </h2>
                <p className='text-sm text-muted-foreground'>
                  أنجز أهم مهام المتجر مباشرة
                </p>
              </div>
              <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
                <QuickAction
                  icon={Plus}
                  title='إضافة منتج جديد'
                  description='أضف سلعة إلى متجرك'
                  onClick={() =>
                    void navigate({
                      to: '/products',
                      search: { create: true },
                    })
                  }
                />
                <QuickAction
                  icon={ShoppingBag}
                  title='متابعة الطلبات'
                  description='راجع الواردة والجارية'
                  onClick={() => void navigate({ to: '/orders' })}
                />
                <QuickAction
                  icon={Palette}
                  title='قوالب المتجر'
                  description='اختر مظهر متجرك'
                  onClick={() => void navigate({ to: '/storefront' })}
                />
                <QuickAction
                  icon={QrCode}
                  title='تسليم فوري'
                  description='تحقق من كود الاستلام'
                  onClick={openDeliveryDialog}
                />
              </div>
            </section>
          </div>
        ) : null}
      </Main>

      <Dialog
        open={Boolean(selectedOrder)}
        onOpenChange={(open) => {
          if (!open) setSelectedOrder(null)
        }}
      >
        <DialogContent className='font-ibm-plex-sans-arabic'>
          <DialogHeader>
            <DialogTitle>تفاصيل الطلب</DialogTitle>
            <DialogDescription>
              {selectedOrder
                ? `الطلب #${selectedOrder.id.slice(0, 8)} من ${selectedOrder.customerName}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className='flex items-center justify-between rounded-lg bg-muted/50 p-4 text-sm'>
              <span className='text-muted-foreground'>
                {statusLabels[selectedOrder.status] || 'قيد المتابعة'}
              </span>
              <bdi className='font-semibold'>
                {formatAmount(selectedOrder.total, selectedOrder.currency)}
              </bdi>
            </div>
          )}
          <DialogFooter>
            <Button variant='outline' onClick={() => setSelectedOrder(null)}>
              إغلاق
            </Button>
            <Button
              onClick={() => {
                if (!selectedOrder) return
                const { id, status } = selectedOrder
                setSelectedOrder(null)
                void navigate({
                  to: '/orders',
                  search: {
                    orderId: id,
                    filter:
                      status === 'completed' || status === 'cancelled'
                        ? 'archived'
                        : 'active',
                  },
                })
              }}
            >
              فتح الطلبات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
        <DialogContent className='font-ibm-plex-sans-arabic'>
          <DialogHeader>
            <DialogTitle>تأكيد تسليم الطلب</DialogTitle>
            <DialogDescription>
              اختر الطلب وأدخل رمز الاستلام المكوّن من أربعة أرقام.
            </DialogDescription>
          </DialogHeader>
          <form className='grid gap-4' onSubmit={submitDeliveryCode}>
            <label className='grid gap-2 text-sm font-medium'>
              الطلب
              <select
                value={deliveryOrderId}
                onChange={(event) => setDeliveryOrderId(event.target.value)}
                className='h-9 w-full rounded-md border border-input bg-background px-3 text-sm'
                required
              >
                {deliveryOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    #{order.id.slice(0, 8)} — {order.customerName}
                  </option>
                ))}
              </select>
            </label>
            <label className='grid gap-2 text-sm font-medium'>
              رمز الاستلام
              <Input
                autoComplete='one-time-code'
                inputMode='numeric'
                maxLength={4}
                pattern='[0-9]{4}'
                placeholder='0000'
                value={deliveryCode}
                onChange={(event) =>
                  setDeliveryCode(
                    event.target.value.replace(/\D/g, '').slice(0, 4)
                  )
                }
                required
              />
            </label>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setDeliveryDialogOpen(false)}
              >
                إلغاء
              </Button>
              <Button
                type='submit'
                disabled={deliveryMutation.isPending || !deliveryOrderId}
              >
                {deliveryMutation.isPending
                  ? 'جارٍ التحقق...'
                  : 'تأكيد التسليم'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function QuickAction({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof Package
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <Button
      variant='outline'
      onClick={onClick}
      className='h-auto min-h-20 justify-start gap-3 rounded-lg p-4 text-start'
    >
      <span className='grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary'>
        <Icon className='size-5' aria-hidden='true' />
      </span>
      <span className='grid flex-1 justify-items-start gap-1 whitespace-normal'>
        <span className='font-semibold'>{title}</span>
        <span className='text-xs font-normal text-muted-foreground'>
          {description}
        </span>
      </span>
      <ArrowLeft
        className='size-4 shrink-0 text-muted-foreground'
        aria-hidden='true'
      />
    </Button>
  )
}
