import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { createRouter } from '@tanstack/react-router'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useAuthStore } from '@/stores/auth-store'
import {
  getActiveMerchantToken,
  removeSavedMerchantAccount,
} from '@/lib/merchant-accounts'
import { PersistedApplication } from './app/persisted-application'
import { createQueryClient, queryPersistOptions } from './queryClient'
// Generated Routes
import { routeTree } from './routeTree.gen'
// Styles
import './styles/index.css'

const queryClient = createQueryClient({
  onUnauthorized: () => {
    removeSavedMerchantAccount(getActiveMerchantToken())
    useAuthStore.getState().auth.reset()
    const redirect = `${router.history.location.href}`
    void router.navigate({ to: '/sign-in', search: { redirect } })
  },
  onInternalServerError: () => {
    void router.navigate({ to: '/500' })
  },
})

// Create a new router instance
export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={queryPersistOptions}
      >
        <PersistedApplication />
      </PersistQueryClientProvider>
    </StrictMode>
  )
}

// ─── تسجيل ساعي البريد الصامت في الخلفية (Service Worker) ─────────────────
if ('serviceWorker' in navigator && typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // eslint-disable-next-line no-console
        console.log(
          '✅ ساعي البريد الصامت في الخلفية جاهز (Service Worker Registered)',
          reg.scope
        )
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('تعذر تسجيل Service Worker:', err)
      })
  })
}
