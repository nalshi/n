import { useEffect, useState } from 'react'
import { z } from 'zod'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import {
  Check,
  Loader2,
  LocateFixed,
  Map,
  Moon,
  Palette,
  Rocket,
  Sun,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useAuthFlowStore,
  type MerchantRegistration,
  type StorefrontThemeMode,
} from '@/stores/auth-flow-store'
import { authApiRequest } from '@/lib/auth-api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  fetchStorefrontLibrary,
  type StorefrontTheme,
} from '@/features/storefront/storefront-data'

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
  onPreview,
}: {
  theme: StorefrontTheme
  selected: boolean
  onPreview: () => void
}) {
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light')
  const preview = previewMode === 'dark' ? theme.preview.dark : theme.preview

  return (
    <article
      className={cn(
        'overflow-hidden rounded-[18px] border bg-card transition-all duration-200',
        selected
          ? 'border-primary shadow-[0_12px_30px_rgba(99,102,241,0.16)]'
          : 'border-border hover:border-primary/50'
      )}
    >
      <div className='flex items-center justify-between gap-2 border-b border-border/70 bg-background/60 px-3 py-2.5'>
        <div className='flex min-w-0 items-center gap-2'>
          <span
            className='size-2.5 shrink-0 rounded-full shadow-sm'
            style={{ backgroundColor: preview.primary }}
            aria-hidden='true'
          />
          <span className='truncate text-sm font-bold text-foreground'>
            {theme.name}
          </span>
        </div>

        <div
          role='group'
          aria-label={`وضع معاينة ${theme.name}`}
          className='flex items-center gap-1 rounded-full border border-border bg-muted/60 p-1'
        >
          {(['light', 'dark'] as const).map((mode) => (
            <button
              key={mode}
              type='button'
              onClick={(event) => {
                event.stopPropagation()
                setPreviewMode(mode)
              }}
              aria-label={`معاينة ${mode === 'light' ? 'فاتحة' : 'داكنة'}`}
              aria-pressed={previewMode === mode}
              className={cn(
                'min-w-12 rounded-full px-2 py-1 text-[10px] font-medium transition-colors',
                previewMode === mode
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {mode === 'light' ? 'فاتح' : 'داكن'}
            </button>
          ))}
        </div>
      </div>

      <div className='p-3' style={{ backgroundColor: preview.background }}>
        <div
          className='overflow-hidden rounded-[14px] border border-black/5 p-2.5'
          style={{
            backgroundColor: preview.card || preview.background,
            color: preview.text || '#0f172a',
          }}
          role='img'
          aria-label={`معاينة قالب ${theme.name} بالوضع ${previewMode === 'dark' ? 'الداكن' : 'الفاتح'}`}
        >
          <div
            className='mb-2 flex items-center justify-between gap-2 rounded-xl px-2 py-1.5'
            style={{ backgroundColor: preview.background, opacity: 0.9 }}
          >
            <div className='flex items-center gap-1.5'>
              {[...Array(3)].map((_, index) => (
                <span
                  key={index}
                  className='size-1.5 rounded-full'
                  style={{ backgroundColor: preview.primary }}
                  aria-hidden='true'
                />
              ))}
            </div>
            <div
              className='rounded-full px-2 py-1 text-[9px] font-semibold text-white'
              style={{ backgroundColor: preview.primary }}
            >
              متجر
            </div>
          </div>

          <div
            className='mb-2 flex items-center justify-between rounded-xl p-2.5'
            style={{
              background: `linear-gradient(135deg, ${preview.primary}, ${preview.accent})`,
            }}
          >
            <div>
              <p className='text-[9px] font-medium text-white/80'>
                {theme.category || 'متجر'}
              </p>
              <p className='mt-0.5 text-[11px] font-bold text-white'>
                {theme.name}
              </p>
            </div>
            <span className='grid size-9 place-items-center rounded-xl bg-white/15 text-white backdrop-blur-sm'>
              <Palette className='size-4' />
            </span>
          </div>

          <div className='grid grid-cols-2 gap-2'>
            {['', '', '', ''].map((_, index) => (
              <div
                key={index}
                className='overflow-hidden rounded-xl border border-black/5'
                style={{ backgroundColor: preview.background }}
              >
                <div
                  className='h-10 rounded-b-xl'
                  style={{
                    background: `linear-gradient(135deg, ${preview.accent}, ${preview.primary})`,
                  }}
                />
                <div className='space-y-1.5 p-2'>
                  <div
                    className='h-2 rounded-full'
                    style={{ backgroundColor: preview.primary, opacity: 0.85 }}
                  />
                  <div
                    className='h-2 w-3/4 rounded-full'
                    style={{ backgroundColor: preview.accent, opacity: 0.8 }}
                  />
                  <div
                    className='h-6 w-full rounded-xl'
                    style={{ backgroundColor: preview.card || '#ffffff' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          type='button'
          onClick={onPreview}
          aria-label={`فتح معاينة قالب ${theme.name}`}
          aria-pressed={selected}
          className={cn(
            'mt-3 flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            selected
              ? 'border-primary/40 bg-primary/10'
              : 'border-transparent bg-card/80 hover:border-primary/30 hover:bg-card'
          )}
        >
          <span className='min-w-0'>
            <span className='block truncate text-xs font-semibold text-foreground'>
              {selected ? 'القالب المختار' : 'معاينة واختيار'}
            </span>
            <span className='mt-0.5 line-clamp-2 block text-[10px] leading-4 text-muted-foreground'>
              {theme.description || theme.category || 'قالب متجر'}
            </span>
          </span>

          <span className='flex shrink-0 items-center gap-1.5'>
            {[preview.primary, preview.accent, preview.background].map(
              (color, index) => (
                <span
                  key={`${theme.id}-${color}-${index}`}
                  className='size-3.5 rounded-full border border-black/5'
                  style={{ backgroundColor: color }}
                  aria-hidden='true'
                />
              )
            )}
            {selected && (
              <span className='grid size-6 place-items-center rounded-full bg-primary text-primary-foreground'>
                <Check className='size-3.5' />
              </span>
            )}
          </span>
        </button>
      </div>
    </article>
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
  const [selectedThemeMode, setSelectedThemeMode] =
    useState<StorefrontThemeMode>('light')
  const [previewTheme, setPreviewTheme] = useState<StorefrontTheme | null>(null)
  const [previewMode, setPreviewMode] = useState<StorefrontThemeMode>('light')
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

  function openThemePreview(theme: StorefrontTheme) {
    setPreviewTheme(theme)
    setPreviewMode(selectedThemeId === theme.id ? selectedThemeMode : 'light')
  }

  function confirmThemeSelection() {
    if (!previewTheme) return
    setSelectedThemeId(previewTheme.id)
    setSelectedThemeMode(previewMode)
    setPreviewTheme(null)
  }

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
        storefrontThemeMode: selectedThemeMode,
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
            <div className='space-y-3 sm:col-span-2'>
              <div className='flex items-center justify-between gap-2'>
                <p className='text-sm font-medium'>شكل المتجر (اختياري)</p>
                <button
                  type='button'
                  onClick={() => {
                    setSelectedThemeId('')
                    setSelectedThemeMode('light')
                  }}
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
                    onPreview={() => openThemePreview(theme)}
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
      <Dialog
        open={previewTheme !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewTheme(null)
        }}
      >
        {previewTheme && (
          <DialogContent
            dir='rtl'
            className='max-h-[90dvh] max-w-4xl overflow-y-auto sm:max-w-4xl'
          >
            <DialogHeader>
              <DialogTitle>معاينة {previewTheme.name}</DialogTitle>
              <DialogDescription>
                اختر الوضع المناسب للمتجر. لن يُعتمد القالب حتى تضغط على زر
                التأكيد.
              </DialogDescription>
            </DialogHeader>

            <div className='mx-auto flex w-full max-w-3xl flex-col gap-4'>
              <div
                role='group'
                aria-label='وضع المتجر'
                className='grid grid-cols-2 gap-2'
              >
                {(['light', 'dark'] as const).map((mode) => (
                  <button
                    key={mode}
                    type='button'
                    onClick={() => setPreviewMode(mode)}
                    aria-pressed={previewMode === mode}
                    className={cn(
                      'flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      previewMode === mode
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:bg-muted'
                    )}
                  >
                    {mode === 'light' ? (
                      <Sun className='size-4' aria-hidden='true' />
                    ) : (
                      <Moon className='size-4' aria-hidden='true' />
                    )}
                    {mode === 'light' ? 'الوضع الفاتح' : 'الوضع الداكن'}
                  </button>
                ))}
              </div>

              {(() => {
                const preview =
                  previewMode === 'dark'
                    ? previewTheme.preview.dark
                    : previewTheme.preview
                return (
                  <div
                    className='rounded-2xl border p-3 sm:p-5'
                    style={{ backgroundColor: preview.background }}
                  >
                    <div
                      className='mx-auto max-w-3xl overflow-hidden rounded-xl border border-black/5 p-3 sm:p-5'
                      style={{
                        backgroundColor: preview.card || preview.background,
                        color: preview.text || '#0f172a',
                      }}
                      role='img'
                      aria-label={`معاينة قالب ${previewTheme.name} بالوضع ${previewMode === 'dark' ? 'الداكن' : 'الفاتح'}`}
                    >
                      <div
                        className='mb-3 flex items-center justify-between rounded-xl px-3 py-2'
                        style={{ backgroundColor: preview.background }}
                      >
                        <span className='text-xs font-semibold'>
                          {previewTheme.name}
                        </span>
                        <span
                          className='rounded-full px-3 py-1 text-xs font-semibold text-white'
                          style={{ backgroundColor: preview.primary }}
                        >
                          المتجر
                        </span>
                      </div>
                      <div
                        className='mb-3 flex items-center justify-between rounded-2xl p-4 sm:p-6'
                        style={{
                          background: `linear-gradient(135deg, ${preview.primary}, ${preview.accent})`,
                        }}
                      >
                        <div className='text-white'>
                          <p className='text-xs text-white/80'>
                            {previewTheme.category || 'متجر'}
                          </p>
                          <p className='mt-1 text-lg font-bold sm:text-2xl'>
                            {previewTheme.name}
                          </p>
                        </div>
                        <Palette
                          className='size-8 text-white'
                          aria-hidden='true'
                        />
                      </div>
                      <div className='grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3'>
                        {[...Array(4)].map((_, index) => (
                          <div
                            key={index}
                            className='overflow-hidden rounded-xl border border-black/5'
                            style={{ backgroundColor: preview.background }}
                          >
                            <div
                              className='h-16 sm:h-24'
                              style={{
                                background: `linear-gradient(135deg, ${preview.accent}, ${preview.primary})`,
                              }}
                            />
                            <div className='space-y-2 p-2 sm:p-3'>
                              <div
                                className='h-2 rounded-full'
                                style={{ backgroundColor: preview.primary }}
                              />
                              <div
                                className='h-2 w-3/4 rounded-full'
                                style={{ backgroundColor: preview.accent }}
                              />
                              <div
                                className='h-7 rounded-lg'
                                style={{
                                  backgroundColor: preview.card || '#ffffff',
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>

            <DialogFooter className='sm:justify-start'>
              <Button type='button' onClick={confirmThemeSelection}>
                <Check />
                اعتماد القالب والوضع
              </Button>
              <Button
                type='button'
                variant='outline'
                onClick={() => setPreviewTheme(null)}
              >
                رجوع دون اختيار
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
