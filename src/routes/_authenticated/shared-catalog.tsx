import { createFileRoute } from '@tanstack/react-router'
import { SharedCatalog } from '@/features/shared-catalog'

export const Route = createFileRoute('/_authenticated/shared-catalog')({
  component: SharedCatalog,
})
