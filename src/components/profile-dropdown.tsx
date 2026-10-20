import { Link } from '@tanstack/react-router'
import { LogOut, Repeat2, Settings } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import useDialogState from '@/hooks/use-dialog-state'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SignOutDialog } from '@/components/sign-out-dialog'

export function ProfileDropdown() {
  const [open, setOpen] = useDialogState()
  const user = useAuthStore((state) => state.auth.user)

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='relative size-10 rounded-lg'
            aria-label='فتح قائمة حساب التاجر'
          >
            <Avatar className='size-8'>
              <AvatarFallback>ت</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className='w-56' align='end' forceMount>
          <DropdownMenuLabel className='font-normal'>
            <div className='flex flex-col gap-1.5'>
              <p className='text-sm leading-none font-medium'>حساب التاجر</p>
              <p
                className='truncate text-xs leading-none text-muted-foreground'
                dir='ltr'
              >
                {user?.email || 'بوابة نالش'}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to='/store-settings'>
              <Settings aria-hidden='true' />
              إعدادات المتجر
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to='/sign-in'>
              <Repeat2 aria-hidden='true' />
              تبديل الحساب
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant='destructive' onClick={() => setOpen(true)}>
            <LogOut aria-hidden='true' />
            تسجيل الخروج
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
