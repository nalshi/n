import { useCallback, useMemo, useState } from 'react'
import { DashboardIntro } from '@/components/layout/dashboard-intro'
import { DashboardIntroContext } from '@/components/layout/dashboard-intro-context'

export function DashboardIntroProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isActive, setIsActive] = useState(false)
  const [isReady, setIsReady] = useState(false)

  const startIntro = useCallback(() => {
    setIsReady(false)
    setIsActive(true)
  }, [])
  const setIntroReady = useCallback((ready: boolean) => {
    setIsReady(ready)
  }, [])
  const finishIntro = useCallback(() => {
    setIsActive(false)
    setIsReady(false)
  }, [])

  const contextValue = useMemo(
    () => ({ isActive, startIntro, setIntroReady, finishIntro }),
    [finishIntro, isActive, setIntroReady, startIntro]
  )

  return (
    <DashboardIntroContext.Provider value={contextValue}>
      {children}
      {isActive && (
        <DashboardIntro isReady={isReady} onComplete={finishIntro} />
      )}
    </DashboardIntroContext.Provider>
  )
}
