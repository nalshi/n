import { useEffect } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/context/theme-provider'
import { Button } from '@/components/ui/button'
import { useDashboardIntro } from '@/components/layout/dashboard-intro-context'
import './auth-surface.css'

type AuthLayoutProps = {
  children: React.ReactNode
}

const merchantAreas = ['المنتجات', 'الطلبات', 'إعدادات المتجر']

export function AuthLayout({ children }: AuthLayoutProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const { setIntroReady } = useDashboardIntro()

  useEffect(() => {
    setIntroReady(true)
  }, [setIntroReady])

  return (
    <main className='auth-world' dir='rtl'>
      <div className='auth-world__frame'>
        <aside className='auth-brand' aria-label='بوابة التاجر من نالش'>
          <div className='auth-brand__masthead'>
            <img
              src='/images/favicon_light.svg'
              alt=''
              className='auth-brand__logo'
              aria-hidden='true'
            />
            <div className='auth-brand__name'>
              <span>نالش</span>
              <span dir='ltr'>NALSH</span>
            </div>
          </div>

          <div className='auth-brand__message'>
            <p className='auth-brand__caption'>بوابة التاجر</p>
            <h1>متجرك، بخطوة واضحة.</h1>
            <p className='auth-brand__description'>
              أدِر منتجاتك وطلباتك وإعدادات متجرك من مساحة واحدة.
            </p>
          </div>

          <div className='auth-brand__areas' aria-label='أقسام لوحة التاجر'>
            {merchantAreas.map((area) => (
              <span key={area}>{area}</span>
            ))}
          </div>

          <div className='auth-brand__grid' aria-hidden='true'>
            <span className='auth-brand__grid-cell auth-brand__grid-cell--one'>
              ن
            </span>
            <span className='auth-brand__grid-cell auth-brand__grid-cell--two'>
              ا
            </span>
            <span className='auth-brand__grid-cell auth-brand__grid-cell--three'>
              ل
            </span>
            <span className='auth-brand__grid-cell auth-brand__grid-cell--four'>
              ش
            </span>
          </div>
        </aside>

        <section className='auth-workspace' aria-label='المصادقة'>
          <header className='auth-workspace__toolbar'>
            <span className='auth-workspace__label'>بوابة التاجر</span>
            <Button
              type='button'
              variant='outline'
              size='icon'
              className='auth-theme-toggle'
              aria-label={
                resolvedTheme === 'dark'
                  ? 'التبديل إلى الوضع الفاتح'
                  : 'التبديل إلى الوضع الداكن'
              }
              onClick={() =>
                setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
              }
            >
              {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
            </Button>
          </header>

          <div className='auth-workspace__content'>{children}</div>

          <footer className='auth-workspace__footer'>
            <span>نالش</span>
            <span>بوابة إدارة متجرك</span>
          </footer>
        </section>
      </div>
    </main>
  )
}
