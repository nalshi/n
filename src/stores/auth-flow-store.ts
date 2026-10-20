import { create } from 'zustand'

export type AuthFlowContext = 'register' | 'recover' | 'login_otp'
export type StorefrontThemeMode = 'light' | 'dark'

export type MerchantRegistration = {
  phone: string
  role: 'merchant'
  name: string
  username: string
  password: string
  location: string
  store_type: string
  storefront_theme_id?: string
}

interface AuthFlowState {
  identifier: string
  phone: string
  context: AuthFlowContext | null
  stateToken: string
  remember: boolean
  redirectTo: string
  storeName: string
  storefrontThemeId: string
  storefrontThemeMode: StorefrontThemeMode
  registration: MerchantRegistration | null
  setIdentifier: (identifier: string) => void
  beginFlow: (input: {
    context: AuthFlowContext
    phone: string
    stateToken: string
    remember?: boolean
    redirectTo?: string
    storeName?: string
    storefrontThemeId?: string
    storefrontThemeMode?: StorefrontThemeMode
    registration?: MerchantRegistration
  }) => void
  setStateToken: (stateToken: string) => void
  clearFlow: () => void
}

export const useAuthFlowStore = create<AuthFlowState>()((set) => ({
  identifier: '',
  phone: '',
  context: null,
  stateToken: '',
  remember: true,
  redirectTo: '/',
  storeName: '',
  storefrontThemeId: '',
  storefrontThemeMode: 'light',
  registration: null,
  setIdentifier: (identifier) => set({ identifier }),
  beginFlow: ({
    context,
    phone,
    stateToken,
    remember,
    redirectTo,
    storeName,
    storefrontThemeId,
    storefrontThemeMode,
    registration,
  }) =>
    set({
      context,
      phone,
      stateToken,
      remember: remember ?? true,
      redirectTo: redirectTo ?? '/',
      storeName: storeName ?? '',
      storefrontThemeId: storefrontThemeId ?? '',
      storefrontThemeMode: storefrontThemeMode ?? 'light',
      registration: registration ?? null,
    }),
  setStateToken: (stateToken) => set({ stateToken }),
  clearFlow: () =>
    set({
      phone: '',
      context: null,
      stateToken: '',
      remember: true,
      redirectTo: '/',
      storeName: '',
      storefrontThemeId: '',
      storefrontThemeMode: 'light',
      registration: null,
    }),
}))
