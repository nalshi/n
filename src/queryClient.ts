import { AxiosError } from 'axios'
import { QueryCache, QueryClient, type Query } from '@tanstack/react-query'
import type { Persister } from '@tanstack/react-query-persist-client'
import { del, get, set } from 'idb-keyval'
import { toast } from 'sonner'
import { handleServerError } from '@/lib/handle-server-error'
import { getMerchantIdentityFromToken } from '@/lib/merchant-accounts'

const PERSISTED_CLIENT_KEY = 'merchant-dashboard-query-cache-v1'

function getPersistedClientKey() {
  if (typeof window === 'undefined') return PERSISTED_CLIENT_KEY
  const token =
    localStorage.getItem('merchant_token') ||
    sessionStorage.getItem('merchant_token') ||
    ''
  const accountId = getMerchantIdentityFromToken(token)
  return accountId
    ? `${PERSISTED_CLIENT_KEY}:${encodeURIComponent(accountId)}`
    : `${PERSISTED_CLIENT_KEY}:anonymous`
}

export const queryPersister: Persister = {
  persistClient: async (client) => {
    await set(getPersistedClientKey(), client)
  },
  restoreClient: async () => get(getPersistedClientKey()),
  removeClient: async () => {
    await del(getPersistedClientKey())
  },
}

export const queryPersistOptions = {
  persister: queryPersister,
  buster: 'merchant-dashboard-v1',
  maxAge: Number.POSITIVE_INFINITY,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) => query.state.status === 'success',
  },
}

type QueryClientOptions = {
  onUnauthorized: () => void
  onInternalServerError: () => void
}

export function createQueryClient({
  onUnauthorized,
  onInternalServerError,
}: QueryClientOptions): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          // eslint-disable-next-line no-console
          if (import.meta.env.DEV) console.log({ failureCount, error })
          if (failureCount >= 0 && import.meta.env.DEV) return false
          if (failureCount > 3 && import.meta.env.PROD) return false
          return !(
            error instanceof AxiosError &&
            [401, 403].includes(error.response?.status ?? 0)
          )
        },
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: {
        onError: (error) => {
          handleServerError(error)
          if (error instanceof AxiosError && error.response?.status === 304) {
            toast.error('Content not modified!')
          }
        },
      },
    },
    queryCache: new QueryCache({
      onError: (error) => {
        if (!(error instanceof AxiosError)) return
        if (error.response?.status === 401) {
          toast.error('Session expired!')
          onUnauthorized()
        }
        if (error.response?.status === 500 && import.meta.env.PROD) {
          toast.error('Internal Server Error!')
          onInternalServerError()
        }
      },
    }),
  })
}
