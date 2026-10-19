import {
  BellRing,
  CircleCheck,
  CircleX,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react'
import { Toaster as Sonner, ToasterProps } from 'sonner'
import { useTheme } from '@/context/theme-provider'

export function Toaster({ ...props }: ToasterProps) {
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className='toaster group [&_div[data-content]]:w-full'
      icons={{
        success: (
          <CircleCheck
            className='merchant-toast-icon-success size-4 text-emerald-600 dark:text-emerald-400'
            aria-hidden='true'
          />
        ),
        error: (
          <CircleX
            className='merchant-toast-icon-error size-4 text-destructive'
            aria-hidden='true'
          />
        ),
        info: (
          <BellRing
            className='merchant-toast-icon-info size-4 text-blue-600 dark:text-blue-400'
            aria-hidden='true'
          />
        ),
        warning: (
          <TriangleAlert
            className='merchant-toast-icon-warning size-4 text-amber-600 dark:text-amber-400'
            aria-hidden='true'
          />
        ),
        loading: (
          <LoaderCircle
            className='size-4 animate-spin text-muted-foreground'
            aria-hidden='true'
          />
        ),
      }}
      style={
        {
          '--normal-bg': 'color-mix(in srgb, var(--popover) 92%, transparent)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border':
            'color-mix(in srgb, var(--border) 88%, transparent)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}
