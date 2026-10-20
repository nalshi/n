import { useLayout } from '@/context/layout-provider'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { AppTitle } from './app-title'
import { sidebarData } from './data/sidebar-data'
import { MerchantAccountSwitcher } from './merchant-account-switcher'
import { NavGroup } from './nav-group'

export function AppSidebar({ inert = false }: { inert?: boolean }) {
  const { collapsible, variant } = useLayout()
  return (
    <Sidebar
      collapsible={collapsible}
      variant={variant}
      inert={inert}
      aria-hidden={inert}
    >
      <SidebarHeader className='border-b border-sidebar-border px-3 py-3 group-data-[collapsible=icon]:!px-1 sm:px-4'>
        <AppTitle />
      </SidebarHeader>
      <SidebarContent className='px-2 py-3'>
        {sidebarData.navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter className='border-t border-sidebar-border px-2 py-3'>
        <MerchantAccountSwitcher placement='sidebar' />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
