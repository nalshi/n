import { Link } from '@tanstack/react-router'
import { useAuthFlowStore } from '@/stores/auth-flow-store'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { OtpForm } from './components/otp-form'

export function Otp() {
  const context = useAuthFlowStore((state) => state.context)

  return (
    <AuthLayout>
      <Card className='mx-auto w-full max-w-md gap-0 overflow-hidden rounded-2xl border-border/70 bg-card font-[Cairo] shadow-sm'>
        <CardHeader className='gap-2 px-5 pt-6 pb-4 sm:px-7 sm:pt-8 sm:pb-5'>
          <CardTitle className='text-2xl tracking-tight sm:text-3xl'>
            {context === 'login_otp' ? 'تأكيد الجهاز' : 'رمز التحقق'}
          </CardTitle>
          <CardDescription className='text-sm leading-7'>
            أدخل الرمز المكوّن من 6 أرقام الذي أرسلناه إلى رقم جوالك
            {context === 'recover' ? '، ثم اختر كلمة مرور جديدة.' : '.'}
          </CardDescription>
        </CardHeader>
        <CardContent className='px-5 pb-6 sm:px-7 sm:pb-7'>
          <OtpForm />
        </CardContent>
        <CardFooter className='border-t bg-muted/20 px-5 py-4 sm:px-7 sm:py-5'>
          <p className='w-full text-center text-sm leading-6 text-muted-foreground'>
            لم يصلك الرمز؟{' '}
            <Link
              to='/sign-in'
              className='font-medium text-primary underline underline-offset-4'
            >
              العودة لتسجيل الدخول
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
