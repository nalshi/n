import { Link, useSearch } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { SignUpForm } from './components/sign-up-form'

export function SignUp() {
  const { phone } = useSearch({ from: '/(auth)/sign-up' })

  return (
    <AuthLayout>
      <Card className='mx-auto w-full max-w-2xl gap-0 overflow-hidden py-0 font-[Cairo]'>
        <CardHeader className='px-5 pt-6 pb-4 sm:px-7 sm:pt-8 sm:pb-5'>
          <CardTitle className='text-2xl tracking-tight sm:text-3xl'>
            أنشئ متجرك
          </CardTitle>
          <CardDescription className='text-sm leading-7'>
            أدخل بيانات المتجر ورقم جوالك للبدء. لديك متجر بالفعل؟{' '}
            <Link
              to='/sign-in'
              className='font-semibold text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary'
            >
              تسجيل الدخول
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className='px-5 pb-6 sm:px-7 sm:pb-7'>
          <SignUpForm initialPhone={phone} />
        </CardContent>
        <CardFooter className='border-t bg-muted/20 px-5 py-4 sm:px-7 sm:py-5'>
          <p className='w-full text-center text-xs leading-6 text-muted-foreground'>
            بعد تأكيد رقم الجوال ستختار قالب واجهة متجرك.
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
