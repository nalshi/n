import { useEffect } from 'react'
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { useDashboardIntro } from './dashboard-intro-context'
import { DashboardIntroProvider } from './dashboard-intro-provider'

const pendingOperation: { resolve: () => void } = { resolve: () => undefined }
const pendingQuery: { resolve: (value: string) => void } = {
  resolve: () => undefined,
}

function ReadyRoute({ withMutation = false }: { withMutation?: boolean }) {
  const { setIntroReady } = useDashboardIntro()
  const mutation = useMutation({
    mutationFn: () =>
      new Promise<void>((resolve) => {
        pendingOperation.resolve = resolve
      }),
  })

  useEffect(() => {
    setIntroReady(true)
  }, [setIntroReady])

  return (
    <>
      <p>محتوى الصفحة</p>
      {withMutation && (
        <button type='button' onClick={() => mutation.mutate()}>
          حفظ التغييرات
        </button>
      )}
    </>
  )
}

function LoadingQueryRoute() {
  const { setIntroReady } = useDashboardIntro()
  useQuery({
    queryKey: ['merchant-operation-loader-test'],
    queryFn: () =>
      new Promise<string>((resolve) => {
        pendingQuery.resolve = resolve
      }),
  })

  useEffect(() => {
    setIntroReady(true)
  }, [setIntroReady])

  return <p>جارٍ تحميل الصفحة</p>
}

describe('DashboardIntroProvider', () => {
  it('shows the logo over the page from the first render', async () => {
    const queryClient = new QueryClient()
    await render(
      <QueryClientProvider client={queryClient}>
        <DashboardIntroProvider>
          <ReadyRoute />
        </DashboardIntroProvider>
      </QueryClientProvider>
    )

    const intro = document.querySelector('.merchant-intro')
    expect(intro).not.toBeNull()
    expect(intro?.getAttribute('aria-hidden')).toBe('true')
    expect(document.querySelector('[inert][aria-hidden="true"]')).not.toBeNull()

    await vi.waitFor(
      () => {
        expect(document.querySelector('.merchant-intro')).toBeNull()
      },
      { timeout: 1100 }
    )
  })

  it('shows the centered logo and marks the app busy during mutations', async () => {
    pendingOperation.resolve = () => undefined
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <DashboardIntroProvider>
          <ReadyRoute withMutation />
        </DashboardIntroProvider>
      </QueryClientProvider>
    )
    await vi.waitFor(
      () => expect(document.querySelector('.merchant-intro')).toBeNull(),
      { timeout: 1100 }
    )

    await userEvent.click(screen.getByRole('button', { name: 'حفظ التغييرات' }))
    await expect
      .element(screen.getByRole('status', { name: 'جارٍ تنفيذ العملية' }))
      .toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"][inert]')).not.toBeNull()
    expect(document.querySelector('.merchant-operation-loader')).not.toBeNull()

    pendingOperation.resolve()
    await vi.waitFor(() => {
      expect(document.querySelector('.merchant-operation-loader')).toBeNull()
    })
    expect(document.querySelector('[aria-busy="false"]')).not.toBeNull()
  })

  it('shows the centered logo while a page query is fetching', async () => {
    pendingQuery.resolve = () => undefined
    const queryClient = new QueryClient()
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <DashboardIntroProvider>
          <LoadingQueryRoute />
        </DashboardIntroProvider>
      </QueryClientProvider>
    )
    await vi.waitFor(
      () => expect(document.querySelector('.merchant-intro')).toBeNull(),
      { timeout: 1100 }
    )
    await expect
      .element(screen.getByRole('status', { name: 'جارٍ تنفيذ العملية' }))
      .toBeInTheDocument()

    pendingQuery.resolve('loaded')
    await vi.waitFor(() => {
      expect(document.querySelector('.merchant-operation-loader')).toBeNull()
    })
  })
})
