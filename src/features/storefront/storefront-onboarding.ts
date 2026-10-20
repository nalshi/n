import { getMerchantIdentityFromToken } from '@/lib/merchant-accounts'

export const STOREFRONT_THEME_SETUP_PENDING_KEY =
  'nalsh-storefront-theme-setup-pending'

export function markStorefrontThemeSetupPending(
  token: string,
  username: string
) {
  const merchantId = getMerchantIdentityFromToken(token)
  const normalizedUsername = username.trim().replace(/^@/, '').toLowerCase()
  const marker = merchantId
    ? `merchant:${merchantId}`
    : normalizedUsername
      ? `username:${normalizedUsername}`
      : ''

  if (marker) {
    sessionStorage.setItem(STOREFRONT_THEME_SETUP_PENDING_KEY, marker)
  }
}

export function hasPendingStorefrontThemeSetupForToken(token: string) {
  const marker = sessionStorage.getItem(STOREFRONT_THEME_SETUP_PENDING_KEY)
  if (!marker?.startsWith('merchant:')) return false
  return marker === `merchant:${getMerchantIdentityFromToken(token)}`
}

export function hasPendingStorefrontThemeSetupForUsername(username: string) {
  const marker = sessionStorage.getItem(STOREFRONT_THEME_SETUP_PENDING_KEY)
  const normalizedUsername = username.trim().replace(/^@/, '').toLowerCase()
  return Boolean(
    normalizedUsername && marker === `username:${normalizedUsername}`
  )
}

export function hasPendingStorefrontThemeSetup() {
  const marker = sessionStorage.getItem(STOREFRONT_THEME_SETUP_PENDING_KEY)
  return Boolean(marker?.startsWith('username:'))
}
