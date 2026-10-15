import { Outlet } from '@tanstack/react-router'
import { LoaderCircle, Wifi, WifiOff } from 'lucide-react'
import { useRealtimeStore } from '@/stores/realtime-store'
import { cn } from '@/lib/utils'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import {
  useMerchantData,
  useMerchantIdentity,
  useRealtimeSync,
} from '@/hooks/useMerchantRealtime'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SkipToMain } from '@/components/skip-to-main'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const merchantId = useMerchantIdentity()
  const dashboardQuery = useMerchantData(merchantId)
  useRealtimeSync(merchantId, dashboardQuery.cacheReady)
  const realtimeStatus = useRealtimeStore((state) => state.status)
  const realtimeDetail = useRealtimeStore((state) => state.detail)
  const dashboardInitialized = dashboardQuery.cacheReady
  const initializationError =
    dashboardQuery.error instanceof Error ? dashboardQuery.error.message : ''

  return (
    <SearchProvider>
      <LayoutProvider>
        <SidebarProvider
          defaultOpen={false}
          className='font-ibm-plex-sans-arabic'
        >
          <SkipToMain />
          <AppSidebar />
          <SidebarInset
            className={cn(
              // Set content container, so we can use container queries
              '@container/content',

              // If layout is fixed, set the height
              // to 100svh to prevent overflow
              'has-data-[layout=fixed]:h-svh',

              // If layout is fixed and sidebar is inset,
              // set the height to 100svh - spacing (total margins) to prevent overflow
              'peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]'
            )}
          >
            {dashboardInitialized ? (
              (children ?? <Outlet />)
            ) : (
              <div
                role={initializationError ? 'alert' : 'status'}
                className='flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground'
              >
                {initializationError ? (
                  <>
                    <p>{initializationError}</p>
                    <button
                      type='button'
                      className='rounded-md border px-3 py-2 text-foreground hover:bg-accent'
                      onClick={() => {
                        void dashboardQuery.refetch()
                      }}
                    >
                      إعادة المحاولة
                    </button>
                  </>
                ) : (
                  <>
                    <LoaderCircle className='size-5 animate-spin' />
                    <p>جاري تحميل بيانات لوحة التحكم...</p>
                  </>
                )}
              </div>
            )}
          </SidebarInset>
          <div
            role='status'
            aria-live='polite'
            title={realtimeDetail || 'حالة اتصال لوحة التاجر'}
            className='fixed start-3 bottom-3 z-50 flex items-center gap-2 rounded-full border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur'
          >
            {realtimeStatus === 'connected' ? (
              <Wifi className='size-4 text-emerald-600' />
            ) : realtimeStatus === 'connecting' ? (
              <LoaderCircle className='size-4 animate-spin text-amber-600' />
            ) : (
              <WifiOff className='size-4 text-muted-foreground' />
            )}
            <span>
              {realtimeStatus === 'connected'
                ? 'متصل لحظيًا'
                : realtimeStatus === 'connecting'
                  ? 'جاري الاتصال'
                  : realtimeStatus === 'offline'
                    ? 'غير متصل'
                    : 'إعادة الاتصال'}
            </span>
          </div>
        </SidebarProvider>
      </LayoutProvider>
    </SearchProvider>
  )
}
