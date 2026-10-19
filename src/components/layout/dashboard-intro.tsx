import { useEffect, useRef } from 'react'
import { MerchantLogoSymbol } from '@/components/layout/merchant-logo-symbol'

const MIN_INTRO_DURATION_MS = 650

type DashboardIntroProps = {
  isReady: boolean
  onComplete: () => void
}

export function DashboardIntro({ isReady, onComplete }: DashboardIntroProps) {
  const introRef = useRef<HTMLDivElement>(null)
  const markRef = useRef<HTMLSpanElement>(null)
  const startedAtRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const intro = introRef.current
    if (!intro) return

    startedAtRef.current = performance.now()
    const updateDocumentVisibility = () => {
      intro.classList.toggle('is-document-hidden', document.hidden)
    }
    updateDocumentVisibility()
    document.addEventListener('visibilitychange', updateDocumentVisibility)

    return () =>
      document.removeEventListener('visibilitychange', updateDocumentVisibility)
  }, [])

  useEffect(() => {
    if (!isReady) return

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    const intro = introRef.current
    const mark = markRef.current
    if (!intro || !mark) return

    let animation: Animation | undefined
    let completeTimer: number | undefined
    const startedAt = startedAtRef.current ?? performance.now()
    const readyDelay = Math.max(
      0,
      (reducedMotion ? 180 : MIN_INTRO_DURATION_MS) -
        (performance.now() - startedAt)
    )
    const readyTimer = window.setTimeout(() => {
      intro.classList.add('is-arriving')

      const destination = reducedMotion
        ? null
        : document.querySelector<HTMLElement>(
            '[data-merchant-intro-destination]'
          )
      const targetRect = destination?.getBoundingClientRect()
      const targetIsVisible =
        targetRect &&
        targetRect.width > 0 &&
        targetRect.height > 0 &&
        targetRect.right > 0 &&
        targetRect.bottom > 0 &&
        targetRect.left < window.innerWidth &&
        targetRect.top < window.innerHeight
      let duration = reducedMotion ? 100 : 180

      if (targetRect && targetIsVisible && !reducedMotion) {
        const sourceRect = mark.getBoundingClientRect()
        const translateX =
          targetRect.left +
          targetRect.width / 2 -
          (sourceRect.left + sourceRect.width / 2)
        const translateY =
          targetRect.top +
          targetRect.height / 2 -
          (sourceRect.top + sourceRect.height / 2)
        const scale = targetRect.width / sourceRect.width
        duration = 320
        animation = mark.animate(
          [
            { transform: 'translate3d(0, 0, 0) scale(1)' },
            {
              transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`,
            },
          ],
          {
            duration,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'forwards',
          }
        )
      }

      completeTimer = window.setTimeout(onComplete, duration)
    }, readyDelay)

    return () => {
      window.clearTimeout(readyTimer)
      window.clearTimeout(completeTimer)
      animation?.cancel()
    }
  }, [isReady, onComplete])

  return (
    <div ref={introRef} className='merchant-intro' aria-hidden='true' dir='rtl'>
      <div className='merchant-intro-content'>
        <span ref={markRef} className='merchant-intro-mark'>
          <MerchantLogoSymbol />
        </span>
      </div>
    </div>
  )
}
