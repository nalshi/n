import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { STOREFRONT_THEME_SETUP_PENDING_KEY } from './storefront-onboarding'
import { StorefrontThemeSetup } from './storefront-theme-setup'

const {
  navigate,
  fetchLibraryMock,
  fetchMerchantSettingsMock,
  loadBaseConfigMock,
  loadThemeConfigMock,
  saveConfigMock,
} = vi.hoisted(() => ({
  navigate: vi.fn(),
  fetchLibraryMock: vi.fn(),
  fetchMerchantSettingsMock: vi.fn(),
  loadBaseConfigMock: vi.fn(),
  loadThemeConfigMock: vi.fn(),
  saveConfigMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', async (orig) => {
  const actual = await orig<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('@/features/storefront/storefront-data', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/features/storefront/storefront-data')
    >()
  return {
    ...actual,
    fetchStorefrontLibrary: fetchLibraryMock,
    fetchStorefrontMerchantSettings: fetchMerchantSettingsMock,
    loadBaseStorefrontConfig: loadBaseConfigMock,
    loadStorefrontThemeConfig: loadThemeConfigMock,
    saveStorefrontConfig: saveConfigMock,
  }
})

describe('StorefrontThemeSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.removeItem('merchant_token')
    sessionStorage.setItem(STOREFRONT_THEME_SETUP_PENDING_KEY, 'true')
    fetchLibraryMock.mockResolvedValue({
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
    fetchMerchantSettingsMock.mockResolvedValue({
      config: { store_identity: { store_name: 'متجر الاختبار' } },
      username: 'test_store',
      storeName: 'متجر الاختبار',
      phone: '771234567',
      slogan: '',
      selectedThemeId: '',
      selectedMode: '',
      merchantError: '',
    })
    loadBaseConfigMock.mockResolvedValue({
      store_identity: { store_name: 'متجر الاختبار' },
    })
    loadThemeConfigMock.mockResolvedValue({ shapes: { button_style: 'pill' } })
    saveConfigMock.mockResolvedValue('تم حفظ القالب.')
  })

  it('requires a theme and saves the selected theme before continuing', async () => {
    const screen = await render(<StorefrontThemeSetup />)
    const continueButton = screen.getByRole('button', {
      name: 'اعتماد القالب والدخول إلى لوحة التحكم',
    })

    await expect.element(continueButton).toBeDisabled()
    const themeButton = screen.getByRole('button', {
      name: 'اختيار قالب Velvet Luxe',
    })
    await userEvent.click(themeButton)
    await expect.element(continueButton).toBeEnabled()

    await userEvent.click(
      screen.getByRole('button', { name: 'داكن', exact: true })
    )
    await userEvent.click(continueButton)

    await vi.waitFor(() =>
      expect(saveConfigMock).toHaveBeenCalledWith(
        'test_store',
        expect.objectContaining({
          theme_name: 'velvet_luxe',
          default_theme_mode: 'dark',
          theme_selection: { light: 'velvet_luxe', dark: 'velvet_luxe' },
        })
      )
    )
    expect(
      sessionStorage.getItem(STOREFRONT_THEME_SETUP_PENDING_KEY)
    ).toBeNull()
    expect(navigate).toHaveBeenCalledWith({ to: '/', replace: true })
  })

  it('scopes username-based onboarding to the verified merchant account', async () => {
    const payload = btoa(JSON.stringify({ user_id: 123 }))
    localStorage.setItem('merchant_token', `header.${payload}.signature`)
    sessionStorage.setItem(
      STOREFRONT_THEME_SETUP_PENDING_KEY,
      'username:test_store'
    )

    await render(<StorefrontThemeSetup />)

    await vi.waitFor(() =>
      expect(sessionStorage.getItem(STOREFRONT_THEME_SETUP_PENDING_KEY)).toBe(
        'merchant:123'
      )
    )
  })

  it('shows a recovery action when storefront settings cannot load', async () => {
    fetchMerchantSettingsMock.mockResolvedValue({
      username: '',
      merchantError: 'تعذر تحميل بيانات المتجر.',
    })

    const screen = await render(<StorefrontThemeSetup />)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('تعذر تحميل بيانات المتجر.')
    await expect
      .element(screen.getByRole('button', { name: 'إعادة المحاولة' }))
      .toBeInTheDocument()
  })
})
