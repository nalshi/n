export const MAX_SAVED_MERCHANT_ACCOUNTS = 3

const ACCOUNTS_STORAGE_KEY = 'nalsh_saved_merchant_accounts_v1'

export interface SavedMerchantAccount {
  id: string
  identifier: string
  label: string
  token: string
  expiresAt: number
}

type TokenClaims = Record<string, unknown>

function decodeToken(token: string): TokenClaims | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const claims: unknown = JSON.parse(atob(padded))
    return typeof claims === 'object' &&
      claims !== null &&
      !Array.isArray(claims)
      ? (claims as TokenClaims)
      : null
  } catch {
    return null
  }
}

function readStoredAccounts(): SavedMerchantAccount[] {
  const stored = localStorage.getItem(ACCOUNTS_STORAGE_KEY)
  if (!stored) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    throw new Error(
      'تعذر قراءة الحسابات المحفوظة. أزل بيانات الحسابات من هذا الجهاز ثم سجّل الدخول مجدداً.'
    )
  }

  if (!Array.isArray(parsed)) {
    throw new Error('تنسيق الحسابات المحفوظة غير صالح.')
  }

  const isSavedAccount = (
    account: unknown
  ): account is SavedMerchantAccount => {
    if (typeof account !== 'object' || account === null) return false
    const record = account as Record<string, unknown>
    return (
      typeof record.id === 'string' &&
      typeof record.identifier === 'string' &&
      typeof record.label === 'string' &&
      typeof record.token === 'string' &&
      typeof record.expiresAt === 'number' &&
      Number.isFinite(record.expiresAt)
    )
  }

  if (
    parsed.length > MAX_SAVED_MERCHANT_ACCOUNTS ||
    !parsed.every(isSavedAccount)
  ) {
    throw new Error('بيانات الحسابات المحفوظة غير صالحة أو تتجاوز حد 3 حسابات.')
  }
  return parsed
}

function writeStoredAccounts(accounts: SavedMerchantAccount[]) {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts))
}

export function getActiveMerchantToken(): string {
  return (
    localStorage.getItem('merchant_token') ||
    sessionStorage.getItem('merchant_token') ||
    ''
  )
}

export function getMerchantIdentityFromToken(token: string): string {
  const claims = decodeToken(token)
  const id =
    claims?.user_id ?? claims?.accountNo ?? claims?.merchant_id ?? claims?.sub
  return typeof id === 'string' || typeof id === 'number' ? String(id) : ''
}

export function getMerchantAccountName(token: string): string {
  const claims = decodeToken(token)
  const name = [
    claims?.store_name,
    claims?.storeName,
    claims?.merchant_name,
    claims?.merchantName,
    claims?.display_name,
    claims?.name,
  ].find(
    (value): value is string => typeof value === 'string' && !!value.trim()
  )

  return name?.trim() || ''
}

export function getMerchantAccountAvatarUrl(
  token: string,
  cachedAvatar = ''
): string {
  const claims = decodeToken(token)
  const images = [
    cachedAvatar,
    claims?.store_logo,
    claims?.logo_url,
    claims?.picture,
    claims?.avatar_url,
    claims?.photo_url,
    claims?.profile_image,
  ].filter(
    (value): value is string => typeof value === 'string' && !!value.trim()
  )

  for (const image of images) {
    try {
      const url = new URL(image.trim(), window.location.origin)
      if (url.protocol === 'https:' || url.origin === window.location.origin) {
        return url.href
      }
    } catch {
      continue
    }
  }

  return ''
}

export function getSavedMerchantAccounts(): SavedMerchantAccount[] {
  const now = Date.now()
  const accounts = readStoredAccounts()
  const active = accounts.filter((account) => account.expiresAt > now)
  if (active.length !== accounts.length) writeStoredAccounts(active)
  return active
}

export function saveMerchantAccount(
  token: string,
  identifier: string,
  label = ''
): SavedMerchantAccount {
  const claims = decodeToken(token)
  if (!claims || typeof claims.exp !== 'number') {
    throw new Error('تعذر حفظ الحساب: رمز الجلسة غير صالح أو بلا تاريخ انتهاء.')
  }

  const accountId =
    getMerchantIdentityFromToken(token) ||
    String(claims.email || identifier).trim()
  if (!accountId) {
    throw new Error('تعذر تحديد هوية حساب التاجر لحفظه على هذا الجهاز.')
  }

  const accounts = getSavedMerchantAccounts()
  const existingIndex = accounts.findIndex(
    (account) => account.id === accountId
  )
  if (existingIndex === -1 && accounts.length >= MAX_SAVED_MERCHANT_ACCOUNTS) {
    throw new Error(
      'وصلت إلى الحد الأقصى وهو 3 حسابات محفوظة. أزل حساباً من هذا الجهاز أولاً.'
    )
  }

  const account: SavedMerchantAccount = {
    id: accountId,
    identifier: identifier.trim(),
    label:
      label.trim() ||
      (typeof claims.email === 'string' ? claims.email : identifier.trim()),
    token,
    expiresAt: claims.exp * 1000,
  }
  if (existingIndex === -1) accounts.push(account)
  else accounts[existingIndex] = account
  writeStoredAccounts(accounts)
  return account
}

export function removeSavedMerchantAccount(token: string): void {
  const accountId = getMerchantIdentityFromToken(token)
  const accounts = getSavedMerchantAccounts().filter(
    (account) =>
      account.token !== token && (!accountId || account.id !== accountId)
  )
  writeStoredAccounts(accounts)
}

export function removeSavedMerchantAccountById(accountId: string): void {
  writeStoredAccounts(
    getSavedMerchantAccounts().filter((account) => account.id !== accountId)
  )
}
