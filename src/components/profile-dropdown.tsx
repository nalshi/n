import { useMerchantIdentity } from '@/hooks/useMerchantRealtime'
import { MerchantOrderNotificationBell } from '@/components/layout/merchant-order-notifications'

export function ProfileDropdown() {
  const merchantId = useMerchantIdentity()

  return (
    <div className='flex shrink-0 items-center gap-1'>
      <MerchantOrderNotificationBell merchantId={merchantId} />
    </div>
  )
}
