import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authApiRequest } from '@/lib/auth-api'
import { buildSelectedConfig } from './storefront-config'
import {
  fetchStorefrontMerchantSettings,
  fetchStorefrontLibrary,
  loadStorefrontThemeConfig,
  mergeStorefrontConfig,
  saveStorefrontConfig,
  type StorefrontTheme,
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

    const [library, merchantSettings] = await Promise.all([
      fetchStorefrontLibrary(),
      fetchStorefrontMerchantSettings(),
    ])
    expect(library).toMatchObject({
      themes: [
        {
          id: 'celestial_saffron',
          name: 'شمس سماوية',
          preview: { primary: '#A16207' },
        },
      ],
    })
    expect(merchantSettings).toMatchObject({
      username: 'my_store',
      storeName: 'متجري',
      phone: '+967 700 000 000',
      selectedThemeId: 'celestial_saffron',
      selectedMode: 'light',
    })
    // Verify worker get_storefront_themes was NOT called
    expect(mockedAuthApiRequest).not.toHaveBeenCalledWith(
      'get_storefront_themes',
      expect.anything()
    )
  })

  it('loads all source themes without waiting for merchant API requests', async () => {
    const ids = [
      'celestial_saffron',
      'dragonfire_ruby',
      'enchanted_emerald',
      'faerie_rose',
      'moonlit_amethyst',
      'nebula_sapphire',
      'oceanic_mirage',
      'starlit_aurora',
    ]
    const catalog = {
      version: 3,
      count: ids.length,
      items: ids.map((id) => ({
        id,
        name: id,
        sourceFile: `/templates/themes/${id}.json`,
        preview: {
          primary: '#123456',
          accent: '#234567',
          background: '#FFFFFF',
        },
      })),
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => catalog,
    } as Response)
    const library = await fetchStorefrontLibrary()
    expect(library.themes.map((theme) => theme.id)).toEqual(ids)
    expect(mockedAuthApiRequest).not.toHaveBeenCalled()
  })

  it('reports merchant API failures without affecting the theme catalog query', async () => {
    mockedAuthApiRequest.mockRejectedValue(new Error('API unavailable'))

    const merchantSettings = await fetchStorefrontMerchantSettings()
    expect(merchantSettings.merchantError).toContain('API unavailable')
    expect(merchantSettings.username).toBe('')
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

    await expect(fetchStorefrontLibrary()).rejects.toThrow(
      'تعذر قراءة ملف المتجر'
    )
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
    const fullConfig = {
      light_theme: { colors: { primary: '#A16207' } },
      dark_theme: { colors: { primary: '#FCD34D' } },
      shapes: { button_style: 'pill', card_style: 'glass' },
      typography: { font_family: 'Tajawal', heading_weight: 800 },
      navigation_settings: {
        top_bar: { style: 'floating' },
        bottom_bar: { enabled: true, layout: 'icons' },
      },
      products_settings: {
        portrait: { image_ratio: '4:5' },
        landscape: { columns: 3 },
      },
      assistant: { enabled: true, name: 'مساعد المتجر' },
      custom_settings: { nested: { retained: true } },
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.includes('/templates/themes/celestial_saffron.json')) {
        return {
          ok: true,
          json: async () => ({
            id: 'celestial_saffron',
            config: fullConfig,
          }),
        } as Response
      }
      return { ok: false, status: 404 } as Response
    })

    await expect(loadStorefrontThemeConfig(theme)).resolves.toEqual(fullConfig)
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

  it('preserves full theme settings and existing merchant settings when building a selection', () => {
    const theme: StorefrontTheme = {
      id: 'starlit_aurora',
      name: 'شفق النجوم',
      description: '',
      category: 'خيال ونجوم',
      sourceFile: '/templates/themes/starlit_aurora.json',
      preview: {
        primary: '#6D28D9',
        accent: '#0891B2',
        background: '#F7F4FF',
        dark: {
          primary: '#C4B5FD',
          accent: '#67E8F9',
          background: '#10091F',
        },
      },
    }
    const config = buildSelectedConfig(
      {
        store_identity: { store_name: 'اسمي القديم', slogan: 'شعار قديم' },
        modes: {
          light: { custom: 'light-preserved', colors: { primary: '#111111' } },
          dark: { custom: 'dark-preserved', colors: { primary: '#222222' } },
        },
        navigation_settings: { bottom_bar: { enabled: false, custom: true } },
        products_settings: { landscape: { columns: 2 } },
      },
      {
        assistant: { enabled: true, name: 'مساعد الثيم' },
        light_theme: { colors: { primary: '#6D28D9' } },
        dark_theme: { colors: { primary: '#C4B5FD' } },
        modes: {
          light: {
            custom: 'light-preserved',
            colors: { primary: '#6D28D9' },
          },
          dark: {
            custom: 'dark-preserved',
            colors: { primary: '#C4B5FD' },
          },
        },
        shapes: { button_style: 'pill', card_style: 'glass' },
        typography: { font_family: 'Tajawal', heading_weight: 800 },
        navigation_settings: {
          top_bar: { style: 'floating' },
          bottom_bar: { enabled: true, layout: 'icons' },
        },
        products_settings: {
          portrait: { image_ratio: '4:5' },
          landscape: { columns: 3 },
        },
        custom_theme_settings: { nested: { preserved: true } },
      },
      theme,
      'dark',
      { storeName: 'متجري', phone: '+967700000000', slogan: 'أهلاً بكم' }
    )

    expect(config).toMatchObject({
      default_theme_mode: 'dark',
      theme_name: 'starlit_aurora',
      theme_selection: { light: 'starlit_aurora', dark: 'starlit_aurora' },
      store_identity: { store_name: 'متجري', slogan: 'أهلاً بكم' },
      light_theme: { colors: { primary: '#6D28D9' } },
      dark_theme: { colors: { primary: '#C4B5FD' } },
      shapes: { button_style: 'pill', card_style: 'glass' },
      typography: { font_family: 'Tajawal', heading_weight: 800 },
      navigation_settings: {
        top_bar: { style: 'floating' },
        bottom_bar: { enabled: true, layout: 'icons', custom: true },
      },
      products_settings: {
        portrait: { image_ratio: '4:5' },
        landscape: { columns: 3 },
      },
      custom_theme_settings: { nested: { preserved: true } },
      assistant: {
        enabled: true,
        name: 'مساعد الثيم',
        accent_color: '#C4B5FD',
      },
      marketing: {
        whatsapp_floating: { phone: '+967700000000', enabled: true },
      },
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
