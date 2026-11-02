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
      <Card className='auth-form-card mx-auto w-full max-w-2xl gap-0 border-0 bg-transparent py-0 shadow-none'>
        <CardHeader className='gap-3 px-0 pt-2 pb-5'>
          <CardTitle className='text-2xl tracking-tight sm:text-3xl'>
            أنشئ متجرك
          </CardTitle>
          <CardDescription className='max-w-prose text-sm leading-7'>
            أدخل بيانات المتجر ورقم جوالك للبدء. لديك متجر بالفعل؟{' '}
            <Link
              to='/sign-in'
              className='font-bold text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary'
            >
              تسجيل الدخول
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className='px-0 pb-5'>
          <SignUpForm initialPhone={phone} />
        </CardContent>
        <CardFooter className='border-0 bg-transparent px-0 pt-4 pb-0'>
          <p className='w-full text-center text-xs leading-6 text-muted-foreground'>
            بعد تأكيد رقم الجوال ستختار قالب واجهة متجرك.
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
