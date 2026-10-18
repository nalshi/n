import {
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

type TeamSwitcherProps = {
  teams: {
    name: string
    logo: React.ElementType
    plan: string
  }[]
}

export function TeamSwitcher({ teams }: TeamSwitcherProps) {
  const { state, isMobile } = useSidebar()
  const activeTeam = teams[0]
  if (!activeTeam) return null
  const isCollapsed = state === 'collapsed' && !isMobile

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div
          className={`flex min-w-0 items-center rounded-lg ${
            isCollapsed
              ? 'w-full justify-center px-0 py-1'
              : 'w-full gap-3 px-2 py-2.5'
          }`}
        >
          <span
            className={`grid shrink-0 place-items-center overflow-hidden ${
              isCollapsed ? 'size-8 rounded-lg' : 'size-10 rounded-xl'
            }`}
          >
            {/* وضع فاتح */}
            <img
              src='/images/favicon_light.svg'
              alt='نالش'
              className={`dark:hidden ${isCollapsed ? 'size-8' : 'size-10'}`}
              aria-hidden='true'
            />
            {/* وضع داكن */}
            <img
              src='/images/favicon.svg'
              alt='نالش'
              className={`hidden dark:block ${isCollapsed ? 'size-8' : 'size-10'}`}
              aria-hidden='true'
            />
          </span>
          <span
            className={`grid min-w-0 gap-1 text-start ${isCollapsed ? 'sr-only' : ''}`}
          >
            <span className='truncate text-sm font-bold'>
              {activeTeam.name}
            </span>
            <span className='truncate text-xs text-muted-foreground'>
              {activeTeam.plan}
            </span>
          </span>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
