import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ExternalLink,
  Eye,
  Moon,
  Palette,
  RefreshCw,
  Search,
  Sun,
} from 'lucide-react'
import { toast } from 'sonner'
import { clearAuthApiCache } from '@/lib/auth-api'
import { useMerchantIdentity } from '@/hooks/useMerchantRealtime'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Main } from '@/components/layout/main'
import {
  MerchantPageHeading,
  MerchantWorkspaceHeader,
} from '@/components/layout/merchant-workspace'
import {
  fetchStorefrontLibrary,
  loadBaseStorefrontConfig,
  loadStorefrontThemeConfig,
  mergeStorefrontConfig,
  storefrontLibraryQueryKey,
  saveStorefrontConfig,
  type StorefrontLibrary,
  type StorefrontTheme,
} from './storefront-data'

type ThemeMode = 'light' | 'dark'
type ConfigRecord = Record<string, unknown>

function record(value: unknown): ConfigRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }
  return value as ConfigRecord
}

function ColorSwatches({
  theme,
  mode,
}: {
  theme: StorefrontTheme
  mode: ThemeMode
}) {
  const colors =
    mode === 'dark'
      ? [
          theme.preview.dark.primary,
          theme.preview.dark.accent,
          theme.preview.dark.background,
        ]
      : [theme.preview.primary, theme.preview.accent, theme.preview.background]
  return (
    <span className='flex gap-1.5' aria-label='معاينة ألوان القالب'>
      {colors.map((color, index) => (
        <span
          key={`${color}-${index}`}
          className='size-5 rounded-full border shadow-sm'
          style={{ backgroundColor: color }}
          aria-hidden='true'
        />
      ))}
    </span>
  )
}

function buildSelectedConfig(
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

  const currentModes = record(config.modes)
  const configuredLight = record(config.light_theme)
  const configuredDark = record(config.dark_theme)
  const configuredLightColors = record(configuredLight.colors)
  const configuredDarkColors = record(configuredDark.colors)
  config.modes = {
    ...currentModes,
    ...(Object.keys(configuredLightColors).length
      ? { light: { colors: { ...configuredLightColors } } }
      : {}),
    ...(Object.keys(configuredDarkColors).length
      ? { dark: { colors: { ...configuredDarkColors } } }
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

function ThemeCard({
  theme,
  selectedThemeId,
  selectedMode,
  onSelect,
}: {
  theme: StorefrontTheme
  selectedThemeId: string
  selectedMode: ThemeMode | ''
  onSelect: (theme: StorefrontTheme, mode: ThemeMode) => void
}) {
  return (
    <Card className='overflow-hidden py-0'>
      <div className='grid h-24 grid-cols-2'>
        {(['light', 'dark'] as const).map((mode) => {
          const isDark = mode === 'dark'
          const background = isDark
            ? theme.preview.dark.background
            : theme.preview.background
          const primary = isDark
            ? theme.preview.dark.primary
            : theme.preview.primary
          const accent = isDark
            ? theme.preview.dark.accent
            : theme.preview.accent
          const selected = selectedThemeId === theme.id && selectedMode === mode
          return (
            <button
              key={mode}
              type='button'
              aria-label={`اختيار قالب ${theme.name} للوضع ${isDark ? 'الداكن' : 'الفاتح'}`}
              aria-pressed={selected}
              onClick={() => onSelect(theme, mode)}
              className='relative grid place-items-center gap-2 border-e last:border-e-0 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring'
              style={{ backgroundColor: background }}
            >
              <span
                className='grid size-11 place-items-center rounded-xl text-white shadow-sm'
                style={{ backgroundColor: primary }}
              >
                <Palette className='size-5' />
              </span>
              <span
                className='absolute end-3 bottom-3 size-3 rounded-full border border-white/70'
                style={{ backgroundColor: accent }}
                aria-hidden='true'
              />
              {selected && (
                <span className='absolute end-2 top-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground'>
                  <Check className='size-4' />
                </span>
              )}
            </button>
          )
        })}
      </div>
      <CardHeader className='gap-1 px-4 pt-4 pb-2'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <CardTitle className='truncate text-base'>{theme.name}</CardTitle>
            <CardDescription className='mt-1 line-clamp-2 min-h-10'>
              {theme.description || theme.category || 'قالب لمتجرك'}
            </CardDescription>
          </div>
          <span className='shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground'>
            {theme.category || 'عام'}
          </span>
        </div>
      </CardHeader>
      <CardContent className='flex items-center justify-between gap-3 px-4 pb-4'>
        <div className='flex items-center gap-3'>
          <span className='inline-flex items-center gap-1 text-xs text-muted-foreground'>
            <Sun className='size-3.5' /> فاتح
          </span>
          <ColorSwatches theme={theme} mode='light' />
        </div>
        <div className='flex items-center gap-2'>
          <Moon className='size-3.5 text-muted-foreground' aria-hidden='true' />
          <ColorSwatches theme={theme} mode='dark' />
        </div>
      </CardContent>
    </Card>
  )
}

export function Storefront() {
  const queryClient = useQueryClient()
  const merchantId = useMerchantIdentity()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [selectedThemeId, setSelectedThemeId] = useState('')
  const [selectedMode, setSelectedMode] = useState<ThemeMode | ''>('')
  const [previewing, setPreviewing] = useState(false)
  const libraryQuery = useQuery({
    queryKey: storefrontLibraryQueryKey(merchantId),
    queryFn: fetchStorefrontLibrary,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })

  const library = libraryQuery.data
  const categories = useMemo(
    () =>
      [
        ...new Set(
          library?.themes.map((theme) => theme.category).filter(Boolean)
        ),
      ].sort((left, right) => left.localeCompare(right, 'ar')),
    [library?.themes]
  )
  const themes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return (library?.themes || []).filter((theme) => {
      const matchesSearch =
        !term ||
        `${theme.name} ${theme.description} ${theme.category}`
          .toLocaleLowerCase()
          .includes(term)
      return (
        matchesSearch && (category === 'all' || theme.category === category)
      )
    })
  }, [category, library?.themes, search])
  const activeThemeId = selectedThemeId || library?.selectedThemeId || ''
  const activeMode = selectedMode || library?.selectedMode || ''
  const selectedTheme =
    library?.themes.find((theme) => theme.id === activeThemeId) || null

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!library || !selectedTheme || !activeMode) {
        throw new Error('اختر قالباً ووضعاً فاتحاً أو داكناً أولاً.')
      }
      if (!library.username) throw new Error('تعذر تحديد اسم مستخدم المتجر.')
      const [baseConfig, themeConfig] = await Promise.all([
        loadBaseStorefrontConfig(library.config),
        loadStorefrontThemeConfig(selectedTheme),
      ])
      const config = buildSelectedConfig(
        baseConfig,
        themeConfig,
        selectedTheme,
        activeMode,
        library
      )
      const message = await saveStorefrontConfig(library.username, config)
      return { config, message }
    },
    onSuccess: ({ config, message }) => {
      try {
        localStorage.setItem(
          `nalsh_storefront_config_${library?.username.toLocaleLowerCase()}`,
          JSON.stringify(config)
        )
      } catch {
        toast.warning(
          'تم نشر القالب، لكن تعذر حفظ نسخة محلية لمعاينة التغييرات.'
        )
      }
      window.postMessage(
        { type: 'NALSH_CONFIG_UPDATE', config },
        window.location.origin
      )
      toast.success(message || `تم نشر القالب "${selectedTheme?.name}" بنجاح.`)
      queryClient.setQueryData<StorefrontLibrary>(
        storefrontLibraryQueryKey(merchantId),
        (current) =>
          current
            ? {
                ...current,
                config,
                selectedThemeId: selectedTheme?.id || current.selectedThemeId,
                selectedMode: activeMode,
              }
            : current
      )
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'تعذر نشر القالب.'),
  })

  const preview = async () => {
    if (!library || !selectedTheme || !activeMode) {
      toast.error('اختر قالباً ووضعاً لمعاينته.')
      return
    }
    if (!library.username) {
      toast.error('تعذر تحديد رابط متجرك للمعاينة.')
      return
    }
    setPreviewing(true)
    try {
      const [baseConfig, themeConfig] = await Promise.all([
        loadBaseStorefrontConfig(library.config),
        loadStorefrontThemeConfig(selectedTheme),
      ])
      const config = buildSelectedConfig(
        baseConfig,
        themeConfig,
        selectedTheme,
        activeMode,
        library
      )

      const storeBaseUrl = 'https://appi.dpdns.org'
      const storageKey = `nalsh_template_local_config_${library.username.trim().toLowerCase()}`
      const configJson = JSON.stringify(config)

      // Build the preview URL
      const url = `${storeBaseUrl}/index.html?store=${encodeURIComponent(library.username)}&template_preview=%7B%7D&local_preview=1`

      // Open the store window directly to the preview URL (no about:blank detour).
      // Do NOT null out opener – we need it to stay connected so postMessage works
      // across origins after the page loads.
      const previewWindow = window.open(url, '_blank')
      if (!previewWindow) {
        toast.error('اسمح بفتح نافذة جديدة لمعاينة المتجر.')
        return
      }

      // Send the config to the store window via postMessage once it has loaded.
      // The store page listens for NALSH_CONFIG_UPDATE and applies it immediately.
      // We retry a few times to handle slow loading.
      let attempts = 0
      const maxAttempts = 10
      const interval = window.setInterval(() => {
        attempts++
        try {
          previewWindow.postMessage(
            { type: 'NALSH_CONFIG_UPDATE', config, storageKey, configJson },
            storeBaseUrl
          )
        } catch {
          // Window may not be ready yet – keep retrying
        }
        if (attempts >= maxAttempts || previewWindow.closed) {
          window.clearInterval(interval)
        }
      }, 800)

    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'تعذر تجهيز المعاينة.'
      )
    } finally {
      setPreviewing(false)
    }
  }

  const selectTheme = (theme: StorefrontTheme, mode: ThemeMode) => {
    setSelectedThemeId(theme.id)
    setSelectedMode(mode)
  }

  return (
    <>
      <MerchantWorkspaceHeader />
      <Main className='merchant-content'>
        <div className='mb-6'>
          <MerchantPageHeading
            section={{ title: 'الإعدادات', url: '/store-settings' }}
            title='قوالب المتجر'
            description='اختر التصميم والوضع الافتراضي لمتجرك، وعاينه قبل النشر.'
            actions={
              <>
                <Button
                  variant='outline'
                  disabled={!selectedTheme || !activeMode || previewing}
                  onClick={() => void preview()}
                >
                  {previewing ? (
                    <RefreshCw className='animate-spin' />
                  ) : (
                    <Eye />
                  )}
                  معاينة الاختيار
                </Button>
                <Button
                  disabled={
                    !selectedTheme ||
                    !activeMode ||
                    publishMutation.isPending ||
                    !library?.username
                  }
                  onClick={() => publishMutation.mutate()}
                >
                  {publishMutation.isPending ? (
                    <RefreshCw className='animate-spin' />
                  ) : (
                    <Check />
                  )}
                  {publishMutation.isPending ? 'جارٍ النشر...' : 'تطبيق ونشر'}
                </Button>
              </>
            }
          />
        </div>

        {libraryQuery.isPending ? (
          <div
            className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'
            role='status'
            aria-label='جارٍ تحميل مكتبة القوالب'
          >
            {Array.from({ length: 6 }, (_, index) => (
              <Card key={index} className='h-56 bg-muted/50' />
            ))}
          </div>
        ) : libraryQuery.isError && !library ? (
          <Card>
            <CardHeader>
              <CardTitle>تعذر تحميل مكتبة القوالب</CardTitle>
              <CardDescription>
                {libraryQuery.error instanceof Error
                  ? libraryQuery.error.message
                  : 'تحقق من الاتصال ثم أعد المحاولة.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => {
                  clearAuthApiCache()
                  void libraryQuery.refetch()
                }}
              >
                إعادة المحاولة
              </Button>
            </CardContent>
          </Card>
        ) : library ? (
          <div className='grid gap-5'>
            <Card className='gap-0 py-0'>
              <CardContent className='grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-5'>
                <div className='grid gap-2'>
                  <label
                    htmlFor='storefront-theme-search'
                    className='text-sm font-medium'
                  >
                    البحث في القوالب
                  </label>
                  <div className='relative'>
                    <Search className='absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
                    <Input
                      id='storefront-theme-search'
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder='ابحث باسم القالب أو تصنيفه...'
                      className='ps-9'
                    />
                  </div>
                </div>
                <div className='grid gap-2 sm:min-w-52'>
                  <label
                    className='text-sm font-medium'
                    htmlFor='storefront-theme-category'
                  >
                    التصنيف
                  </label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger
                      id='storefront-theme-category'
                      className='w-full'
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>كل التصنيفات</SelectItem>
                      {categories.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <h2 className='font-semibold'>الثيمات المتاحة</h2>
                <p className='text-sm text-muted-foreground'>
                  {library.themes.length * 2} خياراً: لكل قالب وضع فاتح وآخر
                  داكن. اختر خياراً واحداً.
                </p>
              </div>
              {selectedTheme && activeMode ? (
                <p className='rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary'>
                  اختيارك: {selectedTheme.name} — الوضع{' '}
                  {activeMode === 'dark' ? 'الداكن' : 'الفاتح'}
                </p>
              ) : library.selectedThemeId && library.selectedMode ? (
                <p className='rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground'>
                  القالب المنشور: {library.selectedThemeId} —{' '}
                  {library.selectedMode === 'dark' ? 'داكن' : 'فاتح'}
                </p>
              ) : null}
            </div>

            {themes.length ? (
              <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
                {themes.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    selectedThemeId={activeThemeId}
                    selectedMode={activeMode}
                    onSelect={selectTheme}
                  />
                ))}
              </div>
            ) : (
              <div className='rounded-xl border border-dashed px-4 py-12 text-center'>
                <h2 className='font-semibold'>لا توجد قوالب مطابقة</h2>
                <p className='mt-1 text-sm text-muted-foreground'>
                  غيّر عبارة البحث أو اختر تصنيفاً آخر.
                </p>
              </div>
            )}

            <Card className='gap-0 py-0'>
              <CardContent className='flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5'>
                <div className='flex items-start gap-3'>
                  <span className='grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary'>
                    <Palette className='size-5' />
                  </span>
                  <span>
                    <span className='block font-semibold'>
                      القالب يتكيّف مع متجرك
                    </span>
                    <span className='mt-1 block text-sm text-muted-foreground'>
                      تندمج هوية متجرك وبيانات التواصل تلقائياً مع التصميم.
                    </span>
                  </span>
                </div>
                <a
                  href='/store-builder.html'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline'
                >
                  مصمم القالب الكامل <ExternalLink className='size-4' />
                </a>
              </CardContent>
            </Card>
            {!library.username && (
              <p role='alert' className='text-sm text-destructive'>
                لا يمكن النشر أو المعاينة لأن اسم مستخدم المتجر غير متوفر.
              </p>
            )}
          </div>
        ) : null}
      </Main>
    </>
  )
}
