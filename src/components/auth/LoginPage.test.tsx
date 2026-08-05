// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from './LoginPage'

const authMock = vi.hoisted(() => ({
  useAuth: vi.fn(),
}))

vi.mock('@/contexts/AuthContext', () => ({ useAuth: authMock.useAuth }))

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
    const login = vi.fn(async () => 'Invalid login credentials')
    authMock.useAuth.mockReturnValue({ user: null, loading: false, login })
    renderPage()
    await userEvent.type(screen.getByLabelText('Email'), 'ada@x.mg')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Invalid login credentials')).toBeTruthy()
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
