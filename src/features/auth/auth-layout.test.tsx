import '@/styles/index.css'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { ThemeProvider } from '@/context/theme-provider'
import { AuthLayout } from './auth-layout'

describe('AuthLayout', () => {
  it('fits phone, tablet and desktop widths and supports dark mode', async () => {
    const screen = await render(
      <ThemeProvider defaultTheme='light'>
        <AuthLayout>
          <div className='w-full rounded-2xl border bg-card p-5'>
            <h2 className='text-xl font-semibold'>تسجيل الدخول</h2>
            <label className='mt-4 grid gap-2'>
              رقم الجوال
              <input className='h-11 w-full min-w-0 rounded-lg border px-3' />
            </label>
            <button className='mt-4 h-11 w-full rounded-lg bg-primary text-primary-foreground'>
              متابعة
            </button>
          </div>
        </AuthLayout>
      </ThemeProvider>
    )

    expect(
      screen.getByRole('heading', { name: 'متجرك، بخطوة واضحة.' })
    ).toBeInTheDocument()
    expect(screen.getByLabelText('أقسام لوحة التاجر')).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'التبديل إلى الوضع الداكن' })
    )
    await expect
      .poll(() => document.documentElement.classList.contains('dark'))
      .toBe(true)

    for (const [width, height] of [
      [360, 640],
      [390, 844],
      [768, 1024],
      [1440, 900],
    ]) {
      await page.viewport(width, height)
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width)
      expect(
        document.querySelector('main')?.getBoundingClientRect().width
      ).toBe(width)
      if (width <= 1023) {
        expect(
          document.querySelector('.auth-brand')?.getBoundingClientRect().height
        ).toBeLessThanOrEqual(240)
      }
    }

    expect(
      screen.getByRole('button', { name: 'التبديل إلى الوضع الفاتح' })
    ).toBeInTheDocument()
  })
})
