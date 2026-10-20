import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { restoreAuthSession } from '@/lib/complete-auth-session'
import {
  getActiveMerchantToken,
  getSavedMerchantAccounts,
  MAX_SAVED_MERCHANT_ACCOUNTS,
  removeSavedMerchantAccount,
  saveMerchantAccount,
} from '@/lib/merchant-accounts'
import { SignIn } from '@/features/auth/sign-in'

const searchSchema = z.object({
  redirect: z.string().optional(),
  addAccount: z.boolean().optional(),
})

export const Route = createFileRoute('/(auth)/sign-in')({
  beforeLoad: ({ search }) => {
    if (search.addAccount) return

    const token = getActiveMerchantToken()
    if (!token) return

    const remember = Boolean(localStorage.getItem('merchant_token'))
    if (restoreAuthSession(token, remember)) {
      const savedAccounts = getSavedMerchantAccounts()
      if (
        remember &&
        savedAccounts.length < MAX_SAVED_MERCHANT_ACCOUNTS &&
        !savedAccounts.some((account) => account.token === token)
      ) {
        const user = useAuthStore.getState().auth.user
        saveMerchantAccount(
          token,
          user?.email || user?.accountNo || 'حساب التاجر الحالي',
          user?.email || 'حساب التاجر الحالي'
        )
      }
      return
    }

    removeSavedMerchantAccount(token)
    useAuthStore.getState().auth.reset()
  },
  component: SignIn,
  validateSearch: searchSchema,
})
