import { mergeStorefrontConfig, type StorefrontTheme } from './storefront-data'

export type ThemeMode = 'light' | 'dark'
type ConfigRecord = Record<string, unknown>

function record(value: unknown): ConfigRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }
  return value as ConfigRecord
}

export function buildSelectedConfig(
  base: ConfigRecord,
  themeConfig: ConfigRecord,
  theme: StorefrontTheme,
  mode: ThemeMode,
  identity: { storeName: string; phone: string; slogan: string }
): ConfigRecord {
  const config = JSON.parse(JSON.stringify(base)) as ConfigRecord
  const modes = record(config.modes)
  const lightMode = record(modes.light)
  const darkMode = record(modes.dark)
  const lightColors = record(lightMode.colors)
  const darkColors = record(darkMode.colors)
  if (Object.keys(lightColors).length) {
    const lightTheme = record(config.light_theme)
    config.light_theme = { ...lightTheme, colors: { ...lightColors } }
  }
  if (Object.keys(darkColors).length) {
    const darkTheme = record(config.dark_theme)
    config.dark_theme = { ...darkTheme, colors: { ...darkColors } }
  }

  mergeStorefrontConfig(config, themeConfig)

  config.default_theme_mode = mode
  config.theme_name = theme.id
  config.theme_selection = { light: theme.id, dark: theme.id }
  config.theme_display_names = { light: theme.name, dark: theme.name }

  const themeAssistant = record(themeConfig.assistant)
  if (Object.keys(themeAssistant).length) {
    const messages = record(config.messages)
    const existingAssistant = record(messages.ai_assistant)
    config.messages = {
      ...messages,
      ai_assistant: {
        ...existingAssistant,
        ...themeAssistant,
        accent_color:
          mode === 'dark' ? theme.preview.dark.primary : theme.preview.primary,
      },
    }
    config.assistant = {
      ...themeAssistant,
      accent_color:
        mode === 'dark' ? theme.preview.dark.primary : theme.preview.primary,
    }
  }

  const themeNavigation = record(themeConfig.navigation_settings)
  if (Object.keys(themeNavigation).length) {
    const currentNav = record(config.navigation_settings)
    config.navigation_settings = {
      ...currentNav,
      ...themeNavigation,
      bottom_bar: {
        ...record(currentNav.bottom_bar),
        ...record(themeNavigation.bottom_bar),
      },
      top_bar: {
        ...record(currentNav.top_bar),
        ...record(themeNavigation.top_bar),
      },
    }
  }

  const themeShapes = record(themeConfig.shapes)
  if (Object.keys(themeShapes).length) {
    config.shapes = {
      ...record(config.shapes),
      ...themeShapes,
    }
  }

  const themeTypography = record(themeConfig.typography)
  if (Object.keys(themeTypography).length) {
    config.typography = {
      ...record(config.typography),
      ...themeTypography,
    }
  }

  const themeProducts = record(themeConfig.products_settings)
  if (Object.keys(themeProducts).length) {
    const currentProd = record(config.products_settings)
    config.products_settings = {
      ...currentProd,
      ...themeProducts,
      portrait: {
        ...record(currentProd.portrait),
        ...record(themeProducts.portrait),
      },
      landscape: {
        ...record(currentProd.landscape),
        ...record(themeProducts.landscape),
      },
    }
  }

  const currentModes = record(config.modes)
  const currentLightMode = record(currentModes.light)
  const currentDarkMode = record(currentModes.dark)
  const configuredLight = record(config.light_theme)
  const configuredDark = record(config.dark_theme)
  const configuredLightColors = record(configuredLight.colors)
  const configuredDarkColors = record(configuredDark.colors)
  config.modes = {
    ...currentModes,
    ...(Object.keys(configuredLightColors).length
      ? {
          light: {
            ...currentLightMode,
            colors: { ...configuredLightColors },
          },
        }
      : {}),
    ...(Object.keys(configuredDarkColors).length
      ? {
          dark: {
            ...currentDarkMode,
            colors: { ...configuredDarkColors },
          },
        }
      : {}),
  }

  const storeIdentity = record(config.store_identity)
  config.store_identity = {
    ...storeIdentity,
    ...(identity.storeName ? { store_name: identity.storeName } : {}),
    ...(identity.slogan ? { slogan: identity.slogan } : {}),
  }
  if (identity.phone) {
    const marketing = record(config.marketing)
    const floatingWhatsapp = record(marketing.whatsapp_floating)
    config.marketing = {
      ...marketing,
      whatsapp_floating: {
        ...floatingWhatsapp,
        phone: identity.phone,
        enabled: true,
      },
    }
  }
  return config
}
