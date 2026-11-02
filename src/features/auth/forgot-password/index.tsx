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
      <Card className='mx-auto w-full max-w-md gap-0 overflow-hidden rounded-2xl font-[Cairo] sm:rounded-3xl'>
        <CardHeader className='gap-2 px-5 pt-6 pb-4 sm:px-7 sm:pt-8 sm:pb-5'>
          <CardTitle className='text-2xl tracking-tight sm:text-3xl'>
            استعادة كلمة المرور
          </CardTitle>
          <CardDescription>
            أدخل رقم الجوال المسجل في حسابك لإرسال رمز التحقق.
          </CardDescription>
        </CardHeader>
        <CardContent className='px-5 pb-6 sm:px-7 sm:pb-7'>
          <ForgotPasswordForm />
        </CardContent>
        <CardFooter className='border-t bg-muted/20 px-5 py-4 sm:px-7 sm:py-5'>
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
