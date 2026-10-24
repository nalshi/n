import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApiRequest } from '@/lib/auth-api'
import { compressDashboardImage } from '@/features/dashboard/dashboard-data'
import {
  fetchStoreLogoSettings,
  fetchStoreSettings,
  logoutMerchant,
  saveAiAssistantSettings,
  saveStoreLogoConfig,
  saveMerchantSettings,
  saveWhatsappSettings,
  updateStoreLogoConfig,
  uploadStoreLogo,
} from './store-settings-data'

vi.mock('@/features/dashboard/dashboard-data', () => ({
  compressDashboardImage: vi.fn(),
}))

vi.mock('@/lib/auth-api', () => ({
  authApiRequest: vi.fn(),
}))

const mockedAuthApiRequest = vi.mocked(authApiRequest)
const mockedCompressDashboardImage = vi.mocked(compressDashboardImage)

describe('store settings data', () => {
  beforeEach(() => {
    mockedAuthApiRequest.mockReset()
    mockedCompressDashboardImage.mockReset()
  })

  it('loads merchant, assistant, and WhatsApp settings', async () => {
    mockedAuthApiRequest.mockImplementation(async (action) => {
      if (action === 'get_merchant_settings') {
        return {
          status: 'success',
          data: {
            store_name: 'متجر نالش',
            store_type: 'fashion',
            username: '@nalsh',
            settings: JSON.stringify({
              phone: '+967 700 000 000',
              welcome_message: 'أهلاً بكم',
              free_shipping_enabled: 'true',
              free_shipping_type: 'item_count',
              free_shipping_threshold: '3',
              push_notifications: true,
            }),
          },
        }
      }
      if (action === 'get_ai_assistant_config') {
        return {
          status: 'success',
          data: {
            ai_enabled: 1,
            bot_name: 'سلمى',
            tone: 'friendly',
            custom_rules: ['قاعدة أولى', 'قاعدة ثانية'],
          },
        }
      }
      if (action === 'get_whatsapp_config') {
        return {
          status: 'success',
          data: {
            enabled: true,
            phone_number_id: '12345',
            has_access_token: true,
            access_token_masked: '****abcd',
            display_phone_number: '+967700000000',
            webhook_url: 'https://example.test/hook',
            verify_token: 'verify',
          },
        }
      }
      return { status: 'error', message: 'طلب غير معروف' }
    })

    await expect(fetchStoreSettings()).resolves.toEqual({
      merchant: {
        storeName: 'متجر نالش',
        storeType: 'fashion',
        phone: '+967 700 000 000',
        welcomeMessage: 'أهلاً بكم',
        freeShippingEnabled: true,
        freeShippingType: 'item_count',
        freeShippingThreshold: 3,
        pushNotifications: true,
        username: 'nalsh',
      },
      assistant: {
        enabled: true,
        botName: 'سلمى',
        tone: 'friendly',
        customRules: ['قاعدة أولى', 'قاعدة ثانية'],
      },
      whatsapp: {
        enabled: true,
        phoneNumberId: '12345',
        hasAccessToken: true,
        accessTokenMasked: '****abcd',
        displayPhoneNumber: '+967700000000',
        webhookUrl: 'https://example.test/hook',
        verifyToken: 'verify',
      },
    })
  })

  it('loads the current store logo and icon from the storefront configuration', async () => {
    mockedAuthApiRequest.mockImplementation(async (action) => {
      if (action === 'get_storefront_config') {
        return {
          status: 'success',
          data: {
            config: {
              store_identity: {
                store_name: 'متجر نالش',
                logo_url: 'https://cdn.jsdelivr.net/gh/owner/repo/logo.webp',
              },
              navigation_settings: {
                top_bar: { logo_icon: 'fa-gem' },
              },
            },
          },
        }
      }
      if (action === 'get_merchant_settings') {
        return {
          status: 'success',
          data: { username: '@nalsh' },
        }
      }
      return { status: 'error', message: 'طلب غير معروف' }
    })

    await expect(fetchStoreLogoSettings()).resolves.toMatchObject({
      username: 'nalsh',
      logoUrl: 'https://cdn.jsdelivr.net/gh/owner/repo/logo.webp',
      icon: 'fa-gem',
    })
  })

  it('updates logo URL and a validated icon without dropping other storefront settings', async () => {
    const config = {
      store_identity: { store_name: 'متجري', logo_url: 'old-logo' },
      navigation_settings: {
        top_bar: { logo_icon: 'fa-store', show_search_btn: false },
      },
      theme_name: 'nalsh_indigo',
    }

    expect(
      updateStoreLogoConfig(
        config,
        'https://cdn.jsdelivr.net/gh/owner/repo/logo.webp',
        'fa-gem'
      )
    ).toEqual({
      store_identity: {
        store_name: 'متجري',
        logo_url: 'https://cdn.jsdelivr.net/gh/owner/repo/logo.webp',
        logo: 'https://cdn.jsdelivr.net/gh/owner/repo/logo.webp',
      },
      navigation_settings: {
        top_bar: {
          logo_icon: 'fa-gem',
          show_search_btn: false,
          show_logo_icon: true,
        },
      },
      theme_name: 'nalsh_indigo',
    })
    expect(() =>
      updateStoreLogoConfig(config, '', 'fa-store" onerror="bad')
    ).toThrow('أيقونة الشعار المحددة غير صالحة.')
  })

  it('keeps the uploaded GitHub image when the fallback icon changes', () => {
    const logoUrl =
      'https://cdn.jsdelivr.net/gh/owner/repo@main/images/nalsh/store-logo.webp'
    const config = {
      store_identity: { store_name: 'متجري', logo_url: logoUrl, logo: logoUrl },
      navigation_settings: {
        top_bar: { logo_icon: 'fa-store', show_logo_icon: true },
      },
    }

    expect(updateStoreLogoConfig(config, logoUrl, 'fa-gem')).toEqual({
      store_identity: {
        store_name: 'متجري',
        logo_url: logoUrl,
        logo: logoUrl,
      },
      navigation_settings: {
        top_bar: { logo_icon: 'fa-gem', show_logo_icon: true },
      },
    })
  })

  it('turns the logo back on when an icon is selected after image removal', () => {
    const config = {
      store_identity: { store_name: 'متجري', logo_url: '', logo: '' },
      navigation_settings: {
        top_bar: { logo_icon: 'fa-store', show_logo_icon: false },
      },
    }

    expect(updateStoreLogoConfig(config, '', 'fa-gem')).toMatchObject({
      store_identity: { logo_url: '', logo: '' },
      navigation_settings: {
        top_bar: { logo_icon: 'fa-gem', show_logo_icon: true },
      },
    })
  })

  it('uploads the compressed image to GitHub and accepts only its public CDN URL', async () => {
    const sourceImage = new File(
      [
        Uint8Array.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x00,
        ]),
      ],
      'logo.png',
      { type: 'image/png' }
    )
    const compressedImage = new File(['webp image'], 'logo.webp', {
      type: 'image/webp',
    })
    const cdnUrl =
      'https://cdn.jsdelivr.net/gh/owner/repo@main/images/nalsh/store-logo.webp'
    const onUploadProgress = vi.fn()
    mockedCompressDashboardImage.mockResolvedValueOnce(compressedImage)
    mockedAuthApiRequest.mockResolvedValueOnce({
      status: 'success',
      url: cdnUrl,
    })

    await expect(uploadStoreLogo(sourceImage, onUploadProgress)).resolves.toBe(
      cdnUrl
    )
    expect(mockedCompressDashboardImage).toHaveBeenCalledWith(
      sourceImage,
      0.8,
      1024
    )
    expect(mockedAuthApiRequest).toHaveBeenCalledWith(
      'upload_store_logo',
      expect.any(FormData),
      onUploadProgress
    )
  })

  it('publishes logo settings through the authenticated storefront action', async () => {
    mockedAuthApiRequest.mockResolvedValueOnce({
      status: 'success',
      message: 'تم نشر الشعار',
    })

    await expect(
      saveStoreLogoConfig('nalsh', { store_identity: { logo_url: '' } })
    ).resolves.toBe('تم نشر الشعار')
    expect(mockedAuthApiRequest).toHaveBeenCalledWith(
      'save_storefront_config',
      {
        config: { store_identity: { logo_url: '' } },
        merchant_username: 'nalsh',
      }
    )
  })

  it('saves merchant profile and shipping settings using the legacy payload', async () => {
    mockedAuthApiRequest.mockResolvedValueOnce({
      status: 'success',
      message: 'تم الحفظ',
    })

    await expect(
      saveMerchantSettings({
        storeName: 'متجري',
        storeType: 'fashion',
        phone: '+967 700',
        welcomeMessage: 'أهلاً',
        freeShippingEnabled: true,
        freeShippingType: 'order_value',
        freeShippingThreshold: 15000,
        pushNotifications: false,
        username: 'merchant',
      })
    ).resolves.toBe('تم الحفظ')

    expect(mockedAuthApiRequest).toHaveBeenCalledWith(
      'save_merchant_settings',
      {
        storeName: 'متجري',
        storeType: 'fashion',
        settings: {
          welcome_message: 'أهلاً',
          free_shipping_enabled: true,
          free_shipping_type: 'order_value',
          free_shipping_threshold: 15000,
          push_notifications: false,
        },
      }
    )
  })

  it('saves assistant rules and validates rule limits', async () => {
    mockedAuthApiRequest.mockResolvedValueOnce({ status: 'success' })
    await expect(
      saveAiAssistantSettings({
        enabled: true,
        botName: 'سلمى',
        tone: 'friendly',
        customRules: [' قاعدة ', 'قاعدة أخرى'],
      })
    ).resolves.toBe('')
    expect(mockedAuthApiRequest).toHaveBeenCalledWith(
      'save_ai_assistant_config',
      {
        ai_enabled: true,
        bot_name: 'سلمى',
        tone: 'friendly',
        custom_rules: ['قاعدة', 'قاعدة أخرى'],
      }
    )

    await expect(
      saveAiAssistantSettings({
        enabled: false,
        botName: 'مساعد',
        tone: 'formal',
        customRules: ['س'.repeat(201)],
      })
    ).rejects.toThrow('يجب ألا يتجاوز طول كل قاعدة 200 حرف.')
  })

  it('saves WhatsApp credentials without overwriting a token left blank', async () => {
    mockedAuthApiRequest.mockResolvedValueOnce({ status: 'success' })
    await expect(
      saveWhatsappSettings(
        {
          enabled: true,
          phoneNumberId: '12345',
          hasAccessToken: true,
          accessTokenMasked: '****abcd',
          displayPhoneNumber: '+967700',
          webhookUrl: '',
          verifyToken: '',
        },
        ''
      )
    ).resolves.toBe('')
    expect(mockedAuthApiRequest).toHaveBeenCalledWith('save_whatsapp_config', {
      enabled: true,
      phone_number_id: '12345',
      access_token: '',
      display_phone_number: '+967700',
    })
  })

  it('requires a Phone Number ID before enabling WhatsApp', async () => {
    await expect(
      saveWhatsappSettings(
        {
          enabled: true,
          phoneNumberId: '',
          hasAccessToken: false,
          accessTokenMasked: '',
          displayPhoneNumber: '',
          webhookUrl: '',
          verifyToken: '',
        },
        ''
      )
    ).rejects.toThrow('أدخل Phone Number ID أولاً.')
    expect(mockedAuthApiRequest).not.toHaveBeenCalled()
  })

  it('sends server logout before clearing the client session', async () => {
    mockedAuthApiRequest.mockResolvedValueOnce({ status: 'success' })
    await expect(logoutMerchant()).resolves.toBeUndefined()
    expect(mockedAuthApiRequest).toHaveBeenCalledWith('logout', {})
  })
})
