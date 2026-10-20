import { create } from 'zustand'

export type AuthFlowContext = 'register' | 'recover' | 'login_otp'

export type MerchantRegistration = {
  phone: string
  role: 'merchant'
  name: string
  username: string
  password: string
  location: string
  store_type: string
}

interface AuthFlowState {
  identifier: string
  phone: string
  context: AuthFlowContext | null
  stateToken: string
  remember: boolean
  redirectTo: string
  storeName: string
  registration: MerchantRegistration | null
  setIdentifier: (identifier: string) => void
  beginFlow: (input: {
    context: AuthFlowContext
    phone: string
    stateToken: string
    remember?: boolean
    redirectTo?: string
    storeName?: string
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
  registration: null,
  setIdentifier: (identifier) => set({ identifier }),
  beginFlow: ({
    context,
    phone,
    stateToken,
    remember,
    redirectTo,
    storeName,
    registration,
  }) =>
    set({
      context,
      phone,
      stateToken,
      remember: remember ?? true,
      redirectTo: redirectTo ?? '/',
      storeName: storeName ?? '',
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
      registration: null,
    }),
}))
