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
  Tags,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'التاجر',
    email: 'مساحة التاجر',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: 'نالش',
      logo: Store,
      plan: 'بوابة التاجر',
    },
  ],
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
              title: 'إدارة المخزون',
              url: '/products?tab=inventory',
              icon: Boxes,
            },
            {
              title: 'الفئات',
              url: '/products?manageCategories=true',
              icon: Tags,
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
