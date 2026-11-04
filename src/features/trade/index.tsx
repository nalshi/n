import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  BadgeCheck,
  CircleAlert,
  Clock3,
  ExternalLink,
  Package,
  Search,
  ShieldCheck,
  Store,
  Truck,
} from 'lucide-react'
import { toast } from 'sonner'
import { authApiRequest } from '@/lib/auth-api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Main } from '@/components/layout/main'
import { MerchantPageHeading, MerchantWorkspaceHeader } from '@/components/layout/merchant-workspace'

type TradeProfile = {
  user_id: string
  business_name: string
  description: string
  country: string
  shipping_policy: string
  return_policy: string
  status: string
  review_note?: string
  updated_at?: string
}

type TradeOffer = {
  id: string
  supplier_id: string
  title: string
  description: string
  image_url: string
  currency: string
  wholesale_price: number
  suggested_retail_price: number | null
  minimum_order_quantity: number
  stock_quantity: number
  processing_days: number
  allows_wholesale: number
  dropshipping_enabled: number
  allows_description_edits: number
  allows_image_use: number
  status: string
  price_tiers?: Array<{ minimum_quantity: number; unit_price: number }>
  supplier_name?: string
  supplier_country?: string
  shipping_policy?: string
  return_policy?: string
}

type ImportedOffer = {
  product_id: string
  offer_id: string
  retail_price: number
  wholesale_price: number
  price: number
  currency: string
  source_stock: number
  offer_status: string
  supplier_name: string
  name: string
}

type SupplierOrder = {
  id: string
  ticket_id: string
  supplier_name?: string
  merchant_name?: string
  status: string
  status_note?: string
  tracking_reference?: string
  items: Array<{
    product_id: string
    offer_id: string
    product_name: string
    quantity: number
    unit_cost: number
    currency: string
  }>
  customer?: {
    name: string
    phone: string
    address_text: string
    gps_link: string
  } | null
  created_at: string
}

type TradeContext = {
  profile: TradeProfile | null
  isAdmin: boolean
}

type TradeAdminQueue = {
  suppliers: TradeProfile[]
  offers: TradeOffer[]
}

type TradeOrders = {
  supplierOrders: SupplierOrder[]
  merchantOrders: SupplierOrder[]
}

type TradeApiResult = {
  status: string
  message?: string
  profile?: TradeProfile | null
  isAdmin?: boolean
  data?: unknown
  suppliers?: TradeProfile[]
  offers?: TradeOffer[]
  supplierOrders?: SupplierOrder[]
  merchantOrders?: SupplierOrder[]
}

type Tab = 'market' | 'imports' | 'supplier' | 'orders' | 'review'

const queryKeys = {
  context: ['trade', 'context'] as const,
  market: (search: string) => ['trade', 'market', search] as const,
  myOffers: ['trade', 'my-offers'] as const,
  imports: ['trade', 'imports'] as const,
  orders: ['trade', 'orders'] as const,
  review: ['trade', 'review'] as const,
}

const profileStatus: Record<string, string> = {
  pending_review: 'قيد مراجعة الإدارة',
  approved: 'مورد معتمد',
  rejected: 'يحتاج إلى تعديل',
  suspended: 'موقوف مؤقتاً',
}

const offerStatus: Record<string, string> = {
  pending_review: 'بانتظار المراجعة',
  active: 'منشور',
  paused: 'متوقف',
  rejected: 'مرفوض',
  suspended: 'موقوف',
}

const orderStatus: Record<string, string> = {
  pending: 'بانتظار قبول المورد',
  accepting: 'جارٍ تأكيد المخزون',
  accepted: 'مقبول',
  rejected: 'مرفوض',
  preparing: 'قيد التجهيز',
  shipped: 'تم الشحن',
  completed: 'مكتمل',
  cancelled: 'ملغي',
}

async function tradeRequest(action: string, payload: Record<string, unknown> = {}) {
  const result = (await authApiRequest(action, payload)) as TradeApiResult
  if (result.status !== 'success' && result.status !== 'ok') {
    throw new Error(result.message || 'تعذر إكمال العملية.')
  }
  return result
}

function useTradeMutation(
  action: string,
  invalidates: (readonly unknown[])[],
  onSuccess?: (result: TradeApiResult) => void
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => tradeRequest(action, payload),
    onSuccess: async (result) => {
      await Promise.all(
        invalidates.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
      )
      toast.success(result.message || 'تم حفظ التغييرات.')
      onSuccess?.(result)
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

function StatusTag({ children, tone = 'neutral' }: { children: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const colors = {
    neutral: 'bg-muted text-muted-foreground',
    good: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
    warn: 'bg-amber-500/10 text-amber-800 dark:text-amber-300',
    bad: 'bg-destructive/10 text-destructive',
  }
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${colors[tone]}`}>{children}</span>
}

function currency(value: number, code: string) {
  return new Intl.NumberFormat('ar', {
    style: 'currency',
    currency: /^[A-Z]{3}$/.test(code) ? code : 'YER',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)
}

function errorPanel(message: string, retry?: () => void) {
  return (
    <div role='alert' className='flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between'>
      <span className='flex items-center gap-2 text-destructive'><CircleAlert className='size-4 shrink-0' />{message}</span>
      {retry && <Button variant='outline' size='sm' onClick={retry}>إعادة المحاولة</Button>}
    </div>
  )
}

export function TradeWorkspace() {
  const [tab, setTab] = useState<Tab>('market')
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState('all')
  const [editingOffer, setEditingOffer] = useState<TradeOffer | null>(null)
  const contextQuery = useQuery({
    queryKey: queryKeys.context,
    queryFn: async () => {
      const result = await tradeRequest('trade_get_context')
      return { profile: result.profile || null, isAdmin: Boolean(result.isAdmin) } as TradeContext
    },
  })
  const context = contextQuery.data
  const marketQuery = useQuery({
    queryKey: queryKeys.market(`${mode}:${search}`),
    queryFn: async () => {
      const result = await tradeRequest('trade_list_marketplace', { search, mode })
      return (result.data || []) as TradeOffer[]
    },
    enabled: tab === 'market',
  })
  const offersQuery = useQuery({
    queryKey: queryKeys.myOffers,
    queryFn: async () => {
      const result = await tradeRequest('trade_list_my_offers')
      return (result.data || []) as TradeOffer[]
    },
    enabled: tab === 'supplier',
  })
  const importsQuery = useQuery({
    queryKey: queryKeys.imports,
    queryFn: async () => {
      const result = await tradeRequest('trade_list_imports')
      return (result.data || []) as ImportedOffer[]
    },
    enabled: tab === 'imports',
  })
  const ordersQuery = useQuery({
    queryKey: queryKeys.orders,
    queryFn: async () => {
      const result = await tradeRequest('trade_list_orders')
      return {
        supplierOrders: result.supplierOrders || [],
        merchantOrders: result.merchantOrders || [],
      } as TradeOrders
    },
    enabled: tab === 'orders',
  })
  const reviewQuery = useQuery({
    queryKey: queryKeys.review,
    queryFn: async () => (await tradeRequest('trade_admin_queue')) as TradeAdminQueue,
    enabled: tab === 'review' && Boolean(context?.isAdmin),
  })

  const importMutation = useTradeMutation('trade_import_offer', [
    queryKeys.imports,
    queryKeys.market(`${mode}:${search}`),
  ])
  const saveProfileMutation = useTradeMutation('trade_save_supplier_profile', [
    queryKeys.context,
  ])
  const saveOfferMutation = useTradeMutation('trade_save_offer', [
    queryKeys.myOffers,
    queryKeys.review,
  ], () => setEditingOffer(null))
  const priceMutation = useTradeMutation('trade_update_import_price', [
    queryKeys.imports,
  ])
  const orderMutation = useTradeMutation('trade_update_supplier_order', [
    queryKeys.orders,
  ])
  const reviewMutation = useTradeMutation('trade_review_item', [
    queryKeys.review,
    queryKeys.context,
  ])
  const deleteMutation = useTradeMutation('delete_product', [
    queryKeys.imports,
    queryKeys.market(`${mode}:${search}`),
  ])

  const tabs = useMemo(
    () =>
      [
        ['market', 'سوق الموردين'],
        ['imports', 'منتجاتي المستوردة'],
        ['supplier', 'إدارة المورد'],
        ['orders', 'طلبات الموردين'],
        ...(context?.isAdmin ? [['review', 'مراجعة الإدارة'] as const] : []),
      ] as const,
    [context?.isAdmin]
  )

  if (contextQuery.isLoading) {
    return (
      <>
        <MerchantWorkspaceHeader />
        <Main><div className='space-y-5' aria-busy='true'><div className='h-9 w-48 animate-pulse rounded bg-muted' /><div className='h-40 animate-pulse rounded-xl bg-muted' /><div className='grid gap-4 sm:grid-cols-2'><div className='h-56 animate-pulse rounded-xl bg-muted' /><div className='h-56 animate-pulse rounded-xl bg-muted' /></div></div></Main>
      </>
    )
  }

  if (contextQuery.isError || !context) {
    return (
      <>
        <MerchantWorkspaceHeader />
        <Main><MerchantPageHeading title='Nalsh Trade' description='سوق الموردين وتوسعة البيع لمتجرك.' />{errorPanel(contextQuery.error instanceof Error ? contextQuery.error.message : 'تعذر تحميل بيانات السوق.', () => void contextQuery.refetch())}</Main>
      </>
    )
  }

  const profile = context.profile
  const canListProducts = profile?.status === 'approved'

  return (
    <>
      <MerchantWorkspaceHeader />
      <Main className='space-y-6'>
        <MerchantPageHeading
          title='Nalsh Trade'
          description='اكتشف عروض الموردين، واستورد المنتجات المسموح بها إلى متجرك، وتابع تنفيذ الطلبات.'
          actions={profile ? <StatusTag tone={profile.status === 'approved' ? 'good' : 'warn'}>{profileStatus[profile.status] || profile.status}</StatusTag> : undefined}
        />

        <section className='grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 sm:p-5' aria-label='طريقة عمل سوق الموردين'>
          <div className='flex items-start gap-3'><Search className='mt-0.5 size-4 text-primary' /><p className='text-sm leading-6'><strong className='block text-foreground'>اكتشف</strong><span className='text-muted-foreground'>راجع شروط المورد والمخزون قبل الاستيراد.</span></p></div>
          <div className='flex items-start gap-3'><Store className='mt-0.5 size-4 text-primary' /><p className='text-sm leading-6'><strong className='block text-foreground'>أضف لمتجرك</strong><span className='text-muted-foreground'>تبدأ المنتجات المستوردة بسعر المورد؛ عدّل سعر البيع قبل الترويج.</span></p></div>
          <div className='flex items-start gap-3'><Truck className='mt-0.5 size-4 text-primary' /><p className='text-sm leading-6'><strong className='block text-foreground'>تابع التنفيذ</strong><span className='text-muted-foreground'>تأكيد الطلب والشحن يدويان في الإصدار التجريبي.</span></p></div>
        </section>

        {!profile && (
          <Card>
            <CardHeader>
              <CardTitle>ابدأ ملف المورد</CardTitle>
              <CardDescription>يمكن لحساب التاجر الحالي تسجيل نشاطه كمورد. تظل العروض غير ظاهرة حتى اعتماد الإدارة.</CardDescription>
            </CardHeader>
            <CardContent><SupplierProfileForm key='new' onSubmit={(payload) => saveProfileMutation.mutate(payload)} busy={saveProfileMutation.isPending} /></CardContent>
          </Card>
        )}

        {profile && profile.status !== 'approved' && (
          <div className='rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm leading-6'>
            <p className='flex items-center gap-2 font-semibold'><Clock3 className='size-4' />ملف المورد {profileStatus[profile.status] || profile.status}.</p>
            <p className='mt-1 text-muted-foreground'>لن تظهر عروضك في السوق قبل اعتمادها. يمكنك تحديث بيانات النشاط أدناه.</p>
            {profile.review_note && <p className='mt-2 text-foreground'>ملاحظة المراجعة: {profile.review_note}</p>}
          </div>
        )}

        <nav className='flex gap-1 overflow-x-auto border-b' aria-label='أقسام Nalsh Trade'>
          {tabs.map(([value, label]) => (
            <button
              key={value}
              type='button'
              aria-current={tab === value ? 'page' : undefined}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${tab === value ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === 'market' && (
          <section className='space-y-4'>
            <div className='flex flex-col gap-3 sm:flex-row'>
              <div className='relative min-w-0 flex-1'>
                <Search className='absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' aria-hidden='true' />
                <Input aria-label='ابحث عن منتج أو مورد' placeholder='ابحث عن منتج أو مورد' value={search} onChange={(event) => setSearch(event.target.value)} className='ps-9' />
              </div>
              <select aria-label='نوع العرض' value={mode} onChange={(event) => setMode(event.target.value)} className='h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring'>
                <option value='all'>جميع العروض</option>
                <option value='dropshipping'>دروب شيبينغ</option>
                <option value='wholesale'>جملة</option>
              </select>
            </div>
            {marketQuery.isError && errorPanel(marketQuery.error instanceof Error ? marketQuery.error.message : 'تعذر تحميل العروض.', () => void marketQuery.refetch())}
            {marketQuery.isLoading ? <LoadingList /> : marketQuery.data?.length ? (
              <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
                {marketQuery.data.map((offer) => (
                  <OfferCard key={offer.id} offer={offer} onImport={() => importMutation.mutate({ offer_id: offer.id })} busy={importMutation.isPending} />
                ))}
              </div>
            ) : !marketQuery.isError ? <EmptyState title='لا توجد عروض مطابقة' description='جرّب عبارة بحث أخرى أو ارجع لاحقاً؛ لا تظهر إلا العروض المعتمدة والمتاحة.' /> : null}
          </section>
        )}

        {tab === 'imports' && (
          <section className='space-y-4'>
            <p className='text-sm text-muted-foreground'>تُدار المنتجات المستوردة هنا. عدّل سعر البيع من هذا القسم؛ مخزونها وشروط توريدها يتبعان المورد.</p>
            {importsQuery.isError && errorPanel(importsQuery.error instanceof Error ? importsQuery.error.message : 'تعذر تحميل المنتجات المستوردة.', () => void importsQuery.refetch())}
            {importsQuery.isLoading ? <LoadingList /> : importsQuery.data?.length ? (
              <div className='overflow-hidden rounded-xl border bg-card'>
                <div className='hidden grid-cols-[minmax(0,1.6fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_auto] gap-3 border-b bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground md:grid'>
                  <span>المنتج والمورد</span><span>المخزون</span><span>سعر التكلفة</span><span>سعر البيع</span><span>الإجراء</span>
                </div>
                <div className='divide-y'>
                  {importsQuery.data.map((item) => <ImportedRow key={`${item.product_id}:${item.price}`} item={item} onSavePrice={(price) => priceMutation.mutate({ product_id: item.product_id, price })} onRemove={() => deleteMutation.mutate({ id: item.product_id })} busy={priceMutation.isPending || deleteMutation.isPending} />)}
                </div>
              </div>
            ) : !importsQuery.isError ? <EmptyState title='لم تستورد منتجات بعد' description='تصفح السوق وأضف المنتجات المتاحة للدروب شيبينغ إلى متجرك.' action={<Button variant='outline' onClick={() => setTab('market')}>تصفح السوق</Button>} /> : null}
          </section>
        )}

        {tab === 'supplier' && (
          <section className='grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]'>
            {profile && <Card><CardHeader><CardTitle>بيانات المورد</CardTitle><CardDescription>التغييرات في اسم النشاط أو الدولة تعيد الملف للمراجعة.</CardDescription></CardHeader><CardContent><SupplierProfileForm key={profile.updated_at} profile={profile} onSubmit={(payload) => saveProfileMutation.mutate(payload)} busy={saveProfileMutation.isPending} /></CardContent></Card>}
            <Card>
              <CardHeader><CardTitle>{editingOffer ? 'تعديل العرض' : 'إضافة عرض جديد'}</CardTitle><CardDescription>حدد شروط الجملة والدروب شيبينغ وأذونات استخدام المحتوى بدقة.</CardDescription></CardHeader>
              <CardContent>
                {!profile ? <p className='text-sm text-muted-foreground'>أنشئ ملف المورد أولاً.</p> : (
                  <>
                    {!canListProducts && <p className='mb-4 rounded-md bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200'>يمكنك إعداد العروض؛ لن تُنشر حتى اعتماد ملف المورد والعرض.</p>}
                    <OfferForm key={editingOffer?.id || 'new'} offer={editingOffer} busy={saveOfferMutation.isPending} onCancel={() => setEditingOffer(null)} onSubmit={(payload) => saveOfferMutation.mutate(payload)} />
                  </>
                )}
              </CardContent>
            </Card>
            <Card className='xl:col-span-2'>
              <CardHeader><CardTitle>عروضي</CardTitle><CardDescription>يتطلب كل عرض مراجعة مستقلة. تعديل بيانات المنتج أو أذونات المحتوى يعيد إرساله للمراجعة.</CardDescription></CardHeader>
              <CardContent>
                {offersQuery.isError && errorPanel(offersQuery.error instanceof Error ? offersQuery.error.message : 'تعذر تحميل عروضك.', () => void offersQuery.refetch())}
                {offersQuery.isLoading ? <LoadingList /> : offersQuery.data?.length ? (
                  <div className='divide-y'>
                    {offersQuery.data.map((offer) => (
                      <div key={offer.id} className='flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between'>
                        <div className='min-w-0'>
                          <div className='flex flex-wrap items-center gap-2'><h3 className='font-semibold'>{offer.title}</h3><StatusTag tone={offer.status === 'active' ? 'good' : offer.status === 'rejected' ? 'bad' : 'warn'}>{offerStatus[offer.status] || offer.status}</StatusTag></div>
                          <p className='mt-1 text-sm text-muted-foreground'>جملة: {currency(offer.wholesale_price, offer.currency)} · المخزون: {offer.stock_quantity} · MOQ: {offer.minimum_order_quantity}</p>
                        </div>
                        <Button variant='outline' size='sm' onClick={() => { setEditingOffer(offer); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>تعديل العرض</Button>
                      </div>
                    ))}
                  </div>
                ) : !offersQuery.isError ? <EmptyState title='لا توجد عروض بعد' description='أنشئ عرضاً أولاً، ثم أرسله للمراجعة قبل ظهوره في السوق.' /> : null}
              </CardContent>
            </Card>
          </section>
        )}

        {tab === 'orders' && (
          <section className='grid gap-5 xl:grid-cols-2'>
            <OrderList title='طلبات واردة لموردي' description='تأكيد الطلب يحجز كمية المورد. بيانات العميل لا تظهر إلا بعد القبول.' orders={ordersQuery.data?.supplierOrders || []} kind='supplier' busy={orderMutation.isPending} onUpdate={(payload) => orderMutation.mutate(payload)} isLoading={ordersQuery.isLoading} error={ordersQuery.isError ? (ordersQuery.error instanceof Error ? ordersQuery.error.message : 'تعذر تحميل الطلبات.') : undefined} onRetry={() => void ordersQuery.refetch()} />
            <OrderList title='طلبات منتجاتي المستوردة' description='حالة قبول المورد والشحن تظهر هنا؛ التسوية والدفع خارج نطاق الإصدار التجريبي.' orders={ordersQuery.data?.merchantOrders || []} kind='merchant' busy={false} onUpdate={() => undefined} isLoading={ordersQuery.isLoading} error={ordersQuery.isError ? (ordersQuery.error instanceof Error ? ordersQuery.error.message : 'تعذر تحميل الطلبات.') : undefined} onRetry={() => void ordersQuery.refetch()} />
          </section>
        )}

        {tab === 'review' && context.isAdmin && (
          <section className='space-y-5'>
            <div className='rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground'><ShieldCheck className='me-2 inline size-4' />صلاحية مراجعة الموردين محددة على الخادم بقائمة TRADE_ADMIN_IDS؛ ظهور هذه الشاشة لا يمنح صلاحية.</div>
            {reviewQuery.isError && errorPanel(reviewQuery.error instanceof Error ? reviewQuery.error.message : 'تعذرت قراءة قائمة المراجعة.', () => void reviewQuery.refetch())}
            {reviewQuery.isLoading ? <LoadingList /> : reviewQuery.data ? (
              <div className='grid gap-5 xl:grid-cols-2'>
                <ReviewList title='ملفات الموردين' items={reviewQuery.data.suppliers || []} type='supplier' busy={reviewMutation.isPending} onReview={(payload) => reviewMutation.mutate(payload)} />
                <ReviewList title='عروض المنتجات' items={reviewQuery.data.offers || []} type='offer' busy={reviewMutation.isPending} onReview={(payload) => reviewMutation.mutate(payload)} />
              </div>
            ) : null}
          </section>
        )}

        <div className='rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm leading-6 text-muted-foreground'>
          <strong className='text-foreground'>تنبيه للإصدار التجريبي:</strong> الطلبات تُحال للمورد يدوياً، ولا توجد بوابة دفع أو تسوية أو تكامل شحن. بيانات المخزون تعكس آخر تحديث يقدمه المورد وقد تتغير قبل قبوله للطلب.
        </div>
      </Main>
    </>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className='space-y-1.5'><Label>{label}</Label>{children}</div>
}

function SupplierProfileForm({
  profile,
  busy,
  onSubmit,
}: {
  profile?: TradeProfile
  busy: boolean
  onSubmit: (payload: Record<string, unknown>) => void
}) {
  const [businessName, setBusinessName] = useState(profile?.business_name || '')
  const [country, setCountry] = useState(profile?.country || '')
  const [description, setDescription] = useState(profile?.description || '')
  const [shipping, setShipping] = useState(profile?.shipping_policy || '')
  const [returns, setReturns] = useState(profile?.return_policy || '')

  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit({
      business_name: businessName,
      country,
      description,
      shipping_policy: shipping,
      return_policy: returns,
    })
  }

  return (
    <form className='grid gap-4' onSubmit={submit}>
      <div className='grid gap-4 sm:grid-cols-2'>
        <Field label='اسم النشاط التجاري'><Input required maxLength={120} value={businessName} onChange={(event) => setBusinessName(event.target.value)} /></Field>
        <Field label='الدولة'><Input required maxLength={80} value={country} onChange={(event) => setCountry(event.target.value)} placeholder='مثال: اليمن' /></Field>
      </div>
      <Field label='نبذة عن النشاط'><Textarea maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></Field>
      <div className='grid gap-4 sm:grid-cols-2'>
        <Field label='شروط الشحن'><Textarea maxLength={2000} value={shipping} onChange={(event) => setShipping(event.target.value)} rows={3} /></Field>
        <Field label='شروط الإرجاع'><Textarea maxLength={2000} value={returns} onChange={(event) => setReturns(event.target.value)} rows={3} /></Field>
      </div>
      <div><Button disabled={busy}>{busy ? 'جارٍ الحفظ…' : profile ? 'حفظ بيانات المورد' : 'إرسال ملف المورد للمراجعة'}</Button></div>
    </form>
  )
}

function OfferForm({
  offer,
  busy,
  onCancel,
  onSubmit,
}: {
  offer: TradeOffer | null
  busy: boolean
  onCancel: () => void
  onSubmit: (payload: Record<string, unknown>) => void
}) {
  const [title, setTitle] = useState(offer?.title || '')
  const [description, setDescription] = useState(offer?.description || '')
  const [imageUrl, setImageUrl] = useState(offer?.image_url || '')
  const [currencyCode, setCurrencyCode] = useState(offer?.currency || 'YER')
  const [wholesalePrice, setWholesalePrice] = useState(offer ? String(offer.wholesale_price) : '')
  const [tierTwoQuantity, setTierTwoQuantity] = useState(
    offer?.price_tiers?.[1] ? String(offer.price_tiers[1].minimum_quantity) : ''
  )
  const [tierTwoPrice, setTierTwoPrice] = useState(
    offer?.price_tiers?.[1] ? String(offer.price_tiers[1].unit_price) : ''
  )
  const [tierThreeQuantity, setTierThreeQuantity] = useState(
    offer?.price_tiers?.[2] ? String(offer.price_tiers[2].minimum_quantity) : ''
  )
  const [tierThreePrice, setTierThreePrice] = useState(
    offer?.price_tiers?.[2] ? String(offer.price_tiers[2].unit_price) : ''
  )
  const [retailPrice, setRetailPrice] = useState(
    offer?.suggested_retail_price ? String(offer.suggested_retail_price) : ''
  )
  const [minimum, setMinimum] = useState(offer ? String(offer.minimum_order_quantity) : '1')
  const [stock, setStock] = useState(offer ? String(offer.stock_quantity) : '0')
  const [processingDays, setProcessingDays] = useState(offer ? String(offer.processing_days) : '1')
  const [wholesale, setWholesale] = useState(offer ? Boolean(offer.allows_wholesale) : true)
  const [dropshipping, setDropshipping] = useState(Boolean(offer?.dropshipping_enabled))
  const [descriptionPermission, setDescriptionPermission] = useState(
    Boolean(offer?.allows_description_edits)
  )
  const [imagePermission, setImagePermission] = useState(Boolean(offer?.allows_image_use))

  function submit(event: FormEvent) {
    event.preventDefault()
    if (Boolean(tierTwoQuantity) !== Boolean(tierTwoPrice) || Boolean(tierThreeQuantity) !== Boolean(tierThreePrice)) {
      toast.error('أدخل حد الكمية وسعر الوحدة لكل شريحة.')
      return
    }
    if ((tierThreeQuantity || tierThreePrice) && !(tierTwoQuantity && tierTwoPrice)) {
      toast.error('أكمل الشريحة الثانية قبل إضافة الثالثة.')
      return
    }
    onSubmit({
      ...(offer ? { id: offer.id } : {}),
      title,
      description,
      image_url: imageUrl,
      currency: currencyCode,
      wholesale_price: wholesalePrice,
      suggested_retail_price: retailPrice,
      minimum_order_quantity: minimum,
      price_tiers: [
        { minimum_quantity: minimum, unit_price: wholesalePrice },
        ...(tierTwoQuantity && tierTwoPrice
          ? [{ minimum_quantity: tierTwoQuantity, unit_price: tierTwoPrice }]
          : []),
        ...(tierThreeQuantity && tierThreePrice
          ? [{ minimum_quantity: tierThreeQuantity, unit_price: tierThreePrice }]
          : []),
      ],
      stock_quantity: stock,
      processing_days: processingDays,
      allows_wholesale: wholesale,
      dropshipping_enabled: dropshipping,
      allows_description_edits: descriptionPermission,
      allows_image_use: imagePermission,
    })
  }

  return (
    <form className='space-y-4' onSubmit={submit}>
      <div className='grid gap-4 sm:grid-cols-2'>
        <Field label='اسم المنتج'><Input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label='رابط الصورة (اختياري)'><Input type='url' value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder='https://…' /></Field>
      </div>
      <Field label='الوصف'><Textarea maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></Field>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <Field label='العملة'><Input required minLength={3} maxLength={3} value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} /></Field>
        <Field label='سعر الجملة'><Input required type='number' min='0.01' step='0.01' value={wholesalePrice} onChange={(event) => setWholesalePrice(event.target.value)} /></Field>
        <Field label='سعر بيع مقترح'><Input type='number' min='0' step='0.01' value={retailPrice} onChange={(event) => setRetailPrice(event.target.value)} /></Field>
        <Field label='الحد الأدنى للطلب'><Input required type='number' min='1' step='1' value={minimum} onChange={(event) => setMinimum(event.target.value)} /></Field>
        <Field label='حد الشريحة الثانية (اختياري)'><Input type='number' min='1' step='1' value={tierTwoQuantity} onChange={(event) => setTierTwoQuantity(event.target.value)} /></Field>
        <Field label='سعر الوحدة للشريحة الثانية'><Input type='number' min='0.01' step='0.01' value={tierTwoPrice} onChange={(event) => setTierTwoPrice(event.target.value)} /></Field>
        <Field label='حد الشريحة الثالثة (اختياري)'><Input type='number' min='1' step='1' value={tierThreeQuantity} onChange={(event) => setTierThreeQuantity(event.target.value)} /></Field>
        <Field label='سعر الوحدة للشريحة الثالثة'><Input type='number' min='0.01' step='0.01' value={tierThreePrice} onChange={(event) => setTierThreePrice(event.target.value)} /></Field>
        <Field label='المخزون المتاح'><Input required type='number' min='0' step='1' value={stock} onChange={(event) => setStock(event.target.value)} /></Field>
        <Field label='مدة التجهيز (أيام)'><Input required type='number' min='0' max='365' step='1' value={processingDays} onChange={(event) => setProcessingDays(event.target.value)} /></Field>
      </div>
      <div className='grid gap-3 sm:grid-cols-2'>
        <label className='flex items-start gap-2 rounded-md border p-3 text-sm'><input type='checkbox' checked={wholesale} onChange={(event) => setWholesale(event.target.checked)} className='mt-1 accent-primary' /><span><strong className='block'>متاح للبيع بالجملة</strong><span className='text-muted-foreground'>يظهر نوع البيع في تفاصيل العرض.</span></span></label>
        <label className='flex items-start gap-2 rounded-md border p-3 text-sm'><input type='checkbox' checked={dropshipping} onChange={(event) => setDropshipping(event.target.checked)} className='mt-1 accent-primary' /><span><strong className='block'>أوافق على الدروب شيبينغ</strong><span className='text-muted-foreground'>يتيح للتاجر استيراد المنتج إلى متجره.</span></span></label>
        <label className='flex items-start gap-2 rounded-md border p-3 text-sm'><input type='checkbox' checked={imagePermission} onChange={(event) => setImagePermission(event.target.checked)} className='mt-1 accent-primary' /><span><strong className='block'>أسمح باستخدام الصورة</strong><span className='text-muted-foreground'>من دون هذا الإذن لا تُنسخ الصورة للمتجر.</span></span></label>
        <label className='flex items-start gap-2 rounded-md border p-3 text-sm'><input type='checkbox' checked={descriptionPermission} onChange={(event) => setDescriptionPermission(event.target.checked)} className='mt-1 accent-primary' /><span><strong className='block'>أسمح بتعديل الوصف</strong><span className='text-muted-foreground'>من دون هذا الإذن لا يُنسخ الوصف.</span></span></label>
      </div>
      <div className='flex flex-wrap gap-2'>
        <Button disabled={busy}>{busy ? 'جارٍ الحفظ…' : offer ? 'حفظ التعديلات' : 'إرسال العرض للمراجعة'}</Button>
        {offer && <Button type='button' variant='outline' onClick={onCancel}>إلغاء التعديل</Button>}
      </div>
    </form>
  )
}

function OfferCard({ offer, onImport, busy }: { offer: TradeOffer; onImport: () => void; busy: boolean }) {
  return (
    <Card className='overflow-hidden'>
      {offer.image_url && <img src={offer.image_url} alt='' className='h-44 w-full bg-muted object-cover' loading='lazy' />}
      <CardHeader className='pb-2'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'><CardTitle className='line-clamp-2'>{offer.title}</CardTitle><CardDescription className='mt-1'>{offer.supplier_name} · {offer.supplier_country}</CardDescription></div>
          <BadgeCheck className='size-5 shrink-0 text-emerald-700 dark:text-emerald-300' aria-label='مورد معتمد' />
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p className='line-clamp-3 min-h-12 text-sm leading-6 text-muted-foreground'>{offer.description || 'لا يوجد وصف إضافي.'}</p>
        <div className='grid grid-cols-2 gap-3 border-y py-3 text-sm'>
          <div><span className='block text-muted-foreground'>سعر الجملة</span><strong>{currency(offer.wholesale_price, offer.currency)}</strong></div>
          <div><span className='block text-muted-foreground'>الحد الأدنى</span><strong>{offer.minimum_order_quantity} قطعة</strong></div>
          <div><span className='block text-muted-foreground'>المخزون</span><strong>{offer.stock_quantity} قطعة</strong></div>
          <div><span className='block text-muted-foreground'>التجهيز</span><strong>{offer.processing_days} يوم</strong></div>
        </div>
        {offer.price_tiers && offer.price_tiers.length > 1 && (
          <div className='space-y-1 text-xs text-muted-foreground'>
            {offer.price_tiers.slice(1).map((tier) => (
              <p key={tier.minimum_quantity}>من {tier.minimum_quantity} قطعة: {currency(tier.unit_price, offer.currency)} للوحدة</p>
            ))}
          </div>
        )}
        <div className='flex flex-wrap gap-2 text-xs'>
          {offer.dropshipping_enabled === 1 && <StatusTag tone='good'>دروب شيبينغ</StatusTag>}
          {offer.allows_wholesale === 1 && <StatusTag>جملة</StatusTag>}
        </div>
        <p className='text-xs leading-5 text-muted-foreground'>الشحن: {offer.shipping_policy || 'تواصل مع المورد لمعرفة التفاصيل.'}<br />الإرجاع: {offer.return_policy || 'راجع شروط المورد قبل الطلب.'}</p>
        <Button className='w-full' disabled={busy || offer.dropshipping_enabled !== 1} onClick={onImport}>
          <ArrowUpRight className='size-4' />{offer.dropshipping_enabled === 1 ? 'أضف إلى متجري' : 'غير متاح للدروب شيبينغ'}
        </Button>
      </CardContent>
    </Card>
  )
}

function ImportedRow({ item, onSavePrice, onRemove, busy }: { item: ImportedOffer; onSavePrice: (price: number) => void; onRemove: () => void; busy: boolean }) {
  const [price, setPrice] = useState(String(item.price))
  return (
    <div className='grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.6fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_auto] md:items-center'>
      <div className='min-w-0'><p className='font-medium'>{item.name}</p><p className='text-sm text-muted-foreground'>{item.supplier_name}</p></div>
      <div className='text-sm'><span className='text-muted-foreground md:hidden'>المخزون: </span>{item.source_stock} قطعة</div>
      <div className='text-sm'><span className='text-muted-foreground md:hidden'>تكلفة المورد: </span>{currency(Number(item.wholesale_price), item.currency)}</div>
      <div className='flex items-center gap-2'><Input aria-label={`سعر البيع لـ ${item.name}`} type='number' min='0.01' step='0.01' value={price} onChange={(event) => setPrice(event.target.value)} className='h-8 min-w-24' /><Button size='sm' variant='outline' disabled={busy || Number(price) <= 0 || Number(price) === Number(item.price)} onClick={() => onSavePrice(Number(price))}>حفظ</Button></div>
      <Button size='sm' variant='ghost' className='text-destructive hover:text-destructive' disabled={busy} onClick={onRemove}>إزالة</Button>
    </div>
  )
}

function OrderList({
  title,
  description,
  orders,
  kind,
  busy,
  onUpdate,
  isLoading,
  error,
  onRetry,
}: {
  title: string
  description: string
  orders: SupplierOrder[]
  kind: 'supplier' | 'merchant'
  busy: boolean
  onUpdate: (payload: Record<string, unknown>) => void
  isLoading: boolean
  error?: string
  onRetry: () => void
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className='space-y-3'>
        {error && errorPanel(error, onRetry)}
        {isLoading ? <LoadingList /> : orders.map((order) => (
          <article key={order.id} className='space-y-3 rounded-lg border p-4'>
            <div className='flex flex-wrap items-start justify-between gap-2'>
              <div><p className='font-semibold'>{kind === 'supplier' ? order.merchant_name : order.supplier_name}</p><p className='text-xs text-muted-foreground'>طلب #{order.ticket_id.slice(-8)} · {new Date(order.created_at).toLocaleDateString('ar')}</p></div>
              <StatusTag tone={order.status === 'accepted' || order.status === 'shipped' || order.status === 'completed' ? 'good' : order.status === 'rejected' || order.status === 'cancelled' ? 'bad' : 'warn'}>{orderStatus[order.status] || order.status}</StatusTag>
            </div>
            <ul className='space-y-1 text-sm'>{order.items.map((item) => <li key={`${item.offer_id}-${item.product_id}`} className='flex justify-between gap-2'><span>{item.product_name} × {item.quantity}</span><span className='shrink-0 text-muted-foreground'>{currency(item.unit_cost * item.quantity, item.currency)}</span></li>)}</ul>
            {order.status_note && <p className='text-sm text-muted-foreground'>{order.status_note}</p>}
            {order.customer && <div className='rounded-md bg-muted/40 p-3 text-sm leading-6'><p>{order.customer.name}</p><p dir='ltr' className='text-start'>{order.customer.phone}</p><p>{order.customer.address_text}</p>{order.customer.gps_link && <a className='inline-flex items-center gap-1 text-primary underline' href={order.customer.gps_link} target='_blank' rel='noreferrer'>موقع التسليم <ExternalLink className='size-3' /></a>}</div>}
            {order.tracking_reference && <p className='text-sm'>مرجع التتبع: {order.tracking_reference}</p>}
            {kind === 'supplier' && <OrderActions order={order} busy={busy} onUpdate={(status, extra = {}) => onUpdate({ id: order.id, status, ...extra })} />}
          </article>
        ))}
        {!isLoading && !error && !orders.length && <EmptyState title='لا توجد طلبات بعد' description='ستظهر هنا الطلبات المرتبطة بعروض الموردين.' />}
      </CardContent>
    </Card>
  )
}

function OrderActions({ order, busy, onUpdate }: { order: SupplierOrder; busy: boolean; onUpdate: (status: string, extra?: Record<string, unknown>) => void }) {
  const [tracking, setTracking] = useState('')
  if (order.status === 'pending') return <div className='flex flex-wrap gap-2'><Button size='sm' disabled={busy} onClick={() => onUpdate('accepted')}>قبول وحجز المخزون</Button><Button size='sm' variant='outline' disabled={busy} onClick={() => onUpdate('rejected', { note: 'تعذر تنفيذ الطلب.' })}>رفض الطلب</Button></div>
  if (order.status === 'accepted') return <Button size='sm' disabled={busy} onClick={() => onUpdate('preparing')}>بدء التجهيز</Button>
  if (order.status === 'preparing') return <form className='flex flex-col gap-2 sm:flex-row' onSubmit={(event) => { event.preventDefault(); if (tracking.trim()) onUpdate('shipped', { tracking_reference: tracking.trim() }) }}><Input aria-label='رقم أو مرجع التتبع' required maxLength={160} value={tracking} onChange={(event) => setTracking(event.target.value)} placeholder='رقم أو مرجع التتبع' /><Button size='sm' disabled={busy}>تأكيد الشحن</Button></form>
  if (order.status === 'shipped') return <Button size='sm' variant='outline' disabled={busy} onClick={() => onUpdate('completed')}>تأكيد الإكمال</Button>
  return null
}

function ReviewList({
  title,
  items,
  type,
  busy,
  onReview,
}: {
  title: string
  items: Array<TradeProfile | TradeOffer>
  type: 'supplier' | 'offer'
  busy: boolean
  onReview: (payload: Record<string, unknown>) => void
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>اعتمد بعد التحقق من البيانات والشروط. كل قرار يسجل للمراجعة.</CardDescription></CardHeader>
      <CardContent className='space-y-3'>
        {items.map((item) => {
          const targetId = type === 'supplier' ? (item as TradeProfile).user_id : (item as TradeOffer).id
          const name = type === 'supplier' ? (item as TradeProfile).business_name : (item as TradeOffer).title
          return <div key={targetId} className='rounded-lg border p-4'><h3 className='font-semibold'>{name}</h3><p className='my-2 text-sm leading-6 text-muted-foreground'>{type === 'supplier' ? `${(item as TradeProfile).country} · ${(item as TradeProfile).description}` : `${(item as TradeOffer).currency} ${(item as TradeOffer).wholesale_price} · مخزون ${(item as TradeOffer).stock_quantity} · ${(item as TradeOffer).dropshipping_enabled ? 'دروب شيبينغ' : 'جملة فقط'}`}</p><div className='flex flex-wrap gap-2'><Button size='sm' disabled={busy} onClick={() => onReview({ target_type: type, target_id: targetId, decision: 'approved' })}>اعتماد</Button><Button size='sm' variant='outline' disabled={busy} onClick={() => onReview({ target_type: type, target_id: targetId, decision: 'rejected', note: 'يرجى استكمال بيانات المراجعة.' })}>رفض</Button></div></div>
        })}
        {!items.length && <EmptyState title='قائمة المراجعة فارغة' description='لا توجد طلبات جديدة حالياً.' />}
      </CardContent>
    </Card>
  )
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className='grid min-h-44 place-items-center rounded-xl border border-dashed px-5 py-8 text-center'><div><div className='mx-auto mb-3 grid size-10 place-items-center rounded-full bg-muted'><Package className='size-5 text-muted-foreground' /></div><h3 className='font-semibold'>{title}</h3><p className='mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground'>{description}</p>{action && <div className='mt-4'>{action}</div>}</div></div>
}

function LoadingList() {
  return <div className='grid gap-3 sm:grid-cols-2'><div className='h-40 animate-pulse rounded-xl bg-muted' /><div className='h-40 animate-pulse rounded-xl bg-muted' /></div>
}
