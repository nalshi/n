import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { DashboardIntro } from './dashboard-intro'

describe('DashboardIntro', () => {
  it('shows only the animated mark and completes the intro', async () => {
    const onComplete = vi.fn()
    await render(<DashboardIntro isReady onComplete={onComplete} />)

    const intro = document.querySelector('.merchant-intro')
    expect(intro?.textContent).toBe('')
    expect(intro?.getAttribute('aria-hidden')).toBe('true')

    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce(), {
      timeout: 800,
    })
  })

  it('keeps the intro open until the dashboard is ready', async () => {
    const onComplete = vi.fn()
    await render(<DashboardIntro isReady={false} onComplete={onComplete} />)

    expect(document.querySelector('.merchant-intro')).not.toBeNull()
    await new Promise((resolve) => window.setTimeout(resolve, 500))

    expect(onComplete).not.toHaveBeenCalled()
  })
})
