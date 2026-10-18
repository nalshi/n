import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authApiRequest } from '@/lib/auth-api'
import {
  fetchStorefrontLibrary,
  loadStorefrontThemeConfig,
  mergeStorefrontConfig,
  saveStorefrontConfig,
} from './storefront-data'

vi.mock('@/lib/auth-api', () => ({
  authApiRequest: vi.fn(),
}))

const mockedAuthApiRequest = vi.mocked(authApiRequest)

describe('storefront data', () => {
  beforeEach(() => {
    mockedAuthApiRequest.mockReset()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads themes from static storefront files and merchant settings via API', async () => {
    const mockCatalog = {
      items: [
        {
          id: 'celestial_saffron',
          name: 'شمس سماوية',
          description: 'ذهبي مشرق',
          category: 'شمس ودفء',
          sourceFile: '/templates/themes/celestial_saffron.json',
          preview: {
            primary: '#A16207',
            accent: '#0F766E',
            background: '#FFFCF2',
          },
        },
      ],
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.includes('/templates/themes.json')) {
        return {
          ok: true,
          json: async () => mockCatalog,
        } as Response
      }
      return { ok: false, status: 404 } as Response
    })

    mockedAuthApiRequest.mockImplementation(async (action) => {
      if (action === 'get_storefront_config') {
        return {
          status: 'success',
          data: {
            config: {
              theme_name: 'celestial_saffron',
              default_theme_mode: 'light',
            },
          },
        }
      }
      if (action === 'get_merchant_settings') {
        return {
          status: 'success',
          data: {
            username: '@my_store',
            store_name: 'متجري',
            settings: { whatsapp: '+967 700 000 000' },
          },
        }
      }
      return { status: 'error', message: 'طلب غير معروف' }
    })

    const library = await fetchStorefrontLibrary()
    expect(library).toMatchObject({
      username: 'my_store',
      storeName: 'متجري',
      phone: '+967 700 000 000',
      selectedThemeId: 'celestial_saffron',
      selectedMode: 'light',
      themes: [
        {
          id: 'celestial_saffron',
          name: 'شمس سماوية',
          preview: { primary: '#A16207' },
        },
      ],
    })
    // Verify worker get_storefront_themes was NOT called
    expect(mockedAuthApiRequest).not.toHaveBeenCalledWith('get_storefront_themes', expect.anything())
  })

  it('handles storefront static theme file fetch failure properly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
    } as Response)

    mockedAuthApiRequest.mockImplementation(async (action) => {
      if (action === 'get_storefront_config') {
        return { status: 'success', data: { config: {} } }
      }
      if (action === 'get_merchant_settings') {
        return { status: 'success', data: { username: 'demo' } }
      }
      return { status: 'error', message: 'طلب غير معروف' }
    })

    await expect(fetchStorefrontLibrary()).rejects.toThrow('تعذر قراءة ملف المتجر')
  })

  it('loads a theme configuration from static template file', async () => {
    const theme = {
      id: 'celestial_saffron',
      name: 'شمس سماوية',
      description: '',
      category: '',
      sourceFile: '/templates/themes/celestial_saffron.json',
      preview: {
        primary: '#A16207',
        accent: '#0F766E',
        background: '#FFFCF2',
        dark: {
          primary: '#FCD34D',
          accent: '#5EEAD4',
          background: '#1B1407',
        },
      },
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.includes('/templates/themes/celestial_saffron.json')) {
        return {
          ok: true,
          json: async () => ({
            id: 'celestial_saffron',
            config: {
              light_theme: { colors: { primary: '#A16207' } },
            },
          }),
        } as Response
      }
      return { ok: false, status: 404 } as Response
    })

    await expect(loadStorefrontThemeConfig(theme)).resolves.toEqual({
      light_theme: { colors: { primary: '#A16207' } },
    })
  })

  it('uses inline config when available on theme without extra fetch', async () => {
    const theme = {
      id: 'custom_theme',
      name: 'مخصص',
      description: '',
      category: '',
      sourceFile: '',
      preview: {
        primary: '#123456',
        accent: '#06B6D4',
        background: '#F8FAFC',
        dark: {
          primary: '#6D28D9',
          accent: '#0891B2',
          background: '#111827',
        },
      },
      config: {
        custom_key: 'custom_value',
      },
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(loadStorefrontThemeConfig(theme)).resolves.toEqual({
      custom_key: 'custom_value',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('merges nested config while retaining unrelated base storefront settings', () => {
    const base = {
      store_identity: { store_name: 'متجري', slogan: 'أهلاً' },
      light_theme: { colors: { primary: '#111111', accent: '#222222' } },
    }

    expect(
      mergeStorefrontConfig(base, {
        light_theme: { colors: { primary: '#abcdef' } },
      })
    ).toEqual({
      store_identity: { store_name: 'متجري', slogan: 'أهلاً' },
      light_theme: { colors: { primary: '#abcdef', accent: '#222222' } },
    })
  })

  it('saves the selected storefront configuration using the API payload', async () => {
    mockedAuthApiRequest.mockResolvedValueOnce({
      status: 'success',
      message: 'تم النشر',
    })
    const config = { theme_name: 'summer-shop', default_theme_mode: 'dark' }

    await expect(saveStorefrontConfig('my_store', config)).resolves.toBe(
      'تم النشر'
    )
    expect(mockedAuthApiRequest).toHaveBeenCalledWith(
      'save_storefront_config',
      { config, merchant_username: 'my_store' }
    )
  })
})
