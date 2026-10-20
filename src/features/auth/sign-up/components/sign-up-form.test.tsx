import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { useAuthFlowStore } from '@/stores/auth-flow-store'
import { SignUpForm } from './sign-up-form'

const { navigate, apiRequestMock, startIntro, setIntroReady, fetchThemesMock } =
  vi.hoisted(() => ({
    navigate: vi.fn(),
    apiRequestMock: vi.fn(),
    startIntro: vi.fn(),
    setIntroReady: vi.fn(),
    fetchThemesMock: vi.fn(),
  }))

vi.mock('@/lib/auth-api', () => ({ authApiRequest: apiRequestMock }))
vi.mock('@/features/storefront/storefront-data', () => ({
  fetchStorefrontLibrary: fetchThemesMock,
}))
vi.mock('@/components/layout/dashboard-intro-context', () => ({
  useDashboardIntro: () => ({ startIntro, setIntroReady }),
}))
vi.mock('@tanstack/react-router', async (orig) => {
  const actual = await orig<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigate }
})

describe('SignUpForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setIntroReady.mockClear()
    fetchThemesMock.mockResolvedValue({
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
    useAuthFlowStore.setState({
      identifier: '',
      phone: '',
      context: null,
      stateToken: '',
      remember: true,
      redirectTo: '/',
      storeName: '',
      storefrontThemeId: '',
      registration: null,
    })
    apiRequestMock.mockResolvedValue({
      status: 'success_otp_sent',
      state_token: 'register-state',
    })
  })

  it('renders the merchant registration fields', async () => {
    const screen = await render(<SignUpForm />)
    const phoneField = screen.getByRole('textbox', {
      name: 'رقم الجوال (للواتساب والطلبات)',
    })
    await expect.element(phoneField).toHaveAttribute('aria-required', 'true')
    expect(screen.getByRole('checkbox')).toHaveAttribute(
      'aria-required',
      'true'
    )
    await expect
      .element(screen.getByRole('button', { name: 'إنشاء المتجر' }))
      .toBeInTheDocument()
  })

  it('previews both color modes without selecting the theme', async () => {
    const screen = await render(<SignUpForm />)
    const selectThemeButton = screen.getByRole('button', {
      name: 'اختيار قالب Velvet Luxe',
    })

    await expect
      .element(selectThemeButton)
      .toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'معاينة داكنة' }))

    await expect
      .element(
        screen.getByRole('img', {
          name: 'معاينة قالب Velvet Luxe بالوضع الداكن',
        })
      )
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'معاينة داكنة' }))
      .toHaveAttribute('aria-pressed', 'true')
    await expect
      .element(selectThemeButton)
      .toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(selectThemeButton)
    await expect
      .element(selectThemeButton)
      .toHaveAttribute('aria-pressed', 'true')
  })

  it('allows choosing a storefront theme before registration', async () => {
    const screen = await render(<SignUpForm initialPhone='771234567' />)
    await userEvent.click(
      screen.getByRole('button', { name: 'اختيار قالب Velvet Luxe' })
    )

    await userEvent.fill(
      screen.getByRole('textbox', { name: 'اسم المتجر' }),
      'متجر الاختبار'
    )
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'اسم المستخدم (رابط المتجر)' }),
      'test_store'
    )
    await userEvent.click(screen.getByRole('combobox', { name: 'نوع النشاط' }))
    await userEvent.click(
      screen.getByRole('option', { name: 'مطاعم ومأكولات' })
    )
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'موقع المتجر (Google Maps)' }),
      'https://maps.google.com/test'
    )
    await userEvent.fill(
      screen.getByLabelText('كلمة المرور (8 أحرف على الأقل)'),
      'secret123'
    )
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'إنشاء المتجر' }))

    await vi.waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith('register_init', {
        phone: '771234567',
        role: 'merchant',
        name: 'متجر الاختبار',
        username: 'test_store',
        password: 'secret123',
        location: 'https://maps.google.com/test',
        store_type: 'مطاعم ومأكولات',
        storefront_theme_id: 'velvet_luxe',
      })
    )
  })

  it('starts verification with the complete store registration payload', async () => {
    const screen = await render(<SignUpForm initialPhone='771234567' />)
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'اسم المتجر' }),
      'متجر الاختبار'
    )
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'اسم المستخدم (رابط المتجر)' }),
      'test_store'
    )
    await userEvent.click(screen.getByRole('combobox', { name: 'نوع النشاط' }))
    await userEvent.click(
      screen.getByRole('option', { name: 'مطاعم ومأكولات' })
    )
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'موقع المتجر (Google Maps)' }),
      'https://maps.google.com/test'
    )
    await userEvent.fill(
      screen.getByLabelText('كلمة المرور (8 أحرف على الأقل)'),
      'secret123'
    )
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'إنشاء المتجر' }))

    await vi.waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith('register_init', {
        phone: '771234567',
        role: 'merchant',
        name: 'متجر الاختبار',
        username: 'test_store',
        password: 'secret123',
        location: 'https://maps.google.com/test',
        store_type: 'مطاعم ومأكولات',
      })
    )
    expect(useAuthFlowStore.getState().context).toBe('register')
    expect(useAuthFlowStore.getState().stateToken).toBe('register-state')
    expect(startIntro).toHaveBeenCalledOnce()
    expect(setIntroReady).toHaveBeenCalledWith(true)
    expect(navigate).toHaveBeenCalledWith({ to: '/otp' })
  })
})
