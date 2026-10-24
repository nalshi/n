import { describe, expect, it } from 'vitest'
import { buildSelectedConfig } from './storefront-config'
import type { StorefrontTheme } from './storefront-data'

describe('buildSelectedConfig', () => {
  it('preserves the merchant logo and icon when changing storefront themes', () => {
    const base = {
      store_identity: {
        store_name: 'متجر نالش',
        logo: 'https://cdn.jsdelivr.net/gh/owner/repo/logo.webp',
        logo_url: 'https://cdn.jsdelivr.net/gh/owner/repo/logo.webp',
      },
      navigation_settings: {
        top_bar: {
          logo_icon: 'fa-gem',
          show_search_btn: false,
        },
      },
    }
    const themeConfig = {
      store_identity: {
        store_name: 'اسم القالب',
        logo: '',
        logo_url: '',
      },
      navigation_settings: {
        top_bar: {
          logo_icon: 'fa-store',
          show_search_btn: true,
        },
      },
    }
    const theme: StorefrontTheme = {
      id: 'oceanic_mirage',
      name: 'محيط',
      description: '',
      category: '',
      sourceFile: '',
      preview: {
        primary: '#123456',
        accent: '#234567',
        background: '#FFFFFF',
        dark: {
          primary: '#123456',
          accent: '#234567',
          background: '#111111',
        },
      },
    }

    const config = buildSelectedConfig(base, themeConfig, theme, 'light', {
      storeName: 'متجر نالش',
      phone: '',
      slogan: '',
    })

    expect(config.store_identity).toMatchObject({
      store_name: 'متجر نالش',
      logo: 'https://cdn.jsdelivr.net/gh/owner/repo/logo.webp',
      logo_url: 'https://cdn.jsdelivr.net/gh/owner/repo/logo.webp',
    })
    expect(config.navigation_settings).toMatchObject({
      top_bar: {
        logo_icon: 'fa-gem',
        show_search_btn: true,
      },
    })
  })
})
