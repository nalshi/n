/* eslint-disable react-refresh/only-export-components */
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(auth)/dropshipping/sign-in')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(auth)/dropshipping/sign-in"!</div>
}
