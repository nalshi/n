export function MerchantLogoSymbol() {
  return (
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
  )
}
