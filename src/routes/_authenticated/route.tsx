import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { restoreAuthSession } from '@/lib/complete-auth-session'
import {
  getActiveMerchantToken,
  removeSavedMerchantAccount,
} from '@/lib/merchant-accounts'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'
import { hasPendingStorefrontThemeSetupForToken } from '@/features/storefront/storefront-onboarding'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    const localToken = localStorage.getItem('merchant_token')
    const sessionToken = sessionStorage.getItem('merchant_token')
    const token = localToken || sessionToken

    if (token && restoreAuthSession(token, Boolean(localToken))) {
      if (
        hasPendingStorefrontThemeSetupForToken(token) &&
        location.pathname !== '/storefront-setup'
      ) {
        throw redirect({ to: '/storefront-setup', replace: true })
      }
      return
    }

    if (token) removeSavedMerchantAccount(getActiveMerchantToken())
    useAuthStore.getState().auth.reset()
    throw redirect({
      to: '/sign-in',
      search: { redirect: location.href },
    })
  },
  component: AuthenticatedLayout,
})
