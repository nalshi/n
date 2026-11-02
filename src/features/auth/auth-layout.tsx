import { useEffect } from 'react'
import { ClipboardList, Moon, PackageCheck, Settings2, Sun } from 'lucide-react'
import { useTheme } from '@/context/theme-provider'
import { Button } from '@/components/ui/button'
import { useDashboardIntro } from '@/components/layout/dashboard-intro-context'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const { setIntroReady } = useDashboardIntro()

  useEffect(() => {
    setIntroReady(true)
  }, [setIntroReady])

  return (
    <main
      dir='rtl'
      className='relative isolate min-h-svh overflow-x-clip bg-background px-3 pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] pb-[max(1.5rem,env(safe-area-inset-bottom))] font-[Cairo] sm:px-6 sm:pt-20 lg:grid lg:place-items-center lg:px-8 lg:py-8'
    >
      <Button
        type='button'
        variant='outline'
        size='icon'
        className='absolute end-3 top-3 z-10 size-11 rounded-xl bg-background shadow-sm sm:end-6 sm:top-6 lg:end-8 lg:top-8'
        aria-label={
          resolvedTheme === 'dark'
            ? 'التبديل إلى الوضع الفاتح'
            : 'التبديل إلى الوضع الداكن'
        }
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      >
        {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
      </Button>

      <div className='mx-auto grid w-full max-w-6xl gap-3 sm:gap-6 lg:min-h-[min(680px,calc(100svh-4rem))] lg:grid-cols-[minmax(17rem,0.82fr)_minmax(0,1.18fr)] lg:items-stretch lg:gap-6 xl:gap-8'>
        <aside className='relative flex min-h-16 items-center justify-between gap-3 overflow-hidden rounded-2xl bg-primary p-3.5 text-primary-foreground sm:min-h-28 sm:p-5 lg:min-h-0 lg:flex-col lg:items-start lg:rounded-3xl lg:p-8 xl:p-10'>
          <div className='flex shrink-0 items-center gap-3'>
            <span className='flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl sm:size-12'>
              <img
                src='/images/favicon_light.svg'
                alt=''
                className='size-full dark:hidden'
                aria-hidden='true'
              />
              <img
                src='/images/favicon.svg'
                alt=''
                className='hidden size-full dark:block'
                aria-hidden='true'
              />
            </span>
            <div>
              <p className='text-xl leading-none font-black sm:text-2xl'>
                نالش
              </p>
              <p
                className='mt-1 text-[10px] font-bold tracking-[0.3em] opacity-75'
                dir='ltr'
              >
                NALSH
              </p>
            </div>
          </div>

          <div className='hidden max-w-sm min-w-0 flex-1 sm:block sm:max-w-none lg:mt-auto lg:max-w-md lg:flex-none lg:pb-6 xl:pb-10'>
            <h1 className='text-lg leading-snug font-bold text-balance sm:text-2xl lg:text-3xl xl:text-4xl'>
              متجرك، وعملياتك اليومية في مكان واحد
            </h1>
            <p className='mt-2 hidden text-xs leading-6 text-primary-foreground/90 sm:block sm:text-sm sm:leading-7 lg:text-base'>
              تابع الطلبات، ونظّم منتجاتك، واضبط واجهة متجرك من لوحة واحدة.
            </p>

            <ul className='mt-8 hidden gap-4 text-sm lg:grid xl:mt-10'>
              <li className='flex items-center gap-3'>
                <ClipboardList
                  className='size-4 shrink-0 opacity-80'
                  aria-hidden='true'
                />
                <span>الطلبات وحالاتها</span>
              </li>
              <li className='flex items-center gap-3'>
                <PackageCheck
                  className='size-4 shrink-0 opacity-80'
                  aria-hidden='true'
                />
                <span>المنتجات والمخزون</span>
              </li>
              <li className='flex items-center gap-3'>
                <Settings2
                  className='size-4 shrink-0 opacity-80'
                  aria-hidden='true'
                />
                <span>إعدادات المتجر وواجهته</span>
              </li>
            </ul>
          </div>
        </aside>

        <section className='flex min-w-0 items-start justify-center lg:items-center'>
          <div className='w-full min-w-0'>{children}</div>
        </section>
      </div>
    </main>
  )
}
