import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthFlowStore } from '@/stores/auth-flow-store'
import { authApiRequest } from '@/lib/auth-api'
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

const formSchema = z.object({
  phone: z.string().min(1, 'أدخل رقم الجوال.'),
})

export function ForgotPasswordForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLFormElement>) {
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const flow = useAuthFlowStore()
  const { beginOperation } = useDashboardIntro()
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { phone: flow.identifier },
  })

  async function onSubmit({ phone: value }: z.infer<typeof formSchema>) {
    let phone = value.replace(/\D/g, '')
    if (phone.startsWith('967')) phone = phone.slice(3)
    if (phone.startsWith('0')) phone = phone.slice(1)
    if (phone.length !== 9) {
      form.setError('phone', { message: 'رقم الجوال يجب أن يتكون من 9 أرقام.' })
      return
    }

    setIsLoading(true)
    const finishOperation = beginOperation()
    try {
      const response = await authApiRequest('recover_init', { phone })
      if (response.status !== 'success') {
        throw new Error(response.message || 'تعذر بدء استعادة كلمة المرور.')
      }
      flow.beginFlow({
        context: 'recover',
        phone,
        stateToken: response.state_token || '',
      })
      toast.success('أرسلنا رمز التحقق إلى رقم جوالك.')
      await navigate({ to: '/otp' })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'تعذر الاتصال بالخادم.'
      )
    } finally {
      setIsLoading(false)
      finishOperation()
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-3', className)}
        dir='rtl'
        {...props}
      >
        <FormField
          control={form.control}
          name='phone'
          render={({ field }) => (
            <FormItem>
              <FormLabel>رقم الجوال</FormLabel>
              <FormControl>
                <Input
                  autoComplete='tel'
                  inputMode='tel'
                  placeholder='77XXXXXXX'
                  dir='ltr'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className='mt-2' disabled={isLoading}>
          {isLoading ? <Loader2 className='animate-spin' /> : <ArrowRight />}
          إرسال رمز التحقق
        </Button>
      </form>
    </Form>
  )
}
