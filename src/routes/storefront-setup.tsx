import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { restoreAuthSession } from '@/lib/complete-auth-session'
import {
  getActiveMerchantToken,
  removeSavedMerchantAccount,
} from '@/lib/merchant-accounts'
import {
  hasPendingStorefrontThemeSetup,
  hasPendingStorefrontThemeSetupForToken,
} from '@/features/storefront/storefront-onboarding'
import { StorefrontThemeSetup } from '@/features/storefront/storefront-theme-setup'

export const Route = createFileRoute('/storefront-setup')({
  beforeLoad: ({ location }) => {
    const localToken = localStorage.getItem('merchant_token')
    const sessionToken = sessionStorage.getItem('merchant_token')
    const token = localToken || sessionToken

    if (token && restoreAuthSession(token, Boolean(localToken))) {
      if (
        hasPendingStorefrontThemeSetupForToken(token) ||
        hasPendingStorefrontThemeSetup()
      ) {
        return
      }
      throw redirect({ to: '/', replace: true })
    }

    if (token) removeSavedMerchantAccount(getActiveMerchantToken())
    useAuthStore.getState().auth.reset()
    throw redirect({
      to: '/sign-in',
      search: { redirect: location.href },
    })
  },
  component: StorefrontThemeSetup,
})
