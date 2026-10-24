import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Bell,
  Bot,
  Check,
  ImagePlus,
  LoaderCircle,
  LogOut,
  MapPin,
  MessageSquareText,
  MessagesSquare,
  Palette,
  Phone,
  Store,
  Trash2,
  Truck,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { clearAuthApiCache } from '@/lib/auth-api'
import {
  getActiveMerchantToken,
  removeSavedMerchantAccount,
} from '@/lib/merchant-accounts'
import {
  getMerchantProfile,
  saveMerchantProfile,
} from '@/lib/merchant-profiles'
import {
  merchantBootstrapKey,
  merchantQueryKeys,
  useMerchantIdentity,
} from '@/hooks/useMerchantRealtime'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Main } from '@/components/layout/main'
import {
  MerchantPageHeading,
  MerchantWorkspaceHeader,
} from '@/components/layout/merchant-workspace'
import {
  clearDashboardInitializationCache,
  type DashboardData,
  type DashboardInitialization,
} from '@/features/dashboard/dashboard-data'
import {
  storefrontLibraryQueryKey,
  storefrontMerchantSettingsQueryKey,
  type StorefrontLibrary,
} from '@/features/storefront/storefront-data'
import {
  fetchStoreLogoSettings,
  fetchStoreSettings,
  logoutMerchant,
  merchantSettingsQueryKey,
  saveAiAssistantSettings,
  saveStoreLogoConfig,
  saveMerchantSettings,
  saveWhatsappSettings,
  updateStoreLogoConfig,
  uploadStoreLogo,
  type AiAssistantSettings,
  type MerchantSettings,
  type StoreLogoSettings,
  type StoreSettingsData,
  type WhatsappSettings,
} from './store-settings-data'

type DialogName =
  | 'name'
  | 'type'
  | 'location'
  | 'welcome'
  | 'shipping'
  | 'assistant'
  | 'whatsapp'
  | null

const storeTypeOptions = [
  'مطاعم ومأكولات',
  'إلكترونيات وجوالات',
  'أزياء وملابس',
  'سوبر ماركت وبقالة',
  'عطور وتجميل',
  'صيدليات وأدوية',
  'متنوع',
]

const toneLabels: Record<string, string> = {
  friendly: 'ودّي ومرح',
  formal: 'رسمي',
  professional: 'احترافي مباشر',
  funny: 'خفيف الظل',
  concise: 'مختصر جداً',
}

function SettingGroup({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='px-5 pt-5 pb-3'>
        <CardTitle className='text-base'>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className='grid px-3 pb-3 sm:px-4'>{children}</CardContent>
    </Card>
  )
}

function SettingRow({
  icon: Icon,
  title,
  value,
  onClick,
  badge,
}: {
  icon: typeof Store
  title: string
  value: string
  onClick: () => void
  badge?: string
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='flex min-w-0 items-center gap-3 rounded-lg p-3 text-start transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring'
    >
      <span className='grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary'>
        <Icon className='size-5' aria-hidden='true' />
      </span>
      <span className='grid min-w-0 flex-1 gap-1'>
        <span className='text-sm font-semibold'>{title}</span>
        <span className='truncate text-xs text-muted-foreground'>{value}</span>
      </span>
      {badge && (
        <span className='rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary'>
          {badge}
        </span>
      )}
      <span className='text-sm text-muted-foreground' aria-hidden='true'>
        ←
      </span>
    </button>
  )
}

function DialogShell({
  open,
  title,
  description,
  children,
  onOpenChange,
}: {
  open: boolean
  title: string
  description?: string
  children: React.ReactNode
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent className='max-h-[90svh] overflow-y-auto font-ibm-plex-sans-arabic sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>
          {children}
        </DialogContent>
      )}
    </Dialog>
  )
}

function shippingDescription(merchant: MerchantSettings) {
  if (!merchant.freeShippingEnabled) return 'معطل'
  if (merchant.freeShippingType === 'always') return 'مجاني دائماً'
  const unit = merchant.freeShippingType === 'item_count' ? 'قطع' : 'ريال'
  const operator =
    merchant.freeShippingType === 'item_count' ? 'عند شراء' : 'عند بلوغ'
  return `${operator} ${merchant.freeShippingThreshold.toLocaleString('ar-YE')} ${unit}`
}

type StoreLogoAction = { type: 'upload'; file: File } | { type: 'remove' }

function StoreLogoSettings({
  merchantId,
  storeName,
}: {
  merchantId: string
  storeName: string
}) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [brokenLogoUrl, setBrokenLogoUrl] = useState('')
  const logoQuery = useQuery({
    queryKey: ['merchant-store-logo', merchantId],
    queryFn: fetchStoreLogoSettings,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const logoMutation = useMutation({
    mutationFn: async (action: StoreLogoAction) => {
      const current = logoQuery.data
      if (!current) throw new Error('تعذر تحميل إعدادات هوية المتجر.')

      const logoUrl =
        action.type === 'upload'
          ? await uploadStoreLogo(action.file, setUploadProgress)
          : ''
      const config = updateStoreLogoConfig(
        current.config,
        logoUrl,
        current.icon
      )
      const message = await saveStoreLogoConfig(current.username, config)
      return {
        settings: { ...current, config, logoUrl },
        message,
      }
    },
    onSuccess: ({ settings: updated, message }) => {
      queryClient.setQueryData<StoreLogoSettings>(
        ['merchant-store-logo', merchantId],
        updated
      )
      setBrokenLogoUrl('')
      void queryClient.invalidateQueries({
        queryKey: storefrontMerchantSettingsQueryKey(merchantId),
      })
      setUploadProgress(null)
      toast.success(message || 'تم تحديث هوية المتجر.')
    },
    onError: (error) => {
      setUploadProgress(null)
      toast.error(
        error instanceof Error ? error.message : 'تعذر تحديث هوية المتجر.'
      )
    },
  })

  const handleFileSelection = (file?: File) => {
    if (!file) return
    setUploadProgress(0)
    logoMutation.mutate({ type: 'upload', file })
  }

  if (logoQuery.isPending) {
    return (
      <div className='grid gap-4 border-t pt-5 lg:grid-cols-2' role='status'>
        <div className='flex items-center gap-3'>
          <div className='size-20 animate-pulse rounded-2xl bg-muted' />
          <div className='grid flex-1 gap-2'>
            <div className='h-4 w-28 animate-pulse rounded bg-muted' />
            <div className='h-3 w-full max-w-64 animate-pulse rounded bg-muted' />
          </div>
        </div>
        <div className='h-24 animate-pulse rounded-xl bg-muted' />
        <span className='sr-only'>جارٍ تحميل إعدادات الشعار…</span>
      </div>
    )
  }

  if (logoQuery.isError || !logoQuery.data) {
    return (
      <div className='grid gap-3 border-t pt-5'>
        <div className='flex items-start gap-3'>
          <span className='grid size-11 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive'>
            <ImagePlus className='size-5' aria-hidden='true' />
          </span>
          <div className='grid gap-1'>
            <p className='text-sm font-semibold'>تعذر تحميل هوية المتجر</p>
            <p className='text-xs text-destructive'>
              {logoQuery.error instanceof Error
                ? logoQuery.error.message
                : 'تعذر تحميل إعدادات الشعار.'}
            </p>
          </div>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='w-fit'
          onClick={() => void logoQuery.refetch()}
        >
          إعادة المحاولة
        </Button>
      </div>
    )
  }

  const logoUrl = logoQuery.data.logoUrl
  const showImage = Boolean(logoUrl) && brokenLogoUrl !== logoUrl

  return (
    <div className='grid gap-5 border-t pt-5'>
      <div className='grid gap-4'>
        <div className='flex items-center gap-4'>
          <div className='grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border bg-muted/60'>
            {showImage ? (
              <img
                src={logoUrl}
                alt={`شعار ${storeName || 'المتجر'}`}
                className='size-full object-contain p-1'
                onError={() => setBrokenLogoUrl(logoUrl)}
              />
            ) : (
              <span className='px-2 text-center text-[11px] text-muted-foreground'>
                {logoUrl ? 'تعذر تحميل الصورة' : 'لا توجد صورة'}
              </span>
            )}
          </div>
          <div className='min-w-0 flex-1'>
            <p className='text-sm font-semibold'>معاينة الشعار</p>
            <p className='mt-1 text-xs leading-relaxed text-muted-foreground'>
              {showImage
                ? `يظهر شعار ${storeName || 'متجرك'} في واجهة المتجر.`
                : logoUrl
                  ? 'تعذر تحميل الصورة. أعد رفعها لتظهر في واجهة المتجر.'
                  : 'ارفع صورة ليظهر شعار متجرك في واجهة العملاء.'}
            </p>
            <p className='mt-2 text-[11px] text-muted-foreground'>
              PNG أو JPG أو WebP · حتى 1 ميغابايت بعد الضغط
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type='file'
          accept='image/png,image/jpeg,image/webp'
          className='sr-only'
          aria-label='اختيار صورة شعار المتجر'
          disabled={logoMutation.isPending}
          onChange={(event) => {
            handleFileSelection(event.currentTarget.files?.[0])
            event.currentTarget.value = ''
          }}
        />
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            type='button'
            size='sm'
            disabled={logoMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {logoMutation.isPending && uploadProgress !== null ? (
              <LoaderCircle className='animate-spin' aria-hidden='true' />
            ) : (
              <ImagePlus aria-hidden='true' />
            )}
            {logoUrl ? 'استبدال الصورة' : 'رفع صورة الشعار'}
          </Button>
          {logoUrl && (
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={logoMutation.isPending}
              onClick={() => logoMutation.mutate({ type: 'remove' })}
            >
              <Trash2 aria-hidden='true' />
              إزالة الصورة
            </Button>
          )}
        </div>
        {logoMutation.isPending && uploadProgress !== null && (
          <div className='grid gap-1' aria-live='polite'>
            <div className='flex items-center justify-between text-xs text-muted-foreground'>
              <span>
                {uploadProgress > 0
                  ? 'جارٍ رفع الصورة إلى GitHub…'
                  : 'جارٍ تجهيز الصورة…'}
              </span>
              {uploadProgress > 0 && <span>{uploadProgress}%</span>}
            </div>
            <div
              role='progressbar'
              aria-label='تقدم رفع الشعار'
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={uploadProgress}
              className='h-1.5 overflow-hidden rounded-full bg-muted'
            >
              <div
                className='h-full rounded-full bg-primary transition-[width]'
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function StoreSettings() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const merchantId = useMerchantIdentity()
  const merchantProfile = getMerchantProfile(merchantId)
  const [dialog, setDialog] = useState<DialogName>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [merchantDraft, setMerchantDraft] = useState<MerchantSettings | null>(
    null
  )
  const [storeTypeSelection, setStoreTypeSelection] = useState('')
  const [otherStoreType, setOtherStoreType] = useState('')
  const [locationDraft, setLocationDraft] = useState('')
  const [assistantDraft, setAssistantDraft] =
    useState<AiAssistantSettings | null>(null)
  const [whatsappDraft, setWhatsappDraft] = useState<WhatsappSettings | null>(
    null
  )
  const [accessToken, setAccessToken] = useState('')
  const settingsQuery = useQuery({
    queryKey: merchantSettingsQueryKey(merchantId),
    queryFn: async () => {
      const data = await fetchStoreSettings()
      localStorage.setItem(
        `merchant_push_notifications_enabled:${merchantId}`,
        String(data.merchant.pushNotifications)
      )
      return data
    },
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const settings = settingsQuery.data

  useEffect(() => {
    if (!settings) return

    const profileUpdates = {
      ...(settings.merchant.storeName
        ? { storeName: settings.merchant.storeName }
        : {}),
      ...(settings.merchant.phone ? { phone: settings.merchant.phone } : {}),
    }
    if (Object.keys(profileUpdates).length === 0) return

    try {
      saveMerchantProfile(merchantId, profileUpdates)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'تعذر حفظ معلومات المتجر على هذا الجهاز.'
      )
    }
  }, [merchantId, settings])

  const updateSettingsCache = (
    update: (current: StoreSettingsData) => StoreSettingsData
  ) => {
    queryClient.setQueryData<StoreSettingsData>(
      merchantSettingsQueryKey(merchantId),
      (current) => (current ? update(current) : current)
    )
  }

  const updateDashboardStore = (
    update: (current: DashboardData) => DashboardData
  ) => {
    queryClient.setQueryData<DashboardData>(
      merchantQueryKeys.dashboard(merchantId),
      (current) => (current ? update(current) : current)
    )
    queryClient.setQueryData<DashboardInitialization>(
      merchantBootstrapKey(merchantId),
      (current) =>
        current ? { ...current, dashboard: update(current.dashboard) } : current
    )
  }

  const merchantMutation = useMutation({
    mutationFn: (draft: MerchantSettings) => saveMerchantSettings(draft),
    onSuccess: (message, draft) => {
      updateSettingsCache((current) => ({
        ...current,
        merchant: { ...draft, phone: current.merchant.phone },
      }))
      queryClient.setQueryData<StorefrontLibrary>(
        storefrontLibraryQueryKey(merchantId),
        (current) =>
          current
            ? {
                ...current,
                storeName: draft.storeName,
                slogan: draft.welcomeMessage,
              }
            : current
      )
      updateDashboardStore((current) => ({
        ...current,
        storeName: draft.storeName,
      }))
      localStorage.setItem(`merchant_store_name:${merchantId}`, draft.storeName)
      saveMerchantProfile(merchantId, {
        ...(draft.storeName ? { storeName: draft.storeName } : {}),
        ...(draft.phone ? { phone: draft.phone } : {}),
      })
      toast.success(message || 'تم حفظ إعدادات المتجر.')
      setDialog(null)
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'تعذر حفظ إعدادات المتجر.'
      ),
  })

  const assistantMutation = useMutation({
    mutationFn: (draft: AiAssistantSettings) => saveAiAssistantSettings(draft),
    onSuccess: (message, draft) => {
      updateSettingsCache((current) => ({ ...current, assistant: draft }))
      toast.success(message || 'تم حفظ إعدادات المساعد الذكي.')
      setDialog(null)
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'تعذر حفظ إعدادات المساعد.'
      ),
  })

  const whatsappMutation = useMutation({
    mutationFn: ({
      draft,
      token,
    }: {
      draft: WhatsappSettings
      token: string
    }) => saveWhatsappSettings(draft, token),
    onSuccess: (message, variables) => {
      updateSettingsCache((current) => ({
        ...current,
        whatsapp: {
          ...variables.draft,
          hasAccessToken:
            variables.draft.hasAccessToken || Boolean(variables.token),
        },
      }))
      toast.success(message || 'تم حفظ إعدادات واتساب.')
      setAccessToken('')
      setDialog(null)
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'تعذر حفظ إعدادات واتساب.'
      ),
  })

  const notificationMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!settings) throw new Error('تعذر تحميل إعدادات المتجر.')
      if (enabled) {
        if (!('Notification' in window)) {
          throw new Error('هذا المتصفح لا يدعم تنبيهات الطلبات.')
        }
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          throw new Error('يرجى السماح بالإشعارات في إعدادات المتصفح أولاً.')
        }
      }
      return saveMerchantSettings({
        ...settings.merchant,
        pushNotifications: enabled,
      })
    },
    onSuccess: (message, enabled) => {
      localStorage.setItem(
        `merchant_push_notifications_enabled:${merchantId}`,
        String(enabled)
      )
      updateSettingsCache((current) => ({
        ...current,
        merchant: { ...current.merchant, pushNotifications: enabled },
      }))
      toast.success(message || 'تم تحديث إعدادات تنبيهات الطلبات.')
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'تعذر تحديث التنبيهات.'
      )
    },
  })

  const logoutMutation = useMutation({
    mutationFn: logoutMerchant,
    onSuccess: () => {
      removeSavedMerchantAccount(getActiveMerchantToken())
      clearDashboardInitializationCache()
      queryClient.clear()
      useAuthStore.getState().auth.reset()
      void navigate({ to: '/sign-in', replace: true })
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'تعذر تسجيل الخروج.'
      ),
  })

  const openSettingsDialog = (name: Exclude<DialogName, null>) => {
    if (!settings) return
    if (name === 'location') {
      setLocationDraft(getMerchantProfile(merchantId).location)
    }
    setMerchantDraft({ ...settings.merchant })
    setAssistantDraft({
      ...settings.assistant,
      customRules: [...settings.assistant.customRules],
    })
    setWhatsappDraft({ ...settings.whatsapp })
    setAccessToken('')
    if (name === 'type') {
      const currentType = settings.merchant.storeType
      const isStandardType = storeTypeOptions.includes(currentType)
      setStoreTypeSelection(isStandardType ? currentType : 'other')
      setOtherStoreType(isStandardType ? '' : currentType)
    }
    setDialog(name)
  }

  const saveMerchantLocation = () => {
    try {
      saveMerchantProfile(merchantId, {
        location: locationDraft.trim(),
      })
      toast.success('تم حفظ موقع المتجر على هذا الجهاز.')
      setDialog(null)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'تعذر حفظ موقع المتجر.'
      )
    }
  }

  const saveMerchantDraft = () => {
    if (!merchantDraft) return
    if (dialog === 'name' && merchantDraft.storeName.trim().length < 2) {
      toast.error('اسم المتجر مطلوب ويجب ألا يقل عن حرفين.')
      return
    }
    if (dialog === 'welcome' && merchantDraft.welcomeMessage.length > 150) {
      toast.error('رسالة الترحيب يجب ألا تتجاوز 150 حرفاً.')
      return
    }
    if (
      dialog === 'shipping' &&
      merchantDraft.freeShippingEnabled &&
      merchantDraft.freeShippingType !== 'always' &&
      merchantDraft.freeShippingThreshold <= 0
    ) {
      toast.error('أدخل حداً أكبر من صفر للتوصيل المجاني.')
      return
    }
    const draft =
      dialog === 'type'
        ? {
            ...merchantDraft,
            storeType:
              storeTypeSelection === 'other'
                ? otherStoreType.trim()
                : storeTypeSelection,
          }
        : merchantDraft
    if (dialog === 'type' && !draft.storeType) {
      toast.error('اختر نوع النشاط أو اكتب نوعاً مخصصاً.')
      return
    }
    merchantMutation.mutate(draft)
  }

  const copyValue = async (value: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      toast.success('تم النسخ.')
    } catch {
      toast.error('تعذر النسخ تلقائياً من هذا المتصفح.')
    }
  }

  const whatsappStatus = settings?.whatsapp.enabled
    ? 'مربوط ومفعّل'
    : settings?.whatsapp.hasAccessToken
      ? 'الإعداد محفوظ وغير مفعّل'
      : 'غير مربوط'

  return (
    <>
      <MerchantWorkspaceHeader />
      <Main className='merchant-content'>
        <div className='mb-6'>
          <MerchantPageHeading
            title='إعدادات المتجر'
            description='خصص تجربة متجرك وتحكم بخياراته من مكان واحد.'
          />
        </div>

        {settingsQuery.isPending ? (
          <div
            className='grid gap-3 lg:grid-cols-2'
            role='status'
            aria-label='جارٍ تحميل إعدادات المتجر'
          >
            {Array.from({ length: 4 }, (_, index) => (
              <Card key={index} className='h-56 bg-muted/50' />
            ))}
          </div>
        ) : settingsQuery.isError && !settings ? (
          <Card>
            <CardHeader>
              <CardTitle>تعذر تحميل الإعدادات</CardTitle>
              <CardDescription>
                {settingsQuery.error instanceof Error
                  ? settingsQuery.error.message
                  : 'تحقق من اتصالك ثم أعد المحاولة.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => {
                  clearAuthApiCache()
                  void settingsQuery.refetch()
                }}
              >
                إعادة المحاولة
              </Button>
            </CardContent>
          </Card>
        ) : settings ? (
          <>
            <SettingGroup
              title='شعار المتجر'
              description='ارفع صورة الشعار التي تمثل متجرك في واجهة العملاء.'
            >
              <StoreLogoSettings
                merchantId={merchantId}
                storeName={settings.merchant.storeName}
              />
            </SettingGroup>
            <div className='mt-4 grid gap-4 xl:grid-cols-2'>
              <SettingGroup
                title='هوية المتجر'
                description='المعلومات التي تظهر لعملائك'
              >
                <SettingRow
                  icon={Store}
                  title='اسم المتجر'
                  value={settings.merchant.storeName || 'غير محدد'}
                  onClick={() => openSettingsDialog('name')}
                />
                <SettingRow
                  icon={Store}
                  title='نوع النشاط'
                  value={settings.merchant.storeType || 'غير محدد'}
                  onClick={() => openSettingsDialog('type')}
                />
                <div className='flex min-w-0 items-center gap-3 rounded-lg p-3'>
                  <span className='grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary'>
                    <Phone className='size-5' aria-hidden='true' />
                  </span>
                  <span className='grid min-w-0 flex-1 gap-1'>
                    <span className='text-sm font-semibold'>رقم الجوال</span>
                    <span
                      className='truncate text-xs text-muted-foreground'
                      dir='ltr'
                    >
                      {settings.merchant.phone || 'غير محدد'}
                    </span>
                  </span>
                  <span className='shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground'>
                    ثابت
                  </span>
                </div>
                <SettingRow
                  icon={MapPin}
                  title='موقع المتجر'
                  value={merchantProfile.location || 'أضف المدينة والعنوان'}
                  onClick={() => openSettingsDialog('location')}
                />
              </SettingGroup>

              <SettingGroup
                title='واجهة المتجر'
                description='اجعل تجربة التسوق أقرب إلى علامتك'
              >
                <button
                  type='button'
                  onClick={() => void navigate({ to: '/storefront' })}
                  className='flex items-center gap-3 rounded-lg p-3 text-start transition-colors hover:bg-muted/60'
                >
                  <span className='grid size-10 place-items-center rounded-lg bg-primary/10 text-primary'>
                    <Palette className='size-5' />
                  </span>
                  <span className='grid flex-1 gap-1'>
                    <span className='text-sm font-semibold'>قوالب المتجر</span>
                    <span className='text-xs text-muted-foreground'>
                      اختيار ومعاينة المظهر
                    </span>
                  </span>
                  <span className='rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary'>
                    جديد
                  </span>
                  <span className='text-muted-foreground' aria-hidden='true'>
                    ←
                  </span>
                </button>
                <SettingRow
                  icon={MessageSquareText}
                  title='رسالة الترحيب'
                  value={settings.merchant.welcomeMessage || 'غير محددة'}
                  onClick={() => openSettingsDialog('welcome')}
                />
                <SettingRow
                  icon={Truck}
                  title='التوصيل المجاني'
                  value={shippingDescription(settings.merchant)}
                  onClick={() => openSettingsDialog('shipping')}
                />
              </SettingGroup>

              <SettingGroup
                title='المساعد والتواصل'
                description='أدوات تساعدك على خدمة عملائك'
              >
                <SettingRow
                  icon={Bot}
                  title='المساعد الذكي'
                  value={
                    settings.assistant.enabled
                      ? `مفعّل — ${settings.assistant.botName}`
                      : 'غير مفعّل'
                  }
                  onClick={() => openSettingsDialog('assistant')}
                />
                <SettingRow
                  icon={MessagesSquare}
                  title='ربط المساعد بواتساب'
                  value={whatsappStatus}
                  onClick={() => openSettingsDialog('whatsapp')}
                />
              </SettingGroup>

              <SettingGroup
                title='التنبيهات والحساب'
                description='إدارة الإشعارات والجلسة الحالية'
              >
                <div className='flex items-center gap-3 rounded-lg p-3'>
                  <span className='grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary'>
                    <Bell className='size-5' />
                  </span>
                  <span className='grid flex-1 gap-1'>
                    <span className='text-sm font-semibold'>
                      تنبيهات الطلبات الجديدة
                    </span>
                    <span className='text-xs text-muted-foreground'>
                      إشعار عند وصول طلب جديد أثناء اتصال لوحة التاجر؛ يتطلب
                      السماح بالتنبيهات في المتصفح.
                    </span>
                  </span>
                  <Switch
                    checked={
                      settings.merchant.pushNotifications &&
                      'Notification' in window &&
                      Notification.permission === 'granted'
                    }
                    disabled={notificationMutation.isPending}
                    aria-label='تنبيهات الطلبات الجديدة'
                    onCheckedChange={(checked) =>
                      notificationMutation.mutate(checked)
                    }
                  />
                </div>
                <button
                  type='button'
                  onClick={() => setLogoutOpen(true)}
                  className='flex items-center gap-3 rounded-lg p-3 text-start text-destructive transition-colors hover:bg-destructive/5'
                >
                  <span className='grid size-10 place-items-center rounded-lg bg-destructive/10'>
                    <LogOut className='size-5' />
                  </span>
                  <span className='grid flex-1 gap-1'>
                    <span className='text-sm font-semibold'>تسجيل الخروج</span>
                    <span className='text-xs text-muted-foreground'>
                      إنهاء الجلسة على هذا الجهاز
                    </span>
                  </span>
                  <span aria-hidden='true'>←</span>
                </button>
              </SettingGroup>
            </div>
          </>
        ) : null}
      </Main>

      <DialogShell
        open={dialog === 'name'}
        onOpenChange={(open) => !open && setDialog(null)}
        title='تعديل اسم المتجر'
        description='يظهر هذا الاسم لعملائك وفي واجهة متجرك.'
      >
        <div className='grid gap-2'>
          <Label htmlFor='settings-store-name'>اسم المتجر</Label>
          <Input
            id='settings-store-name'
            maxLength={40}
            value={merchantDraft?.storeName || ''}
            onChange={(event) =>
              setMerchantDraft((current) =>
                current
                  ? { ...current, storeName: event.target.value }
                  : current
              )
            }
            placeholder='اكتب اسم المتجر'
          />
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setDialog(null)}>
            إلغاء
          </Button>
          <Button
            disabled={merchantMutation.isPending}
            onClick={saveMerchantDraft}
          >
            {merchantMutation.isPending && (
              <LoaderCircle className='animate-spin' />
            )}
            حفظ
          </Button>
        </DialogFooter>
      </DialogShell>

      <DialogShell
        open={dialog === 'type'}
        onOpenChange={(open) => !open && setDialog(null)}
        title='نوع النشاط'
        description='اختر التصنيف الذي يصف متجرك، أو أضف تصنيفاً مخصصاً.'
      >
        <div className='grid gap-4'>
          <div className='grid gap-2'>
            <Label htmlFor='settings-store-type'>نوع النشاط</Label>
            <Select
              value={storeTypeSelection}
              onValueChange={(value) => {
                setStoreTypeSelection(value)
                if (value !== 'other') {
                  setMerchantDraft((current) =>
                    current ? { ...current, storeType: value } : current
                  )
                }
              }}
            >
              <SelectTrigger id='settings-store-type' className='w-full'>
                <SelectValue placeholder='اختر نوع النشاط' />
              </SelectTrigger>
              <SelectContent>
                {storeTypeOptions.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
                <SelectItem value='other'>أخرى</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {storeTypeSelection === 'other' && (
            <div className='grid gap-2'>
              <Label htmlFor='settings-other-store-type'>اكتب نوع النشاط</Label>
              <Input
                id='settings-other-store-type'
                maxLength={60}
                value={otherStoreType}
                onChange={(event) => setOtherStoreType(event.target.value)}
                placeholder='نوع النشاط'
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setDialog(null)}>
            إلغاء
          </Button>
          <Button
            disabled={merchantMutation.isPending}
            onClick={saveMerchantDraft}
          >
            {merchantMutation.isPending && (
              <LoaderCircle className='animate-spin' />
            )}
            حفظ
          </Button>
        </DialogFooter>
      </DialogShell>

      <DialogShell
        open={dialog === 'location'}
        onOpenChange={(open) => !open && setDialog(null)}
        title='موقع المتجر'
        description='أضف المدينة والعنوان ليسهل تمييز هذا المتجر عند التبديل بين حساباتك.'
      >
        <div className='grid gap-2'>
          <Label htmlFor='settings-merchant-location'>المدينة والعنوان</Label>
          <Textarea
            id='settings-merchant-location'
            rows={3}
            maxLength={200}
            value={locationDraft}
            onChange={(event) => setLocationDraft(event.target.value)}
            placeholder='مثال: صنعاء، شارع الزبيري'
          />
          <p className='text-xs text-muted-foreground'>
            تُحفظ هذه المعلومة على هذا الجهاز لهذا الحساب فقط، ولا تُرسل إلى
            الخادم.
          </p>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setDialog(null)}>
            إلغاء
          </Button>
          <Button onClick={saveMerchantLocation}>حفظ الموقع</Button>
        </DialogFooter>
      </DialogShell>

      <DialogShell
        open={dialog === 'welcome'}
        onOpenChange={(open) => !open && setDialog(null)}
        title='رسالة ترحيب المتجر'
        description='عبارة ترحيبية تظهر للعملاء أعلى متجرك.'
      >
        <div className='grid gap-2'>
          <Label htmlFor='settings-welcome'>رسالة الترحيب</Label>
          <Textarea
            id='settings-welcome'
            rows={4}
            maxLength={150}
            value={merchantDraft?.welcomeMessage || ''}
            onChange={(event) =>
              setMerchantDraft((current) =>
                current
                  ? { ...current, welcomeMessage: event.target.value }
                  : current
              )
            }
            placeholder='أهلاً بكم في متجرنا!'
          />
          <p className='text-end text-xs text-muted-foreground'>
            {merchantDraft?.welcomeMessage.length || 0}/150
          </p>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setDialog(null)}>
            إلغاء
          </Button>
          <Button
            disabled={merchantMutation.isPending}
            onClick={saveMerchantDraft}
          >
            حفظ الرسالة
          </Button>
        </DialogFooter>
      </DialogShell>

      <DialogShell
        open={dialog === 'shipping'}
        onOpenChange={(open) => !open && setDialog(null)}
        title='التوصيل المجاني'
        description='اختر متى يحصل العميل على التوصيل المجاني.'
      >
        <div className='grid gap-4'>
          <div className='flex items-center justify-between gap-4 rounded-lg border p-3'>
            <Label htmlFor='settings-free-shipping'>
              تفعيل التوصيل المجاني
            </Label>
            <Switch
              id='settings-free-shipping'
              checked={merchantDraft?.freeShippingEnabled || false}
              onCheckedChange={(checked) =>
                setMerchantDraft((current) =>
                  current
                    ? { ...current, freeShippingEnabled: checked }
                    : current
                )
              }
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='settings-shipping-type'>شرط التوصيل المجاني</Label>
            <Select
              value={merchantDraft?.freeShippingType || 'order_value'}
              disabled={!merchantDraft?.freeShippingEnabled}
              onValueChange={(value: MerchantSettings['freeShippingType']) =>
                setMerchantDraft((current) =>
                  current ? { ...current, freeShippingType: value } : current
                )
              }
            >
              <SelectTrigger id='settings-shipping-type' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='always'>مجاني دائماً</SelectItem>
                <SelectItem value='order_value'>
                  عندما تصل قيمة الطلب إلى
                </SelectItem>
                <SelectItem value='item_count'>
                  عندما يصل عدد القطع إلى
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {merchantDraft?.freeShippingEnabled &&
            merchantDraft.freeShippingType !== 'always' && (
              <div className='grid gap-2'>
                <Label htmlFor='settings-shipping-threshold'>
                  الحد المطلوب
                </Label>
                <Input
                  id='settings-shipping-threshold'
                  type='number'
                  min={1}
                  step={1}
                  value={merchantDraft.freeShippingThreshold || ''}
                  onChange={(event) =>
                    setMerchantDraft((current) =>
                      current
                        ? {
                            ...current,
                            freeShippingThreshold: Number(event.target.value),
                          }
                        : current
                    )
                  }
                  placeholder={
                    merchantDraft.freeShippingType === 'item_count'
                      ? 'مثال: 3'
                      : 'مثال: 15000'
                  }
                />
              </div>
            )}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setDialog(null)}>
            إلغاء
          </Button>
          <Button
            disabled={merchantMutation.isPending}
            onClick={saveMerchantDraft}
          >
            حفظ الإعدادات
          </Button>
        </DialogFooter>
      </DialogShell>

      <DialogShell
        open={dialog === 'assistant'}
        onOpenChange={(open) => !open && setDialog(null)}
        title='المساعد الذكي الخاص بمتجرك'
        description='خصص طريقة ظهور المساعد وطريقة رده على عملائك.'
      >
        <div className='grid gap-4'>
          <div className='flex items-center justify-between gap-4 rounded-lg border p-3'>
            <Label htmlFor='settings-ai-enabled'>تفعيل المساعد لعملائك</Label>
            <Switch
              id='settings-ai-enabled'
              checked={assistantDraft?.enabled || false}
              onCheckedChange={(checked) =>
                setAssistantDraft((current) =>
                  current ? { ...current, enabled: checked } : current
                )
              }
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='settings-ai-name'>اسم المساعد</Label>
            <Input
              id='settings-ai-name'
              maxLength={40}
              value={assistantDraft?.botName || ''}
              onChange={(event) =>
                setAssistantDraft((current) =>
                  current
                    ? { ...current, botName: event.target.value }
                    : current
                )
              }
              placeholder='مثال: سلمى'
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='settings-ai-tone'>نبرة الردود</Label>
            <Select
              value={assistantDraft?.tone || 'friendly'}
              onValueChange={(tone) =>
                setAssistantDraft((current) =>
                  current ? { ...current, tone } : current
                )
              }
            >
              <SelectTrigger id='settings-ai-tone' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(toneLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='settings-ai-rules'>قواعد مخصصة</Label>
            <Textarea
              id='settings-ai-rules'
              rows={5}
              value={assistantDraft?.customRules.join('\n') || ''}
              onChange={(event) =>
                setAssistantDraft((current) =>
                  current
                    ? {
                        ...current,
                        customRules: event.target.value
                          .split(/\r?\n/)
                          .slice(0, 26),
                      }
                    : current
                )
              }
              placeholder={
                'كل سطر قاعدة مستقلة، مثال:\nلا تعرض أرقام هواتف شخصية.'
              }
            />
            <p className='text-xs text-muted-foreground'>
              حتى 25 قاعدة، بحد أقصى 200 حرف لكل قاعدة.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setDialog(null)}>
            إلغاء
          </Button>
          <Button
            disabled={assistantMutation.isPending || !assistantDraft}
            onClick={() =>
              assistantDraft && assistantMutation.mutate(assistantDraft)
            }
          >
            {assistantMutation.isPending && (
              <LoaderCircle className='animate-spin' />
            )}
            حفظ إعدادات المساعد
          </Button>
        </DialogFooter>
      </DialogShell>

      <DialogShell
        open={dialog === 'whatsapp'}
        onOpenChange={(open) => !open && setDialog(null)}
        title='ربط المساعد بواتساب'
        description='يتطلب الربط حساب WhatsApp Business API (Meta Cloud API) خاصاً بمتجرك.'
      >
        <div className='grid gap-4'>
          <div className='flex items-center justify-between gap-4 rounded-lg border p-3'>
            <Label htmlFor='settings-wa-enabled'>تفعيل الربط بواتساب</Label>
            <Switch
              id='settings-wa-enabled'
              checked={whatsappDraft?.enabled || false}
              onCheckedChange={(checked) =>
                setWhatsappDraft((current) =>
                  current ? { ...current, enabled: checked } : current
                )
              }
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='settings-wa-phone-id'>Phone Number ID</Label>
            <Input
              id='settings-wa-phone-id'
              dir='ltr'
              value={whatsappDraft?.phoneNumberId || ''}
              onChange={(event) =>
                setWhatsappDraft((current) =>
                  current
                    ? { ...current, phoneNumberId: event.target.value }
                    : current
                )
              }
              placeholder='مثال: 109876543211234'
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='settings-wa-token'>Access Token</Label>
            <Input
              id='settings-wa-token'
              type='password'
              autoComplete='new-password'
              dir='ltr'
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder='اتركه فارغاً للإبقاء على القيمة المحفوظة'
            />
            <p className='text-xs text-muted-foreground'>
              {whatsappDraft?.hasAccessToken
                ? `يوجد رمز محفوظ (${whatsappDraft.accessTokenMasked}). لن نعرض الرمز الكامل.`
                : 'لم يتم حفظ Access Token بعد.'}
            </p>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='settings-wa-display-phone'>
              رقم واتساب (اختياري)
            </Label>
            <Input
              id='settings-wa-display-phone'
              dir='ltr'
              value={whatsappDraft?.displayPhoneNumber || ''}
              onChange={(event) =>
                setWhatsappDraft((current) =>
                  current
                    ? { ...current, displayPhoneNumber: event.target.value }
                    : current
                )
              }
              placeholder='+967 7xx xxx xxx'
            />
          </div>
          <div className='grid gap-3 rounded-lg bg-muted/40 p-3'>
            <div className='grid gap-2'>
              <Label htmlFor='settings-wa-webhook'>Callback URL</Label>
              <div className='flex gap-2'>
                <Input
                  id='settings-wa-webhook'
                  readOnly
                  dir='ltr'
                  value={whatsappDraft?.webhookUrl || ''}
                />
                <Button
                  type='button'
                  variant='outline'
                  aria-label='نسخ Callback URL'
                  disabled={!whatsappDraft?.webhookUrl}
                  onClick={() =>
                    void copyValue(whatsappDraft?.webhookUrl || '')
                  }
                >
                  <Check />
                </Button>
              </div>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='settings-wa-verify'>Verify Token</Label>
              <div className='flex gap-2'>
                <Input
                  id='settings-wa-verify'
                  readOnly
                  dir='ltr'
                  value={whatsappDraft?.verifyToken || ''}
                />
                <Button
                  type='button'
                  variant='outline'
                  aria-label='نسخ Verify Token'
                  disabled={!whatsappDraft?.verifyToken}
                  onClick={() =>
                    void copyValue(whatsappDraft?.verifyToken || '')
                  }
                >
                  <Check />
                </Button>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setDialog(null)}>
            إلغاء
          </Button>
          <Button
            disabled={whatsappMutation.isPending || !whatsappDraft}
            onClick={() =>
              whatsappDraft &&
              whatsappMutation.mutate({
                draft: whatsappDraft,
                token: accessToken,
              })
            }
          >
            {whatsappMutation.isPending && (
              <LoaderCircle className='animate-spin' />
            )}
            حفظ إعدادات واتساب
          </Button>
        </DialogFooter>
      </DialogShell>

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent className='font-ibm-plex-sans-arabic'>
          <AlertDialogHeader className='text-start'>
            <AlertDialogTitle>تسجيل الخروج</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد أنك تريد إنهاء الجلسة الحالية على هذا الجهاز؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={logoutMutation.isPending}>
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={logoutMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                logoutMutation.mutate()
              }}
              className='text-destructive-foreground bg-destructive hover:bg-destructive/90'
            >
              {logoutMutation.isPending && (
                <LoaderCircle className='animate-spin' />
              )}
              تسجيل الخروج
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
