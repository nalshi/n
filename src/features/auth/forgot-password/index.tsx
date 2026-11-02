import { Link } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { ForgotPasswordForm } from './components/forgot-password-form'

export function ForgotPassword() {
  return (
    <AuthLayout>
      <Card className='auth-form-card mx-auto w-full max-w-md gap-0 border-0 bg-transparent py-0 shadow-none'>
        <CardHeader className='gap-3 px-0 pt-2 pb-5'>
          <CardTitle className='text-2xl tracking-tight sm:text-3xl'>
            استعادة كلمة المرور
          </CardTitle>
          <CardDescription>
            أدخل رقم الجوال المسجل في حسابك لإرسال رمز التحقق.
          </CardDescription>
        </CardHeader>
        <CardContent className='px-0 pb-5'>
          <ForgotPasswordForm />
        </CardContent>
        <CardFooter className='border-0 bg-transparent px-0 pt-4 pb-0'>
          <p className='mx-auto text-center text-sm leading-6 text-balance text-muted-foreground'>
            ليس لديك متجر؟{' '}
            <Link
              to='/sign-up'
              className='underline underline-offset-4 hover:text-primary'
            >
              أنشئ متجرك
            </Link>
            .
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
