import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  ArrowLeft,
  BadgeCheck,
  MapPin,
  Phone,
  Plus,
  Trash2,
} from 'lucide-react'
import { getSafeAuthRedirect } from '@/lib/auth-redirect'
import { restoreAuthSession } from '@/lib/complete-auth-session'
import {
  getActiveMerchantToken,
  getMerchantAccountName,
  getSavedMerchantAccounts,
  MAX_SAVED_MERCHANT_ACCOUNTS,
  removeSavedMerchantAccountById,
  type SavedMerchantAccount,
} from '@/lib/merchant-accounts'
import {
  getMerchantDisplayName,
  getMerchantProfile,
} from '@/lib/merchant-profiles'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { MerchantAvatar } from '@/components/merchant-avatar'
import { AuthLayout } from '../auth-layout'
import { TermsDialog } from '../terms-dialog'
import { UserAuthForm } from './components/user-auth-form'

export function SignIn() {
  const { redirect, addAccount } = useSearch({ from: '/(auth)/sign-in' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [savedAccounts, setSavedAccounts] = useState(getSavedMerchantAccounts)
  const activeToken = getActiveMerchantToken()
  const [addingAccount, setAddingAccount] = useState(
    savedAccounts.length === 0 || addAccount === true
  )
  const [accountToRemove, setAccountToRemove] =
    useState<SavedMerchantAccount | null>(null)
  const removingStoreName = accountToRemove
    ? getMerchantDisplayName(
        accountToRemove.id,
        getMerchantAccountName(accountToRemove.token) ||
          accountToRemove.label ||
          accountToRemove.identifier
      )
    : ''

  function resumeAccount(account: SavedMerchantAccount) {
    if (
      !restoreAuthSession(
        account.token,
        true,
        account.identifier,
        getMerchantDisplayName(account.id, account.label)
      )
    ) {
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
    removeSavedMerchantAccountById(account.id)
    setSavedAccounts(getSavedMerchantAccounts())
    setAccountToRemove(null)
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
              <div className='flex items-end justify-between gap-3 pb-1'>
                <div className='grid gap-1'>
                  <h2 className='text-base font-bold'>متاجرك</h2>
                  <p className='text-sm text-muted-foreground'>
                    اختر المتجر الذي تريد إدارته
                  </p>
                </div>
                <span className='shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground tabular-nums'>
                  {savedAccounts.length} من {MAX_SAVED_MERCHANT_ACCOUNTS}
                </span>
              </div>
              {savedAccounts.map((account) => {
                const profile = getMerchantProfile(account.id)
                const cachedStoreName =
                  localStorage
                    .getItem(`merchant_store_name:${account.id}`)
                    ?.trim() || ''
                const storeName =
                  profile.storeName ||
                  cachedStoreName ||
                  getMerchantAccountName(account.token) ||
                  account.label.trim() ||
                  account.identifier

                return (
                  <article
                    key={account.id}
                    className='group flex flex-col gap-4 rounded-xl border border-border/80 bg-background p-4 transition-colors hover:border-primary/35 hover:bg-muted/20 md:flex-row md:items-center md:justify-between'
                  >
                    <div className='flex min-w-0 items-start gap-3'>
                      <MerchantAvatar
                        merchantId={account.id}
                        token={account.token}
                        name={storeName}
                        className='size-11 shrink-0 rounded-lg'
                      />
                      <div className='grid min-w-0 gap-1.5'>
                        <div className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'>
                          <p className='max-w-full truncate text-base leading-6 font-bold'>
                            {storeName}
                          </p>
                          {account.token === activeToken && (
                            <span className='inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary'>
                              <BadgeCheck
                                className='size-3.5'
                                aria-hidden='true'
                              />
                              نشط
                            </span>
                          )}
                        </div>
                        {account.identifier !== profile.phone && (
                          <p
                            className='truncate text-xs text-muted-foreground'
                            dir='ltr'
                          >
                            {account.identifier}
                          </p>
                        )}
                        {profile.phone && (
                          <p
                            className='flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground'
                            dir='ltr'
                          >
                            <Phone
                              className='size-3.5 shrink-0'
                              aria-hidden='true'
                            />
                            <span className='truncate'>{profile.phone}</span>
                          </p>
                        )}
                        {profile.location && (
                          <p className='flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground'>
                            <MapPin
                              className='size-3.5 shrink-0'
                              aria-hidden='true'
                            />
                            <span className='truncate'>{profile.location}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <div className='flex w-full shrink-0 items-center gap-2 border-t pt-3 md:w-auto md:border-t-0 md:pt-0'>
                      <Button
                        type='button'
                        variant='default'
                        size='sm'
                        className='min-h-11 flex-1 md:flex-none'
                        onClick={() => resumeAccount(account)}
                        aria-label={`فتح ${storeName}`}
                      >
                        <ArrowLeft aria-hidden='true' />
                        فتح المتجر
                      </Button>
                      <Button
                        type='button'
                        variant='outline'
                        size='icon'
                        className='size-11 shrink-0 text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive'
                        onClick={() => setAccountToRemove(account)}
                        aria-label={`إزالة ${storeName} من هذا الجهاز`}
                        title='إزالة الحساب من هذا الجهاز'
                      >
                        <Trash2 className='size-4' aria-hidden='true' />
                      </Button>
                    </div>
                  </article>
                )
              })}
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
      <ConfirmDialog
        open={accountToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setAccountToRemove(null)
        }}
        title='إزالة الحساب المحفوظ؟'
        desc={
          accountToRemove
            ? `سيُزال «${removingStoreName}» من قائمة الحسابات المحفوظة على هذا الجهاز. لن يُحذف المتجر أو بياناته.`
            : ''
        }
        confirmText='إزالة الحساب'
        cancelBtnText='إلغاء'
        destructive
        handleConfirm={() => {
          if (accountToRemove) removeAccount(accountToRemove)
        }}
      />
    </AuthLayout>
  )
}
