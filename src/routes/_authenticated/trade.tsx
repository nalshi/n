import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/trade')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authenticated/trade"!</div>
}
