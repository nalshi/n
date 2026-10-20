import { useEffect, useState } from 'react'
import { z } from 'zod'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { Check, Loader2, LocateFixed, Map, Palette, Rocket } from 'lucide-react'
import { toast } from 'sonner'
import {
  useAuthFlowStore,
  type MerchantRegistration,
} from '@/stores/auth-flow-store'
import { authApiRequest } from '@/lib/auth-api'
import {
  fetchStorefrontLibrary,
  type StorefrontTheme,
} from '@/features/storefront/storefront-data'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDashboardIntro } from '@/components/layout/dashboard-intro-context'
import { PasswordInput } from '@/components/password-input'
import { TermsDialog } from '@/features/auth/terms-dialog'

const mapUrlPattern =
  /^(https?:\/\/)?(www\.)?(google\.com\/maps|maps\.google\.com|goo\.gl\/maps|maps\.app\.goo\.gl)\/?.*$/i

const formSchema = z.object({
  phone: z.string().min(1, 'أدخل رقم الجوال.'),
  name: z.string().trim().min(1, 'أدخل اسم المتجر.'),
  username: z
    .string()
    .min(1, 'أدخل اسم المستخدم.')
    .regex(
      /^[a-z0-9_]+$/,
      'استخدم الأحرف الإنجليزية والأرقام والشرطة السفلية فقط.'
    ),
  storeType: z.string().min(1, 'اختر نوع النشاط.'),
  otherStoreType: z.string().optional(),
  location: z
    .string()
    .trim()
    .min(1, 'أدخل رابط موقع المتجر.')
    .regex(mapUrlPattern, 'أدخل رابطًا صحيحًا من خرائط Google.'),
  password: z.string().min(8, 'كلمة المرور يجب ألا تقل عن 8 أحرف.'),
  terms: z.boolean().refine(Boolean, 'يجب الموافقة على الشروط والأحكام.'),
})

type SignUpFormProps = React.HTMLAttributes<HTMLFormElement> & {
  initialPhone?: string
}

function ThemeOptionCard({
  theme,
  selected,
  onSelect,
}: {
  theme: StorefrontTheme
  selected: boolean
  onSelect: () => void
}) {
  const palette = selected ? theme.preview.dark : theme.preview

  return (
    <button
      type='button'
      onClick={onSelect}
      aria-label={`اختيار قالب ${theme.name}`}
      aria-pressed={selected}
      className={cn(
        'group relative overflow-hidden rounded-2xl border text-start transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'border-primary bg-primary/5 shadow-sm ring-2 ring-primary/30'
          : 'border-border bg-card hover:border-primary/50 hover:bg-muted/20'
      )}
    >
      <div className='grid h-24 grid-cols-2'>
        {(['light', 'dark'] as const).map((mode) => {
          const isDark = mode === 'dark'
          const preview = isDark ? theme.preview.dark : theme.preview
          return (
            <div
              key={mode}
              className='flex items-center justify-center border-e border-white/10 last:border-e-0'
              style={{ backgroundColor: preview.background }}
            >
              <span
                className='grid size-10 place-items-center rounded-xl text-white shadow-sm'
                style={{ backgroundColor: isDark ? preview.primary : preview.primary }}
              >
                <Palette className='size-4' />
              </span>
            </div>
          )
        })}
      </div>
      <div className='flex items-start justify-between gap-3 p-3.5'>
        <div className='min-w-0'>
          <p className='truncate text-sm font-bold text-foreground'>
            {theme.name}
          </p>
          <p className='mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground'>
            {theme.description || theme.category || 'قالب متجر'}
          </p>
        </div>
        {selected && (
          <span className='grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground'>
            <Check className='size-4' />
          </span>
        )}
      </div>
      <div className='flex items-center gap-1.5 px-3.5 pb-3.5'>
        {[
          palette.primary,
          palette.accent,
          palette.background,
          palette.card || '#ffffff',
        ].map((color, index) => (
          <span
            key={`${theme.id}-${color}-${index}`}
            className='size-4 rounded-md border border-black/5 shadow-xs'
            style={{ backgroundColor: color }}
            aria-hidden='true'
          />
        ))}
      </div>
    </button>
  )
}

function RequiredFormLabel({ children }: { children: React.ReactNode }) {
  return (
    <FormLabel>
      {children}
      <span className='ms-1 text-destructive' aria-hidden='true'>
        *
      </span>
    </FormLabel>
  )
}

export function SignUpForm({
  className,
  initialPhone = '',
  ...props
}: SignUpFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [themes, setThemes] = useState<StorefrontTheme[]>([])
  const [selectedThemeId, setSelectedThemeId] = useState('')
  const navigate = useNavigate()
  const flow = useAuthFlowStore()
  const { startIntro, setIntroReady } = useDashboardIntro()

  useEffect(() => {
    let active = true
    fetchStorefrontLibrary()
      .then((library) => {
        if (!active) return
        setThemes(library.themes.slice(0, 8))
      })
      .catch(() => {
        if (active) setThemes([])
      })
    return () => {
      active = false
    }
  }, [])
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      phone: initialPhone,
      name: '',
      username: '',
      storeType: '',
      otherStoreType: '',
      location: '',
      password: '',
      terms: false,
    },
  })

  const storeType = useWatch({
    control: form.control,
    name: 'storeType',
  })
  const username = useWatch({
    control: form.control,
    name: 'username',
  })

  async function locateStore() {
    if (!navigator.geolocation) {
      toast.error('تحديد الموقع غير مدعوم في هذا المتصفح.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        form.setValue(
          'location',
          `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`,
          { shouldValidate: true }
        )
        setLocating(false)
      },
      () => {
        toast.error('تعذر تحديد موقعك. يمكنك إدخال رابط خرائط Google يدويًا.')
        setLocating(false)
      },
      { enableHighAccuracy: true }
    )
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    let phone = values.phone.replace(/\D/g, '')
    if (phone.startsWith('967')) phone = phone.slice(3)
    if (phone.startsWith('0')) phone = phone.slice(1)
    if (phone.length !== 9) {
      form.setError('phone', { message: 'رقم الجوال يجب أن يتكون من 9 أرقام.' })
      return
    }
    const resolvedStoreType =
      values.storeType === 'other'
        ? values.otherStoreType?.trim() || ''
        : values.storeType
    if (!resolvedStoreType) {
      form.setError('otherStoreType', { message: 'اكتب نوع النشاط.' })
      return
    }

    const registration: MerchantRegistration = {
      phone,
      role: 'merchant',
      name: values.name.trim(),
      username: values.username.trim().toLowerCase(),
      password: values.password,
      location: values.location.trim(),
      store_type: resolvedStoreType,
      storefront_theme_id: selectedThemeId || undefined,
    }
    setIsLoading(true)
    startIntro()
    try {
      const response = await authApiRequest('register_init', registration)
      if (response.status !== 'success_otp_sent') {
        throw new Error(response.message || 'تعذر بدء تسجيل المتجر.')
      }
      flow.beginFlow({
        context: 'register',
        phone,
        stateToken: response.state_token || '',
        registration,
        storefrontThemeId: selectedThemeId,
      })
      toast.success('أرسلنا رمز التحقق إلى رقم جوالك.')
      setIntroReady(true)
      await navigate({ to: '/otp' })
    } catch (error) {
      setIntroReady(true)
      toast.error(
        error instanceof Error ? error.message : 'تعذر الاتصال بالخادم.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className={cn('grid gap-x-4 gap-y-4 sm:grid-cols-2', className)}
          dir='rtl'
          {...props}
        >
          <FormField
            control={form.control}
            name='phone'
            render={({ field }) => (
              <FormItem>
                <RequiredFormLabel>
                  رقم الجوال (للواتساب والطلبات)
                </RequiredFormLabel>
                <FormControl>
                  <Input
                    className='h-11 bg-background'
                    aria-required='true'
                    inputMode='tel'
                    autoComplete='tel'
                    placeholder='77XXXXXXX'
                    dir='ltr'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <RequiredFormLabel>اسم المتجر</RequiredFormLabel>
                <FormControl>
                  <Input
                    className='h-11 bg-background'
                    aria-required='true'
                    placeholder='مثال: متجر الأناقة'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='username'
            render={({ field }) => (
              <FormItem>
                <RequiredFormLabel>
                  اسم المستخدم (رابط المتجر)
                </RequiredFormLabel>
                <FormControl>
                  <Input
                    className='h-11 bg-background'
                    aria-required='true'
                    autoComplete='username'
                    placeholder='mystore_123'
                    dir='ltr'
                    {...field}
                    onChange={(event) => {
                      field.onChange(
                        event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, '')
                      )
                    }}
                  />
                </FormControl>
                {username && (
                  <p className='text-xs text-muted-foreground' dir='ltr'>
                    appi.dpdns.org/{username}
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='storeType'
            render={({ field, fieldState }) => (
              <FormItem>
                <RequiredFormLabel>نوع النشاط</RequiredFormLabel>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      className='h-11 w-full bg-background data-[size=default]:h-11'
                      aria-label='نوع النشاط'
                      aria-required='true'
                      aria-invalid={!!fieldState.error}
                    >
                      <SelectValue placeholder='اختر نوع النشاط' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='مطاعم ومأكولات'>
                        مطاعم ومأكولات
                      </SelectItem>
                      <SelectItem value='إلكترونيات وجوالات'>
                        إلكترونيات وجوالات
                      </SelectItem>
                      <SelectItem value='أزياء وملابس'>أزياء وملابس</SelectItem>
                      <SelectItem value='سوبر ماركت وبقالة'>
                        سوبر ماركت وبقالة
                      </SelectItem>
                      <SelectItem value='عطور وتجميل'>عطور وتجميل</SelectItem>
                      <SelectItem value='صيدليات وأدوية'>
                        صيدليات وأدوية
                      </SelectItem>
                      <SelectItem value='متنوع'>متنوع</SelectItem>
                      <SelectItem value='other'>أخرى</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {storeType === 'other' && (
            <FormField
              control={form.control}
              name='otherStoreType'
              render={({ field }) => (
                <FormItem className='sm:col-span-2'>
                  <RequiredFormLabel>حدد نوع النشاط</RequiredFormLabel>
                  <FormControl>
                    <Input
                      className='h-11 bg-background'
                      aria-required='true'
                      placeholder='اكتب نوع النشاط'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name='location'
            render={({ field }) => (
              <FormItem className='sm:col-span-2'>
                <RequiredFormLabel>موقع المتجر (Google Maps)</RequiredFormLabel>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    className='h-11'
                    onClick={() =>
                      window.open(
                        'https://www.google.com/maps',
                        '_blank',
                        'noopener,noreferrer'
                      )
                    }
                  >
                    <Map />
                    الخرائط
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    className='size-11'
                    onClick={locateStore}
                    disabled={locating}
                    aria-label='تحديد موقعي'
                  >
                    {locating ? (
                      <Loader2 className='animate-spin' />
                    ) : (
                      <LocateFixed />
                    )}
                  </Button>
                </div>
                <FormControl>
                  <Input
                    className='h-11 bg-background'
                    aria-required='true'
                    type='text'
                    inputMode='url'
                    placeholder='https://maps.google.com/...'
                    dir='ltr'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='password'
            render={({ field }) => (
              <FormItem className='sm:col-span-2'>
                <RequiredFormLabel>
                  كلمة المرور (8 أحرف على الأقل)
                </RequiredFormLabel>
                <FormControl>
                  <PasswordInput
                    className='h-11'
                    inputClassName='h-11 bg-background'
                    aria-required='true'
                    autoComplete='new-password'
                    placeholder='أدخل كلمة مرور قوية'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {themes.length > 0 && (
            <div className='sm:col-span-2 space-y-3'>
              <div className='flex items-center justify-between gap-2'>
                <p className='text-sm font-medium'>شكل المتجر (اختياري)</p>
                <button
                  type='button'
                  onClick={() => setSelectedThemeId('')}
                  className='text-xs font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline'
                >
                  لا أختار الآن
                </button>
              </div>
              <div className='grid gap-3 md:grid-cols-2'>
                {themes.map((theme) => (
                  <ThemeOptionCard
                    key={theme.id}
                    theme={theme}
                    selected={selectedThemeId === theme.id}
                    onSelect={() => setSelectedThemeId(theme.id)}
                  />
                ))}
              </div>
            </div>
          )}
          <FormField
            control={form.control}
            name='terms'
            render={({ field }) => (
              <FormItem className='sm:col-span-2'>
                <div className='flex min-h-11 items-start gap-3 rounded-xl bg-muted/50 p-3.5'>
                  <FormControl>
                    <Checkbox
                      className='relative mt-0.5 size-5 shrink-0 before:absolute before:-inset-3 before:rounded-xl before:content-[""]'
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-required='true'
                      aria-label='أوافق على الشروط والأحكام'
                    />
                  </FormControl>
                  <div className='text-sm'>
                    <span>أوافق على </span>
                    <TermsDialog triggerClassName='font-semibold text-primary underline underline-offset-4' />
                    <span className='ms-1 text-destructive' aria-hidden='true'>
                      *
                    </span>
                    <FormMessage />
                  </div>
                </div>
              </FormItem>
            )}
          />
          <Button className='h-11 sm:col-span-2' disabled={isLoading}>
            {isLoading ? <Loader2 className='animate-spin' /> : <Rocket />}
            إنشاء المتجر
          </Button>
        </form>
      </Form>
    </>
  )
}
