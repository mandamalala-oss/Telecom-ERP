// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth, firstAllowedPath, describeAuthError } from './AuthContext'

// Stub the Supabase client and the CRUD api — no env vars / network needed.
const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}))
// makeApi() is called at AuthContext import time, so the mock returns a list
// fn that reads a mutable rows slot — tests swap the value, not the mock.
// `deferList` lets a test hold the profile lookup open (for the stale-user race).
const mocks = vi.hoisted(() => {
  const rows: { value: unknown[] } = { value: [] }
  let deferred: Promise<unknown[]> | null = null
  const makeApi = vi.fn(() => ({ list: vi.fn(() => (deferred ?? Promise.resolve(rows.value))) }))
  return {
    makeApi,
    rows,
    deferList: (p: Promise<unknown[]> | null) => { deferred = p },
  }
})

vi.mock('@/lib/supabase', () => ({ supabase: { auth } }))
vi.mock('@/lib/api/crud', () => ({ makeApi: mocks.makeApi }))

const profile = { id: 'u1', name: 'Ada', email: 'ada@x.mg', role: 'CEO', avatar: '', department: '', phone: '', authId: 'u1' }

function listMock(rows: unknown[]) { mocks.rows.value = rows }

function emptySession() {
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
}

function renderAuth() {
  return renderHook(() => useAuth(), {
    wrapper: ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.deferList(null)
})
// vitest runs with globals:false — RTL auto-cleanup never registers.
afterEach(() => cleanup())

describe('AuthContext — session', () => {
  it('restores an existing session and loads the profile by auth_id', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1', email: 'ada@x.mg' } } }, error: null })
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    listMock([profile])
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user?.id).toBe('u1')
    expect(result.current.user?.role).toBe('CEO')
  })

  it('stays signed out when there is no session', async () => {
    emptySession()
    listMock([])
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })
})

describe('AuthContext — login/logout', () => {
  it('login succeeds and sets the user', async () => {
    emptySession()
    listMock([])
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.loading).toBe(false))

    auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1', email: 'ada@x.mg' } } }, error: null })
    listMock([profile])
    const err = await result.current.login('ada@x.mg', 'secret')
    expect(err).toBeNull()
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ada@x.mg', password: 'secret' })
    await waitFor(() => expect(result.current.user?.id).toBe('u1'))
  })

  it('login failure returns the error message and sets no user', async () => {
    emptySession()
    listMock([])
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.loading).toBe(false))

    auth.signInWithPassword.mockResolvedValue({ data: null, error: { message: 'Invalid login credentials' } })
    const err = await result.current.login('ada@x.mg', 'wrong')
    expect(err).toBe('Invalid login credentials')
    expect(result.current.user).toBeNull()
  })

  it('logout clears the user', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1', email: 'ada@x.mg' } } }, error: null })
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    listMock([profile])
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.user?.id).toBe('u1'))

    auth.signOut.mockResolvedValue({ error: null })
    await result.current.logout()
    expect(auth.signOut).toHaveBeenCalled()
    await waitFor(() => expect(result.current.user).toBeNull())
  })

  it('does not resurrect a stale user when a profile lookup resolves after sign-out', async () => {
    // Capture the auth-state callback so the test can drive SIGNED_IN/SIGNED_OUT.
    let onEvent: ((event: string, session: any) => void) | undefined
    auth.onAuthStateChange.mockImplementation((handler: any) => {
      onEvent = handler
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.loading).toBe(false))

    // SIGNED_IN fires, starting a profile lookup we keep hanging…
    let resolveList!: (v: unknown[]) => void
    mocks.deferList(new Promise<unknown[]>((r) => { resolveList = r }))
    onEvent?.('SIGNED_IN', { user: { id: 'u1', email: 'ada@x.mg' } })
    // …then the session is signed out (e.g. /auth/confirm right after verifyOtp)…
    onEvent?.('SIGNED_OUT', null)
    expect(result.current.user).toBeNull()

    // …and finally the stale profile lookup lands. It must NOT set the user.
    resolveList([profile])
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current.user).toBeNull()
  })

  it('does not apply a stale profile when the session was replaced by another user', async () => {
    let onEvent: ((event: string, session: any) => void) | undefined
    auth.onAuthStateChange.mockImplementation((handler: any) => {
      onEvent = handler
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.loading).toBe(false))

    // SIGNED_IN for u1 starts a hanging profile lookup…
    let resolveList!: (v: unknown[]) => void
    mocks.deferList(new Promise<unknown[]>((r) => { resolveList = r }))
    onEvent?.('SIGNED_IN', { user: { id: 'u1', email: 'ada@x.mg' } })
    // …meanwhile the session belongs to a different user…
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u2', email: 'bob@x.mg' } } }, error: null })
    // …and u1's profile lookup lands. It must NOT overwrite the current user.
    resolveList([profile])
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current.user).toBeNull()
  })
})

describe('AuthContext — can() role gating', () => {
  it('grants modules from ROLE_PERMISSIONS for the profile role', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u2', email: 'pm@x.mg' } } }, error: null })
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    listMock([{ ...profile, id: 'u2', role: 'Manager', authId: 'u2' }])
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.user?.role).toBe('Manager'))
    expect(result.current.can('projects')).toBe(true)
    expect(result.current.can('finance')).toBe(true)
    expect(result.current.can('team')).toBe(false) // not in Manager's list
  })

  it('admin can do everything', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1', email: 'ada@x.mg' } } }, error: null })
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    listMock([profile])
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.user?.role).toBe('CEO'))
    expect(result.current.can('anything-at-all')).toBe(true)
  })

  it('denies everything when signed out', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>,
    })
    expect(result.current.can('projects')).toBe(false)
  })
})

describe('firstAllowedPath', () => {
  it('returns the first module the role can open, in priority order', () => {
    expect(firstAllowedPath((m) => m === 'sites' || m === 'tasks')).toBe('/sites')
    expect(firstAllowedPath((m) => m === 'evm' || m === 'finance')).toBe('/evm')
  })

  it('falls back to /login when nothing is allowed', () => {
    expect(firstAllowedPath(() => false)).toBe('/login')
  })
})

describe('describeAuthError', () => {
  it('uses message when present', () => {
    expect(describeAuthError({ message: 'Invalid login credentials' })).toBe('Invalid login credentials')
  })

  it('gives actionable guidance for email_not_confirmed', () => {
    expect(describeAuthError({ message: 'Email not confirmed', code: 'email_not_confirmed', status: 400 }))
      .toBe('Email not confirmed — check your inbox and click the confirmation link before signing in.')
  })

  it('extracts fields from message-less supabase-style errors', () => {
    expect(describeAuthError({ status: 400, code: 'invalid_credentials' })).toBe('invalid_credentials · 400')
  })

  it('reads the message of plain Error instances (non-enumerable props)', () => {
    expect(describeAuthError(new Error('Failed to fetch'))).toBe('Failed to fetch')
  })

  it('never renders {} for an empty object', () => {
    const out = describeAuthError({})
    expect(out).not.toBe('{}')
    expect(out).toBe('[object Object]')
  })

  it('handles null, undefined and strings', () => {
    expect(describeAuthError(null)).toBe('Unknown error')
    expect(describeAuthError(undefined)).toBe('Unknown error')
    expect(describeAuthError('boom')).toBe('boom')
  })
})

describe('AuthContext — per-module permission overrides', () => {
  async function mountWith(profile: Record<string, any>) {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: profile.authId ?? 'u1', email: profile.email } } }, error: null })
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    listMock([profile])
    const hook = renderAuth()
    await waitFor(() => expect(hook.result.current.user).toBeTruthy())
    return hook
  }

  it('role default grants edit on the role’s modules', async () => {
    const { result } = await mountWith({ ...profile, role: 'Manager', permissions: {} })
    expect(result.current.can('projects')).toBe(true)
    expect(result.current.canEdit('projects')).toBe(true)
    expect(result.current.permissionLevel('projects')).toBe('edit')
    expect(result.current.can('team')).toBe(false)
  })

  it('per-user override can demote edit to view', async () => {
    const { result } = await mountWith({ ...profile, role: 'Manager', permissions: { projects: 'view' } })
    expect(result.current.can('projects')).toBe(true)
    expect(result.current.canEdit('projects')).toBe(false)
    expect(result.current.permissionLevel('projects')).toBe('view')
  })

  it('per-user override can grant view beyond the role default', async () => {
    const { result } = await mountWith({ ...profile, role: 'Inspector', permissions: { finance: 'view' } })
    expect(result.current.can('finance')).toBe(true)
    expect(result.current.canEdit('finance')).toBe(false)
    // role default still applies where no override
    expect(result.current.can('sites')).toBe(true)
    expect(result.current.canEdit('sites')).toBe(true)
  })

  it('admin keeps edit everywhere unless overridden', async () => {
    const { result } = await mountWith({ ...profile, role: 'CEO', permissions: { finance: 'view' } })
    expect(result.current.canEdit('anything')).toBe(true)
    expect(result.current.permissionLevel('finance')).toBe('view')
  })
})
