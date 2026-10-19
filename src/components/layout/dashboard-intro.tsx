import { useEffect, useState } from 'react'

type DashboardIntroProps = {
  isReady: boolean
  onComplete: () => void
}

export function DashboardIntro({
  isReady,
  onComplete,
}: DashboardIntroProps) {
  const [minimumTimeElapsed, setMinimumTimeElapsed] = useState(false)
  const isExiting = isReady && minimumTimeElapsed

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    const minimumDisplayDuration = reducedMotion ? 400 : 1_600
    const timer = window.setTimeout(
      () => setMinimumTimeElapsed(true),
      minimumDisplayDuration
    )

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!isReady || !minimumTimeElapsed) return

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    const timer = window.setTimeout(onComplete, reducedMotion ? 100 : 280)

    return () => window.clearTimeout(timer)
  }, [isReady, minimumTimeElapsed, onComplete])

  return (
    <div
      className={`merchant-intro${isExiting ? 'is-exiting' : ''}`}
      role='status'
      aria-live='polite'
      aria-label='جارٍ تجهيز لوحة التاجر'
      dir='rtl'
    >
      <div className='merchant-intro-content'>
        <span className='merchant-intro-mark'>
          <svg
            viewBox='0 0 100 100'
            className='merchant-intro-symbol'
            aria-hidden='true'
          >
            <path
              className='merchant-intro-mark-path'
              d='M22 38 Q22 82 50 82 Q78 82 78 38'
            />
            <circle className='merchant-intro-mark-dot' cx='50' cy='16' r='7' />
          </svg>
        </span>
        <span className='merchant-intro-name'>نالش</span>
        <span className='merchant-intro-caption'>بوابة التاجر</span>
        <span className='merchant-intro-status'>جارٍ تجهيز لوحة التاجر</span>
      </div>
    </div>
  )
}
