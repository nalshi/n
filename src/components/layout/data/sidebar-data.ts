import {
  Boxes,
  CirclePlus,
  Clock3,
  History,
  LayoutDashboard,
  List,
  Package,
  Palette,
  Settings,
  ShoppingBag,
  Store,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'التاجر',
    email: 'مساحة التاجر',
  },
  navGroups: [
    {
      title: 'إدارة المتجر',
      items: [
        {
          title: 'الرئيسية',
          url: '/',
          icon: LayoutDashboard,
        },
        {
          title: 'المنتجات',
          icon: Package,
          items: [
            {
              title: 'قائمة المنتجات',
              url: '/products',
              icon: List,
            },
            {
              title: 'المخزون والفئات',
              url: '/products?tab=inventory',
              icon: Boxes,
            },
            {
              title: 'إضافة منتج',
              url: '/products?create=true',
              icon: CirclePlus,
            },
          ],
        },
        {
          title: 'الطلبات',
          icon: ShoppingBag,
          items: [
            {
              title: 'الطلبات النشطة',
              url: '/orders',
              icon: Clock3,
            },
            {
              title: 'الطلبات السابقة',
              url: '/previous-orders',
              icon: History,
            },
          ],
        },
        {
          title: 'الإعدادات',
          icon: Settings,
          items: [
            {
              title: 'قوالب المتجر',
              url: '/storefront',
              icon: Palette,
            },
            {
              title: 'إعدادات المتجر',
              url: '/store-settings',
              icon: Store,
            },
          ],
        },
      ],
    },
  ],
}
