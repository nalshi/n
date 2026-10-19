import { createContext, useContext } from 'react'

export type DashboardIntroContextValue = {
  isActive: boolean
  startIntro: () => void
  setIntroReady: (ready: boolean) => void
  finishIntro: () => void
}

export const DashboardIntroContext = createContext<DashboardIntroContextValue>({
  isActive: false,
  startIntro: () => undefined,
  setIntroReady: () => undefined,
  finishIntro: () => undefined,
})

export function useDashboardIntro() {
  return useContext(DashboardIntroContext)
}
