import { useEffect, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { Loader2, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthFlowStore } from '@/stores/auth-flow-store'
import { authApiRequest } from '@/lib/auth-api'
import { getSafeAuthRedirect } from '@/lib/auth-redirect'
import { completeAuthSession } from '@/lib/complete-auth-session'
import { buildSelectedConfig } from '@/features/storefront/storefront-config'
import {
  fetchStorefrontLibrary,
  loadBaseStorefrontConfig,
  loadStorefrontThemeConfig,
  saveStorefrontConfig,
} from '@/features/storefront/storefront-data'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useDashboardIntro } from '@/components/layout/dashboard-intro-context'
import { PasswordInput } from '@/components/password-input'

const otpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'أدخل رمز التحقق المكوّن من 6 أرقام.'),
})

const passwordSchema = z
  .object({
    password: z.string().min(8, 'كلمة المرور يجب ألا تقل عن 8 أحرف.'),
    confirmPassword: z.string().min(1, 'أعد إدخال كلمة المرور.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين.',
    path: ['confirmPassword'],
  })

type OtpFormProps = React.HTMLAttributes<HTMLFormElement>

export function OtpForm({ className, ...props }: OtpFormProps) {
  const navigate = useNavigate()
  const flow = useAuthFlowStore()
  const { beginOperation } = useDashboardIntro()
  const [isLoading, setIsLoading] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(
    flow.context === 'login_otp' ? 300 : 120
  )
  const [isResettingPassword, setIsResettingPassword] = useState(false)

  const otpForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: '' },
  })
  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  useEffect(() => {
    if (remainingSeconds <= 0) return
    const timer = window.setTimeout(
      () => setRemainingSeconds((seconds) => seconds - 1),
      1000
    )
    return () => window.clearTimeout(timer)
  }, [remainingSeconds])

  const context = flow.context
  const phone = flow.phone
  const timerLabel = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`

  async function applySelectedStorefrontTheme() {
    const themeId = flow.storefrontThemeId
    const registration = flow.registration
    if (!themeId || !registration?.username) return

    try {
      const library = await fetchStorefrontLibrary()
      const theme = library.themes.find((candidate) => candidate.id === themeId)
      if (!theme) return

      const [baseConfig, themeConfig] = await Promise.all([
        loadBaseStorefrontConfig({}),
        loadStorefrontThemeConfig(theme),
      ])
      const selectedConfig = buildSelectedConfig(
        baseConfig,
        themeConfig,
        theme,
        'light',
        {
          storeName: registration.name,
          phone: registration.phone,
          slogan: '',
        }
      )
      await saveStorefrontConfig(registration.username, selectedConfig)
    } catch (error) {
      console.warn('Selected storefront theme could not be applied.', error)
    }
  }

  async function finishLogin(
    response: { token?: string; redirect?: string },
    afterAuth?: () => Promise<void> | void
  ) {
    if (!response.token) {
      throw new Error('لم يُرجع الخادم رمز جلسة صالحًا.')
    }
    completeAuthSession(
      response.token,
      flow.remember,
      phone,
      flow.storeName || flow.registration?.name || ''
    )
    if (afterAuth) await afterAuth()
    const redirectTo = getSafeAuthRedirect(flow.redirectTo)
    flow.clearFlow()
    await navigate({ to: redirectTo, replace: true })
  }

  async function onOtpSubmit({ otp }: z.infer<typeof otpSchema>) {
    if (!context) {
      toast.error('انتهت صلاحية جلسة التحقق. ابدأ تسجيل الدخول من جديد.')
      return
    }
    const request =
      context === 'register'
        ? {
            action: 'register_verify',
            payload: { otp, state_token: flow.stateToken },
          }
        : context === 'recover'
          ? {
              action: 'recover_check_otp',
              payload: { phone, otp, state_token: flow.stateToken },
            }
          : {
              action: 'verify_new_device_otp',
              payload: {
                otp,
                remember: flow.remember,
                state_token: flow.stateToken,
              },
            }
    setIsLoading(true)
    const finishOperation = beginOperation()
    try {
      const response = await authApiRequest(request.action, request.payload)
      if (response.status !== 'success') {
        throw new Error(response.message || 'رمز التحقق غير صحيح.')
      }
      if (response.state_token) flow.setStateToken(response.state_token)
      if (context === 'register') {
        flow.setIdentifier(phone)
        if (response.token) {
          await finishLogin({ token: response.token }, applySelectedStorefrontTheme)
          toast.success('تم تفعيل متجرك وتسجيل الدخول بنجاح.')
          return
        }
        flow.clearFlow()
        toast.success('تم تفعيل رقمك. سجّل الدخول إلى متجرك.')
        await navigate({ to: '/sign-in', replace: true })
      } else if (context === 'recover') {
        setIsResettingPassword(true)
        otpForm.reset()
      } else {
        await finishLogin(response)
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'تعذر الاتصال بالخادم.'
      )
      otpForm.setValue('otp', '')
    } finally {
      setIsLoading(false)
      finishOperation()
    }
  }

  async function resendOtp() {
    if (!context) return
    let action: string
    let payload: Record<string, unknown>
    if (context === 'register') {
      if (!flow.registration) {
        toast.error('بيانات التسجيل غير متاحة. ابدأ إنشاء المتجر من جديد.')
        return
      }
      action = 'register_init'
      payload = flow.registration
    } else if (context === 'recover') {
      action = 'recover_init'
      payload = { phone }
    } else {
      action = 'resend_device_otp'
      payload = {}
    }

    setIsLoading(true)
    const finishOperation = beginOperation()
    try {
      const response = await authApiRequest(action, payload)
      if (
        !['success_otp_sent', 'success', 'new_device_otp_required'].includes(
          response.status
        )
      ) {
        throw new Error(response.message || 'تعذر إعادة إرسال الرمز.')
      }
      if (response.state_token) flow.setStateToken(response.state_token)
      setRemainingSeconds(context === 'login_otp' ? 300 : 120)
      otpForm.reset()
      toast.success('تم إرسال رمز تحقق جديد.')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'تعذر الاتصال بالخادم.'
      )
    } finally {
      setIsLoading(false)
      finishOperation()
    }
  }

  async function onPasswordSubmit(values: z.infer<typeof passwordSchema>) {
    setIsLoading(true)
    const finishOperation = beginOperation()
    try {
      const response = await authApiRequest('recover_set_password', {
        password: values.password,
        state_token: flow.stateToken,
      })
      if (response.status !== 'success') {
        throw new Error(response.message || 'تعذر تحديث كلمة المرور.')
      }
      flow.clearFlow()
      toast.success('تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.')
      await navigate({ to: '/sign-in', replace: true })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'تعذر الاتصال بالخادم.'
      )
    } finally {
      setIsLoading(false)
      finishOperation()
    }
  }

  if (!context) {
    return (
      <div className='grid gap-4 text-center' dir='rtl'>
        <p className='text-sm text-muted-foreground'>
          لا توجد عملية تحقق نشطة. ارجع إلى صفحة تسجيل الدخول وابدأ من جديد.
        </p>
        <Button asChild>
          <Link to='/sign-in'>العودة لتسجيل الدخول</Link>
        </Button>
      </div>
    )
  }

  if (isResettingPassword) {
    return (
      <Form {...passwordForm}>
        <form
          onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
          className={cn('grid gap-3', className)}
          dir='rtl'
          {...props}
        >
          <FormField
            control={passwordForm.control}
            name='password'
            render={({ field }) => (
              <FormItem>
                <FormLabel>كلمة المرور الجديدة</FormLabel>
                <FormControl>
                  <PasswordInput
                    autoComplete='new-password'
                    placeholder='8 أحرف على الأقل'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={passwordForm.control}
            name='confirmPassword'
            render={({ field }) => (
              <FormItem>
                <FormLabel>تأكيد كلمة المرور</FormLabel>
                <FormControl>
                  <PasswordInput
                    autoComplete='new-password'
                    placeholder='أعد إدخال كلمة المرور'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button disabled={isLoading}>
            {isLoading && <Loader2 className='animate-spin' />}
            حفظ كلمة المرور
          </Button>
        </form>
      </Form>
    )
  }

  return (
    <Form {...otpForm}>
      <form
        onSubmit={otpForm.handleSubmit(onOtpSubmit)}
        className={cn('grid gap-3', className)}
        dir='rtl'
        {...props}
      >
        <FormField
          control={otpForm.control}
          name='otp'
          render={({ field }) => (
            <FormItem>
              <FormLabel>رمز التحقق</FormLabel>
              <FormControl>
                <Input
                  autoComplete='one-time-code'
                  inputMode='numeric'
                  maxLength={6}
                  placeholder='••••••'
                  dir='ltr'
                  className='text-center text-xl tracking-[0.5em]'
                  {...field}
                  onChange={(event) =>
                    field.onChange(
                      event.target.value.replace(/\D/g, '').slice(0, 6)
                    )
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className='mt-2' disabled={isLoading}>
          {isLoading ? <Loader2 className='animate-spin' /> : null}
          تأكيد الرمز
        </Button>
        <div className='text-center text-sm text-muted-foreground'>
          {remainingSeconds > 0 ? (
            <span>إعادة إرسال الرمز خلال {timerLabel}</span>
          ) : (
            <Button
              type='button'
              variant='link'
              onClick={resendOtp}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className='animate-spin' /> : <RotateCw />}
              إعادة إرسال الرمز
            </Button>
          )}
        </div>
      </form>
    </Form>
  )
}
