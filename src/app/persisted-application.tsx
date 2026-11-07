import { useIsRestoring } from '@tanstack/react-query'
import { RouterProvider, type AnyRouter } from '@tanstack/react-router'
import { DirectionProvider } from '@/context/direction-provider'
import { FontProvider } from '@/context/font-provider'
import { ThemeProvider } from '@/context/theme-provider'

export function PersistedApplication({
  router,
}: {
  router: AnyRouter
}) {
  const isRestoring = useIsRestoring()

  if (isRestoring) return null

  return (
    <ThemeProvider>
      <FontProvider>
        <DirectionProvider>
          <RouterProvider router={router} />
        </DirectionProvider>
      </FontProvider>
    </ThemeProvider>
  )
}
