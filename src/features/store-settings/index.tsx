import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Bell,
  Bot,
  Check,
  LoaderCircle,
  LogOut,
  MessageSquareText,
  MessagesSquare,
  Palette,
  Phone,
  Store,
  Truck,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { clearAuthApiCache } from '@/lib/auth-api'
import {
  refreshMerchantSnapshot,
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
import { clearDashboardInitializationCache } from '@/features/dashboard/dashboard-data'
import {
  fetchStoreSettings,
  logoutMerchant,
  saveAiAssistantSettings,
  saveMerchantSettings,
  saveWhatsappSettings,
  type AiAssistantSettings,
  type MerchantSettings,
  type WhatsappSettings,
} from './store-settings-data'

type DialogName =
  | 'name'
  | 'phone'
  | 'welcome'
  | 'shipping'
  | 'assistant'
  | 'whatsapp'
  | null

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

export function StoreSettings() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const merchantId = useMerchantIdentity()
  const [dialog, setDialog] = useState<DialogName>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [merchantDraft, setMerchantDraft] = useState<MerchantSettings | null>(
    null
  )
  const [assistantDraft, setAssistantDraft] =
    useState<AiAssistantSettings | null>(null)
  const [whatsappDraft, setWhatsappDraft] = useState<WhatsappSettings | null>(
    null
  )
  const [accessToken, setAccessToken] = useState('')
  const settingsQuery = useQuery({
    queryKey: ['merchant-store-settings'],
    queryFn: async () => {
      const data = await fetchStoreSettings()
      localStorage.setItem(
        'merchant_push_notifications_enabled',
        String(data.merchant.pushNotifications)
      )
      return data
    },
    retry: false,
  })
  const settings = settingsQuery.data

  const refreshSettings = async () => {
    clearDashboardInitializationCache()
    try {
      await refreshMerchantSnapshot(queryClient, merchantId)
    } catch (error) {
      toast.error(
        `تم حفظ الإعدادات، لكن تعذر تحديث بيانات اللوحة: ${
          error instanceof Error ? error.message : 'خطأ غير معروف.'
        }`
      )
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['merchant-dashboard-home', merchantId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['merchant-bootstrap', merchantId],
        }),
      ])
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['merchant-store-settings'] }),
      queryClient.invalidateQueries({
        queryKey: ['merchant-storefront-library'],
      }),
    ])
  }

  const merchantMutation = useMutation({
    mutationFn: (draft: MerchantSettings) => saveMerchantSettings(draft),
    onSuccess: async (message) => {
      toast.success(message || 'تم حفظ إعدادات المتجر.')
      setDialog(null)
      await refreshSettings()
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'تعذر حفظ إعدادات المتجر.'
      ),
  })

  const assistantMutation = useMutation({
    mutationFn: (draft: AiAssistantSettings) => saveAiAssistantSettings(draft),
    onSuccess: async (message) => {
      toast.success(message || 'تم حفظ إعدادات المساعد الذكي.')
      setDialog(null)
      await refreshSettings()
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
    onSuccess: async (message) => {
      toast.success(message || 'تم حفظ إعدادات واتساب.')
      setAccessToken('')
      setDialog(null)
      await refreshSettings()
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
    onSuccess: async (message, enabled) => {
      localStorage.setItem(
        'merchant_push_notifications_enabled',
        String(enabled)
      )
      toast.success(message || 'تم تحديث إعدادات تنبيهات الطلبات.')
      await refreshSettings()
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
      localStorage.removeItem('merchant_push_notifications_enabled')
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
    setMerchantDraft({ ...settings.merchant })
    setAssistantDraft({
      ...settings.assistant,
      customRules: [...settings.assistant.customRules],
    })
    setWhatsappDraft({ ...settings.whatsapp })
    setAccessToken('')
    setDialog(name)
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
    merchantMutation.mutate(merchantDraft)
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
          <div className='grid gap-4 xl:grid-cols-2'>
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
                icon={Phone}
                title='رقم التواصل'
                value={settings.merchant.phone || 'غير محدد'}
                onClick={() => openSettingsDialog('phone')}
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
        open={dialog === 'phone'}
        onOpenChange={(open) => !open && setDialog(null)}
        title='رقم التواصل'
        description='رقم واتساب/الهاتف الذي يظهر للعملاء للتواصل مع المتجر.'
      >
        <div className='grid gap-2'>
          <Label htmlFor='settings-store-phone'>رقم الهاتف</Label>
          <Input
            id='settings-store-phone'
            type='tel'
            inputMode='tel'
            maxLength={15}
            dir='ltr'
            value={merchantDraft?.phone || ''}
            onChange={(event) =>
              setMerchantDraft((current) =>
                current ? { ...current, phone: event.target.value } : current
              )
            }
            placeholder='96777XXXXXXX'
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
            حفظ
          </Button>
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
