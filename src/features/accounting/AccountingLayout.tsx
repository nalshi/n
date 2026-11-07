import { type ReactNode } from 'react'
import {
  BarChart3,
  BookOpen,
  BookText,
  Boxes,
  Building2,
  Calculator,
  CheckCircle2,
  CircleAlert,
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
import { Badge } from '@/components/ui/badge'
import { Main } from '@/components/layout/main'
import {
  MerchantPageHeading,
  MerchantWorkspaceHeader,
} from '@/components/layout/merchant-workspace'
import { useMerchantIdentity } from '@/hooks/useMerchantRealtime'
import { useQuery } from '@tanstack/react-query'
import {
  accountingQueryKeys,
  fetchAccountingSettings,
  fetchTrialBalance,
} from './accounting-data'

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
  { id: 'dashboard', label: 'لوحة المؤشرات', href: '/accounting/dashboard', icon: LayoutDashboard },
  { id: 'accounts', label: 'دليل الحسابات', href: '/accounting/accounts', icon: BookOpen },
  { id: 'journal-entries', label: 'قيود اليومية', href: '/accounting/journal-entries', icon: FilePlus2 },
  { id: 'general-ledger', label: 'دفتر الأستاذ', href: '/accounting/general-ledger', icon: BookText },
  { id: 'trial-balance', label: 'ميزان المراجعة', href: '/accounting/trial-balance', icon: Scale },
  { id: 'sales', label: 'المبيعات والفواتير', href: '/accounting/sales', icon: ShoppingBag },
  { id: 'purchases', label: 'المشتريات', href: '/accounting/purchases', icon: ShoppingCart },
  { id: 'customers', label: 'العملاء', href: '/accounting/customers', icon: Users },
  { id: 'suppliers', label: 'الموردون', href: '/accounting/suppliers', icon: Truck },
  { id: 'cash', label: 'الصناديق', href: '/accounting/cash', icon: Wallet },
  { id: 'banks', label: 'البنوك', href: '/accounting/banks', icon: Building2 },
  { id: 'inventory', label: 'المخزون والتكلفة', href: '/accounting/inventory', icon: Boxes },
  { id: 'expenses', label: 'المصروفات', href: '/accounting/expenses', icon: Receipt },
  { id: 'reports', label: 'التقارير المالية', href: '/accounting/reports', icon: BarChart3 },
  { id: 'settings', label: 'الإعدادات والفترات', href: '/accounting/settings', icon: Settings },
]

export function AccountingLayout({
  children,
  activeTab,
  onTabChange,
}: {
  children: ReactNode
  activeTab?: AccountingTabId
  onTabChange?: (tab: AccountingTabId) => void
}) {
  const merchantId = useMerchantIdentity()

  const settingsQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'settings'],
    queryFn: fetchAccountingSettings,
    enabled: Boolean(merchantId),
  })

  const trialBalanceQuery = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'trial-balance-status'],
    queryFn: () => fetchTrialBalance(),
    enabled: Boolean(merchantId),
    staleTime: 30_000,
  })

  const settings = settingsQuery.data
  const currency = settings?.functional_currency || 'YER'
  const isPolicyConfirmed = Boolean(settings?.policy_confirmed)
  const isBalanced = trialBalanceQuery.data?.is_balanced ?? true

  return (
    <>
      <MerchantWorkspaceHeader />
      <Main className='p-4 md:p-6 space-y-6'>
        {/* رأس الصفحة الرئيسي */}
        <div className='flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b pb-4'>
          <div>
            <div className='flex items-center gap-3'>
              <div className='p-2 bg-primary/10 text-primary rounded-lg'>
                <Calculator className='size-6' />
              </div>
              <div>
                <MerchantPageHeading
                  title='النظام المحاسبي والمالي المتكامل'
                  description='إدارة الحسابات، المبيعات والمشتريات، الذمم، الصناديق، المخزون، والتقارير المالية بنظام القيد المزدوج'
                />
              </div>
            </div>
          </div>

          {/* شارات الحالة والعملة */}
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='outline' className='gap-1 text-sm py-1 px-3'>
              <span className='text-muted-foreground'>العملة الوظيفية:</span>
              <span className='font-bold text-foreground'>{currency}</span>
            </Badge>

            {isPolicyConfirmed ? (
              <Badge variant='default' className='bg-emerald-600 gap-1 text-sm py-1 px-3'>
                <CheckCircle2 className='size-3.5' />
                <span>النظام المحاسبي معتمد</span>
              </Badge>
            ) : (
              <Badge variant='destructive' className='gap-1 text-sm py-1 px-3'>
                <CircleAlert className='size-3.5' />
                <span>يتطلب اعتماد السياسة</span>
              </Badge>
            )}

            {isBalanced ? (
              <Badge variant='secondary' className='border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 gap-1 text-sm py-1 px-3'>
                <Scale className='size-3.5' />
                <span>القيود متوازنة</span>
              </Badge>
            ) : (
              <Badge variant='destructive' className='gap-1 text-sm py-1 px-3'>
                <CircleAlert className='size-3.5' />
                <span>تحذير: عدم توازن في ميزان المراجعة</span>
              </Badge>
            )}
          </div>
        </div>

        {/* شريط التبويبات العلوي المتجاوب */}
        <div className='overflow-x-auto pb-1 scrollbar-none'>
          <nav className='flex items-center gap-1.5 min-w-max border-b border-border/60 pb-2'>
            {ACCOUNTING_NAV_TABS.map((tab) => {
              const Icon = tab.icon
              const isActive =
                activeTab === tab.id ||
                (!activeTab && tab.id === 'dashboard')

              return (
                <button
                  key={tab.id}
                  type='button'
                  onClick={() => {
                    if (onTabChange) {
                      onTabChange(tab.id)
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <Icon className='size-4' />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* محتوى الصفحة الحالي */}
        <div className='space-y-6'>{children}</div>
      </Main>
    </>
  )
}
