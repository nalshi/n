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
      <Card className='auth-form-card mx-auto w-full max-w-md gap-0 border-0 bg-transparent py-0 shadow-none'>
        <CardHeader className='gap-3 px-0 pt-2 pb-5'>
          <CardTitle className='text-2xl tracking-tight sm:text-3xl'>
            {context === 'login_otp' ? 'تأكيد الجهاز' : 'رمز التحقق'}
          </CardTitle>
          <CardDescription className='text-sm leading-7'>
            أدخل الرمز المكوّن من 6 أرقام الذي أرسلناه إلى رقم جوالك
            {context === 'recover' ? '، ثم اختر كلمة مرور جديدة.' : '.'}
          </CardDescription>
        </CardHeader>
        <CardContent className='px-0 pb-5'>
          <OtpForm />
        </CardContent>
        <CardFooter className='border-0 bg-transparent px-0 pt-4 pb-0'>
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
