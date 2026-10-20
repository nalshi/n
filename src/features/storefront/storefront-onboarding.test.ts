import { beforeEach, describe, expect, it } from 'vitest'
import {
  hasPendingStorefrontThemeSetupForToken,
  hasPendingStorefrontThemeSetupForUsername,
  markStorefrontThemeSetupPending,
  STOREFRONT_THEME_SETUP_PENDING_KEY,
} from './storefront-onboarding'

function token(claims: Record<string, unknown>) {
  return `header.${btoa(JSON.stringify(claims))}.signature`
}

describe('storefront theme onboarding', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('keeps the required theme step scoped to the account that registered', () => {
    const firstAccount = token({ user_id: 'merchant-1' })
    const secondAccount = token({ user_id: 'merchant-2' })

    markStorefrontThemeSetupPending(firstAccount, 'shop-one')

    expect(sessionStorage.getItem(STOREFRONT_THEME_SETUP_PENDING_KEY)).toBe(
      'merchant:merchant-1'
    )
    expect(hasPendingStorefrontThemeSetupForToken(firstAccount)).toBe(true)
    expect(hasPendingStorefrontThemeSetupForToken(secondAccount)).toBe(false)
  })

  it('uses the new account username when verification has not returned a token', () => {
    markStorefrontThemeSetupPending('', '@shop-one')

    expect(hasPendingStorefrontThemeSetupForUsername('shop-one')).toBe(true)
    expect(hasPendingStorefrontThemeSetupForUsername('shop-two')).toBe(false)
  })
})
