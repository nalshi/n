import { useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { Bell, BellRing, CheckCheck, ShoppingBag, X } from 'lucide-react'
import {
  merchantOrderNotificationStorageKey,
  useMerchantOrderNotificationStore,
  type MerchantOrderNotification,
} from '@/stores/merchant-order-notifications'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const EMPTY_NOTIFICATIONS: MerchantOrderNotification[] = []

function formatNotificationDate(value: string) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return 'وقت غير محدد'
  return date.toLocaleString('ar-YE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function MerchantOrderNotificationBell({
  merchantId,
}: {
  merchantId: string
}) {
  const notifications = useMerchantOrderNotificationStore(
    (state) => state.notificationsByMerchant[merchantId] || EMPTY_NOTIFICATIONS
  )
  const markRead = useMerchantOrderNotificationStore((state) => state.markRead)
  const markAllRead = useMerchantOrderNotificationStore(
    (state) => state.markAllRead
  )
  const unreadCount = notifications.filter(
    (notification) => notification.readAt === null
  ).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className={`relative size-10 shrink-0 rounded-lg transition-colors sm:size-11 ${
            unreadCount
              ? 'border border-amber-500/35 bg-amber-500/10 text-amber-700 shadow-sm hover:bg-amber-500/20 dark:text-amber-300'
              : ''
          }`}
          aria-label={
            unreadCount
              ? `التنبيهات، ${unreadCount.toLocaleString('ar-YE')} غير مقروءة`
              : 'التنبيهات'
          }
        >
          {unreadCount > 0 ? (
            <BellRing
              className='merchant-notification-bell size-5'
              aria-hidden='true'
            />
          ) : (
            <Bell aria-hidden='true' />
          )}
          {unreadCount > 0 && (
            <span className='merchant-notification-count absolute -end-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-none font-bold text-white'>
              {unreadCount > 9 ? '9+' : unreadCount.toLocaleString('ar-YE')}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        sideOffset={8}
        className='max-h-[min(70svh,28rem)] w-80 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl'
      >
        <DropdownMenuLabel className='flex items-center justify-between gap-3 px-3 py-2'>
          <span>تنبيهات الطلبات</span>
          {unreadCount > 0 && (
            <span className='text-xs font-normal text-muted-foreground'>
              {unreadCount.toLocaleString('ar-YE')} جديدة
            </span>
          )}
        </DropdownMenuLabel>
        {unreadCount > 0 && (
          <>
            <DropdownMenuItem
              className='justify-start gap-2 text-xs text-primary'
              onSelect={() => markAllRead(merchantId)}
            >
              <CheckCheck aria-hidden='true' />
              تعليم الكل كمقروء
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {notifications.length ? (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              asChild
              className='h-auto items-start gap-3 px-3 py-3 whitespace-normal'
            >
              <Link
                to='/orders'
                search={{ orderId: notification.orderId }}
                onClick={() => markRead(merchantId, notification.id)}
              >
                <span className='mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary'>
                  <ShoppingBag className='size-4' aria-hidden='true' />
                </span>
                <span className='grid min-w-0 flex-1 gap-1'>
                  <span className='flex min-w-0 items-center gap-2'>
                    <span className='truncate font-medium'>طلب جديد</span>
                    {notification.readAt === null && (
                      <span
                        className='size-2 shrink-0 rounded-full bg-primary'
                        aria-label='غير مقروء'
                      />
                    )}
                  </span>
                  <span className='truncate text-xs text-muted-foreground'>
                    من {notification.customerName}
                  </span>
                  <span className='text-[11px] text-muted-foreground'>
                    {formatNotificationDate(notification.createdAt)}
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        ) : (
          <p className='px-4 py-8 text-center text-sm text-muted-foreground'>
            لا توجد تنبيهات جديدة. ستظهر الطلبات الواردة هنا.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function MerchantOrderAnnouncement({
  merchantId,
  hidden = false,
}: {
  merchantId: string
  hidden?: boolean
}) {
  const notification = useMerchantOrderNotificationStore((state) =>
    state.announcement?.merchantId === merchantId ? state.announcement : null
  )
  const hydrate = useMerchantOrderNotificationStore((state) => state.hydrate)
  const dismiss = useMerchantOrderNotificationStore(
    (state) => state.dismissAnnouncement
  )

  useEffect(() => {
    if (!merchantId) return
    hydrate(merchantId)

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === merchantOrderNotificationStorageKey(merchantId) &&
        event.newValue
      ) {
        hydrate(merchantId, true)
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [hydrate, merchantId])

  useEffect(() => {
    if (!notification || hidden) return
    const timeout = window.setTimeout(
      () => dismiss(merchantId, notification.id),
      12_000
    )
    return () => window.clearTimeout(timeout)
  }, [dismiss, hidden, merchantId, notification])

  if (hidden || !notification) return null

  return (
    <div
      role='status'
      aria-live='polite'
      dir='rtl'
      className='fixed inset-x-3 top-16 z-[60] mx-auto flex w-auto max-w-xl items-center gap-3 rounded-xl border bg-background p-3 shadow-lg sm:top-20 sm:w-[min(32rem,calc(100vw-2rem))]'
    >
      <span className='grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary'>
        <BellRing className='size-5' aria-hidden='true' />
      </span>
      <span className='grid min-w-0 flex-1 gap-0.5'>
        <span className='font-semibold'>وصل طلب جديد</span>
        <span className='truncate text-sm text-muted-foreground'>
          من {notification.customerName}
          <bdi className='ms-1' dir='ltr'>
            #{notification.orderId.slice(0, 8)}
          </bdi>
        </span>
      </span>
      <Button
        variant='ghost'
        size='icon'
        className='size-8 shrink-0'
        aria-label='إغلاق تنبيه الطلب'
        onClick={() => dismiss(merchantId, notification.id)}
      >
        <X aria-hidden='true' />
      </Button>
      <Button
        asChild
        size='sm'
        className='shrink-0 px-2 sm:px-3'
        onClick={() => dismiss(merchantId, notification.id)}
      >
        <Link to='/orders' search={{ orderId: notification.orderId }}>
          عرض
        </Link>
      </Button>
    </div>
  )
}
