import {
  BarChart3,
  BookOpen,
  BookText,
  Boxes,
  Building2,
  Calculator,
  CirclePlus,
  Clock3,
  FilePlus2,
  History,
  LayoutDashboard,
  List,
  Package,
  Palette,
  Receipt,
  Scale,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Wallet,
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
    {
      title: 'الشؤون المالية والمحاسبية',
      items: [
        {
          title: 'النظام المحاسبي',
          icon: Calculator,
          items: [
            {
              title: 'لوحة المؤشرات المالية',
              url: '/accounting',
              icon: LayoutDashboard,
            },
            {
              title: 'دليل الحسابات',
              url: '/accounting?tab=accounts',
              icon: BookOpen,
            },
            {
              title: 'قيود اليومية',
              url: '/accounting?tab=journal-entries',
              icon: FilePlus2,
            },
            {
              title: 'دفتر الأستاذ العام',
              url: '/accounting?tab=general-ledger',
              icon: BookText,
            },
            {
              title: 'ميزان المراجعة',
              url: '/accounting?tab=trial-balance',
              icon: Scale,
            },
            {
              title: 'المبيعات والفواتير',
              url: '/accounting?tab=sales',
              icon: ShoppingBag,
            },
            {
              title: 'المشتريات وفواتير الموردين',
              url: '/accounting?tab=purchases',
              icon: ShoppingCart,
            },
            {
              title: 'العملاء والذمم المدينة',
              url: '/accounting?tab=customers',
              icon: Users,
            },
            {
              title: 'الموردون والذمم الدائنة',
              url: '/accounting?tab=suppliers',
              icon: Truck,
            },
            {
              title: 'الصناديق وسندات القبض/الصرف',
              url: '/accounting?tab=cash',
              icon: Wallet,
            },
            {
              title: 'الحسابات البنكية والتحويلات',
              url: '/accounting?tab=banks',
              icon: Building2,
            },
            {
              title: 'المخزون وتكلفة البضاعة المباعة',
              url: '/accounting?tab=inventory',
              icon: Boxes,
            },
            {
              title: 'المصروفات التشغيلية',
              url: '/accounting?tab=expenses',
              icon: Receipt,
            },
            {
              title: 'القوائم والتقارير المالية',
              url: '/accounting?tab=reports',
              icon: BarChart3,
            },
            {
              title: 'إعدادات المحاسبة والفترات',
              url: '/accounting?tab=settings',
              icon: Settings,
            },
          ],
        },
      ],
    },
  ],
}
