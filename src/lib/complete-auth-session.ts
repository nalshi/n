import { useAuthStore } from '@/stores/auth-store'
import { clearAuthApiCache } from '@/lib/auth-api'
import { saveMerchantAccount } from '@/lib/merchant-accounts'

function decodeToken(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

export function completeAuthSession(
  token: string,
  remember: boolean,
  fallbackIdentifier: string,
  displayName = ''
) {
  clearAuthApiCache()
  if (remember) {
    saveMerchantAccount(token, fallbackIdentifier, displayName)
  }
  if (remember) {
    localStorage.setItem('merchant_token', token)
    sessionStorage.removeItem('merchant_token')
  } else {
    sessionStorage.setItem('merchant_token', token)
    localStorage.removeItem('merchant_token')
  }

  const claims = decodeToken(token)
  const tokenRole = claims?.role
  useAuthStore.getState().auth.setUser({
    accountNo: String(claims?.accountNo || claims?.user_id || ''),
    email: String(claims?.email || fallbackIdentifier),
    role: Array.isArray(tokenRole)
      ? tokenRole.filter((role): role is string => typeof role === 'string')
      : [typeof tokenRole === 'string' ? tokenRole : 'merchant'],
    exp:
      typeof claims?.exp === 'number'
        ? claims.exp * 1000
        : Date.now() + 24 * 60 * 60 * 1000,
  })
  useAuthStore.getState().auth.setAccessToken(token)
}

export function restoreAuthSession(
  token: string,
  remember: boolean,
  fallbackIdentifier = '',
  displayName = ''
) {
  const claims = decodeToken(token)
  if (
    !claims ||
    typeof claims.exp !== 'number' ||
    claims.exp * 1000 - 60_000 < Date.now()
  ) {
    return false
  }
  completeAuthSession(token, remember, fallbackIdentifier, displayName)
  return true
}
