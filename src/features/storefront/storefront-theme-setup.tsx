import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Check,
  LoaderCircle,
  Moon,
  Palette,
  RefreshCw,
  Sun,
} from 'lucide-react'
import { toast } from 'sonner'
import { getActiveMerchantToken } from '@/lib/merchant-accounts'
import { Button } from '@/components/ui/button'
import { AuthLayout } from '@/features/auth/auth-layout'
import { buildSelectedConfig, type ThemeMode } from './storefront-config'
import {
  fetchStorefrontLibrary,
  fetchStorefrontMerchantSettings,
  loadBaseStorefrontConfig,
  loadStorefrontThemeConfig,
  saveStorefrontConfig,
  type StorefrontMerchantSettings,
  type StorefrontTheme,
} from './storefront-data'
import {
  hasPendingStorefrontThemeSetupForToken,
  hasPendingStorefrontThemeSetupForUsername,
  markStorefrontThemeSetupPending,
  STOREFRONT_THEME_SETUP_PENDING_KEY,
} from './storefront-onboarding'

export function StorefrontThemeSetup() {
  const navigate = useNavigate()
  const [themes, setThemes] = useState<StorefrontTheme[]>([])
  const [merchant, setMerchant] = useState<StorefrontMerchantSettings | null>(
    null
  )
  const [selectedThemeId, setSelectedThemeId] = useState('')
  const [mode, setMode] = useState<ThemeMode>('light')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true

    Promise.all([fetchStorefrontLibrary(), fetchStorefrontMerchantSettings()])
      .then(([library, settings]) => {
        if (!settings.username) {
          throw new Error(
            settings.merchantError || 'تعذر تحديد حساب المتجر الحالي.'
          )
        }
        if (library.themes.length === 0) {
          throw new Error('لا توجد قوالب متاحة حاليًا. أعد المحاولة لاحقًا.')
        }
        const pendingMarker = sessionStorage.getItem(
          STOREFRONT_THEME_SETUP_PENDING_KEY
        )
        if (
          (pendingMarker?.startsWith('username:') &&
            !hasPendingStorefrontThemeSetupForUsername(settings.username)) ||
          (pendingMarker?.startsWith('merchant:') &&
            !hasPendingStorefrontThemeSetupForToken(getActiveMerchantToken()))
        ) {
          void navigate({ to: '/', replace: true })
          return
        }
        if (!active) return
        if (pendingMarker?.startsWith('username:')) {
          markStorefrontThemeSetupPending(
            getActiveMerchantToken(),
            settings.username
          )
        }
        setThemes(library.themes)
        setMerchant(settings)
      })
      .catch((error: unknown) => {
        if (!active) return
        setLoadError(
          error instanceof Error ? error.message : 'تعذر تحميل قوالب المتجر.'
        )
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [navigate, reloadKey])

  const selectedTheme = themes.find((theme) => theme.id === selectedThemeId)

  async function applySelectedTheme() {
    if (!selectedTheme || !merchant || isSaving) return
    setIsSaving(true)
    setSaveError('')

    try {
      const [baseConfig, themeConfig] = await Promise.all([
        loadBaseStorefrontConfig(merchant.config),
        loadStorefrontThemeConfig(selectedTheme),
      ])
      const config = buildSelectedConfig(
        baseConfig,
        themeConfig,
        selectedTheme,
        mode,
        {
          storeName: merchant.storeName,
          phone: merchant.phone,
          slogan: merchant.slogan,
        }
      )
      await saveStorefrontConfig(merchant.username, config)
      sessionStorage.removeItem(STOREFRONT_THEME_SETUP_PENDING_KEY)
      toast.success('تم اعتماد قالب متجرك.')
      await navigate({ to: '/', replace: true })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'تعذر حفظ قالب المتجر.'
      setSaveError(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AuthLayout>
      <div
        className='mx-auto w-full max-w-5xl space-y-6 font-[Cairo]'
        dir='rtl'
      >
        <header className='flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between'>
          <div className='max-w-2xl'>
            <div className='mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary'>
              <Check className='size-3.5' aria-hidden='true' />
              اكتمل إنشاء الحساب
            </div>
            <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
              اختر قالب متجرك
            </h1>
            <p className='mt-2 text-sm leading-7 text-muted-foreground'>
              اختر المظهر الذي يناسب نشاطك، ثم اعتمده لفتح لوحة التحكم.
            </p>
          </div>
          <div className='flex w-fit items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs font-medium text-foreground'>
            <span className='grid size-6 place-items-center rounded-full bg-primary text-primary-foreground'>
              <Check className='size-3.5' aria-hidden='true' />
            </span>
            <span>الخطوة ٢ من ٢</span>
          </div>
        </header>

        <section aria-labelledby='theme-selection-title' className='space-y-5'>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <h2 id='theme-selection-title' className='text-lg font-semibold'>
                قوالب المتجر
              </h2>
              <p className='mt-1 text-sm text-muted-foreground'>
                اختيار قالب مطلوب لإكمال إعداد حسابك.
              </p>
            </div>
            <div
              role='group'
              aria-label='وضع المتجر'
              className='inline-flex w-fit rounded-lg border bg-muted/40 p-1'
            >
              {(['light', 'dark'] as const).map((themeMode) => (
                <button
                  key={themeMode}
                  type='button'
                  aria-pressed={mode === themeMode}
                  onClick={() => setMode(themeMode)}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                    mode === themeMode
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {themeMode === 'light' ? (
                    <Sun className='size-4' aria-hidden='true' />
                  ) : (
                    <Moon className='size-4' aria-hidden='true' />
                  )}
                  {themeMode === 'light' ? 'فاتح' : 'داكن'}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div
              role='status'
              className='flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border bg-card text-sm text-muted-foreground'
            >
              <LoaderCircle
                className='size-5 animate-spin'
                aria-hidden='true'
              />
              <span>جاري تحميل قوالب المتجر...</span>
            </div>
          ) : loadError ? (
            <div
              role='alert'
              className='flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between'
            >
              <p className='text-sm leading-6 text-foreground'>{loadError}</p>
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  setIsLoading(true)
                  setLoadError('')
                  setReloadKey((key) => key + 1)
                }}
              >
                <RefreshCw aria-hidden='true' />
                إعادة المحاولة
              </Button>
            </div>
          ) : (
            <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
              {themes.map((theme) => {
                const isSelected = selectedThemeId === theme.id
                const preview =
                  mode === 'dark' ? theme.preview.dark : theme.preview

                return (
                  <button
                    key={theme.id}
                    type='button'
                    aria-label={`اختيار قالب ${theme.name}`}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedThemeId(theme.id)
                      setSaveError('')
                    }}
                    className={`group overflow-hidden rounded-xl border bg-card text-start transition-[border-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div
                      className='p-3'
                      style={{ backgroundColor: preview.background }}
                    >
                      <div
                        className='overflow-hidden rounded-lg border border-black/10 p-3'
                        style={{
                          backgroundColor: preview.card || preview.background,
                          color: preview.text || '#0f172a',
                        }}
                      >
                        <div className='flex items-center justify-between gap-2'>
                          <span className='inline-flex items-center gap-2 text-xs font-semibold'>
                            <Palette
                              className='size-4'
                              style={{ color: preview.primary }}
                              aria-hidden='true'
                            />
                            {theme.name}
                          </span>
                          {isSelected && (
                            <span className='grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground'>
                              <Check className='size-4' aria-hidden='true' />
                            </span>
                          )}
                        </div>
                        <div
                          className='mt-3 flex h-16 items-end rounded-md p-2'
                          style={{
                            background: `linear-gradient(120deg, ${preview.primary}, ${preview.accent})`,
                          }}
                        >
                          <span className='rounded bg-white/90 px-2 py-1 text-[10px] font-bold text-slate-900'>
                            واجهة المتجر
                          </span>
                        </div>
                        <div className='mt-2 grid grid-cols-3 gap-2'>
                          {[
                            preview.primary,
                            preview.accent,
                            preview.background,
                          ].map((color, index) => (
                            <span
                              key={`${theme.id}-${index}`}
                              className='h-2 rounded-full'
                              style={{ backgroundColor: color }}
                              aria-hidden='true'
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className='flex min-h-16 items-center justify-between gap-3 px-4 py-3'>
                      <span className='min-w-0'>
                        <span className='block truncate text-sm font-semibold text-foreground'>
                          {theme.name}
                        </span>
                        <span className='mt-1 block truncate text-xs text-muted-foreground'>
                          {theme.description || theme.category || 'قالب متجر'}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 text-xs font-semibold ${
                          isSelected ? 'text-primary' : 'text-muted-foreground'
                        }`}
                      >
                        {isSelected ? 'تم الاختيار' : 'اختيار القالب'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <footer className='flex flex-col gap-3 border-t border-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between'>
          <p className='text-sm text-muted-foreground'>
            {selectedTheme
              ? `القالب المحدد: ${selectedTheme.name} — الوضع ${mode === 'light' ? 'الفاتح' : 'الداكن'}`
              : 'حدد قالبًا للمتابعة إلى لوحة التحكم.'}
          </p>
          <Button
            type='button'
            className='min-h-11 w-full sm:w-auto'
            disabled={
              !selectedTheme || isLoading || Boolean(loadError) || isSaving
            }
            onClick={() => void applySelectedTheme()}
          >
            {isSaving ? (
              <LoaderCircle className='animate-spin' aria-hidden='true' />
            ) : (
              <Check aria-hidden='true' />
            )}
            اعتماد القالب والدخول إلى لوحة التحكم
          </Button>
        </footer>
        {saveError && (
          <p role='alert' className='text-sm text-destructive'>
            {saveError}
          </p>
        )}
      </div>
    </AuthLayout>
  )
}
