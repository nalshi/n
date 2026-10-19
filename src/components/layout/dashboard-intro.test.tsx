import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { DashboardIntro } from './dashboard-intro'

describe('DashboardIntro', () => {
  it('shows the Nalsh mark and completes the intro', async () => {
    const onComplete = vi.fn()
    const screen = await render(
      <DashboardIntro isReady onComplete={onComplete} />
    )

    await expect
      .element(screen.getByRole('status', { name: 'جارٍ تجهيز لوحة التاجر' }))
      .toBeInTheDocument()
    await expect.element(screen.getByText('نالش')).toBeInTheDocument()

    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce(), {
      timeout: 2_200,
    })
  })

  it('keeps the intro open until the dashboard is ready', async () => {
    const onComplete = vi.fn()
    const screen = await render(
      <DashboardIntro isReady={false} onComplete={onComplete} />
    )

    await expect
      .element(screen.getByRole('status', { name: 'جارٍ تجهيز لوحة التاجر' }))
      .toBeInTheDocument()
    await new Promise((resolve) => window.setTimeout(resolve, 1_800))

    expect(onComplete).not.toHaveBeenCalled()
  })
})
