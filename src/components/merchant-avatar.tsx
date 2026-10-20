import { getMerchantAccountAvatarUrl } from '@/lib/merchant-accounts'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

type MerchantAvatarProps = {
  merchantId?: string
  token: string
  name: string
  className?: string
}

export function MerchantAvatar({
  merchantId,
  token,
  name,
  className,
}: MerchantAvatarProps) {
  const avatarUrl = getMerchantAccountAvatarUrl(
    token,
    merchantId
      ? localStorage.getItem(`merchant_store_avatar:${merchantId}`) || ''
      : ''
  )
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => [...part][0])
      .join('') || 'م'

  return (
    <Avatar className={className}>
      {avatarUrl && (
        <AvatarImage
          src={avatarUrl}
          alt={`صورة ${name}`}
          referrerPolicy='no-referrer'
        />
      )}
      <AvatarFallback className='bg-primary/10 font-semibold text-primary'>
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
