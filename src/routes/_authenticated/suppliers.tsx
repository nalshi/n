import { createFileRoute } from '@tanstack/react-router'
import { SupplierWorkspace } from '@/features/trade'

export const Route = createFileRoute('/_authenticated/suppliers')({
  component: SupplierWorkspace,
})
