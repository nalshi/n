import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  Barcode,
  Boxes,
  Check,
  ImagePlus,
  List,
  LoaderCircle,
  Package,
  Pencil,
  Plus,
  Search,
  Share2,
  Tags,
  Trash2,
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
import { Checkbox } from '@/components/ui/checkbox'
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
import { Textarea } from '@/components/ui/textarea'
import { Main } from '@/components/layout/main'
import {
  MerchantPageHeading,
  MerchantWorkspaceHeader,
} from '@/components/layout/merchant-workspace'
import {
  buildPendingCategoryChain,
  deleteDashboardProduct,
  fetchDashboardCategories,
  fetchDashboardProducts,
  fetchDashboardUsername,
  saveDashboardProduct,
  updateDashboardProductStock,
  type DashboardCategory,
  type DashboardProduct,
  type ProductOption,
  updateDashboardAvailability,
  compressDashboardImage,
} from '@/features/dashboard/dashboard-data'

const PAGE_SIZE = 12
const qrService = 'https://api.qrserver.com/v1/create-qr-code/'

type DraftOption = ProductOption & { imageFile: File | null }

type ProductDraft = {
  id: string
  name: string
  description: string
  categoryId: string
  image: string
  imageFile: File | null
  price: string
  costPrice: string
  discount: string
  currency: string
  quantity: string
  quantityType: 'tracked' | 'unlimited'
  isAvailable: boolean
  variantsEnabled: boolean
  options: DraftOption[]
}

type StockDraft = {
  quantity: number
  quantityType: 'tracked' | 'unlimited'
  options: Array<{
    id: string
    name: string
    quantity: number
    quantityType: 'tracked' | 'unlimited'
  }>
}

const currencies = [
  { value: 'YER', label: 'يمني (YER)' },
  { value: 'SAR', label: 'سعودي (SAR)' },
  { value: 'USD', label: 'دولار (USD)' },
]

function emptyDraft(): ProductDraft {
  return {
    id: '',
    name: '',
    description: '',
    categoryId: '',
    image: '',
    imageFile: null,
    price: '',
    costPrice: '0',
    discount: '0',
    currency: 'YER',
    quantity: '1',
    quantityType: 'tracked',
    isAvailable: true,
    variantsEnabled: false,
    options: [],
  }
}

function draftFromProduct(product: DashboardProduct): ProductDraft {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    categoryId: product.categoryId,
    image: product.image,
    imageFile: null,
    price: String(product.price),
    costPrice: String(product.costPrice),
    discount: String(product.discount),
    currency: product.currency,
    quantity: String(product.quantity),
    quantityType: product.quantityType,
    isAvailable: product.isAvailable,
    variantsEnabled: product.options.length > 0,
    options: product.options.map((option) => ({ ...option, imageFile: null })),
  }
}

function flattenCategories(
  categories: DashboardCategory[],
  parentId = '',
  depth = 0
): Array<DashboardCategory & { depth: number }> {
  return categories
    .filter((category) => category.parentId === parentId)
    .flatMap((category) => [
      { ...category, depth },
      ...flattenCategories(categories, category.id, depth + 1),
    ])
}

function categoryPath(
  category: DashboardCategory,
  categories: DashboardCategory[]
) {
  const byId = new Map(categories.map((item) => [item.id, item]))
  const path: string[] = []
  const visited = new Set<string>()
  let current: DashboardCategory | undefined = category

  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    path.unshift(current.name)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }

  return path.join(' / ')
}

function selectedCategoryPath(
  categoryId: string,
  categories: DashboardCategory[]
) {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const path: DashboardCategory[] = []
  const visited = new Set<string>()
  let currentId = categoryId

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const category = byId.get(currentId)
    if (!category) break
    path.unshift(category)
    currentId = category.parentId
  }
  return path
}

function formatPrice(price: number, currency: string) {
  return `${price.toLocaleString('ar-YE')} ${currency}`
}

function getStock(product: DashboardProduct) {
  if (product.options.length) {
    if (product.options.some((option) => option.quantityType === 'unlimited')) {
      return 'مخزون متجدد'
    }
    return `المخزون ${product.options.reduce((sum, option) => sum + option.quantity, 0)}`
  }
  return product.quantityType === 'unlimited'
    ? 'مخزون متجدد'
    : `المخزون ${product.quantity}`
}

function stockDraftFromProduct(product: DashboardProduct): StockDraft {
  return {
    quantity: product.quantity,
    quantityType: product.quantityType,
    options: product.options.map((option) => ({
      id: option.id,
      name: option.name,
      quantity: option.quantity,
      quantityType: option.quantityType,
    })),
  }
}

function approvalLabel(status: string) {
  if (status === 'pending') return 'بانتظار النشر'
  if (status === 'rejected') return 'مرفوض'
  return 'منشور'
}

function CategoryPicker({
  categories,
  value,
  loading,
  onChange,
}: {
  categories: DashboardCategory[]
  value: string
  loading: boolean
  onChange: (categoryId: string) => void
}) {
  const selectedPath = selectedCategoryPath(value, categories)
  const parentIds = ['', ...selectedPath.map((category) => category.id)]
  const levels = parentIds
    .map((parentId, depth) => ({
      parentId,
      depth,
      options: categories.filter((category) => category.parentId === parentId),
    }))
    .filter(({ depth, options }) => depth === 0 || options.length > 0)

  return (
    <div className='grid min-w-0 flex-1 gap-2'>
      {levels.map(({ depth, options }) => {
        const selectedId = selectedPath[depth]?.id || '__none__'
        return (
          <Select
            key={depth}
            value={selectedId}
            disabled={loading}
            onValueChange={(categoryId) => {
              if (categoryId === '__none__') {
                onChange(depth === 0 ? '' : selectedPath[depth - 1]?.id || '')
              } else {
                onChange(categoryId)
              }
            }}
          >
            <SelectTrigger className='w-full'>
              <SelectValue
                placeholder={
                  loading
                    ? 'جارٍ تحميل الفئات...'
                    : depth === 0
                      ? 'اختر الفئة الرئيسية'
                      : `اختر فئة فرعية - المستوى ${depth + 1}`
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='__none__'>
                {depth === 0 ? 'اختر الفئة' : 'بدون فئة فرعية'}
              </SelectItem>
              {options.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      })}
    </div>
  )
}

export function Products() {
  const { tab, create, manageCategories } = useSearch({
    from: '/_authenticated/products',
  })
  return (
    <ProductsWorkspace
      tab={tab}
      create={create === true}
      manageCategories={manageCategories === true}
    />
  )
}

export function ProductCatalog() {
  return <ProductsWorkspace />
}

function ProductsWorkspace({
  tab,
  create = false,
  manageCategories = false,
}: {
  tab?: string
  create?: boolean
  manageCategories?: boolean
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const merchantId = useMerchantIdentity()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [availabilityFilter, setAvailabilityFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<DashboardProduct | null>(
    null
  )
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)
  const [inventoryView, setInventoryView] = useState(tab === 'inventory')
  const [stockDrafts, setStockDrafts] = useState<Record<string, StockDraft>>({})
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [categories, setCategories] = useState<DashboardCategory[]>([])
  const [qrProduct, setQrProduct] = useState<DashboardProduct | null>(null)
  const [deleteProduct, setDeleteProduct] = useState<DashboardProduct | null>(
    null
  )
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase())

  useEffect(() => {
    if (tab === 'inventory') {
      setInventoryView(true)
    } else if (tab === 'catalog') {
      setInventoryView(false)
    }
  }, [tab])

  useEffect(() => {
    if (manageCategories || tab === 'categories') {
      setCategoryManagerOpen(true)
    }
  }, [manageCategories, tab])

  useEffect(() => {
    if (create || tab === 'new') {
      setEditorOpen(true)
    }
  }, [create, tab])

  const clearCreateShortcut = () => {
    if (create || tab === 'new') {
      void navigate({
        to: '/products',
        search: (prev) => ({
          ...prev,
          create: undefined,
          tab: prev.tab === 'new' ? undefined : prev.tab,
        }),
        replace: true,
      })
    }
  }

  const clearCategoryShortcut = () => {
    if (manageCategories || tab === 'categories') {
      void navigate({
        to: '/products',
        search: (prev) => ({
          ...prev,
          manageCategories: undefined,
          tab: prev.tab === 'categories' ? undefined : prev.tab,
        }),
        replace: true,
      })
    }
  }

  const productsQuery = useQuery({
    queryKey: merchantQueryKeys.products(merchantId),
    queryFn: fetchDashboardProducts,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const categoriesQuery = useQuery({
    queryKey: merchantQueryKeys.categories(merchantId),
    queryFn: fetchDashboardCategories,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
  const usernameQuery = useQuery({
    queryKey: merchantQueryKeys.username(merchantId),
    queryFn: fetchDashboardUsername,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })

  const categoryList = useMemo(() => {
    const loaded = categoriesQuery.data || []
    const pending = categories.filter(
      (category) =>
        category.id.startsWith('NEW:') &&
        !loaded.some(
          (item) =>
            item.parentId === category.parentId &&
            item.name.toLocaleLowerCase() === category.name.toLocaleLowerCase()
        )
    )
    return [
      ...loaded,
      ...pending.filter(
        (category) => !loaded.some((item) => item.id === category.id)
      ),
    ]
  }, [categories, categoriesQuery.data])
  const categoryOptions = useMemo(
    () => flattenCategories(categoryList),
    [categoryList]
  )
  const products = useMemo(() => productsQuery.data || [], [productsQuery.data])
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
  const filteredProducts = useMemo(() => {
    const matching = products.filter((product) => {
      const matchesSearch =
        !deferredSearch ||
        `${product.name} ${product.description} ${product.type}`
          .toLocaleLowerCase()
          .includes(deferredSearch)
      const matchesCategory =
        categoryFilter === 'all' || product.categoryId === categoryFilter
      const matchesAvailability =
        availabilityFilter === 'all' ||
        (availabilityFilter === 'available'
          ? product.isAvailable
          : !product.isAvailable)
      return matchesSearch && matchesCategory && matchesAvailability
    })

    return matching.sort((left, right) => {
      if (sort === 'name') return left.name.localeCompare(right.name, 'ar')
      if (sort === 'price-asc') return left.price - right.price
      if (sort === 'price-desc') return right.price - left.price
      return (
        (Date.parse(right.createdAt) || 0) - (Date.parse(left.createdAt) || 0)
      )
    })
  }, [availabilityFilter, categoryFilter, deferredSearch, products, sort])
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE))
  const visibleProducts = filteredProducts.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  )

  const saveMutation = useMutation({
    mutationFn: async (draft: ProductDraft) => {
      const name = draft.name.trim()
      if (name.length < 2) throw new Error('أدخل اسم المنتج (حرفين على الأقل).')
      const price = Number(draft.price)
      if (!Number.isFinite(price) || price < 0) {
        throw new Error('أدخل سعر بيع صحيحاً وغير سالب.')
      }
      if (!draft.categoryId) throw new Error('اختر فئة المنتج.')
      if (!draft.image && !draft.imageFile) {
        throw new Error('أضف صورة رئيسية للمنتج.')
      }

      const pendingCategory = buildPendingCategoryChain(
        categoryList,
        draft.categoryId
      )
      if (
        draft.categoryId.startsWith('NEW:') &&
        !pendingCategory.names.length
      ) {
        throw new Error('الفئة المختارة غير متاحة. أعد اختيار الفئة.')
      }

      const payload = new FormData()
      if (draft.id) payload.set('id', draft.id)
      payload.set('name', name)
      payload.set('mainDescription', draft.description.trim())
      payload.set('price', String(price))
      payload.set('cost_price', String(Number(draft.costPrice) || 0))
      payload.set('discount', String(Number(draft.discount) || 0))
      payload.set('currency', draft.currency)
      payload.set('isAvailable', draft.isAvailable ? '1' : '0')
      payload.set('existing_image', draft.image)
      payload.set(
        'quantity_type',
        draft.variantsEnabled ? 'tracked' : draft.quantityType
      )
      payload.set(
        'quantity',
        draft.variantsEnabled
          ? String(
              draft.options.some(
                (option) => option.quantityType === 'unlimited'
              )
                ? 9999
                : draft.options.reduce(
                    (sum, option) => sum + option.quantity,
                    0
                  )
            )
          : draft.quantityType === 'unlimited'
            ? '9999'
            : String(Math.max(0, Number(draft.quantity) || 0))
      )

      if (draft.categoryId.startsWith('NEW:')) {
        payload.set('category_id', 'NEW_CHAIN')
        payload.set(
          'category_chain_names',
          JSON.stringify(pendingCategory.names)
        )
        payload.set('category_anchor_id', pendingCategory.anchorId)
      } else {
        payload.set('category_id', draft.categoryId)
      }

      if (draft.variantsEnabled) {
        if (!draft.options.length)
          throw new Error('أضف خياراً واحداً على الأقل.')
        const options: Record<string, unknown>[] = []
        for (const [index, option] of draft.options.entries()) {
          if (!option.name.trim()) throw new Error('اكتب اسم كل خيار للمنتج.')
          const imageFileKey = option.imageFile ? `option_image_${index}` : null
          if (option.imageFile && imageFileKey) {
            payload.set(imageFileKey, option.imageFile, option.imageFile.name)
          }
          options.push({
            id: option.id,
            name: option.name.trim(),
            quantity_type: option.quantityType,
            quantity:
              option.quantityType === 'unlimited' ? 9999 : option.quantity,
            use_main_image: option.useMainImage,
            image: option.useMainImage ? null : option.image || null,
            custom_price: option.customPrice,
            currency: draft.currency,
            ...(imageFileKey ? { image_file_key: imageFileKey } : {}),
          })
        }
        payload.set('sizes', JSON.stringify(options))
      }

      const hasImageUploads =
        Boolean(draft.imageFile) ||
        draft.options.some((option) => Boolean(option.imageFile))
      setUploadProgress(hasImageUploads ? 0 : null)
      if (draft.imageFile) {
        payload.set('image_file', draft.imageFile, draft.imageFile.name)
      }
      return saveDashboardProduct(
        payload,
        hasImageUploads ? setUploadProgress : undefined
      )
    },
    onSuccess: async () => {
      setUploadProgress(null)
      toast.success(
        editingProduct ? 'تم تحديث المنتج بنجاح.' : 'تم حفظ المنتج ونشره بنجاح.'
      )
      await refreshMerchantData()
      setEditorOpen(false)
      setEditingProduct(null)
      clearCreateShortcut()
    },
    onError: (error) => {
      setUploadProgress(null)
      toast.error(error instanceof Error ? error.message : 'تعذر حفظ المنتج.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (product: DashboardProduct) =>
      deleteDashboardProduct(product.id),
    onSuccess: async () => {
      toast.success('تم حذف المنتج.')
      await refreshMerchantData()
      setDeleteProduct(null)
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'تعذر حذف المنتج.'),
  })

  const availabilityMutation = useMutation({
    mutationFn: (product: DashboardProduct) =>
      updateDashboardAvailability(product.id, !product.isAvailable),
    onSuccess: async () => {
      toast.success('تم تحديث إتاحة المنتج.')
      await refreshMerchantData()
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'تعذر تحديث الإتاحة.'
      ),
  })

  const stockMutation = useMutation({
    mutationFn: ({
      product,
      stock,
    }: {
      product: DashboardProduct
      stock: StockDraft
    }) => updateDashboardProductStock(product, stock),
    onSuccess: async (message, { product }) => {
      toast.success(message || 'تم تحديث مخزون المنتج.')
      setStockDrafts((current) => {
        const next = { ...current }
        delete next[product.id]
        return next
      })
      await refreshMerchantData()
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'تعذر تحديث مخزون المنتج.'
      ),
  })

  const changeStockDraft = (
    product: DashboardProduct,
    update: (stock: StockDraft) => StockDraft
  ) => {
    setStockDrafts((current) => ({
      ...current,
      [product.id]: update(
        current[product.id] || stockDraftFromProduct(product)
      ),
    }))
  }

  const openEditor = (product: DashboardProduct | null = null) => {
    setUploadProgress(null)
    setEditingProduct(product)
    setEditorOpen(true)
    if (!categoriesQuery.data && !categoriesQuery.isLoading) {
      clearAuthApiCache()
      void categoriesQuery.refetch()
    }
  }

  return (
    <>
      <MerchantWorkspaceHeader />

      <Main className='merchant-content'>
        <div className='mb-6'>
          <MerchantPageHeading
            section={{ title: 'المنتجات', url: '/products' }}
            title={inventoryView ? 'إدارة المخزون' : 'قائمة المنتجات'}
            description={
              inventoryView
                ? 'راجع رصيد جميع المنتجات وخياراتها، وعدّل المخزون مباشرة.'
                : 'نظّم منتجات متجرك وأسعارها ومخزونها وفئاتها من مكان واحد.'
            }
            actions={
              <>
                <Button
                  variant={!inventoryView ? 'default' : 'outline'}
                  onClick={() => {
                    setInventoryView(false)
                    void navigate({
                      to: '/products',
                      search: {},
                    })
                  }}
                >
                  <List aria-hidden='true' /> قائمة المنتجات
                </Button>
                <Button
                  variant={inventoryView ? 'default' : 'outline'}
                  onClick={() => {
                    setInventoryView(true)
                    void navigate({
                      to: '/products',
                      search: { tab: 'inventory' },
                    })
                  }}
                >
                  <Boxes aria-hidden='true' /> إدارة المخزون
                </Button>
                <Button
                  variant='outline'
                  onClick={() => setCategoryManagerOpen(true)}
                >
                  <Tags aria-hidden='true' /> إدارة الفئات
                </Button>
                <Button onClick={() => openEditor()}>
                  <Plus aria-hidden='true' /> منتج جديد
                </Button>
              </>
            }
          />
        </div>

        <div className='mb-5 grid grid-cols-3 gap-2 sm:gap-3'>
          <StatCard
            title='كل المنتجات'
            value={products.length}
            icon={Package}
            onClick={() => {
              setInventoryView(false)
              void navigate({ to: '/products', search: {} })
            }}
          />
          <StatCard
            title='متاحة في المتجر'
            value={products.filter((product) => product.isAvailable).length}
            icon={Check}
          />
          <StatCard
            title='مخزون محدود'
            value={
              products.filter(
                (product) =>
                  product.quantityType === 'tracked' &&
                  product.quantity <= 5 &&
                  product.options.length === 0
              ).length
            }
            icon={Boxes}
            onClick={() => {
              setInventoryView(true)
              void navigate({ to: '/products', search: { tab: 'inventory' } })
            }}
          />
        </div>

        {!inventoryView ? (
          <Card className='mb-5 gap-4 py-4'>
            <CardContent className='grid gap-3 px-4 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(150px,220px))]'>
              <label className='relative sm:col-span-2 xl:col-span-1'>
                <Search className='absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                  placeholder='ابحث بالاسم أو الوصف أو الفئة...'
                  aria-label='ابحث عن منتج'
                  className='ps-9'
                />
              </label>
              <Select
                value={categoryFilter}
                onValueChange={(value) => {
                  setCategoryFilter(value)
                  setPage(1)
                }}
              >
                <SelectTrigger aria-label='تصفية حسب الفئة' className='w-full'>
                  <SelectValue placeholder='كل الفئات' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>كل الفئات</SelectItem>
                  {categoryOptions
                    .filter((category) => !category.id.startsWith('NEW:'))
                    .map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {categoryPath(category, categoryList)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select
                value={availabilityFilter}
                onValueChange={(value) => {
                  setAvailabilityFilter(value)
                  setPage(1)
                }}
              >
                <SelectTrigger
                  aria-label='تصفية حسب حالة المنتج'
                  className='w-full'
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>كل الحالات</SelectItem>
                  <SelectItem value='available'>متاح</SelectItem>
                  <SelectItem value='unavailable'>غير متاح</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={sort}
                onValueChange={(value) => {
                  setSort(value)
                  setPage(1)
                }}
              >
                <SelectTrigger aria-label='ترتيب المنتجات' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='newest'>الأحدث</SelectItem>
                  <SelectItem value='name'>الاسم</SelectItem>
                  <SelectItem value='price-asc'>السعر: الأقل أولاً</SelectItem>
                  <SelectItem value='price-desc'>
                    السعر: الأعلى أولاً
                  </SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        ) : null}

        {inventoryView ? (
          productsQuery.isPending ? (
            <p className='py-10 text-center text-sm text-muted-foreground'>
              جارٍ تحميل المخزون...
            </p>
          ) : productsQuery.isError && !productsQuery.data ? (
            <Card>
              <CardHeader>
                <CardTitle>تعذر تحميل المخزون</CardTitle>
                <CardDescription>
                  {productsQuery.error instanceof Error
                    ? productsQuery.error.message
                    : 'تحقق من الاتصال ثم أعد المحاولة.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => {
                    clearAuthApiCache()
                    void productsQuery.refetch()
                  }}
                >
                  إعادة المحاولة
                </Button>
              </CardContent>
            </Card>
          ) : (
            <StockManager
              products={products}
              drafts={stockDrafts}
              savingProductId={
                stockMutation.isPending
                  ? stockMutation.variables?.product.id
                  : undefined
              }
              onChange={changeStockDraft}
              onSave={(product) =>
                stockMutation.mutate({
                  product,
                  stock:
                    stockDrafts[product.id] || stockDraftFromProduct(product),
                })
              }
            />
          )
        ) : null}

        {!inventoryView && productsQuery.isPending ? (
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4 2xl:grid-cols-5'>
            {Array.from({ length: 10 }, (_, index) => (
              <Card key={index} className='h-64 bg-muted/40' />
            ))}
          </div>
        ) : !inventoryView && productsQuery.isError && !productsQuery.data ? (
          <Card>
            <CardHeader>
              <CardTitle>تعذر تحميل المنتجات</CardTitle>
              <CardDescription>
                {productsQuery.error instanceof Error
                  ? productsQuery.error.message
                  : 'تحقق من الاتصال ثم أعد المحاولة.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => {
                  clearAuthApiCache()
                  void productsQuery.refetch()
                }}
              >
                إعادة المحاولة
              </Button>
            </CardContent>
          </Card>
        ) : !inventoryView && visibleProducts.length ? (
          <>
            <div className='grid grid-cols-2 items-start gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4 2xl:grid-cols-5'>
              {visibleProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  categoryName={
                    categoryList.find(
                      (category) => category.id === product.categoryId
                    )?.name ||
                    (product.type && product.type !== 'عام'
                      ? product.type
                      : 'بدون فئة')
                  }
                  onEdit={() => openEditor(product)}
                  onDelete={() => setDeleteProduct(product)}
                  onQr={() => setQrProduct(product)}
                  onAvailability={() => availabilityMutation.mutate(product)}
                  availabilityPending={availabilityMutation.isPending}
                />
              ))}
            </div>
            <div className='mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground'>
              <span>
                عرض {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, filteredProducts.length)} من{' '}
                {filteredProducts.length} منتج
              </span>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  السابق
                </Button>
                <span>
                  {page} / {pageCount}
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
            </div>
          </>
        ) : !inventoryView ? (
          <Card>
            <CardContent className='grid justify-items-center gap-3 py-14 text-center'>
              <span className='grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground'>
                {deferredSearch ||
                categoryFilter !== 'all' ||
                availabilityFilter !== 'all' ? (
                  <Search className='size-6' />
                ) : (
                  <Package className='size-6' />
                )}
              </span>
              <h2 className='text-lg font-semibold'>
                {deferredSearch ||
                categoryFilter !== 'all' ||
                availabilityFilter !== 'all'
                  ? 'لا توجد نتائج مطابقة'
                  : 'لا توجد منتجات بعد'}
              </h2>
              <p className='max-w-md text-sm text-muted-foreground'>
                {deferredSearch ||
                categoryFilter !== 'all' ||
                availabilityFilter !== 'all'
                  ? 'جرّب تغيير كلمات البحث أو المرشحات.'
                  : 'أضف أول منتج إلى متجرك ليظهر هنا.'}
              </p>
              {!deferredSearch &&
                categoryFilter === 'all' &&
                availabilityFilter === 'all' && (
                  <Button onClick={() => openEditor()}>
                    <Plus aria-hidden='true' /> إضافة منتج
                  </Button>
                )}
            </CardContent>
          </Card>
        ) : null}
      </Main>

      <ProductEditor
        key={`${editorOpen || create === true ? 'open' : 'closed'}:${editingProduct?.id ?? 'new'}`}
        open={editorOpen || create === true}
        product={editingProduct}
        categories={categoryList}
        categoriesLoading={categoriesQuery.isLoading}
        categoriesError={categoriesQuery.isError}
        onRetryCategories={() => {
          clearAuthApiCache()
          void categoriesQuery.refetch()
        }}
        saving={saveMutation.isPending}
        uploadProgress={uploadProgress}
        onOpenChange={(open) => {
          setEditorOpen(open)
          if (!open) clearCreateShortcut()
        }}
        onSave={(draft) => saveMutation.mutate(draft)}
        onCategoryAdded={(category) => {
          setCategories((current) => [...current, category])
          void categoriesQuery.refetch()
        }}
        onManageCategories={() => {
          setEditorOpen(false)
          setCategoryManagerOpen(true)
          clearCreateShortcut()
        }}
      />

      <CategoryManager
        open={categoryManagerOpen || manageCategories}
        categories={categoryList}
        onOpenChange={(open) => {
          setCategoryManagerOpen(open)
          if (!open) clearCategoryShortcut()
        }}
        onChange={setCategories}
      />

      <Dialog
        open={Boolean(deleteProduct)}
        onOpenChange={(open) => !open && setDeleteProduct(null)}
      >
        <DialogContent className='font-ibm-plex-sans-arabic'>
          <DialogHeader>
            <DialogTitle>حذف المنتج</DialogTitle>
            <DialogDescription>
              هل تريد حذف «{deleteProduct?.name}» نهائياً؟ لا يمكن التراجع عن
              ذلك.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDeleteProduct(null)}>
              إلغاء
            </Button>
            <Button
              variant='destructive'
              disabled={deleteMutation.isPending}
              onClick={() =>
                deleteProduct && deleteMutation.mutate(deleteProduct)
              }
            >
              {deleteMutation.isPending && (
                <LoaderCircle className='animate-spin' />
              )}
              حذف المنتج
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QrDialog
        product={qrProduct}
        username={usernameQuery.data || ''}
        usernameLoading={usernameQuery.isLoading}
        usernameError={usernameQuery.isError}
        onRetryUsername={() => {
          clearAuthApiCache()
          void usernameQuery.refetch()
        }}
        onOpenChange={(open) => !open && setQrProduct(null)}
      />
    </>
  )
}

function StatCard({
  title,
  value,
  icon: Icon,
  onClick,
}: {
  title: string
  value: number
  icon: typeof Package
  onClick?: () => void
}) {
  return (
    <Card
      className={`gap-2 py-3 sm:gap-3 sm:py-4${onClick ? 'cursor-pointer transition-shadow hover:shadow-md' : ''}`}
      onClick={onClick}
    >
      <CardHeader className='flex flex-row items-start justify-between gap-1 px-2 pb-0 sm:items-center sm:px-4'>
        <CardTitle className='text-xs leading-tight font-medium text-muted-foreground sm:text-sm'>
          {title}
        </CardTitle>
        <Icon
          className='size-3.5 shrink-0 text-muted-foreground sm:size-4'
          aria-hidden='true'
        />
      </CardHeader>
      <CardContent className='px-2 sm:px-4'>
        <div className='text-xl font-bold tabular-nums sm:text-2xl'>
          {value.toLocaleString('ar-YE')}
        </div>
      </CardContent>
    </Card>
  )
}

function ProductCard({
  product,
  categoryName,
  onEdit,
  onDelete,
  onQr,
  onAvailability,
  availabilityPending,
}: {
  product: DashboardProduct
  categoryName: string
  onEdit: () => void
  onDelete: () => void
  onQr: () => void
  onAvailability: () => void
  availabilityPending: boolean
}) {
  const discountedPrice = product.price * (1 - product.discount / 100)
  return (
    <Card className='group min-w-0 overflow-hidden py-0 transition-shadow hover:shadow-md'>
      <div className='relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-t-lg border-b bg-muted/20 p-2 sm:p-2.5 dark:bg-muted/10'>
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className='h-auto max-h-full w-auto max-w-full object-contain drop-shadow-sm transition-transform duration-300 group-hover:scale-105'
            loading='lazy'
          />
        ) : (
          <div className='grid size-full place-items-center text-muted-foreground'>
            <Package className='size-8 sm:size-10' aria-hidden='true' />
          </div>
        )}
        <span
          className={`absolute start-1.5 top-1.5 z-10 max-w-[calc(100%-0.75rem)] truncate rounded-full px-1.5 py-0.5 text-[9px] font-semibold shadow-xs sm:start-2 sm:top-2 sm:px-2 sm:text-[10px] ${
            product.isAvailable
              ? 'bg-emerald-600/95 text-white'
              : 'border bg-background/90 text-muted-foreground'
          }`}
        >
          {product.isAvailable ? 'متاح في المتجر' : 'غير متاح'}
        </span>
        {product.discount > 0 && (
          <span className='absolute end-1.5 top-1.5 z-10 rounded-full bg-destructive/95 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-xs sm:end-2 sm:top-2 sm:px-2 sm:text-[10px]'>
            خصم {product.discount}%
          </span>
        )}
      </div>
      <CardHeader className='gap-1 px-2.5 pt-2.5 pb-1 sm:gap-1.5 sm:px-3 sm:pt-3'>
        <div className='flex min-w-0 items-center justify-between gap-1'>
          <span className='flex min-w-0 items-center gap-1 truncate text-[10px] text-muted-foreground sm:text-[11px]'>
            <Tags className='size-3 shrink-0' />
            {categoryName}
          </span>
          <span className='max-w-[45%] shrink-0 truncate rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground sm:text-[10px]'>
            {approvalLabel(product.approvalStatus)}
          </span>
        </div>
        <CardTitle className='line-clamp-1 text-xs leading-5 sm:text-sm'>
          {product.name}
        </CardTitle>
        {product.description && (
          <CardDescription className='line-clamp-1 text-[10px] leading-4 sm:text-xs'>
            {product.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className='grid gap-1.5 px-2.5 pt-1.5 pb-2.5 sm:gap-2 sm:px-3 sm:pb-3'>
        <div className='flex min-w-0 flex-wrap items-end justify-between gap-1'>
          <div className='grid gap-0.5'>
            <bdi className='text-xs font-bold text-primary sm:text-sm'>
              {formatPrice(discountedPrice, product.currency)}
            </bdi>
            {product.discount > 0 && (
              <bdi className='text-[10px] text-muted-foreground line-through'>
                {formatPrice(product.price, product.currency)}
              </bdi>
            )}
          </div>
          <span className='text-[9px] text-muted-foreground sm:text-[10px]'>
            {getStock(product)}
          </span>
        </div>
        {product.options.length > 0 && (
          <p className='line-clamp-1 text-[10px] text-muted-foreground'>
            {product.options.length} خيارات:{' '}
            {product.options.map((option) => option.name).join('، ')}
          </p>
        )}
        <div className='flex flex-wrap items-center justify-between gap-1 border-t pt-1.5 sm:gap-2 sm:pt-2'>
          <label className='flex min-h-11 cursor-pointer items-center gap-1 text-[9px] sm:gap-1.5 sm:text-[10px]'>
            <Checkbox
              checked={product.isAvailable}
              disabled={availabilityPending}
              onCheckedChange={onAvailability}
              aria-label={`إتاحة ${product.name} في المتجر`}
            />
            إتاحة المنتج
          </label>
          <div className='flex gap-0'>
            <Button
              variant='ghost'
              size='icon'
              className='size-11 sm:size-9'
              aria-label='تعديل المنتج'
              onClick={onEdit}
            >
              <Pencil />
            </Button>
            <Button
              variant='ghost'
              size='icon'
              className='size-11 sm:size-9'
              aria-label='مشاركة وباركود'
              onClick={onQr}
            >
              <Barcode />
            </Button>
            <Button
              variant='ghost'
              size='icon'
              className='size-11 sm:size-9'
              aria-label='حذف المنتج'
              onClick={onDelete}
            >
              <Trash2 className='text-destructive' />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ProductEditor({
  open,
  product,
  categories,
  categoriesLoading,
  categoriesError,
  onRetryCategories,
  saving,
  uploadProgress,
  onOpenChange,
  onSave,
  onCategoryAdded,
  onManageCategories,
}: {
  open: boolean
  product: DashboardProduct | null
  categories: DashboardCategory[]
  categoriesLoading: boolean
  categoriesError: boolean
  onRetryCategories: () => void
  saving: boolean
  uploadProgress: number | null
  onOpenChange: (open: boolean) => void
  onSave: (draft: ProductDraft) => void
  onCategoryAdded: (category: DashboardCategory) => void
  onManageCategories: () => void
}) {
  const [draft, setDraft] = useState<ProductDraft>(() =>
    product ? draftFromProduct(product) : emptyDraft()
  )
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryParent, setNewCategoryParent] = useState('')
  const [addCategoryOpen, setAddCategoryOpen] = useState(false)
  const [imagePreview, setImagePreview] = useState(product?.image || '')
  const [imageProcessing, setImageProcessing] = useState(false)
  const [processingOptionImages, setProcessingOptionImages] = useState(
    new Set<string>()
  )
  const flatCategories = useMemo(
    () => flattenCategories(categories),
    [categories]
  )

  const resetEditor = (isOpen: boolean) => {
    onOpenChange(isOpen)
  }

  const handleImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setImageProcessing(true)
    try {
      const prepared = await prepareDashboardImage(file)
      setDraft((current) => ({ ...current, imageFile: prepared.file }))
      setImagePreview(prepared.preview)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'تعذرت قراءة الصورة.'
      )
      event.target.value = ''
    } finally {
      setImageProcessing(false)
    }
  }

  const addPendingCategory = () => {
    const name = newCategoryName.trim()
    if (name.length < 2 || name.length > 60) {
      toast.error('اسم الفئة يجب أن يتكون من حرفين إلى 60 حرفاً.')
      return
    }
    if (
      categories.some(
        (category) =>
          category.parentId === newCategoryParent &&
          category.name.toLocaleLowerCase() === name.toLocaleLowerCase()
      )
    ) {
      toast.error('هذه الفئة موجودة مسبقاً.')
      return
    }
    const category = {
      id: `NEW:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      parentId: newCategoryParent,
    }
    onCategoryAdded(category)
    setDraft((current) => ({ ...current, categoryId: category.id }))
    setNewCategoryName('')
    setNewCategoryParent('')
    setAddCategoryOpen(false)
    toast.success('أُضيفت الفئة مؤقتاً، وسيتم حفظها مع أول منتج تستخدم فيه.')
  }

  const addOption = () => {
    setDraft((current) => ({
      ...current,
      options: [
        ...current.options,
        {
          id: `option-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: '',
          quantityType: 'tracked',
          quantity: 1,
          useMainImage: true,
          image: '',
          customPrice: null,
          imageFile: null,
        },
      ],
    }))
  }

  const updateOption = (index: number, update: Partial<DraftOption>) => {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...update } : option
      ),
    }))
  }

  const removeOption = (index: number) => {
    setDraft((current) => ({
      ...current,
      options: current.options.filter(
        (_, optionIndex) => optionIndex !== index
      ),
    }))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSave(draft)
  }

  return (
    <Dialog open={open} onOpenChange={resetEditor}>
      <DialogContent className='max-h-[92svh] overflow-y-auto font-ibm-plex-sans-arabic sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{product ? 'تعديل المنتج' : 'إضافة منتج'}</DialogTitle>
          <DialogDescription>
            أدخل البيانات الأساسية والسعر والمخزون، ثم احفظ التغييرات.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className='grid gap-5'>
          <section className='grid gap-4 rounded-xl border p-4'>
            <h3 className='font-semibold'>البيانات الأساسية</h3>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field label='اسم المنتج' required>
                <Input
                  autoFocus
                  minLength={2}
                  maxLength={160}
                  required
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label='فئة المنتج' required>
                <div className='flex gap-2'>
                  <CategoryPicker
                    categories={categories}
                    value={draft.categoryId}
                    loading={categoriesLoading}
                    onChange={(categoryId) =>
                      setDraft((current) => ({ ...current, categoryId }))
                    }
                  />
                  <Button
                    type='button'
                    variant='outline'
                    size='icon'
                    aria-label='إضافة فئة فرعية'
                    title='إضافة فئة ضمن الفئة المحددة'
                    onClick={() => {
                      setNewCategoryParent(draft.categoryId)
                      setAddCategoryOpen(true)
                    }}
                  >
                    <Plus />
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='icon'
                    aria-label='إدارة الفئات'
                    onClick={onManageCategories}
                  >
                    <Tags />
                  </Button>
                </div>
              </Field>
            </div>
            {categoriesError && (
              <div className='flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm'>
                <span>تعذر تحميل الفئات من الخادم.</span>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={onRetryCategories}
                >
                  إعادة المحاولة
                </Button>
              </div>
            )}
            <Field label='الوصف' required>
              <Textarea
                required
                rows={3}
                maxLength={5000}
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label='الصورة الرئيسية' required={!draft.image}>
              <div className='flex flex-wrap items-center gap-4'>
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt='معاينة صورة المنتج'
                    className='size-24 rounded-lg border object-cover'
                  />
                ) : (
                  <span className='grid size-24 place-items-center rounded-lg border border-dashed bg-muted/30 text-muted-foreground'>
                    <ImagePlus className='size-7' />
                  </span>
                )}
                <div className='grid gap-2'>
                  <Input
                    type='file'
                    accept='image/jpeg,image/png,image/webp,image/gif'
                    required={!draft.image}
                    onChange={handleImage}
                    className='max-w-sm file:me-3'
                  />
                  <p className='text-xs text-muted-foreground'>
                    تُحوّل الصور إلى WebP وتُضغط قبل رفعها (بحد أقصى 1200px).
                  </p>
                  {imageProcessing && (
                    <div className='grid gap-1' role='status'>
                      <span className='text-xs text-muted-foreground'>
                        جارٍ ضغط الصورة وتحويلها إلى WebP...
                      </span>
                      <div className='h-1.5 overflow-hidden rounded-full bg-muted'>
                        <div className='h-full w-2/3 animate-pulse rounded-full bg-primary' />
                      </div>
                    </div>
                  )}
                  {uploadProgress !== null && (
                    <div className='grid gap-1' role='status'>
                      <span className='text-xs text-muted-foreground'>
                        جارٍ رفع الصورة والمنتج: {uploadProgress}٪
                      </span>
                      <div
                        className='h-1.5 overflow-hidden rounded-full bg-muted'
                        role='progressbar'
                        aria-label='تقدم رفع الصورة'
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={uploadProgress}
                      >
                        <div
                          className='h-full rounded-full bg-primary transition-[width] duration-200'
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Field>
          </section>

          <section className='grid gap-4 rounded-xl border p-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <h3 className='font-semibold'>التسعير والمخزون</h3>
              <label className='flex cursor-pointer items-center gap-2 text-sm'>
                <Checkbox
                  checked={draft.variantsEnabled}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({
                      ...current,
                      variantsEnabled: checked === true,
                      options:
                        checked === true && current.options.length === 0
                          ? [
                              {
                                id: `option-${Date.now()}`,
                                name: '',
                                quantityType: 'tracked',
                                quantity: 1,
                                useMainImage: true,
                                image: '',
                                customPrice: null,
                                imageFile: null,
                              },
                            ]
                          : current.options,
                    }))
                  }
                />
                منتج متعدد الخيارات (مقاس/لون)
              </label>
            </div>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              <Field label='العملة'>
                <Select
                  value={draft.currency}
                  onValueChange={(currency) =>
                    setDraft((current) => ({ ...current, currency }))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((currency) => (
                      <SelectItem key={currency.value} value={currency.value}>
                        {currency.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label='سعر البيع' required>
                <Input
                  required
                  type='number'
                  min='0'
                  step='0.01'
                  value={draft.price}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      price: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label='التكلفة'>
                <Input
                  type='number'
                  min='0'
                  step='0.01'
                  value={draft.costPrice}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      costPrice: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label='نسبة الخصم (%)'>
                <Input
                  type='number'
                  min='0'
                  max='100'
                  step='1'
                  value={draft.discount}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      discount: event.target.value,
                    }))
                  }
                />
              </Field>
              {!draft.variantsEnabled && (
                <>
                  <Field label='نوع المخزون'>
                    <Select
                      value={draft.quantityType}
                      onValueChange={(quantityType: 'tracked' | 'unlimited') =>
                        setDraft((current) => ({ ...current, quantityType }))
                      }
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='tracked'>محدودة</SelectItem>
                        <SelectItem value='unlimited'>متجددة دائماً</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {draft.quantityType === 'tracked' && (
                    <Field label='الكمية' required>
                      <Input
                        type='number'
                        min='0'
                        step='1'
                        required
                        value={draft.quantity}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            quantity: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  )}
                </>
              )}
            </div>
            {draft.variantsEnabled && (
              <div className='grid gap-3'>
                {draft.options.map((option, index) => (
                  <VariantEditor
                    key={option.id}
                    option={option as DraftOption}
                    index={index}
                    currency={draft.currency}
                    onChange={(update) => updateOption(index, update)}
                    onProcessingChange={(processing) =>
                      setProcessingOptionImages((current) => {
                        const next = new Set(current)
                        if (processing) next.add(option.id)
                        else next.delete(option.id)
                        return next
                      })
                    }
                    onRemove={() => removeOption(index)}
                  />
                ))}
                <Button type='button' variant='outline' onClick={addOption}>
                  <Plus aria-hidden='true' /> إضافة خيار
                </Button>
              </div>
            )}
            <label className='flex items-center gap-3 border-t pt-4 text-sm font-medium'>
              <Checkbox
                checked={draft.isAvailable}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    isAvailable: checked === true,
                  }))
                }
              />
              إتاحة المنتج في المتجر
            </label>
          </section>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={saving}
              onClick={() => resetEditor(false)}
            >
              إلغاء
            </Button>
            <Button
              type='submit'
              disabled={
                saving ||
                categoriesLoading ||
                imageProcessing ||
                processingOptionImages.size > 0
              }
            >
              {saving ? <LoaderCircle className='animate-spin' /> : <Check />}
              {saving
                ? 'جارٍ الحفظ...'
                : product
                  ? 'حفظ التعديلات'
                  : 'حفظ ونشر المنتج'}
            </Button>
          </DialogFooter>
        </form>

        <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
          <DialogContent className='font-ibm-plex-sans-arabic sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>إضافة فئة</DialogTitle>
              <DialogDescription>
                اختر أي مستوى كفئة أب لإنشاء فئات متداخلة، مثل إلكترونيات /
                جوالات / سامسونج / جالكسي. تحفظ الفئات الجديدة مع أول منتج
                يستخدمها.
              </DialogDescription>
            </DialogHeader>
            <div className='grid gap-4'>
              <Field label='اسم الفئة'>
                <Input
                  autoFocus
                  maxLength={60}
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder='مثال: سامسونج'
                />
              </Field>
              <Field label='تتبع الفئة (اختياري)'>
                <Select
                  value={newCategoryParent || 'root'}
                  onValueChange={(value) =>
                    setNewCategoryParent(value === 'root' ? '' : value)
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='root'>فئة رئيسية</SelectItem>
                    {flatCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {categoryPath(category, categories)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {newCategoryName.trim() && (
                <p className='text-xs text-muted-foreground' aria-live='polite'>
                  المسار:{' '}
                  {newCategoryParent
                    ? `${categoryPath(
                        categories.find(
                          (category) => category.id === newCategoryParent
                        ) || {
                          id: newCategoryParent,
                          name: '',
                          parentId: '',
                        },
                        categories
                      )} / `
                    : ''}
                  {newCategoryName.trim()}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant='outline'
                onClick={() => setAddCategoryOpen(false)}
              >
                إلغاء
              </Button>
              <Button onClick={addPendingCategory}>إضافة الفئة</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}

function VariantEditor({
  option,
  index,
  currency,
  onChange,
  onProcessingChange,
  onRemove,
}: {
  option: DraftOption
  index: number
  currency: string
  onChange: (update: Partial<DraftOption>) => void
  onProcessingChange: (processing: boolean) => void
  onRemove: () => void
}) {
  const [preview, setPreview] = useState(option.image)
  const [imageProcessing, setImageProcessing] = useState(false)

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setImageProcessing(true)
    onProcessingChange(true)
    try {
      const prepared = await prepareDashboardImage(file)
      setPreview(prepared.preview)
      onChange({ imageFile: prepared.file, useMainImage: false })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'تعذرت قراءة الصورة.'
      )
      event.target.value = ''
    } finally {
      setImageProcessing(false)
      onProcessingChange(false)
    }
  }

  return (
    <div className='grid gap-4 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,1fr)]'>
      <div className='grid content-start gap-3'>
        <div className='flex items-center justify-between gap-2'>
          <h4 className='text-sm font-semibold'>الخيار {index + 1}</h4>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label='حذف الخيار'
            onClick={onRemove}
          >
            <X className='text-destructive' />
          </Button>
        </div>
        <Field label='اسم الخيار' required>
          <Input
            required
            value={option.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder='مثال: أزرق، كبير'
          />
        </Field>
        <Field label='المخزون'>
          <Select
            value={option.quantityType}
            onValueChange={(quantityType: 'tracked' | 'unlimited') =>
              onChange({ quantityType })
            }
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='tracked'>محدودة</SelectItem>
              <SelectItem value='unlimited'>متجددة</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {option.quantityType === 'tracked' && (
          <Field label='الكمية'>
            <Input
              type='number'
              min='0'
              value={option.quantity}
              onChange={(event) =>
                onChange({
                  quantity: Math.max(0, Number(event.target.value) || 0),
                })
              }
            />
          </Field>
        )}
        <label className='flex items-center gap-2 text-sm'>
          <Checkbox
            checked={option.customPrice !== null}
            onCheckedChange={(checked) =>
              onChange({
                customPrice:
                  checked === true ? (option.customPrice ?? 0) : null,
              })
            }
          />
          سعر خاص لهذا الخيار
        </label>
        {option.customPrice !== null && (
          <Field label={`السعر الخاص (${currency})`}>
            <Input
              type='number'
              min='0'
              step='0.01'
              value={option.customPrice}
              onChange={(event) =>
                onChange({ customPrice: Number(event.target.value) || 0 })
              }
            />
          </Field>
        )}
      </div>
      <div className='grid content-start gap-3'>
        <label className='flex items-center gap-2 text-sm'>
          <Checkbox
            checked={option.useMainImage}
            onCheckedChange={(checked) =>
              onChange({ useMainImage: checked === true })
            }
          />
          استخدام صورة المنتج الرئيسية
        </label>
        {!option.useMainImage && (
          <>
            {preview && (
              <img
                src={preview}
                alt={`صورة ${option.name || 'الخيار'}`}
                className='h-36 w-full rounded-lg border object-cover'
              />
            )}
            <Field label='صورة الخيار'>
              <Input
                type='file'
                accept='image/jpeg,image/png,image/webp,image/gif'
                onChange={handleFile}
              />
            </Field>
            {imageProcessing && (
              <div className='grid gap-1' role='status'>
                <span className='text-xs text-muted-foreground'>
                  جارٍ ضغط الصورة وتحويلها إلى WebP...
                </span>
                <div className='h-1.5 overflow-hidden rounded-full bg-muted'>
                  <div className='h-full w-2/3 animate-pulse rounded-full bg-primary' />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function StockManager({
  products,
  drafts,
  savingProductId,
  onChange,
  onSave,
}: {
  products: DashboardProduct[]
  drafts: Record<string, StockDraft>
  savingProductId?: string
  onChange: (
    product: DashboardProduct,
    update: (stock: StockDraft) => StockDraft
  ) => void
  onSave: (product: DashboardProduct) => void
}) {
  if (!products.length) {
    return (
      <p className='rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground'>
        لا توجد منتجات لإدارة مخزونها.
      </p>
    )
  }

  return (
    <div className='divide-y rounded-xl border px-4 sm:px-5'>
      {products.map((product) => {
        const stock = drafts[product.id] || stockDraftFromProduct(product)
        const saving = savingProductId === product.id
        return (
          <section key={product.id} className='grid gap-4 py-5'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <h2 className='font-semibold'>{product.name}</h2>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {product.options.length
                    ? `${product.options.length} خيارات`
                    : product.quantityType === 'unlimited'
                      ? 'مخزون متجدد'
                      : `المتاح حالياً: ${product.quantity}`}
                </p>
              </div>
              <Button
                disabled={saving}
                onClick={() => onSave(product)}
                className='min-w-28'
              >
                {saving ? (
                  <>
                    <LoaderCircle className='animate-spin' aria-hidden='true' />
                    جارٍ الحفظ
                  </>
                ) : (
                  'حفظ المخزون'
                )}
              </Button>
            </div>

            {product.options.length ? (
              <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
                {stock.options.map((option, index) => (
                  <div
                    key={option.id}
                    className='grid gap-3 rounded-lg border bg-muted/20 p-3'
                  >
                    <h3 className='text-sm font-medium'>
                      {option.name || `الخيار ${index + 1}`}
                    </h3>
                    <Field label='نوع المخزون'>
                      <Select
                        value={option.quantityType}
                        onValueChange={(value: 'tracked' | 'unlimited') =>
                          onChange(product, (current) => ({
                            ...current,
                            options: current.options.map((item) =>
                              item.id === option.id
                                ? { ...item, quantityType: value }
                                : item
                            ),
                          }))
                        }
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='tracked'>كمية محدودة</SelectItem>
                          <SelectItem value='unlimited'>
                            متجدد دائماً
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    {option.quantityType === 'tracked' && (
                      <Field label='الكمية'>
                        <Input
                          aria-label={`مخزون ${option.name}`}
                          type='number'
                          min='0'
                          step='1'
                          value={option.quantity}
                          onChange={(event) => {
                            const quantity = Math.max(
                              0,
                              Number(event.target.value) || 0
                            )
                            onChange(product, (current) => ({
                              ...current,
                              options: current.options.map((item) =>
                                item.id === option.id
                                  ? { ...item, quantity }
                                  : item
                              ),
                            }))
                          }}
                        />
                      </Field>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className='grid gap-3 sm:grid-cols-[minmax(180px,240px)_minmax(180px,240px)]'>
                <Field label='نوع المخزون'>
                  <Select
                    value={stock.quantityType}
                    onValueChange={(quantityType: 'tracked' | 'unlimited') =>
                      onChange(product, (current) => ({
                        ...current,
                        quantityType,
                      }))
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='tracked'>كمية محدودة</SelectItem>
                      <SelectItem value='unlimited'>متجدد دائماً</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {stock.quantityType === 'tracked' && (
                  <Field label='الكمية'>
                    <Input
                      aria-label={`مخزون ${product.name}`}
                      type='number'
                      min='0'
                      step='1'
                      value={stock.quantity}
                      onChange={(event) => {
                        const quantity = Math.max(
                          0,
                          Number(event.target.value) || 0
                        )
                        onChange(product, (current) => ({
                          ...current,
                          quantity,
                        }))
                      }}
                    />
                  </Field>
                )}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function CategoryManager({
  open,
  categories,
  onOpenChange,
  onChange,
}: {
  open: boolean
  categories: DashboardCategory[]
  onOpenChange: (open: boolean) => void
  onChange: (categories: DashboardCategory[]) => void
}) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'main' | 'sub'>('main')
  const [parentId, setParentId] = useState('')
  const [search, setSearch] = useState('')
  const flatCategories = useMemo(
    () => flattenCategories(categories),
    [categories]
  )
  const matches = flatCategories.filter((category) =>
    category.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  )

  const add = () => {
    const cleanName = name.trim()
    if (cleanName.length < 2 || cleanName.length > 60) {
      toast.error('اسم الفئة يجب أن يتكون من حرفين إلى 60 حرفاً.')
      return
    }
    if (mode === 'sub' && !parentId) {
      toast.error('اختر الفئة الرئيسية التي ستندرج تحتها الفئة الفرعية.')
      return
    }
    if (
      categories.some(
        (category) =>
          category.parentId === (mode === 'sub' ? parentId : '') &&
          category.name.trim().toLocaleLowerCase() ===
            cleanName.toLocaleLowerCase()
      )
    ) {
      toast.error('هذه الفئة موجودة مسبقاً.')
      return
    }
    const category = {
      id: `NEW:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName,
      parentId: mode === 'sub' ? parentId : '',
    }
    onChange([...categories, category])
    setName('')
    setParentId('')
    setMode('main')
    toast.success('أُضيفت الفئة مؤقتاً، وستحفظ مع أول منتج يستخدمها.')
  }

  const remove = (id: string) => {
    if (!id.startsWith('NEW:')) return
    const removeIds = new Set([id])
    let changed = true
    while (changed) {
      changed = false
      categories.forEach((category) => {
        if (removeIds.has(category.parentId) && !removeIds.has(category.id)) {
          removeIds.add(category.id)
          changed = true
        }
      })
    }
    onChange(categories.filter((category) => !removeIds.has(category.id)))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90svh] overflow-y-auto font-ibm-plex-sans-arabic sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>إدارة الفئات</DialogTitle>
          <DialogDescription>
            أنشئ مستويات متداخلة باختيار أي فئة كأب، مثل إلكترونيات / جوالات /
            سامسونج / جالكسي. تحفظ الفئات الجديدة مع أول منتج يستخدمها.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-5 md:grid-cols-[minmax(230px,0.8fr)_minmax(0,1.2fr)]'>
          <section className='grid content-start gap-3 rounded-xl border p-4'>
            <h3 className='font-semibold'>إضافة فئة جديدة</h3>
            <Field label='اسم الفئة'>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={60}
                placeholder='مثال: سامسونج'
              />
            </Field>
            <fieldset className='grid gap-2'>
              <legend className='text-sm font-medium'>نوع الفئة</legend>
              <div className='grid grid-cols-2 gap-2'>
                <Button
                  type='button'
                  variant={mode === 'main' ? 'default' : 'outline'}
                  aria-pressed={mode === 'main'}
                  onClick={() => {
                    setMode('main')
                    setParentId('')
                  }}
                >
                  فئة رئيسية
                </Button>
                <Button
                  type='button'
                  variant={mode === 'sub' ? 'default' : 'outline'}
                  aria-pressed={mode === 'sub'}
                  onClick={() => setMode('sub')}
                >
                  فئة فرعية
                </Button>
              </div>
            </fieldset>
            {mode === 'sub' && (
              <Field label='تتبع الفئة'>
                <Select value={parentId} onValueChange={setParentId}>
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder='اختر الفئة الأب' />
                  </SelectTrigger>
                  <SelectContent>
                    {flatCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {categoryPath(category, categories)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {mode === 'sub' && parentId && (
              <p className='text-xs text-muted-foreground' aria-live='polite'>
                المسار:{' '}
                {categoryPath(
                  categories.find((category) => category.id === parentId) || {
                    id: parentId,
                    name: '',
                    parentId: '',
                  },
                  categories
                )}
                {name.trim() ? ` / ${name.trim()}` : ''}
              </p>
            )}
            <Button onClick={add}>
              <Plus aria-hidden='true' /> إضافة الفئة
            </Button>
          </section>
          <section className='grid content-start gap-3 rounded-xl border p-4'>
            <h3 className='font-semibold'>كل الفئات ({categories.length})</h3>
            <label className='relative'>
              <Search className='absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder='ابحث عن فئة...'
                className='ps-9'
              />
            </label>
            {matches.length ? (
              <ul className='grid max-h-80 gap-1 overflow-y-auto'>
                {matches.map((category) => (
                  <li
                    key={category.id}
                    className='flex items-center gap-2 rounded-md border px-3 py-2 text-sm'
                    style={{
                      marginInlineStart: `${Math.min(category.depth, 6) * 14}px`,
                    }}
                  >
                    <span className='min-w-0 flex-1 truncate'>
                      {categoryPath(category, categories)}
                    </span>
                    {category.id.startsWith('NEW:') ? (
                      <>
                        <span className='rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-700'>
                          معلّقة
                        </span>
                        <Button
                          variant='ghost'
                          size='icon'
                          aria-label={`حذف الفئة ${category.name}`}
                          onClick={() => remove(category.id)}
                        >
                          <Trash2 className='size-4 text-destructive' />
                        </Button>
                      </>
                    ) : (
                      <span className='text-[10px] text-muted-foreground'>
                        محفوظة
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className='py-8 text-center text-sm text-muted-foreground'>
                {search ? 'لا توجد نتائج مطابقة.' : 'لا توجد فئات بعد.'}
              </p>
            )}
          </section>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function QrDialog({
  product,
  username,
  usernameLoading,
  usernameError,
  onRetryUsername,
  onOpenChange,
}: {
  product: DashboardProduct | null
  username: string
  usernameLoading: boolean
  usernameError: boolean
  onRetryUsername: () => void
  onOpenChange: (open: boolean) => void
}) {
  const [sharing, setSharing] = useState(false)
  if (!product) return null
  const productReference = product.productNumber || product.id
  const storeBaseUrl = 'https://appi.dpdns.org'
  const url = username
    ? `${storeBaseUrl}/${encodeURIComponent(username.replace(/^@/, ''))}/p${encodeURIComponent(productReference)}`
    : ''
  const qrUrl = `${qrService}?size=280x280&format=svg&data=${encodeURIComponent(url)}`

  const share = async () => {
    if (!url) {
      toast.error('رابط المتجر غير متوفر، أعد تحميل بيانات المتجر.')
      return
    }
    setSharing(true)
    try {
      if (navigator.share) {
        await navigator.share({
          title: product.name,
          text: `شاهد هذا المنتج: ${product.name} — ${formatPrice(product.price, product.currency)}`,
          url,
        })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        toast.success('تم نسخ رابط المنتج.')
      } else {
        window.open(
          `https://api.whatsapp.com/send?text=${encodeURIComponent(`${product.name}\n${url}`)}`,
          '_blank',
          'noopener,noreferrer'
        )
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        toast.error('تعذرت مشاركة رابط المنتج.')
      }
    } finally {
      setSharing(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className='font-ibm-plex-sans-arabic sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>مشاركة المنتج والباركود</DialogTitle>
          <DialogDescription>{product.name}</DialogDescription>
        </DialogHeader>
        <div className='grid justify-items-center gap-3 rounded-xl border p-4 text-center'>
          {product.image && (
            <img
              src={product.image}
              alt=''
              className='size-24 rounded-lg object-cover'
            />
          )}
          <bdi className='font-semibold'>
            {formatPrice(product.price, product.currency)}
          </bdi>
          {url ? (
            <>
              <img
                src={qrUrl}
                alt={`رمز QR للمنتج ${product.name}`}
                className='size-56'
              />
              <a
                className='max-w-full truncate text-xs text-primary underline'
                href={url}
                target='_blank'
                rel='noreferrer'
              >
                {url}
              </a>
            </>
          ) : usernameLoading ? (
            <LoaderCircle
              className='animate-spin'
              aria-label='جارٍ تحميل رابط المتجر'
            />
          ) : usernameError ? (
            <div className='text-sm text-destructive'>
              تعذر تحميل اسم المستخدم للمتجر.
              <Button
                type='button'
                size='sm'
                variant='outline'
                className='mt-2 block'
                onClick={onRetryUsername}
              >
                إعادة المحاولة
              </Button>
            </div>
          ) : (
            <p className='text-sm text-muted-foreground'>
              رابط المنتج غير جاهز.
            </p>
          )}
          <p className='text-[11px] text-muted-foreground'>
            يُنشأ رمز QR عبر خدمة خارجية باستخدام رابط المنتج العام.
          </p>
        </div>
        <DialogFooter>
          <Button
            disabled={!url}
            variant='outline'
            onClick={() => window.open(qrUrl, '_blank', 'noopener,noreferrer')}
          >
            تنزيل QR
          </Button>
          <Button disabled={!url || sharing} onClick={() => void share()}>
            {sharing ? <LoaderCircle className='animate-spin' /> : <Share2 />}
            مشاركة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className='grid min-w-0 gap-2'>
      <Label>
        {label}
        {required && <span className='ms-1 text-destructive'>*</span>}
      </Label>
      {children}
    </div>
  )
}

async function prepareDashboardImage(
  file: File
): Promise<{ file: File; preview: string }> {
  const webp = await compressDashboardImage(file, 0.8)
  const compressedFile = new File([webp], 'product.webp', {
    type: 'image/webp',
    lastModified: Date.now(),
  })
  const preview = await readImagePreview(webp)
  return { file: compressedFile, preview }
}

async function readImagePreview(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('تعذر قراءة ملف الصورة.'))
    }
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة.'))
    reader.readAsDataURL(file)
  })
}
