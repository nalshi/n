import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronsUpDown, LogOut, Settings } from 'lucide-react'
import {
  getActiveMerchantToken,
  getMerchantAccountName,
  getMerchantIdentityFromToken,
  getSavedMerchantAccounts,
} from '@/lib/merchant-accounts'
import { getMerchantDisplayName } from '@/lib/merchant-profiles'
import useDialogState from '@/hooks/use-dialog-state'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { MerchantAvatar } from '@/components/merchant-avatar'
import { SignOutDialog } from '@/components/sign-out-dialog'

type NavUserProps = {
  user: {
    name: string
    email: string
  }
}

export function NavUser({ user }: NavUserProps) {
  const { isMobile, setOpen: setSidebarOpen } = useSidebar()
  const [menuOpen, setMenuOpen] = useState(false)
  const [open, setOpen] = useDialogState()
  const activeToken = getActiveMerchantToken()
  const activeMerchantId = getMerchantIdentityFromToken(activeToken)
  const activeAccount = getSavedMerchantAccounts().find(
    (account) => account.id === activeMerchantId
  )
  const merchantId = activeAccount?.id || activeMerchantId
  const merchantName = merchantId
    ? getMerchantDisplayName(
        merchantId,
        getMerchantAccountName(activeToken) ||
          activeAccount?.label ||
          user.name ||
          'التاجر'
      )
    : user.name || 'التاجر'
  const merchantEmail = activeAccount?.identifier || user.email

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu
            open={menuOpen}
            onOpenChange={(nextOpen) => {
              setMenuOpen(nextOpen)

              if (isMobile) return

              if (nextOpen) {
                setSidebarOpen(true)
                return
              }

              const sidebar = document.querySelector(
                '[data-slot="sidebar-inner"]'
              )
              if (!sidebar?.matches(':hover')) setSidebarOpen(false)
            }}
          >
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size='lg'
                className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
              >
                <MerchantAvatar
                  merchantId={merchantId}
                  token={activeToken}
                  name={merchantName}
                  className='size-8 rounded-lg'
                />
                <div className='grid flex-1 text-start text-sm leading-tight'>
                  <span className='truncate font-semibold'>{merchantName}</span>
                  <span className='truncate text-xs'>{merchantEmail}</span>
                </div>
                <ChevronsUpDown className='ms-auto size-4' />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              data-sidebar-account-menu=''
              className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
              side={isMobile ? 'bottom' : 'right'}
              align='end'
              sideOffset={4}
            >
              <DropdownMenuLabel className='p-0 font-normal'>
                <div className='flex items-center gap-2 px-1 py-1.5 text-start text-sm'>
                  <MerchantAvatar
                    merchantId={merchantId}
                    token={activeToken}
                    name={merchantName}
                    className='size-8 rounded-lg'
                  />
                  <div className='grid flex-1 text-start text-sm leading-tight'>
                    <span className='truncate font-semibold'>
                      {merchantName}
                    </span>
                    <span className='truncate text-xs'>{merchantEmail}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link to='/store-settings'>
                    <Settings />
                    إعدادات المتجر
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant='destructive'
                onClick={() => setOpen(true)}
              >
                <LogOut />
                تسجيل الخروج
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
