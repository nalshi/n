import { useMerchantIdentity } from '@/hooks/useMerchantRealtime'
import { MerchantAccountSwitcher } from '@/components/layout/merchant-account-switcher'
import { MerchantOrderNotificationBell } from '@/components/layout/merchant-order-notifications'

export function ProfileDropdown() {
  const merchantId = useMerchantIdentity()

  return (
    <div className='flex shrink-0 items-center gap-1'>
      <MerchantOrderNotificationBell merchantId={merchantId} />
      <MerchantAccountSwitcher placement='header' />
    </div>
  )
}
