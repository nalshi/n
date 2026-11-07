import {
  BarChart3,
  BookOpen,
  BookText,
  Boxes,
  Building2,
  FilePlus2,
  LayoutDashboard,
  Receipt,
  Scale,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from 'lucide-react'

export type AccountingTabId =
  | 'dashboard'
  | 'accounts'
  | 'journal-entries'
  | 'general-ledger'
  | 'trial-balance'
  | 'sales'
  | 'purchases'
  | 'customers'
  | 'suppliers'
  | 'cash'
  | 'banks'
  | 'inventory'
  | 'expenses'
  | 'reports'
  | 'settings'

export const ACCOUNTING_NAV_TABS: Array<{
  id: AccountingTabId
  label: string
  href: string
  icon: typeof BookOpen
}> = [
  {
    id: 'dashboard',
    label: 'لوحة المؤشرات',
    href: '/accounting/dashboard',
    icon: LayoutDashboard,
  },
  {
    id: 'accounts',
    label: 'دليل الحسابات',
    href: '/accounting/accounts',
    icon: BookOpen,
  },
  {
    id: 'journal-entries',
    label: 'قيود اليومية',
    href: '/accounting/journal-entries',
    icon: FilePlus2,
  },
  {
    id: 'general-ledger',
    label: 'دفتر الأستاذ',
    href: '/accounting/general-ledger',
    icon: BookText,
  },
  {
    id: 'trial-balance',
    label: 'ميزان المراجعة',
    href: '/accounting/trial-balance',
    icon: Scale,
  },
  {
    id: 'sales',
    label: 'المبيعات والفواتير',
    href: '/accounting/sales',
    icon: ShoppingBag,
  },
  {
    id: 'purchases',
    label: 'المشتريات',
    href: '/accounting/purchases',
    icon: ShoppingCart,
  },
  {
    id: 'customers',
    label: 'العملاء',
    href: '/accounting/customers',
    icon: Users,
  },
  {
    id: 'suppliers',
    label: 'الموردون',
    href: '/accounting/suppliers',
    icon: Truck,
  },
  { id: 'cash', label: 'الصناديق', href: '/accounting/cash', icon: Wallet },
  { id: 'banks', label: 'البنوك', href: '/accounting/banks', icon: Building2 },
  {
    id: 'inventory',
    label: 'المخزون والتكلفة',
    href: '/accounting/inventory',
    icon: Boxes,
  },
  {
    id: 'expenses',
    label: 'المصروفات',
    href: '/accounting/expenses',
    icon: Receipt,
  },
  {
    id: 'reports',
    label: 'التقارير المالية',
    href: '/accounting/reports',
    icon: BarChart3,
  },
  {
    id: 'settings',
    label: 'الإعدادات والفترات',
    href: '/accounting/settings',
    icon: Settings,
  },
]
