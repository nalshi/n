import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { useIsRestoring } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useAuthStore } from '@/stores/auth-store'
import { DirectionProvider } from './context/direction-provider'
import { FontProvider } from './context/font-provider'
import { ThemeProvider } from './context/theme-provider'
import { createQueryClient, queryPersistOptions } from './queryClient'
// Generated Routes
import { routeTree } from './routeTree.gen'
// Styles
import './styles/index.css'

const queryClient = createQueryClient({
  onUnauthorized: () => {
    useAuthStore.getState().auth.reset()
    const redirect = `${router.history.location.href}`
    void router.navigate({ to: '/sign-in', search: { redirect } })
  },
  onInternalServerError: () => {
    void router.navigate({ to: '/500' })
  },
})

// Create a new router instance
const router = createRouter({
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

function PersistedApplication() {
  const isRestoring = useIsRestoring()
  if (isRestoring) return null

  return (
    <ThemeProvider>
      <FontProvider>
        <DirectionProvider>
          <RouterProvider router={router} />
        </DirectionProvider>
      </FontProvider>
    </ThemeProvider>
  )
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
