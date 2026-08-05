// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from './LoginPage'

const authMock = vi.hoisted(() => ({
  useAuth: vi.fn(),
}))

const EMAIL_NOT_CONFIRMED_MESSAGE = vi.hoisted(
  () => 'Email not confirmed — check your inbox and click the confirmation link before signing in.'
)

const supabaseAuthMock = vi.hoisted(() => ({
  resend: vi.fn(),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: authMock.useAuth,
  EMAIL_NOT_CONFIRMED_MESSAGE,
  // Minimal stand-in matching the real pure function for the cases tested here.
  describeAuthError: (e: any) => (e && typeof e === 'object' && 'message' in e ? e.message : String(e)),
}))
// LoginPage talks to supabase.auth.resend directly — stub the client so the
// real createClient (which throws without env vars) never runs.
vi.mock('@/lib/supabase', () => ({ supabase: { auth: supabaseAuthMock } }))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>
  )
}

beforeEach(() => { authMock.useAuth.mockReset() })
// vitest runs with globals:false — RTL auto-cleanup never registers.
afterEach(() => cleanup())

async function signInWith(login: ReturnType<typeof vi.fn>, email = 'ada@x.mg', password = 'secret') {
  authMock.useAuth.mockReturnValue({ user: null, loading: false, login })
  renderPage()
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('LoginPage', () => {
  it('renders the email and password fields', () => {
    authMock.useAuth.mockReturnValue({ user: null, loading: false, login: vi.fn() })
    renderPage()
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('submits the credentials to login()', async () => {
    const login = vi.fn(async () => null)
    authMock.useAuth.mockReturnValue({ user: null, loading: false, login })
    renderPage()
    await userEvent.type(screen.getByLabelText('Email'), 'ada@x.mg')
    await userEvent.type(screen.getByLabelText('Password'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(login).toHaveBeenCalledWith('ada@x.mg', 'secret'))
  })

  it('shows the error returned by login()', async () => {
    await signInWith(vi.fn(async () => 'Invalid login credentials'), 'ada@x.mg', 'wrong')
    expect(await screen.findByText('Invalid login credentials')).toBeTruthy()
  })

  it('offers a resend action for email_not_confirmed and resends via supabase.auth.resend', async () => {
    supabaseAuthMock.resend.mockResolvedValue({ error: null })
    await signInWith(vi.fn(async () => EMAIL_NOT_CONFIRMED_MESSAGE))
    const resendButton = await screen.findByRole('button', { name: /resend confirmation email/i })
    await userEvent.click(resendButton)
    await waitFor(() =>
      expect(supabaseAuthMock.resend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'ada@x.mg',
        options: { emailRedirectTo: expect.stringMatching(/\/auth\/confirm$/) },
      })
    )
    expect(await screen.findByText(/Confirmation email sent — check your inbox/)).toBeTruthy()
  })

  it('does not offer resend for other login errors', async () => {
    await signInWith(vi.fn(async () => 'Invalid login credentials'), 'ada@x.mg', 'wrong')
    expect(await screen.findByText('Invalid login credentials')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /resend confirmation email/i })).toBeNull()
  })

  it('shows resend feedback when resend fails', async () => {
    supabaseAuthMock.resend.mockResolvedValue({ data: null, error: { message: 'Email is already confirmed' } })
    await signInWith(vi.fn(async () => EMAIL_NOT_CONFIRMED_MESSAGE))
    await userEvent.click(await screen.findByRole('button', { name: /resend confirmation email/i }))
    expect(await screen.findByText('Email is already confirmed')).toBeTruthy()
  })

  it('redirects to the app when already authenticated', async () => {
    authMock.useAuth.mockReturnValue({ user: { id: 'u1' }, loading: false, login: vi.fn() })
    renderPage()
    // MemoryRouter + Navigate → renders the fallback route content; the
    // login form must NOT be present.
    expect(screen.queryByLabelText('Password')).toBeNull()
  })

  it('shows the email-confirmed message when arriving from /auth/confirm', () => {
    authMock.useAuth.mockReturnValue({ user: null, loading: false, login: vi.fn() })
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { confirmed: true } }]}>
        <LoginPage />
      </MemoryRouter>
    )
    expect(screen.getByText('Email confirmed! You can now sign in.')).toBeTruthy()
  })
})
