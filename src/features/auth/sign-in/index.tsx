import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeft, Plus, Store, Trash2 } from 'lucide-react'
import { getSafeAuthRedirect } from '@/lib/auth-redirect'
import { restoreAuthSession } from '@/lib/complete-auth-session'
import {
  getActiveMerchantToken,
  getSavedMerchantAccounts,
  MAX_SAVED_MERCHANT_ACCOUNTS,
  removeSavedMerchantAccountById,
  type SavedMerchantAccount,
} from '@/lib/merchant-accounts'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { TermsDialog } from '../terms-dialog'
import { UserAuthForm } from './components/user-auth-form'

export function SignIn() {
  const { redirect } = useSearch({ from: '/(auth)/sign-in' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [savedAccounts, setSavedAccounts] = useState(getSavedMerchantAccounts)
  const activeToken = getActiveMerchantToken()
  const [addingAccount, setAddingAccount] = useState(savedAccounts.length === 0)

  function resumeAccount(account: SavedMerchantAccount) {
    if (!restoreAuthSession(account.token, true, account.identifier)) {
      removeSavedMerchantAccountById(account.id)
      setSavedAccounts(getSavedMerchantAccounts())
      return
    }

    queryClient.clear()
    void navigate({
      to: getSafeAuthRedirect(redirect),
      replace: true,
    })
  }

  function removeAccount(account: SavedMerchantAccount) {
    if (account.token === activeToken) return
    removeSavedMerchantAccountById(account.id)
    setSavedAccounts(getSavedMerchantAccounts())
  }

  return (
    <AuthLayout>
      <Card className='mx-auto w-full max-w-xl gap-0 overflow-hidden py-0 font-[Cairo]'>
        <CardHeader className='gap-2 px-5 pt-6 pb-4 sm:px-7 sm:pt-8 sm:pb-5'>
          <CardTitle className='text-2xl tracking-tight sm:text-3xl'>
            مرحبًا بعودتك
          </CardTitle>
          <CardDescription className='text-sm leading-7'>
            {savedAccounts.length > 0 && !addingAccount
              ? 'اختر حساب التاجر المحفوظ للمتابعة، أو أضف حساباً آخر على هذا الجهاز.'
              : 'سجّل الدخول لمتابعة متجرك وطلباته. ليس لديك متجر بعد؟ '}
            {(savedAccounts.length === 0 || addingAccount) && (
              <Link
                to='/sign-up'
                className='font-semibold text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary'
              >
                أنشئ متجرًا جديدًا
              </Link>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='px-5 pb-6 sm:px-7 sm:pb-7'>
          {savedAccounts.length > 0 && !addingAccount ? (
            <div className='grid gap-3' dir='rtl'>
              <p className='text-xs text-muted-foreground'>
                الحسابات المحفوظة: {savedAccounts.length} من{' '}
                {MAX_SAVED_MERCHANT_ACCOUNTS}
              </p>
              {savedAccounts.map((account) => (
                <div
                  key={account.id}
                  className='flex items-center gap-3 rounded-lg border bg-card p-3'
                >
                  <span className='flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
                    <Store className='size-5' aria-hidden='true' />
                  </span>
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-semibold'>
                      {account.label}
                    </p>
                    <p
                      className='truncate text-xs text-muted-foreground'
                      dir='ltr'
                    >
                      {account.identifier}
                    </p>
                    {account.token === activeToken && (
                      <p className='mt-1 text-xs font-medium text-primary'>
                        الجلسة النشطة
                      </p>
                    )}
                  </div>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => resumeAccount(account)}
                    aria-label={`الدخول إلى حساب ${account.label}`}
                  >
                    <ArrowLeft aria-hidden='true' />
                    دخول
                  </Button>
                  {account.token !== activeToken && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      onClick={() => removeAccount(account)}
                      aria-label={`إزالة ${account.label} من هذا الجهاز`}
                    >
                      <Trash2 className='size-4' aria-hidden='true' />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type='button'
                variant='outline'
                className='mt-1'
                disabled={savedAccounts.length >= MAX_SAVED_MERCHANT_ACCOUNTS}
                onClick={() => setAddingAccount(true)}
              >
                <Plus aria-hidden='true' />
                {savedAccounts.length >= MAX_SAVED_MERCHANT_ACCOUNTS
                  ? 'وصلت إلى الحد الأقصى للحسابات'
                  : 'إضافة حساب تاجر'}
              </Button>
            </div>
          ) : (
            <div className='grid gap-4'>
              {savedAccounts.length > 0 && (
                <Button
                  type='button'
                  variant='ghost'
                  className='justify-self-start'
                  onClick={() => setAddingAccount(false)}
                >
                  <ArrowLeft aria-hidden='true' />
                  العودة إلى الحسابات المحفوظة
                </Button>
              )}
              {savedAccounts.length < MAX_SAVED_MERCHANT_ACCOUNTS ? (
                <UserAuthForm redirectTo={redirect} />
              ) : (
                <p className='text-sm text-muted-foreground'>
                  وصلت إلى الحد الأقصى. أزل حساباً غير نشط من القائمة قبل إضافة
                  حساب جديد.
                </p>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className='border-t bg-muted/20 px-5 py-4 sm:px-7 sm:py-5'>
          <p className='w-full text-center text-xs leading-6 text-muted-foreground'>
            باستخدامك المنصة فإنك توافق على <TermsDialog />.
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
