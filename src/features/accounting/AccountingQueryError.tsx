import { Button } from '@/components/ui/button'

export function AccountingQueryError({
  error,
  onRetry,
}: {
  error: unknown
  onRetry: () => void
}) {
  return (
    <div
      role='alert'
      className='grid justify-items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-8 text-center'
    >
      <p className='font-semibold text-destructive'>تعذر تحميل البيانات</p>
      <p className='text-sm text-muted-foreground'>
        {error instanceof Error
          ? error.message
          : 'تحقق من اتصالك ثم أعد المحاولة.'}
      </p>
      <Button variant='outline' onClick={onRetry}>
        إعادة المحاولة
      </Button>
    </div>
  )
}
