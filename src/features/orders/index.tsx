import { useDeferredValue, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  ArrowLeft,
  Check,
  Clock3,
  ExternalLink,
  History,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Search,
  ShoppingBag,
  Truck,
  UserRound,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { clearAuthApiCache } from '@/lib/auth-api'
import {
  merchantQueryKeys,
  refreshMerchantSnapshot,
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
import { Label } from '@/components/ui/label'
import { Main } from '@/components/layout/main'
import {
  MerchantPageHeading,
  MerchantWorkspaceHeader,
} from '@/components/layout/merchant-workspace'
import {
  cancelDashboardOrder,
  confirmDashboardOrderDelivery,
  fetchDashboardOrders,
  updateDashboardOrderStatus,
  type DashboardOrder,
} from '@/features/dashboard/dashboard-data'

type OrdersFilter = 'active' | 'archived'
type ConfirmAction = 'out-for-delivery' | 'cancel'

const PAGE_SIZE = 25

function nextPendingOrderId(
  orders: DashboardOrder[],
  currentOrderId: string
): string | null {
  const currentIndex = orders.findIndex((order) => order.id === currentOrderId)
  const pendingOrders = orders.filter(
    (order) =>
      order.id !== currentOrderId &&
      order.status === 'pending_merchant_approval'
  )
  return (
    pendingOrders.find(
      (order) => orders.findIndex((item) => item.id === order.id) > currentIndex
    )?.id ||
    pendingOrders[0]?.id ||
    null
  )
}

const statusDetails: Record<string, { label: string; className: string }> = {
  pending_merchant_approval: {
    label: 'بانتظار موافقتك',
    className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  confirmed_by_store: {
    label: 'قيد التجهيز',
    className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  out_for_delivery: {
    label: 'في الطريق',
    className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  },
  completed: {
    label: 'مكتمل بنجاح',
    className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  cancelled: {
    label: 'ملغي',
    className: 'bg-destructive/10 text-destructive',
  },
}

function formatAmount(amount: number, currency: string) {
  return `${amount.toLocaleString('ar-YE')} ${currency}`
}

function formatDate(value: string, includeTime = false) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return 'غير محدد'
  return date.toLocaleString(
    'ar-YE',
    includeTime
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { dateStyle: 'medium' }
  )
}

function safeMapUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

function OrderStatus({ status }: { status: string }) {
  const details = statusDetails[status] || {
    label: status || 'حالة غير معروفة',
    className: 'bg-muted text-muted-foreground',
  }
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${details.className}`}
    >
      {details.label}
    </span>
  )
}

function OrderCard({
  order,
  onOpen,
}: {
  order: DashboardOrder
  onOpen: () => void
}) {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)
  return (
    <button
      type='button'
      onClick={onOpen}
      className='grid w-full gap-3 rounded-xl border bg-card p-4 text-start transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'
      aria-label={`تفاصيل الطلب ${order.id} للعميل ${order.customerName}`}
    >
      <span className='flex min-w-0 items-start gap-3'>
        <span className='grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary'>
          <ShoppingBag className='size-5' aria-hidden='true' />
        </span>
        <span className='grid min-w-0 gap-1.5'>
          <span className='flex flex-wrap items-center gap-2'>
            <bdi className='font-semibold' dir='ltr'>
              #{order.id.slice(0, 8)}
            </bdi>
            <OrderStatus status={order.status} />
          </span>
          <span className='flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground'>
            <span className='inline-flex items-center gap-1'>
              <UserRound className='size-3.5' aria-hidden='true' />
              {order.customerName}
            </span>
            <span>{itemCount.toLocaleString('ar-YE')} منتجات</span>
            <span>{formatDate(order.createdAt, true)}</span>
          </span>
        </span>
      </span>
      <span className='flex items-center justify-between gap-3 sm:justify-end'>
        <bdi className='font-bold tabular-nums'>
          {formatAmount(order.total, order.currency)}
        </bdi>
        <span className='inline-flex items-center gap-1 text-xs text-primary'>
          التفاصيل <ArrowLeft className='size-3.5' aria-hidden='true' />
        </span>
      </span>
    </button>
  )
}

function OrderDetails({
  order,
  onClose,
  onApprove,
  onConfirmAction,
  onDeliveryCode,
  pending,
}: {
  order: DashboardOrder | null
  onClose: () => void
  onApprove: (order: DashboardOrder) => void
  onConfirmAction: (action: ConfirmAction, order: DashboardOrder) => void
  onDeliveryCode: (order: DashboardOrder) => void
  pending: boolean
}) {
  if (!order) return null
  const lineTotal = order.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )
  const totalCost = order.items.reduce(
    (sum, item) => sum + item.costPrice * item.quantity,
    0
  )
  const deliveryFee = order.deliveryFee
  const grandTotal = lineTotal + deliveryFee
  const profit = lineTotal - totalCost
  const mapUrl = safeMapUrl(order.deliveryMapUrl)
  const phoneHref = order.customerPhone.replace(/[^\d+#*]/g, '')

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-h-[92svh] overflow-y-auto font-ibm-plex-sans-arabic sm:max-w-2xl'>
        <DialogHeader>
          <div className='flex flex-wrap items-center gap-2'>
            <DialogTitle>تفاصيل الطلب</DialogTitle>
            <bdi className='text-sm text-muted-foreground' dir='ltr'>
              #{order.id.slice(0, 8)}
            </bdi>
            <OrderStatus status={order.status} />
          </div>
          <DialogDescription>
            تاريخ الطلب: {formatDate(order.createdAt, true)}
          </DialogDescription>
        </DialogHeader>

        <section className='grid gap-3 rounded-xl border p-4'>
          <h3 className='font-semibold'>بيانات العميل والتوصيل</h3>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <span className='inline-flex items-center gap-2 font-medium'>
              <UserRound className='size-4 text-muted-foreground' />
              {order.customerName}
            </span>
            {phoneHref ? (
              <a
                href={`tel:${phoneHref}`}
                className='inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline'
                dir='ltr'
              >
                <Phone className='size-4' />
                {order.customerPhone}
              </a>
            ) : (
              <span className='text-sm text-muted-foreground'>
                بدون رقم هاتف
              </span>
            )}
          </div>
          {order.deliveryAddress && (
            <p className='flex items-start gap-2 text-sm text-muted-foreground'>
              <MapPin className='mt-0.5 size-4 shrink-0' />
              {order.deliveryAddress}
            </p>
          )}
          {mapUrl && (
            <a
              href={mapUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex w-fit items-center gap-2 text-sm text-primary underline-offset-4 hover:underline'
            >
              <MapPin className='size-4' />
              فتح موقع التوصيل
              <ExternalLink className='size-3.5' />
            </a>
          )}
        </section>

        <section className='grid gap-3 rounded-xl border p-4'>
          <h3 className='font-semibold'>المنتجات المطلوبة</h3>
          {order.items.length ? (
            <ul className='grid gap-3'>
              {order.items.map((item) => (
                <li key={item.id} className='flex min-w-0 items-center gap-3'>
                  {item.image ? (
                    <img
                      src={item.image}
                      alt=''
                      className='size-12 shrink-0 rounded-lg border object-cover'
                    />
                  ) : (
                    <span className='grid size-12 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground'>
                      <Package className='size-5' />
                    </span>
                  )}
                  <span className='grid min-w-0 flex-1 gap-1'>
                    <span className='truncate text-sm font-medium'>
                      {item.name}
                    </span>
                    <span className='text-xs text-muted-foreground'>
                      الكمية: {item.quantity.toLocaleString('ar-YE')}
                    </span>
                  </span>
                  <bdi className='shrink-0 text-sm font-semibold'>
                    {formatAmount(item.price * item.quantity, order.currency)}
                  </bdi>
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-sm text-muted-foreground'>
              لا تتوفر تفاصيل المنتجات لهذا الطلب.
            </p>
          )}
        </section>

        <section className='grid gap-2 rounded-xl border p-4 text-sm'>
          <div className='flex justify-between gap-3'>
            <span className='text-muted-foreground'>إجمالي المنتجات</span>
            <bdi>
              {formatAmount(
                order.items.length ? lineTotal : order.total - deliveryFee,
                order.currency
              )}
            </bdi>
          </div>
          <div className='flex justify-between gap-3'>
            <span className='text-muted-foreground'>رسوم التوصيل</span>
            <bdi>
              {deliveryFee
                ? formatAmount(deliveryFee, order.currency)
                : 'مجاني'}
            </bdi>
          </div>
          <div className='flex justify-between gap-3 border-t pt-3 text-base font-bold'>
            <span>المبلغ الإجمالي المستحق</span>
            <bdi>
              {formatAmount(
                order.items.length ? grandTotal : order.total,
                order.currency
              )}
            </bdi>
          </div>
          {profit > 0 && order.status !== 'cancelled' && (
            <p className='text-end text-xs font-medium text-emerald-700 dark:text-emerald-300'>
              الربح الصافي التقديري: {formatAmount(profit, order.currency)}
            </p>
          )}
        </section>

        <DialogFooter className='flex-wrap'>
          {order.status === 'pending_merchant_approval' && (
            <>
              <Button
                variant='destructive'
                disabled={pending}
                onClick={() => onConfirmAction('cancel', order)}
              >
                <X /> إلغاء الطلب
              </Button>
              <Button disabled={pending} onClick={() => onApprove(order)}>
                <Check /> موافقة وتجهيز
              </Button>
            </>
          )}
          {order.status === 'confirmed_by_store' && (
            <Button
              disabled={pending}
              onClick={() => onConfirmAction('out-for-delivery', order)}
            >
              <Truck /> خرج للتوصيل
            </Button>
          )}
          {order.status === 'out_for_delivery' && (
            <Button disabled={pending} onClick={() => onDeliveryCode(order)}>
              <Check /> تأكيد كود الاستلام
            </Button>
          )}
          <Button variant='outline' onClick={onClose}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function Orders() {
  const { orderId, filter } = useSearch({ from: '/_authenticated/orders' })
  return <OrdersPage orderId={orderId} archived={filter === 'archived'} />
}

export function PreviousOrders() {
  const { orderId } = useSearch({
    from: '/_authenticated/previous-orders',
  })
  return <OrdersPage orderId={orderId} archived />
}

function OrdersPage({
  orderId,
  archived = false,
}: {
  orderId?: string
  archived?: boolean
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const merchantId = useMerchantIdentity()
  const filter: OrdersFilter = archived ? 'archived' : 'active'
  const ordersPath = filter === 'archived' ? '/previous-orders' : '/orders'
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    orderId || null
  )
  const [confirmAction, setConfirmAction] = useState<{
    action: ConfirmAction
    order: DashboardOrder
  } | null>(null)
  const [deliveryOrder, setDeliveryOrder] = useState<DashboardOrder | null>(
    null
  )
  const [deliveryCode, setDeliveryCode] = useState('')
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase())
  const ordersQuery = useQuery({
    queryKey: merchantQueryKeys.orders(merchantId, filter),
    queryFn: () => fetchDashboardOrders(filter),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const activeQuery = useQuery({
    queryKey: merchantQueryKeys.orders(merchantId, 'active'),
    queryFn: () => fetchDashboardOrders('active'),
    enabled: filter === 'archived',
    staleTime: Number.POSITIVE_INFINITY,
  })
  const orders = useMemo(() => ordersQuery.data || [], [ordersQuery.data])
  const filteredOrders = useMemo(() => {
    if (!deferredSearch) return orders
    return orders.filter((order) =>
      [order.id, order.customerName, order.customerPhone, order.deliveryAddress]
        .join(' ')
        .toLocaleLowerCase()
        .includes(deferredSearch)
    )
  }, [deferredSearch, orders])

  const refreshMerchantData = async () => {
    try {
      await refreshMerchantSnapshot(queryClient, merchantId)
    } catch (error) {
      toast.error(
        `تم حفظ التغيير، لكن تعذر تحديث بيانات اللوحة: ${
          error instanceof Error ? error.message : 'خطأ غير معروف.'
        }`
      )
    }
  }

  const statusMutation = useMutation({
    mutationFn: ({
      order,
      status,
    }: {
      order: DashboardOrder
      status: 'confirmed_by_store' | 'out_for_delivery'
    }) => updateDashboardOrderStatus(order.id, status),
    onSuccess: async (message, variables) => {
      toast.success(
        message ||
          (variables.status === 'confirmed_by_store'
            ? 'تمت الموافقة على الطلب وجارٍ التجهيز.'
            : 'تم تحديث حالة الطلب إلى في الطريق.')
      )
      await refreshMerchantData()
      const nextOrderId =
        variables.status === 'confirmed_by_store'
          ? nextPendingOrderId(filteredOrders, variables.order.id)
          : null
      setSelectedOrderId(nextOrderId)
      void navigate({
        to: ordersPath,
        search: { orderId: nextOrderId || undefined },
      })
      setConfirmAction(null)
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'تعذر تحديث حالة الطلب.'
      ),
  })
  const cancelMutation = useMutation({
    mutationFn: (order: DashboardOrder) => cancelDashboardOrder(order.id),
    onSuccess: async (message, order) => {
      toast.success(message || 'تم إلغاء الطلب بنجاح.')
      await refreshMerchantData()
      const nextOrderId = nextPendingOrderId(filteredOrders, order.id)
      setSelectedOrderId(nextOrderId)
      void navigate({
        to: ordersPath,
        search: { orderId: nextOrderId || undefined },
      })
      setConfirmAction(null)
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'تعذر إلغاء الطلب.'),
  })
  const deliveryMutation = useMutation({
    mutationFn: () => {
      if (!deliveryOrder) throw new Error('اختر الطلب المراد تأكيد تسليمه.')
      return confirmDashboardOrderDelivery(
        deliveryOrder.id,
        deliveryCode.trim()
      )
    },
    onSuccess: async (message) => {
      toast.success(message || 'تم تأكيد تسليم الطلب بنجاح.')
      await refreshMerchantData()
      setDeliveryOrder(null)
      setDeliveryCode('')
      setSelectedOrderId(null)
      void navigate({
        to: ordersPath,
        search: { orderId: undefined },
      })
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'تعذر تأكيد التسليم.'
      ),
  })

  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE))
  const visibleOrders = filteredOrders.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  )
  const allOrders = [...(ordersQuery.data || []), ...(activeQuery.data || [])]
  const selectedOrder =
    allOrders.find((order) => order.id === selectedOrderId) || null
  const isMutating =
    statusMutation.isPending ||
    cancelMutation.isPending ||
    deliveryMutation.isPending

  const setOrdersFilter = (nextFilter: OrdersFilter) => {
    setPage(1)
    setSearch('')
    setSelectedOrderId(null)
    void navigate({
      to: nextFilter === 'archived' ? '/previous-orders' : '/orders',
      search: { orderId: undefined },
    })
  }

  const submitDelivery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    deliveryMutation.mutate()
  }

  return (
    <>
      <MerchantWorkspaceHeader />
      <Main className='merchant-content'>
        <div className='mb-6'>
          <MerchantPageHeading
            section={{ title: 'الطلبات', url: '/orders' }}
            title={filter === 'active' ? 'الطلبات النشطة' : 'الطلبات السابقة'}
            description={
              filter === 'active'
                ? 'تابع الطلبات المعلقة وقيد التجهيز والتوصيل واتخذ الإجراء المناسب.'
                : 'راجع الطلبات المكتملة والملغاة وارجع إلى تفاصيلها عند الحاجة.'
            }
            actions={
              <Button
                variant='outline'
                disabled={ordersQuery.isFetching}
                onClick={() => {
                  clearAuthApiCache()
                  void ordersQuery.refetch()
                }}
              >
                <RefreshCw
                  className={ordersQuery.isFetching ? 'animate-spin' : ''}
                />
                تحديث الطلبات
              </Button>
            }
          />
        </div>

        <Card className='gap-0 py-0'>
          <CardHeader className='gap-4 px-4 pt-5 sm:px-5'>
            <div>
              <CardTitle>
                {filter === 'active' ? 'الطلبات النشطة' : 'الطلبات السابقة'}
              </CardTitle>
              <CardDescription className='mt-1'>
                ابحث برقم الطلب أو اسم العميل أو رقم الهاتف، ثم افتح الطلب
                لإدارته.
              </CardDescription>
            </div>
            <div className='flex flex-wrap gap-2' aria-label='صفحات الطلبات'>
              <Button
                variant={filter === 'active' ? 'default' : 'outline'}
                aria-current={filter === 'active' ? 'page' : undefined}
                onClick={() => setOrdersFilter('active')}
              >
                <Clock3 /> النشطة
              </Button>
              <Button
                variant={filter === 'archived' ? 'default' : 'outline'}
                aria-current={filter === 'archived' ? 'page' : undefined}
                onClick={() => setOrdersFilter('archived')}
              >
                <History /> السابقة
              </Button>
            </div>
          </CardHeader>
          <CardContent className='grid gap-4 px-4 pb-5 sm:px-5'>
            <div className='relative'>
              <Search className='absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder='ابحث برقم الطلب أو اسم العميل أو الهاتف...'
                aria-label='البحث في الطلبات'
                className='ps-9'
              />
            </div>

            {ordersQuery.isPending ? (
              <div
                className='grid gap-3'
                role='status'
                aria-label='جارٍ تحميل الطلبات'
              >
                {Array.from({ length: 4 }, (_, index) => (
                  <div
                    key={index}
                    className='h-24 rounded-xl border bg-muted/50'
                  />
                ))}
              </div>
            ) : ordersQuery.isError && !ordersQuery.data ? (
              <div className='rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-center'>
                <p className='font-semibold'>تعذر تحميل الطلبات</p>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {ordersQuery.error instanceof Error
                    ? ordersQuery.error.message
                    : 'تحقق من اتصالك ثم أعد المحاولة.'}
                </p>
                <Button
                  className='mt-3'
                  onClick={() => {
                    clearAuthApiCache()
                    void ordersQuery.refetch()
                  }}
                >
                  إعادة المحاولة
                </Button>
              </div>
            ) : filteredOrders.length ? (
              <>
                <div className='grid gap-3'>
                  {visibleOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onOpen={() => setSelectedOrderId(order.id)}
                    />
                  ))}
                </div>
                {pageCount > 1 && (
                  <div className='flex flex-wrap items-center justify-center gap-3 pt-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={page <= 1}
                      onClick={() => setPage((current) => current - 1)}
                    >
                      السابق
                    </Button>
                    <span className='text-sm text-muted-foreground'>
                      صفحة {page.toLocaleString('ar-YE')} من{' '}
                      {pageCount.toLocaleString('ar-YE')}
                    </span>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={page >= pageCount}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      التالي
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className='rounded-xl border border-dashed px-4 py-12 text-center'>
                <span className='mx-auto mb-3 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground'>
                  <ShoppingBag className='size-6' />
                </span>
                <h2 className='font-semibold'>
                  {deferredSearch
                    ? 'لا توجد نتائج مطابقة'
                    : 'لا توجد طلبات في هذا القسم'}
                </h2>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {deferredSearch
                    ? 'جرّب البحث برقم الطلب أو اسم عميل مختلف.'
                    : 'ستظهر طلبات متجرك هنا عند وصولها.'}
                </p>
              </div>
            )}
            {ordersQuery.isError && ordersQuery.data && (
              <p role='status' className='text-center text-xs text-destructive'>
                تعذر تحديث أحدث الطلبات؛ المعروض هو آخر بيانات محمّلة.
              </p>
            )}
          </CardContent>
        </Card>
      </Main>

      <OrderDetails
        order={selectedOrder}
        pending={isMutating}
        onClose={() => setSelectedOrderId(null)}
        onApprove={(order) =>
          statusMutation.mutate({ order, status: 'confirmed_by_store' })
        }
        onConfirmAction={(action, order) => {
          setSelectedOrderId(null)
          setConfirmAction({ action, order })
        }}
        onDeliveryCode={(order) => {
          setSelectedOrderId(null)
          setDeliveryOrder(order)
          setDeliveryCode('')
        }}
      />

      <Dialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        {confirmAction && (
          <DialogContent className='font-ibm-plex-sans-arabic'>
            <DialogHeader>
              <DialogTitle>
                {confirmAction.action === 'cancel'
                  ? 'إلغاء الطلب'
                  : 'تأكيد خروج الطلب للتوصيل'}
              </DialogTitle>
              <DialogDescription>
                {confirmAction.action === 'cancel'
                  ? `هل أنت متأكد من رغبتك في إلغاء الطلب #${confirmAction.order.id.slice(0, 8)}؟`
                  : `هل تم تسليم الطلب #${confirmAction.order.id.slice(0, 8)} للمندوب وهو في طريقه للعميل؟`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant='outline'
                disabled={isMutating}
                onClick={() => setConfirmAction(null)}
              >
                تراجع
              </Button>
              <Button
                variant={
                  confirmAction.action === 'cancel' ? 'destructive' : 'default'
                }
                disabled={isMutating}
                onClick={() => {
                  if (confirmAction.action === 'cancel') {
                    cancelMutation.mutate(confirmAction.order)
                  } else {
                    statusMutation.mutate({
                      order: confirmAction.order,
                      status: 'out_for_delivery',
                    })
                  }
                }}
              >
                {isMutating ? 'جارٍ التنفيذ...' : 'تأكيد'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(deliveryOrder)}
        onOpenChange={(open) => {
          if (!open && !deliveryMutation.isPending) {
            setDeliveryOrder(null)
            setDeliveryCode('')
          }
        }}
      >
        {deliveryOrder && (
          <DialogContent className='font-ibm-plex-sans-arabic sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>تأكيد استلام الطلب</DialogTitle>
              <DialogDescription>
                أدخل رمز التسليم المكوّن من 4 أرقام الذي يقدمه العميل.
              </DialogDescription>
            </DialogHeader>
            <form className='grid gap-4' onSubmit={submitDelivery}>
              <div className='grid gap-2'>
                <Label htmlFor='delivery-code'>رمز التسليم</Label>
                <Input
                  id='delivery-code'
                  autoFocus
                  inputMode='numeric'
                  autoComplete='one-time-code'
                  maxLength={4}
                  pattern='[0-9]{4}'
                  required
                  value={deliveryCode}
                  onChange={(event) =>
                    setDeliveryCode(
                      event.target.value.replace(/\D/g, '').slice(0, 4)
                    )
                  }
                  placeholder='أدخل الرمز'
                  dir='ltr'
                  className='text-center text-xl tracking-[0.5em]'
                />
              </div>
              <DialogFooter>
                <Button
                  type='button'
                  variant='outline'
                  disabled={deliveryMutation.isPending}
                  onClick={() => setDeliveryOrder(null)}
                >
                  إلغاء
                </Button>
                <Button
                  type='submit'
                  disabled={
                    deliveryMutation.isPending || deliveryCode.length !== 4
                  }
                >
                  {deliveryMutation.isPending
                    ? 'جارٍ التحقق...'
                    : 'تأكيد التسليم'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
