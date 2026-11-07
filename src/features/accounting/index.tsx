import { useEffect, useState } from 'react'
import {
  AccountingLayout,
  type AccountingTabId,
} from './AccountingLayout'
import { DashboardView } from './DashboardView'
import { AccountsView } from './AccountsView'
import { JournalEntriesView } from './JournalEntriesView'
import { GeneralLedgerView } from './GeneralLedgerView'
import { TrialBalanceView } from './TrialBalanceView'
import { SalesView } from './SalesView'
import { PurchasesView } from './PurchasesView'
import { CustomersView } from './CustomersView'
import { SuppliersView } from './SuppliersView'
import { CashView } from './CashView'
import { BanksView } from './BanksView'
import { InventoryView } from './InventoryView'
import { ExpensesView } from './ExpensesView'
import { ReportsView } from './ReportsView'
import { SettingsView } from './SettingsView'

function getInitialTab(): AccountingTabId {
  if (typeof window === 'undefined') return 'dashboard'
  const params = new URLSearchParams(window.location.search)
  const tab = params.get('tab') as AccountingTabId | null
  const validTabs: AccountingTabId[] = [
    'dashboard',
    'accounts',
    'journal-entries',
    'general-ledger',
    'trial-balance',
    'sales',
    'purchases',
    'customers',
    'suppliers',
    'cash',
    'banks',
    'inventory',
    'expenses',
    'reports',
    'settings',
  ]
  if (tab && validTabs.includes(tab)) {
    return tab
  }
  return 'dashboard'
}

export function Accounting() {
  const [activeTab, setActiveTab] = useState<AccountingTabId>(getInitialTab)

  // Listen to popstate (back/forward browser buttons)
  useEffect(() => {
    function onPopState() {
      setActiveTab(getInitialTab())
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function handleTabChange(tab: AccountingTabId) {
    setActiveTab(tab)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (tab === 'dashboard') {
        url.searchParams.delete('tab')
      } else {
        url.searchParams.set('tab', tab)
      }
      window.history.pushState(null, '', url.toString())
    }
  }

  function renderActiveView() {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView onNavigate={handleTabChange} />
      case 'accounts':
        return <AccountsView />
      case 'journal-entries':
        return <JournalEntriesView />
      case 'general-ledger':
        return <GeneralLedgerView />
      case 'trial-balance':
        return <TrialBalanceView />
      case 'sales':
        return <SalesView />
      case 'purchases':
        return <PurchasesView />
      case 'customers':
        return <CustomersView />
      case 'suppliers':
        return <SuppliersView />
      case 'cash':
        return <CashView />
      case 'banks':
        return <BanksView />
      case 'inventory':
        return <InventoryView />
      case 'expenses':
        return <ExpensesView />
      case 'reports':
        return <ReportsView />
      case 'settings':
        return <SettingsView />
      default:
        return <DashboardView onNavigate={handleTabChange} />
    }
  }

  return (
    <AccountingLayout activeTab={activeTab} onTabChange={handleTabChange}>
      {renderActiveView()}
    </AccountingLayout>
  )
}

// Re-exports
export * from './accounting-data'
export * from './AccountingLayout'
export * from './DashboardView'
export * from './AccountsView'
export * from './JournalEntriesView'
export * from './GeneralLedgerView'
export * from './TrialBalanceView'
export * from './SalesView'
export * from './PurchasesView'
export * from './CustomersView'
export * from './SuppliersView'
export * from './CashView'
export * from './BanksView'
export * from './InventoryView'
export * from './ExpensesView'
export * from './ReportsView'
export * from './SettingsView'
export default Accounting
