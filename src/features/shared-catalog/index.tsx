import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownToLine, Search, Store } from 'lucide-react'
import { toast } from 'sonner'
import { authApiRequest } from '@/lib/auth-api'
import {
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
import { Input } from '@/components/ui/input'
import { Main } from '@/components/layout/main'
import {
  MerchantPageHeading,
  MerchantWorkspaceHeader,
} from '@/components/layout/merchant-workspace'

type SharedProduct = {
  id: string
  name: string
  description: string
  image: string
  price: number
  currency: string
  quantity: number
  quantityType: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseProducts(result: Awaited<ReturnType<typeof authApiRequest>>) {
  if (result.status !== 'success' && result.status !== 'ok') {
    throw new Error(result.message || 'تعذر تحميل كتالوج التجار.')
  }
  if (!Array.isArray(result.data)) {
    throw new Error('أعاد الخادم بيانات كتالوج غير متوقعة.')
  }

  return result.data.flatMap((value): SharedProduct[] => {
    const row = asRecord(value)
    if (
      !row ||
      typeof row.id !== 'string' ||
      typeof row.name !== 'string' ||
      typeof row.price !== 'number'
    ) {
      return []
    }
    return [
      {
        id: row.id,
        name: row.name,
        description: typeof row.description === 'string' ? row.description : '',
        image: typeof row.image === 'string' ? row.image : '',
        price: row.price,
        currency: typeof row.currency === 'string' ? row.currency : 'YER',
        quantity: typeof row.quantity === 'number' ? row.quantity : 0,
        quantityType:
          typeof row.quantity_type === 'string' ? row.quantity_type : 'tracked',
      },
    ]
  })
}

function formatPrice(price: number, currency: string) {
  return `${price.toLocaleString('ar-YE')} ${currency}`
}

export function SharedCatalog() {
  const queryClient = useQueryClient()
  const merchantId = useMerchantIdentity()
  const [search, setSearch] = useState('')
  const catalogQuery = useQuery({
    queryKey: ['shared-product-catalog', search],
    queryFn: async () =>
      parseProducts(
        await authApiRequest('list_shared_product_catalog', { search })
      ),
  })
  const importsQuery = useQuery({
    queryKey: ['shared-product-imports', merchantId],
    queryFn: async () =>
      parseProducts(await authApiRequest('list_my_shared_product_imports', {})),
  })
  const importMutation = useMutation({
    mutationFn: async (product: SharedProduct) => {
      const result = await authApiRequest('import_shared_product', {
        product_id: product.id,
      })
      if (result.status !== 'success' && result.status !== 'ok') {
        throw new Error(result.message || 'تعذرت إضافة المنتج إلى متجرك.')
      }
      if (typeof result.product_id !== 'string' || !result.product_id) {
        throw new Error('لم يُرجع الخادم معرّف المنتج الذي تمت إضافته.')
      }
      return { product, alreadyImported: result.already_imported === true }
    },
    onSuccess: async ({ product, alreadyImported }) => {
      toast.success(
        alreadyImported
          ? `«${product.name}» موجود مسبقاً في متجرك.`
          : `تمت إضافة «${product.name}» إلى منتجاتك.`
      )
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['shared-product-catalog'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['shared-product-imports', merchantId],
        }),
        refreshMerchantSnapshot(queryClient, merchantId),
      ])
    },
    onError: (error: Error) => toast.error(error.message),
  })

  return (
    <>
      <MerchantWorkspaceHeader />
      <Main className='space-y-6'>
        <MerchantPageHeading
          title='كتالوج التجار'
          description='اكتشف المنتجات التي اختار أصحابها مشاركتها، وأضف نسخة مستقلة إلى متجرك.'
        />
        <p className='max-w-3xl text-sm leading-6 text-muted-foreground'>
          عند الإضافة تُنشأ نسخة جديدة تملكها أنت. تعديلها أو حذفها لا يغيّر
          منتج التاجر الآخر، وإيقاف المشاركة يمنع الإضافات الجديدة فقط.
        </p>
        <div className='relative max-w-xl'>
          <Search
            className='absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground'
            aria-hidden='true'
          />
          <Input
            aria-label='ابحث في كتالوج التجار'
            placeholder='ابحث عن منتج'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className='ps-9'
          />
        </div>
        {catalogQuery.isError && (
          <div
            role='alert'
            className='rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'
          >
            {catalogQuery.error instanceof Error
              ? catalogQuery.error.message
              : 'تعذر تحميل الكتالوج.'}
            <Button
              variant='outline'
              size='sm'
              className='ms-3'
              onClick={() => void catalogQuery.refetch()}
            >
              إعادة المحاولة
            </Button>
          </div>
        )}
        {importsQuery.isError && (
          <div
            role='alert'
            className='rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'
          >
            تعذر تحميل قائمة المنتجات المضافة إلى متجرك.
            <Button
              variant='outline'
              size='sm'
              className='ms-3'
              onClick={() => void importsQuery.refetch()}
            >
              إعادة المحاولة
            </Button>
          </div>
        )}
        {catalogQuery.isPending ? (
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
            {Array.from({ length: 6 }, (_, index) => (
              <Card key={index} className='h-64 animate-pulse bg-muted/40' />
            ))}
          </div>
        ) : catalogQuery.data?.length ? (
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
            {catalogQuery.data.map((product) => (
              <Card key={product.id} className='overflow-hidden'>
                {product.image && (
                  <img
                    src={product.image}
                    alt={product.name}
                    className='h-48 w-full bg-muted object-contain'
                    loading='lazy'
                  />
                )}
                <CardHeader>
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription className='line-clamp-3'>
                    {product.description || 'لا يوجد وصف للمنتج.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div className='flex items-center justify-between gap-3 text-sm'>
                    <bdi className='font-semibold'>
                      {formatPrice(product.price, product.currency)}
                    </bdi>
                    <span className='inline-flex items-center gap-1 text-muted-foreground'>
                      <Store className='size-4' aria-hidden='true' />
                      متجر مشارك
                    </span>
                  </div>
                  <Button
                    className='w-full'
                    disabled={importMutation.isPending}
                    onClick={() => importMutation.mutate(product)}
                  >
                    <ArrowDownToLine aria-hidden='true' />
                    أضف نسخة إلى متجري
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !catalogQuery.isError ? (
          <Card>
            <CardHeader>
              <CardTitle>
                {search ? 'لا توجد نتائج مطابقة' : 'الكتالوج فارغ حالياً'}
              </CardTitle>
              <CardDescription>
                {search
                  ? 'جرّب البحث باسم مختلف.'
                  : 'ستظهر هنا المنتجات التي يشاركها التجار الآخرون.'}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}
        {importsQuery.data && importsQuery.data.length > 0 && (
          <section className='space-y-3'>
            <h2 className='text-lg font-semibold'>أُضيفت إلى متجرك</h2>
            <ul className='divide-y rounded-lg border'>
              {importsQuery.data.map((product) => (
                <li
                  key={product.id}
                  className='flex items-center justify-between gap-3 p-3 text-sm'
                >
                  <span>{product.name}</span>
                  <span className='text-muted-foreground'>
                    {formatPrice(product.price, product.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Main>
    </>
  )
}
