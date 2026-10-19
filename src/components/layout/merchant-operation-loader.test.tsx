import {
  useMutation,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { MerchantOperationLoader } from './merchant-operation-loader'

const pendingOperation: { resolve: () => void } = { resolve: () => undefined }

function PendingOperation() {
  const mutation = useMutation({
    mutationFn: () =>
      new Promise<void>((resolve) => {
        pendingOperation.resolve = resolve
      }),
  })

  return (
    <>
      <MerchantOperationLoader isPending={mutation.isPending} />
      <button type='button' onClick={() => mutation.mutate()}>
        حفظ التغييرات
      </button>
    </>
  )
}

describe('MerchantOperationLoader', () => {
  it('shows the animated brand mark while a mutation is pending', async () => {
    pendingOperation.resolve = () => undefined
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <PendingOperation />
      </QueryClientProvider>
    )

    await userEvent.click(screen.getByRole('button', { name: 'حفظ التغييرات' }))

    const loader = screen.getByRole('status', { name: 'جارٍ تنفيذ العملية' })
    await expect.element(loader).toBeInTheDocument()
    expect(
      document.querySelector('.merchant-operation-loader svg')
    ).not.toBeNull()

    pendingOperation.resolve()
    await vi.waitFor(() => {
      expect(document.querySelector('.merchant-operation-loader')).toBeNull()
    })
  })
})
