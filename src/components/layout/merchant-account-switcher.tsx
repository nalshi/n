import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Check, ChevronsUpDown, LogOut, Plus, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { restoreAuthSession } from '@/lib/complete-auth-session'
import {
  getActiveMerchantToken,
  getMerchantAccountName,
  getMerchantIdentityFromToken,
  getSavedMerchantAccounts,
  MAX_SAVED_MERCHANT_ACCOUNTS,
  type SavedMerchantAccount,
} from '@/lib/merchant-accounts'
import { getMerchantDisplayName } from '@/lib/merchant-profiles'
import { Button } from '@/components/ui/button'
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

type MerchantAccountSwitcherProps = {
  placement: 'header' | 'sidebar'
}

export function MerchantAccountSwitcher({
  placement,
}: MerchantAccountSwitcherProps) {
  const {
    isMobile,
    setOpen: setSidebarOpen,
    state: sidebarState,
  } = useSidebar()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const user = useAuthStore((state) => state.auth.user)
  const activeToken = getActiveMerchantToken()
  const activeMerchantId = getMerchantIdentityFromToken(activeToken)
  const savedAccounts = getSavedMerchantAccounts()
  const activeAccount =
    savedAccounts.find((account) => account.id === activeMerchantId) ||
    savedAccounts.find((account) => account.token === activeToken)
  const accountId = activeAccount?.id || activeMerchantId
  const fallbackName =
    getMerchantAccountName(activeToken) ||
    activeAccount?.label ||
    user?.email ||
    'التاجر'
  const storeName = accountId
    ? getMerchantDisplayName(accountId, fallbackName)
    : fallbackName
  const isCollapsed = sidebarState === 'collapsed' && !isMobile

  function switchAccount(account: SavedMerchantAccount) {
    if (account.token === activeToken) return

    if (
      !restoreAuthSession(
        account.token,
        true,
        account.identifier,
        getMerchantDisplayName(account.id, account.label)
      )
    ) {
      toast.error('انتهت صلاحية هذا الحساب. سجّل الدخول إليه مجدداً.')
      return
    }

    window.location.reload()
  }

  function handleMenuChange(open: boolean) {
    setMenuOpen(open)
    if (placement !== 'sidebar' || isMobile) return

    if (open) {
      setSidebarOpen(true)
      return
    }

    const sidebar = document.querySelector('[data-slot="sidebar-inner"]')
    if (!sidebar?.matches(':hover')) setSidebarOpen(false)
  }

  const accountOptions = savedAccounts.map((account) => {
    const name = getMerchantDisplayName(
      account.id,
      getMerchantAccountName(account.token) || account.label
    )

    return {
      account,
      name,
      isActive:
        account.id === activeMerchantId || account.token === activeToken,
    }
  })

  const menuContent = (
    <DropdownMenuContent
      data-sidebar-account-menu={placement === 'sidebar' ? '' : undefined}
      className='w-72 max-w-[calc(100vw-1rem)] rounded-xl'
      side={placement === 'sidebar' && !isMobile ? 'right' : 'bottom'}
      align={placement === 'sidebar' ? 'start' : 'end'}
      sideOffset={6}
    >
      <DropdownMenuLabel className='font-normal'>
        <div className='flex min-w-0 items-center gap-3 py-1'>
          <MerchantAvatar
            merchantId={accountId}
            token={activeToken}
            name={storeName}
            className='size-10 rounded-lg'
          />
          <div className='grid min-w-0 gap-1'>
            <span className='truncate text-sm font-semibold'>{storeName}</span>
            <span className='truncate text-xs text-muted-foreground' dir='ltr'>
              {activeAccount?.identifier || user?.email || ''}
            </span>
          </div>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel className='text-xs font-medium text-muted-foreground'>
          الحسابات المحفوظة
        </DropdownMenuLabel>
        {accountOptions.map(({ account, name, isActive }) => (
          <DropdownMenuItem
            key={account.id}
            className='gap-3 py-2'
            disabled={isActive}
            onSelect={() => switchAccount(account)}
          >
            <MerchantAvatar
              merchantId={account.id}
              token={account.token}
              name={name}
              className='size-9 rounded-lg'
            />
            <span className='min-w-0 flex-1 truncate'>{name}</span>
            {isActive && (
              <>
                <span className='text-xs text-muted-foreground'>الحالي</span>
                <Check className='size-4 text-primary' aria-hidden='true' />
              </>
            )}
          </DropdownMenuItem>
        ))}
        {savedAccounts.length < MAX_SAVED_MERCHANT_ACCOUNTS && (
          <DropdownMenuItem asChild className='gap-3 py-2'>
            <Link to='/sign-in' search={{ addAccount: true }}>
              <span className='grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground'>
                <Plus className='size-4' aria-hidden='true' />
              </span>
              <span>إضافة أو تسجيل الدخول لحساب آخر</span>
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link to='/store-settings'>
          <Settings aria-hidden='true' />
          إعدادات المتجر
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem
        variant='destructive'
        onSelect={() => setSignOutOpen(true)}
      >
        <LogOut aria-hidden='true' />
        تسجيل الخروج
      </DropdownMenuItem>
    </DropdownMenuContent>
  )

  return (
    <>
      {placement === 'sidebar' ? (
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu open={menuOpen} onOpenChange={handleMenuChange}>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size='lg'
                  className='w-full min-w-0 gap-3 px-2 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
                  tooltip={storeName}
                  aria-label={`الحساب الحالي: ${storeName}. تبديل الحساب`}
                >
                  <MerchantAvatar
                    merchantId={accountId}
                    token={activeToken}
                    name={storeName}
                    className={isCollapsed ? 'size-8' : 'size-10 rounded-lg'}
                  />
                  {!isCollapsed && (
                    <>
                      <span className='grid min-w-0 flex-1 gap-1 text-start leading-tight'>
                        <span className='truncate text-sm font-semibold'>
                          {storeName}
                        </span>
                        <span className='truncate text-xs text-muted-foreground'>
                          {activeAccount?.identifier ||
                            user?.email ||
                            'حساب المتجر'}
                        </span>
                      </span>
                      <ChevronsUpDown
                        className='ms-auto size-4 shrink-0'
                        aria-hidden='true'
                      />
                    </>
                  )}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              {menuContent}
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      ) : (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              className='h-10 max-w-56 min-w-0 gap-2 rounded-lg px-2 sm:max-w-64'
              aria-label={`الحساب الحالي: ${storeName}. تبديل الحساب`}
            >
              <MerchantAvatar
                merchantId={accountId}
                token={activeToken}
                name={storeName}
                className='size-8 shrink-0'
              />
              <span className='max-w-20 min-w-0 truncate text-xs font-medium sm:max-w-32 sm:text-sm'>
                {storeName}
              </span>
              <ChevronsUpDown
                className='size-4 shrink-0 text-muted-foreground'
                aria-hidden='true'
              />
            </Button>
          </DropdownMenuTrigger>
          {menuContent}
        </DropdownMenu>
      )}
      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </>
  )
}
