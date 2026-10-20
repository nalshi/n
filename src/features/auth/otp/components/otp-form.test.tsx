import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { useAuthFlowStore } from '@/stores/auth-flow-store'
import { OtpForm } from './otp-form'

const {
  navigate,
  apiRequestMock,
  completeAuthSessionMock,
  fetchStorefrontLibraryMock,
  loadBaseConfigMock,
  loadThemeConfigMock,
  saveStorefrontConfigMock,
} = vi.hoisted(() => ({
  navigate: vi.fn(),
  apiRequestMock: vi.fn(),
  completeAuthSessionMock: vi.fn(),
  fetchStorefrontLibraryMock: vi.fn(),
  loadBaseConfigMock: vi.fn(),
  loadThemeConfigMock: vi.fn(),
  saveStorefrontConfigMock: vi.fn(),
}))

vi.mock('@/lib/auth-api', () => ({ authApiRequest: apiRequestMock }))
vi.mock('@/lib/complete-auth-session', () => ({
  completeAuthSession: completeAuthSessionMock,
}))
vi.mock('@/features/storefront/storefront-data', () => ({
  fetchStorefrontLibrary: fetchStorefrontLibraryMock,
  loadBaseStorefrontConfig: loadBaseConfigMock,
  loadStorefrontThemeConfig: loadThemeConfigMock,
  saveStorefrontConfig: saveStorefrontConfigMock,
  mergeStorefrontConfig: (
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ) => ({
    ...target,
    ...source,
  }),
}))
vi.mock('@tanstack/react-router', async (orig) => {
  const actual = await orig<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => navigate,
    Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
  }
})

describe('OtpForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchStorefrontLibraryMock.mockResolvedValue({
      themes: [
        {
          id: 'velvet_luxe',
          name: 'Velvet Luxe',
          description: 'قالب فاخر',
          category: 'أزياء',
          sourceFile: '/templates/themes/velvet_luxe.json',
          preview: {
            primary: '#7C3AED',
            accent: '#F59E0B',
            background: '#F8FAFC',
            dark: {
              primary: '#8B5CF6',
              accent: '#FBBF24',
              background: '#0F172A',
            },
          },
        },
      ],
    })
    loadBaseConfigMock.mockResolvedValue({
      store_identity: { store_name: 'متجري' },
    })
    loadThemeConfigMock.mockResolvedValue({
      shapes: { button_style: 'pill' },
    })
    saveStorefrontConfigMock.mockResolvedValue('تم تحديث مظهر المتجر.')
    useAuthFlowStore.setState({
      identifier: '',
      phone: '771234567',
      context: 'register',
      stateToken: 'register-state',
      remember: true,
      redirectTo: '/',
      storeName: '',
      storefrontThemeId: '',
      storefrontThemeMode: 'light',
      registration: null,
    })
    apiRequestMock.mockResolvedValue({ status: 'success' })
  })

  it('validates the six-digit code and activates a registered account', async () => {
    const screen = await render(<OtpForm />)
    const otpInput = screen.getByRole('textbox', { name: 'رمز التحقق' })
    const submit = screen.getByRole('button', { name: 'تأكيد الرمز' })

    await userEvent.fill(otpInput, '12345')
    await userEvent.click(submit)
    await expect
      .element(screen.getByText('أدخل رمز التحقق المكوّن من 6 أرقام.'))
      .toBeInTheDocument()

    await userEvent.fill(otpInput, '123456')
    await userEvent.click(submit)
    await vi.waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith('register_verify', {
        otp: '123456',
        state_token: 'register-state',
      })
    )
    expect(navigate).toHaveBeenCalledWith({
      to: '/sign-in',
      replace: true,
    })
    expect(useAuthFlowStore.getState().context).toBeNull()
  })

  it('applies the selected storefront theme after the merchant registers successfully', async () => {
    useAuthFlowStore.setState({
      phone: '771234567',
      context: 'register',
      stateToken: 'register-state',
      storefrontThemeId: 'velvet_luxe',
      storefrontThemeMode: 'dark',
      registration: {
        phone: '771234567',
        role: 'merchant',
        name: 'متجر الاختبار',
        username: 'test_store',
        password: 'secret123',
        location: 'https://maps.google.com/test',
        store_type: 'مطاعم ومأكولات',
        storefront_theme_id: 'velvet_luxe',
      },
    })
    apiRequestMock.mockResolvedValue({
      status: 'success',
      token: `head.${btoa(JSON.stringify({ exp: 2000000000 }))}.sig`,
    })

    const screen = await render(<OtpForm />)
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'رمز التحقق' }),
      '123456'
    )
    await userEvent.click(screen.getByRole('button', { name: 'تأكيد الرمز' }))

    await vi.waitFor(() =>
      expect(saveStorefrontConfigMock).toHaveBeenCalledWith(
        'test_store',
        expect.objectContaining({ default_theme_mode: 'dark' })
      )
    )
    expect(saveStorefrontConfigMock).toHaveBeenCalledOnce()
  })

  it('switches to the new-password step after recovery verification', async () => {
    useAuthFlowStore.setState({
      context: 'recover',
      stateToken: 'recover-state',
    })
    const screen = await render(<OtpForm />)
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'رمز التحقق' }),
      '123456'
    )
    await userEvent.click(screen.getByRole('button', { name: 'تأكيد الرمز' }))

    await expect
      .element(screen.getByLabelText('كلمة المرور الجديدة'))
      .toBeInTheDocument()
    expect(useAuthFlowStore.getState().context).toBe('recover')
  })

  it('starts the merchant session when registration verification returns a token', async () => {
    apiRequestMock.mockResolvedValue({
      status: 'success',
      token: `head.${btoa(JSON.stringify({ exp: 2000000000 }))}.sig`,
    })

    const screen = await render(<OtpForm />)
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'رمز التحقق' }),
      '123456'
    )
    await userEvent.click(screen.getByRole('button', { name: 'تأكيد الرمز' }))

    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/', replace: true })
    )
    expect(completeAuthSessionMock).toHaveBeenCalledOnce()
    expect(useAuthFlowStore.getState().context).toBeNull()
  })

  it('returns to the originally requested page after login OTP', async () => {
    useAuthFlowStore.setState({
      context: 'login_otp',
      phone: '771234567',
      stateToken: 'login-state',
      redirectTo: '/orders',
    })
    apiRequestMock.mockResolvedValue({
      status: 'success',
      token: `head.${btoa(JSON.stringify({ exp: 2000000000 }))}.sig`,
    })

    const screen = await render(<OtpForm />)
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'رمز التحقق' }),
      '123456'
    )
    await userEvent.click(screen.getByRole('button', { name: 'تأكيد الرمز' }))

    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/orders',
        replace: true,
      })
    )
    expect(completeAuthSessionMock).toHaveBeenCalledOnce()
    expect(useAuthFlowStore.getState().context).toBeNull()
  })
})
