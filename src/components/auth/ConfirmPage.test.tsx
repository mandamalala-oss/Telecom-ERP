// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ConfirmPage } from './ConfirmPage'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ supabase: { auth } }))

const session = { user: { id: 'u1', email: 'ada@x.mg' }, access_token: 'at', refresh_token: 'rt' }

function renderAt(href: string) {
  // ConfirmPage reads window.location directly, so point jsdom at the URL.
  window.history.replaceState(null, '', href)
  return render(
    <MemoryRouter initialEntries={[href]}>
      <Routes>
        <Route path="/auth/confirm" element={<ConfirmPage />} />
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  auth.exchangeCodeForSession.mockResolvedValue({ data: { session }, error: null })
  auth.verifyOtp.mockResolvedValue({ data: { session }, error: null })
})
// vitest runs with globals:false — RTL auto-cleanup never registers.
afterEach(() => cleanup())

describe('ConfirmPage', () => {
  it('exchanges a PKCE ?code=… token and redirects to /login', async () => {
    renderAt('/auth/confirm?code=abc123')
    expect(await screen.findByText('LOGIN PAGE')).toBeTruthy()
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc123')
    expect(auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('verifies a #token_hash=…&type=… email link and redirects to /login', async () => {
    renderAt('/auth/confirm#token_hash=xyz&type=email')
    expect(await screen.findByText('LOGIN PAGE')).toBeTruthy()
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'xyz', type: 'email' })
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('short-circuits when detectSessionInUrl already established a session', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null })
    renderAt('/auth/confirm#access_token=at&type=signup')
    expect(await screen.findByText('LOGIN PAGE')).toBeTruthy()
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('shows the URL error for an expired/invalid link', async () => {
    renderAt('/auth/confirm?error_description=Email%20link%20is%20invalid%20or%20has%20expired')
    expect(await screen.findByText('Email link is invalid or has expired')).toBeTruthy()
  })

  it('shows the URL error even when a stored session exists', async () => {
    // A stale stored session must not mask a failed link.
    auth.getSession.mockResolvedValue({ data: { session }, error: null })
    renderAt('/auth/confirm?error_description=Email%20link%20is%20invalid%20or%20has%20expired')
    expect(await screen.findByText('Email link is invalid or has expired')).toBeTruthy()
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('surfaces an error when the code exchange fails', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: null, error: { message: 'Auth code has expired' } })
    renderAt('/auth/confirm?code=stale')
    expect(await screen.findByText('Auth code has expired')).toBeTruthy()
  })

  it('surfaces an error when token_hash verification fails', async () => {
    auth.verifyOtp.mockResolvedValue({ data: null, error: { message: 'Token has expired or is invalid' } })
    renderAt('/auth/confirm#token_hash=bad&type=email')
    expect(await screen.findByText('Token has expired or is invalid')).toBeTruthy()
  })

  it('reads the URL error from the hash as well as the query', async () => {
    renderAt('/auth/confirm#error_description=Email%20link%20is%20invalid%20or%20has%20expired')
    expect(await screen.findByText('Email link is invalid or has expired')).toBeTruthy()
  })

  it('shows an error when the URL has no token at all', async () => {
    renderAt('/auth/confirm')
    expect(await screen.findByText('No confirmation token found in the URL.')).toBeTruthy()
  })
})
