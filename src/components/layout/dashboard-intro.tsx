import { useEffect, useRef } from 'react'

type DashboardIntroProps = {
  isReady: boolean
  onComplete: () => void
}

export function DashboardIntro({ isReady, onComplete }: DashboardIntroProps) {
  const introRef = useRef<HTMLDivElement>(null)
  const markRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const intro = introRef.current
    if (!intro) return

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

    intro.classList.add('is-arriving')

    const destination = reducedMotion
      ? null
      : document.querySelector<HTMLElement>('[data-merchant-intro-destination]')
    const targetRect = destination?.getBoundingClientRect()
    const targetIsVisible =
      targetRect &&
      targetRect.width > 0 &&
      targetRect.height > 0 &&
      targetRect.right > 0 &&
      targetRect.bottom > 0 &&
      targetRect.left < window.innerWidth &&
      targetRect.top < window.innerHeight
    let animation: Animation | undefined
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

    const timer = window.setTimeout(onComplete, duration)

    return () => {
      window.clearTimeout(timer)
      animation?.cancel()
    }
  }, [isReady, onComplete])

  return (
    <div
      ref={introRef}
      className='merchant-intro'
      role='status'
      aria-live='polite'
      aria-label='جارٍ تجهيز لوحة التاجر'
      dir='rtl'
    >
      <div className='merchant-intro-content'>
        <span ref={markRef} className='merchant-intro-mark'>
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
