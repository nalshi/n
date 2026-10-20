import { Link } from '@tanstack/react-router'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Button } from '../ui/button'

export function AppTitle() {
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className='flex min-w-0 items-center gap-1'>
          <SidebarMenuButton
            size='lg'
            className='min-w-0 flex-1 gap-3 group-data-[collapsible=icon]:justify-center hover:bg-transparent active:bg-transparent'
            asChild
          >
            <Link
              to='/'
              onClick={() => setOpenMobile(false)}
              aria-label='نالش - بوابة التاجر'
            >
              <span className='flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg sm:size-10'>
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
              <span className='grid min-w-0 flex-1 text-start text-sm leading-tight group-data-[collapsible=icon]:hidden'>
                <span className='truncate font-bold'>نالش</span>
                <span className='truncate text-xs'>بوابة التاجر</span>
              </span>
            </Link>
          </SidebarMenuButton>
          <ToggleSidebar className='group-data-[collapsible=icon]:hidden' />
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function ToggleSidebar({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar='trigger'
      data-slot='sidebar-trigger'
      variant='ghost'
      size='icon'
      className={cn('aspect-square size-8 max-md:scale-125', className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <X className='md:hidden' />
      <Menu className='max-md:hidden' />
      <span className='sr-only'>Toggle Sidebar</span>
    </Button>
  )
}
