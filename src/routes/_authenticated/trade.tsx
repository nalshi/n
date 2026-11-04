import { createFileRoute } from '@tanstack/react-router'
import { TradeWorkspace } from '@/features/trade'

export const Route = createFileRoute('/_authenticated/trade')({
  component: TradeWorkspace,
})
