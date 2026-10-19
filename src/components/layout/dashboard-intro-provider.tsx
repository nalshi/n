import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useIsFetching, useIsMutating } from '@tanstack/react-query'
import { DashboardIntro } from '@/components/layout/dashboard-intro'
import { DashboardIntroContext } from '@/components/layout/dashboard-intro-context'
import { MerchantOperationLoader } from '@/components/layout/merchant-operation-loader'

const STARTUP_FALLBACK_MS = 1500

export function DashboardIntroProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isActive, setIsActive] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const [localOperationCount, setLocalOperationCount] = useState(0)
  const pendingMutations = useIsMutating()
  const fetchingQueries = useIsFetching({ type: 'active' })
  const isOperationPending =
    pendingMutations > 0 || fetchingQueries > 0 || localOperationCount > 0
  const startupFallbackRef = useRef<number | undefined>(undefined)
  const hasRouteReadinessSignalRef = useRef(false)

  const startIntro = useCallback(() => {
    hasRouteReadinessSignalRef.current = true
    window.clearTimeout(startupFallbackRef.current)
    startupFallbackRef.current = undefined
    setIsReady(false)
    setIsActive(true)
  }, [])
  const setIntroReady = useCallback((ready: boolean) => {
    hasRouteReadinessSignalRef.current = true
    if (ready) {
      window.clearTimeout(startupFallbackRef.current)
      startupFallbackRef.current = undefined
    }
    setIsReady(ready)
  }, [])
  const finishIntro = useCallback(() => {
    window.clearTimeout(startupFallbackRef.current)
    startupFallbackRef.current = undefined
    setIsActive(false)
    setIsReady(false)
  }, [])
  const beginOperation = useCallback(() => {
    setLocalOperationCount((count) => count + 1)
    let finished = false
    return () => {
      if (finished) return
      finished = true
      setLocalOperationCount((count) => Math.max(0, count - 1))
    }
  }, [])

  useEffect(() => {
    if (hasRouteReadinessSignalRef.current) return

    startupFallbackRef.current = window.setTimeout(() => {
      setIntroReady(true)
    }, STARTUP_FALLBACK_MS)

    return () => window.clearTimeout(startupFallbackRef.current)
  }, [setIntroReady])

  const contextValue = useMemo(
    () => ({
      isActive,
      startIntro,
      setIntroReady,
      finishIntro,
      beginOperation,
    }),
    [beginOperation, finishIntro, isActive, setIntroReady, startIntro]
  )

  return (
    <DashboardIntroContext.Provider value={contextValue}>
      <div
        inert={isActive || isOperationPending}
        aria-hidden={isActive || isOperationPending}
        aria-busy={isOperationPending}
      >
        {children}
      </div>
      {!isActive && <MerchantOperationLoader isPending={isOperationPending} />}
      {isActive && (
        <DashboardIntro isReady={isReady} onComplete={finishIntro} />
      )}
    </DashboardIntroContext.Provider>
  )
}
