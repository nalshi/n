import { useEffect, useRef } from 'react'
import { MerchantLogoSymbol } from '@/components/layout/merchant-logo-symbol'

export function MerchantOperationLoader({ isPending }: { isPending: boolean }) {
  const loaderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loader = loaderRef.current
    if (!loader) return

    const updateDocumentVisibility = () => {
      loader.classList.toggle('is-document-hidden', document.hidden)
    }
    updateDocumentVisibility()
    document.addEventListener('visibilitychange', updateDocumentVisibility)

    return () =>
      document.removeEventListener('visibilitychange', updateDocumentVisibility)
  }, [])

  if (!isPending) return null

  return (
    <div
      ref={loaderRef}
      className='merchant-operation-loader'
      role='status'
      aria-label='جارٍ تنفيذ العملية'
      dir='rtl'
    >
      <span className='merchant-operation-loader-mark'>
        <MerchantLogoSymbol />
      </span>
    </div>
  )
}
