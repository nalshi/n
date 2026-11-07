import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calculator, CheckCircle2, CircleAlert, Scale } from 'lucide-react'
import { useMerchantIdentity } from '@/hooks/useMerchantRealtime'
import { Badge } from '@/components/ui/badge'
import { Main } from '@/components/layout/main'
import {
  MerchantPageHeading,
  MerchantWorkspaceHeader,
} from '@/components/layout/merchant-workspace'
import {
  accountingQueryKeys,
  fetchAccountingSettings,
  fetchTrialBalance,
} from './accounting-data'
import { ACCOUNTING_NAV_TABS, type AccountingTabId } from './accounting-tabs'

export type { AccountingTabId } from './accounting-tabs'

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
    queryKey: [...accountingQueryKeys(merchantId || ''), 'trial-balance'],
    queryFn: () => fetchTrialBalance(),
    enabled: Boolean(merchantId),
    staleTime: 30_000,
  })

  const settings = settingsQuery.data
  const currency = settings?.functional_currency
  const isPolicyConfirmed = settings?.policy_confirmed
  const isBalanced = trialBalanceQuery.data?.is_balanced

  return (
    <>
      <MerchantWorkspaceHeader />
      <Main className='space-y-6 p-4 md:p-6'>
        {/* رأس الصفحة الرئيسي */}
        <div className='flex flex-col items-start justify-between gap-4 border-b pb-4 md:flex-row md:items-center'>
          <div>
            <div className='flex items-center gap-3'>
              <div className='rounded-lg bg-primary/10 p-2 text-primary'>
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
            <Badge variant='outline' className='gap-1 px-3 py-1 text-sm'>
              <span className='text-muted-foreground'>العملة الوظيفية:</span>
              <span className='font-bold text-foreground'>
                {currency || 'غير محددة'}
              </span>
            </Badge>

            {settingsQuery.isPending ? (
              <Badge variant='outline' className='gap-1 px-3 py-1 text-sm'>
                جاري تحميل إعدادات المحاسبة
              </Badge>
            ) : settingsQuery.isError ? (
              <Badge variant='destructive' className='gap-1 px-3 py-1 text-sm'>
                تعذر تحميل إعدادات المحاسبة
              </Badge>
            ) : isPolicyConfirmed ? (
              <Badge
                variant='default'
                className='gap-1 bg-emerald-600 px-3 py-1 text-sm'
              >
                <CheckCircle2 className='size-3.5' />
                <span>النظام المحاسبي معتمد</span>
              </Badge>
            ) : (
              <Badge variant='destructive' className='gap-1 px-3 py-1 text-sm'>
                <CircleAlert className='size-3.5' />
                <span>يتطلب اعتماد السياسة</span>
              </Badge>
            )}

            {trialBalanceQuery.isPending ? (
              <Badge variant='outline' className='gap-1 px-3 py-1 text-sm'>
                جاري التحقق من ميزان المراجعة
              </Badge>
            ) : trialBalanceQuery.isError ? (
              <Badge variant='destructive' className='gap-1 px-3 py-1 text-sm'>
                تعذر التحقق من ميزان المراجعة
              </Badge>
            ) : isBalanced ? (
              <Badge
                variant='secondary'
                className='gap-1 border border-emerald-500/30 px-3 py-1 text-sm text-emerald-700 dark:text-emerald-400'
              >
                <Scale className='size-3.5' />
                <span>القيود متوازنة</span>
              </Badge>
            ) : (
              <Badge variant='destructive' className='gap-1 px-3 py-1 text-sm'>
                <CircleAlert className='size-3.5' />
                <span>تحذير: عدم توازن في ميزان المراجعة</span>
              </Badge>
            )}
          </div>
        </div>

        {/* شريط التبويبات العلوي المتجاوب */}
        <div className='scrollbar-none overflow-x-auto pb-1'>
          <nav className='flex min-w-max items-center gap-1.5 border-b border-border/60 pb-2'>
            {ACCOUNTING_NAV_TABS.map((tab) => {
              const Icon = tab.icon
              const isActive =
                activeTab === tab.id || (!activeTab && tab.id === 'dashboard')

              return (
                <button
                  key={tab.id}
                  type='button'
                  onClick={() => {
                    if (onTabChange) {
                      onTabChange(tab.id)
                    }
                  }}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
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
