import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Loader2, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthFlowStore } from '@/stores/auth-flow-store'
import { authApiRequest } from '@/lib/auth-api'
import { getSafeAuthRedirect } from '@/lib/auth-redirect'
import { completeAuthSession } from '@/lib/complete-auth-session'
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

const formSchema = z.object({
  identifier: z.string().min(1, 'أدخل رقم الجوال أو اسم المستخدم.'),
  password: z.string().optional(),
})

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

export function UserAuthForm({
  className,
  redirectTo,
  ...props
}: UserAuthFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<'identifier' | 'password'>('identifier')
  const [displayName, setDisplayName] = useState('')
  const [isPhone, setIsPhone] = useState(false)
  const navigate = useNavigate()
  const flow = useAuthFlowStore()
  const { startIntro, finishIntro, beginOperation } = useDashboardIntro()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      identifier: flow.identifier,
      password: '',
    },
  })

  function normalizePhone(value: string) {
    let phone = value.replace(/\D/g, '')
    if (phone.startsWith('967')) phone = phone.slice(3)
    if (phone.startsWith('0')) phone = phone.slice(1)
    return phone
  }

  async function continueWithIdentifier(identifier: string) {
    const raw = identifier.trim()
    if (!raw) {
      form.setError('identifier', {
        message: 'أدخل رقم الجوال أو اسم المستخدم.',
      })
      return
    }
    const phoneIdentifier = !/\p{L}/u.test(raw)
    const normalized = phoneIdentifier ? normalizePhone(raw) : raw
    if (phoneIdentifier && normalized.length !== 9) {
      form.setError('identifier', {
        message: 'رقم الجوال يجب أن يتكون من 9 أرقام.',
      })
      return
    }

    flow.setIdentifier(normalized)
    setIsPhone(phoneIdentifier)
    setIsLoading(true)
    const finishOperation = beginOperation()
    try {
      if (phoneIdentifier) {
        const response = await authApiRequest('check_phone', {
          phone: normalized,
        })
        if (response.status === 'user_not_found') {
          await navigate({ to: '/sign-up', search: { phone: normalized } })
          return
        }
        if (response.status === 'multiple_users_found') {
          const merchantAccount = response.accounts?.merchant
          if (!merchantAccount) {
            throw new Error(
              'هذا الرقم لا يملك حساب تاجر. استخدم بوابة المندوب لتسجيل الدخول.'
            )
          }
          setDisplayName(merchantAccount.name || '')
        } else {
          if (response.status !== 'user_found') {
            throw new Error(response.message || 'تعذر التحقق من رقم الجوال.')
          }
          setDisplayName(response.name || '')
        }
      } else {
        setDisplayName(normalized)
      }
      setStep('password')
      form.clearErrors()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'تعذر الاتصال بالخادم.'
      )
    } finally {
      setIsLoading(false)
      finishOperation()
    }
  }

  async function onSubmit(data: z.infer<typeof formSchema>) {
    if (step !== 'password') {
      await continueWithIdentifier(data.identifier)
      return
    }
    if (!data.password) {
      form.setError('password', { message: 'أدخل كلمة المرور.' })
      return
    }

    setIsLoading(true)
    startIntro()
    try {
      const response = await authApiRequest('login', {
        phone: flow.identifier,
        password: data.password,
        remember: true,
        role: 'merchant',
      })
      if (response.status === 'new_device_otp_required') {
        finishIntro()
        flow.beginFlow({
          context: 'login_otp',
          phone: flow.identifier,
          stateToken: response.state_token || '',
          remember: true,
          redirectTo: getSafeAuthRedirect(redirectTo),
        })
        await navigate({ to: '/otp' })
        return
      }
      if (response.status !== 'success' || !response.token) {
        throw new Error(response.message || 'تعذر تسجيل الدخول.')
      }

      completeAuthSession(response.token, true, flow.identifier, displayName)

      await navigate({
        to: getSafeAuthRedirect(redirectTo),
        replace: true,
      })
    } catch (error) {
      form.setValue('password', '')
      finishIntro()
      toast.error(
        error instanceof Error ? error.message : 'تعذر الاتصال بالخادم.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-4', className)}
        dir='rtl'
        aria-busy={isLoading}
        {...props}
      >
        <FormField
          control={form.control}
          name='identifier'
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                رقم الجوال أو اسم المستخدم
                <span className='ms-1 text-destructive' aria-hidden='true'>
                  *
                </span>
              </FormLabel>
              <FormControl>
                <Input
                  className='h-11 bg-background'
                  aria-required='true'
                  autoComplete='username'
                  disabled={isLoading}
                  placeholder='أدخل رقم الجوال أو اسم المستخدم'
                  dir='auto'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {step !== 'identifier' && (
          <>
            <FormField
              control={form.control}
              name='password'
              render={({ field }) => (
                <FormItem>
                  <div className='flex items-center justify-between gap-2'>
                    <FormLabel>
                      {displayName
                        ? `كلمة المرور لـ ${displayName}`
                        : 'كلمة المرور'}
                      <span
                        className='ms-1 text-destructive'
                        aria-hidden='true'
                      >
                        *
                      </span>
                    </FormLabel>
                    {isPhone && (
                      <Link
                        to='/forgot-password'
                        className='text-sm font-medium text-muted-foreground hover:text-primary'
                      >
                        نسيت كلمة المرور؟
                      </Link>
                    )}
                  </div>
                  <FormControl>
                    <PasswordInput
                      className='h-11'
                      inputClassName='h-11 bg-background'
                      aria-required='true'
                      autoComplete='current-password'
                      placeholder='أدخل كلمة المرور'
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
        <div className='grid grid-cols-2 gap-3'>
          {step !== 'identifier' && (
            <Button
              type='button'
              variant='outline'
              className='h-11'
              disabled={isLoading}
              onClick={() => {
                setStep('identifier')
                form.setValue('password', '')
              }}
            >
              رجوع
            </Button>
          )}
          <Button
            className={cn(
              'h-11',
              step === 'identifier' && 'col-span-2',
              step !== 'identifier' && 'col-start-2'
            )}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className='animate-spin' aria-hidden='true' />
            ) : step === 'identifier' ? (
              <ArrowLeft />
            ) : (
              <LogIn />
            )}
            {isLoading
              ? step === 'identifier'
                ? 'جارٍ التحقق...'
                : 'جارٍ تسجيل الدخول...'
              : step === 'identifier'
                ? 'متابعة'
                : 'تسجيل الدخول'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
