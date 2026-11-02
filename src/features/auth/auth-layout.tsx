import { useEffect } from 'react'
import { Moon, Sun } from 'lucide-react'
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
      className='relative isolate min-h-svh overflow-x-clip bg-muted/20 font-[Cairo]'
    >
      <div className='mx-auto flex min-h-svh w-full max-w-7xl flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 lg:px-12'>
        <header className='flex min-h-14 items-center justify-between gap-4'>
          <div className='flex items-center gap-3'>
            <span className='flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary p-1.5 sm:size-11'>
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
              <p className='text-lg leading-none font-black sm:text-xl'>نالش</p>
              <p className='mt-1 text-[9px] font-bold tracking-[0.28em] text-muted-foreground'>
                NALSH
              </p>
            </div>
          </div>

          <div className='flex items-center gap-3'>
            <span className='hidden text-sm font-medium text-muted-foreground sm:inline'>
              بوابة التاجر
            </span>
            <Button
              type='button'
              variant='outline'
              size='icon'
              className='size-10 rounded-xl bg-background'
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
          </div>
        </header>

        <div
          dir='ltr'
          className='grid flex-1 content-start items-center gap-7 py-8 sm:gap-10 sm:py-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:content-center lg:gap-16 lg:py-12'
        >
          <aside
            dir='rtl'
            className='mx-auto w-full max-w-xl self-center lg:mx-0'
          >
            <h1 className='text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl'>
              متجرك يبدأ من هنا
            </h1>
            <p className='mt-3 max-w-[42ch] text-base leading-8 text-muted-foreground sm:mt-4 sm:text-lg'>
              ادخل إلى لوحة متجرك، وتابع منتجاتك وطلباتك من مكان واحد.
            </p>
          </aside>

          <section
            dir='rtl'
            className='flex w-full min-w-0 items-center justify-center'
          >
            <div className='w-full min-w-0'>{children}</div>
          </section>
        </div>
      </div>
    </main>
  )
}
