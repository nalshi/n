/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import { AccountingLayout } from './AccountingLayout'
import { type AccountingTabId } from './accounting-tabs'
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

export { AccountingLayout } from './AccountingLayout'
export { ACCOUNTING_NAV_TABS, type AccountingTabId } from './accounting-tabs'
export { DashboardView } from './DashboardView'
export { AccountsView } from './AccountsView'
export { JournalEntriesView } from './JournalEntriesView'
export { GeneralLedgerView } from './GeneralLedgerView'
export { TrialBalanceView } from './TrialBalanceView'
export { SalesView } from './SalesView'
export { PurchasesView } from './PurchasesView'
export { CustomersView } from './CustomersView'
export { SuppliersView } from './SuppliersView'
export { CashView } from './CashView'
export { BanksView } from './BanksView'
export { InventoryView } from './InventoryView'
export { ExpensesView } from './ExpensesView'
export { ReportsView } from './ReportsView'
export { SettingsView } from './SettingsView'
export { accountingQueryKeys } from './accounting-data'
export default Accounting
