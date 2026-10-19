import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { useAuthFlowStore } from '@/stores/auth-flow-store'
import { useDashboardIntro } from '@/components/layout/dashboard-intro-context'
import { DashboardIntroProvider } from '@/components/layout/dashboard-intro-provider'
import { UserAuthForm } from './user-auth-form'

const { navigate, apiRequestMock, completeAuthSessionMock } = vi.hoisted(
  () => ({
    navigate: vi.fn(),
    apiRequestMock: vi.fn(),
    completeAuthSessionMock: vi.fn(),
  })
)

vi.mock('@/lib/auth-api', () => ({ authApiRequest: apiRequestMock }))
vi.mock('@/lib/complete-auth-session', () => ({
  completeAuthSession: completeAuthSessionMock,
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => navigate,
    Link: ({
      children,
      to,
      ...rest
    }: {
      children?: React.ReactNode
      to: string
    }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  }
})

function ReadySignInForm() {
  const { setIntroReady } = useDashboardIntro()

  useEffect(() => {
    setIntroReady(true)
  }, [setIntroReady])

  return <UserAuthForm />
}

function renderWithIntro(redirectTo?: string) {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardIntroProvider>
        <UserAuthForm redirectTo={redirectTo} />
      </DashboardIntroProvider>
    </QueryClientProvider>
  )
}

describe('UserAuthForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthFlowStore.setState({
      identifier: '',
      phone: '',
      context: null,
      stateToken: '',
      remember: true,
      registration: null,
    })
    apiRequestMock.mockImplementation(async (action: string) =>
      action === 'check_phone'
        ? { status: 'user_found', name: 'متجر الاختبار' }
        : {
            status: 'success',
            token: `head.${btoa(JSON.stringify({ exp: 2000000000 }))}.sig`,
          }
    )
  })

  it('advances from phone lookup to password after finding an account', async () => {
    const screen = await render(<UserAuthForm />)
    const identifier = screen.getByRole('textbox', {
      name: 'رقم الجوال أو اسم المستخدم',
    })
    expect(identifier).toHaveAttribute('aria-required', 'true')
    await userEvent.fill(identifier, '771234567')
    await userEvent.click(screen.getByRole('button', { name: 'متابعة' }))

    await expect
      .element(screen.getByLabelText(/كلمة المرور لـ متجر الاختبار/))
      .toBeInTheDocument()
    expect(apiRequestMock).toHaveBeenCalledWith('check_phone', {
      phone: '771234567',
    })
  })

  it('accepts an Arabic username without treating it as a phone number', async () => {
    const screen = await render(<UserAuthForm />)
    const identifier = screen.getByRole('textbox', {
      name: 'رقم الجوال أو اسم المستخدم',
    })
    await userEvent.fill(identifier, 'متجر النور')
    await userEvent.click(screen.getByRole('button', { name: 'متابعة' }))

    await expect
      .element(screen.getByLabelText(/كلمة المرور/))
      .toBeInTheDocument()
    expect(apiRequestMock).not.toHaveBeenCalledWith(
      'check_phone',
      expect.anything()
    )
    expect(useAuthFlowStore.getState().identifier).toBe('متجر النور')
  })

  it('authenticates and redirects to the default route', async () => {
    const screen = await render(<UserAuthForm />)
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'رقم الجوال أو اسم المستخدم' }),
      '771234567'
    )
    await userEvent.click(screen.getByRole('button', { name: 'متابعة' }))
    await userEvent.fill(
      screen.getByLabelText(/كلمة المرور لـ متجر الاختبار/),
      'secret'
    )
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }))

    await vi.waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith('login', {
        phone: '771234567',
        password: 'secret',
        remember: true,
        role: 'merchant',
      })
    )
    expect(completeAuthSessionMock).toHaveBeenCalledOnce()
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/', replace: true })
    )
  })

  it('shows the intro while the login request is loading', async () => {
    let resolveLogin: (response: {
      status: string
      token: string
    }) => void = () => undefined
    apiRequestMock.mockImplementation((action: string) =>
      action === 'check_phone'
        ? Promise.resolve({ status: 'user_found', name: 'متجر الاختبار' })
        : new Promise<{ status: string; token: string }>((resolve) => {
            resolveLogin = resolve
          })
    )
    const queryClient = new QueryClient()
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <DashboardIntroProvider>
          <ReadySignInForm />
        </DashboardIntroProvider>
      </QueryClientProvider>
    )
    await vi.waitFor(
      () => expect(document.querySelector('.merchant-intro')).toBeNull(),
      { timeout: 1100 }
    )
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'رقم الجوال أو اسم المستخدم' }),
      '771234567'
    )
    await userEvent.click(screen.getByRole('button', { name: 'متابعة' }))
    await userEvent.fill(
      screen.getByLabelText(/كلمة المرور لـ متجر الاختبار/),
      'secret'
    )
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }))

    expect(document.querySelector('.merchant-intro')).not.toBeNull()
    expect(
      apiRequestMock.mock.calls.filter(([action]) => action === 'login')
    ).toHaveLength(1)
    const loginButton = document.querySelector('form button')
    expect(loginButton?.hasAttribute('disabled')).toBe(true)
    expect(
      apiRequestMock.mock.calls.filter(([action]) => action === 'login')
    ).toHaveLength(1)
    resolveLogin({
      status: 'success',
      token: `head.${btoa(JSON.stringify({ exp: 2000000000 }))}.sig`,
    })
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/', replace: true })
    )
  })

  it('selects the merchant account when the phone is shared across roles', async () => {
    apiRequestMock.mockImplementation(async (action: string) =>
      action === 'check_phone'
        ? {
            status: 'multiple_users_found',
            accounts: {
              merchant: { name: 'متجر الاختبار' },
              delivery: { name: 'حساب المندوب' },
            },
          }
        : {
            status: 'success',
            token: `head.${btoa(JSON.stringify({ exp: 2000000000 }))}.sig`,
          }
    )
    const screen = await render(<UserAuthForm />)
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'رقم الجوال أو اسم المستخدم' }),
      '771234567'
    )
    await userEvent.click(screen.getByRole('button', { name: 'متابعة' }))

    await expect
      .element(screen.getByLabelText(/كلمة المرور لـ متجر الاختبار/))
      .toBeInTheDocument()
    await userEvent.fill(
      screen.getByLabelText(/كلمة المرور لـ متجر الاختبار/),
      'secret'
    )
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }))

    await vi.waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith('login', {
        phone: '771234567',
        password: 'secret',
        remember: true,
        role: 'merchant',
      })
    )
  })

  it('sends an unknown phone number to store registration', async () => {
    apiRequestMock.mockResolvedValueOnce({ status: 'user_not_found' })
    const screen = await render(<UserAuthForm />)
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'رقم الجوال أو اسم المستخدم' }),
      '771234567'
    )
    await userEvent.click(screen.getByRole('button', { name: 'متابعة' }))

    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/sign-up',
        search: { phone: '771234567' },
      })
    )
  })

  it('returns to a requested local page after direct login', async () => {
    apiRequestMock.mockImplementation(async (action: string) =>
      action === 'check_phone'
        ? { status: 'user_found', name: 'متجر الاختبار' }
        : {
            status: 'success',
            token: `head.${btoa(JSON.stringify({ exp: 2000000000 }))}.sig`,
            redirect: 'https://external.example/',
          }
    )
    const screen = await render(<UserAuthForm redirectTo='/store-settings' />)
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'رقم الجوال أو اسم المستخدم' }),
      '771234567'
    )
    await userEvent.click(screen.getByRole('button', { name: 'متابعة' }))
    await userEvent.fill(
      screen.getByLabelText(/كلمة المرور لـ متجر الاختبار/),
      'secret'
    )
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }))

    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/store-settings',
        replace: true,
      })
    )
  })

  it('keeps the requested page while asking for new-device verification', async () => {
    apiRequestMock.mockImplementation(async (action: string) =>
      action === 'check_phone'
        ? { status: 'user_found' }
        : {
            status: 'new_device_otp_required',
            state_token: 'device-state',
          }
    )
    const screen = await renderWithIntro('/orders')
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'رقم الجوال أو اسم المستخدم' }),
      '771234567'
    )
    await userEvent.click(screen.getByRole('button', { name: 'متابعة' }))
    await userEvent.fill(screen.getByLabelText(/كلمة المرور/), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }))

    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/otp' })
    )
    expect(useAuthFlowStore.getState().redirectTo).toBe('/orders')
    await expect
      .element(screen.getByRole('status', { name: 'جارٍ تجهيز لوحة التاجر' }))
      .not.toBeInTheDocument()
  })
})
