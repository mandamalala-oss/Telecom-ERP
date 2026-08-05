import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { PermissionLevel, User } from '@/types'
import { ROLE_PERMISSIONS } from '@/types'
import { supabase } from '@/lib/supabase'
import { makeApi } from '@/lib/api/crud'

const usersApi = makeApi<User>('users')

interface AuthContextType {
  user: User | null
  users: User[]
  loading: boolean
  /** Returns an error message, or null on success. */
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  /** View access: per-user override ?? role default (ROLE_PERMISSIONS). */
  can: (module: string) => boolean
  /** Edit access: 'edit' level for the module. */
  canEdit: (module: string) => boolean
  /** 'view' | 'edit' | null for a module. */
  permissionLevel: (module: string) => PermissionLevel | null
  refreshUsers: () => Promise<User[]>
}

const AuthContext = createContext<AuthContextType | null>(null)

// Ordered fallback paths: the first module the current role can open.
const HOME_PATHS: Array<[module: string, path: string]> = [
  ['dashboard', '/dashboard'],
  ['sites', '/sites'],
  ['projects', '/projects'],
  ['tasks', '/tasks'],
  ['evm', '/evm'],
  ['inventory', '/inventory'],
  ['finance', '/finance'],
  ['crm', '/crm'],
  ['customers', '/customers'],
]

/**
 * First module the current role can open — landing/fallback path (never loops).
 */
export function firstAllowedPath(can: (module: string) => boolean): string {
  return HOME_PATHS.find(([m]) => can(m))?.[1] ?? '/login'
}

// Message shown for supabase error code `email_not_confirmed` — the most
// common trip-up: the account was invited but the confirmation link never
// completed (e.g. the redirect origin isn't in the project's Redirect URLs
// allowlist). LoginPage matches on this constant to offer a resend action.
export const EMAIL_NOT_CONFIRMED_MESSAGE =
  'Email not confirmed — check your inbox and click the confirmation link before signing in.'

/**
 * Pull a human-readable message out of ANY thrown/returned error — Supabase
 * AuthError, plain Error (non-enumerable props — JSON.stringify gives "{}"),
 * strings, or unexpected objects. Pure + unit-tested.
 */
export function describeAuthError(e: unknown): string {
  if (e === null || e === undefined) return 'Unknown error'
  if (typeof e === 'string') return e
  const err = e as Record<string, any>
  // Say what to do instead of dumping the raw Supabase error.
  if (err.code === 'email_not_confirmed') return EMAIL_NOT_CONFIRMED_MESSAGE
  // Common fields across supabase / fetch / custom errors.
  const parts = [
    err.message, err.error_description, err.msg, err.hint, err.details,
    err.code, err.status,
  ]
  const text = parts
    .filter((p) => p !== undefined && p !== null && p !== '')
    .map(String)
    .join(' · ')
  if (text) return text
  if (e instanceof Error) return `${e.name}: ${e.message}`
  try {
    const dump = JSON.stringify(e)
    if (dump && dump !== '{}') return dump
  } catch { /* fall through */ }
  return Object.prototype.toString.call(e)
}

// Real Supabase Auth (email/password) backed by the `users` profile table.
// The users ↔ auth.users sync trigger (migration 012) creates/updates the
// profile row; here we resolve it by auth_id and drive `can()` from its role.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUsers = async () => {
    const rows = await usersApi.list({ orderBy: 'name', ascending: true })
    setUsers(rows)
    return rows
  }

  const profileFor = async (uid: string): Promise<User | null> => {
    try {
      const rows = await usersApi.list({ filters: { authId: uid } })
      if (rows[0]) return rows[0]
    } catch (e) {
      console.warn('[auth] profile lookup failed:', e)
    }
    return null
  }

  // Restore the session on load and keep `user` in sync with auth state.
  useEffect(() => {
    let cancelled = false
    const finish = () => { if (!cancelled) setLoading(false) }

    supabase.auth.getSession()
      .then(async ({ data }) => {
        const session = data.session
        if (!session) { finish(); return }
        const uid = session.user.id
        const profile = await profileFor(uid)
        if (cancelled) return
        // The session may have been signed out or replaced (e.g. another tab)
        // while the profile lookup was in flight — don't restore a stale user.
        const { data: now } = await supabase.auth.getSession()
        if (cancelled) return
        if (now.session?.user.id !== uid) { finish(); return }
        setUser(profile ?? {
          id: uid,
          name: session.user.email ?? 'User',
          email: session.user.email ?? '',
          role: 'Team Leader',
          avatar: '',
          department: '',
          phone: '',
        } as User)
        void refreshUsers().catch(() => {})
        finish()
      })
      .catch(() => finish())

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      if (!session?.user) { setUser(null); return }
      const uid = session.user.id
      profileFor(uid).then((profile) => {
        if (cancelled) return
        // The session may have been signed out or replaced while the profile
        // lookup was in flight (e.g. /auth/confirm signs the fresh session out
        // right after verifyOtp) — never resurrect a stale user.
        supabase.auth.getSession().then(({ data }) => {
          if (cancelled) return
          if (data.session?.user.id !== uid) return
          setUser(profile ?? {
            id: uid,
            name: session.user.email ?? 'User',
            email: session.user.email ?? '',
            role: 'Team Leader',
            avatar: '',
            department: '',
            phone: '',
          } as User)
        }).catch(() => {})
      })
      void refreshUsers().catch(() => {})
    })

    return () => { cancelled = true; sub.subscription.unsubscribe() }
  }, [])

  const login = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // Log the RAW object so DevTools shows its true shape (message may be
      // hidden in non-enumerable props or an unexpected field).
      console.error('[login] signInWithPassword error:', error)
      return describeAuthError(error)
    }
    // Eagerly resolve the profile so the UI updates before the auth event lands.
    const { data } = await supabase.auth.getSession()
    const uid = data.session?.user.id
    if (uid) {
      const profile = await profileFor(uid)
      if (profile) setUser(profile)
      void refreshUsers().catch(() => {})
    }
    return null
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  // Per-module access: the member's own permission override wins; otherwise
  // fall back to the role defaults (ROLE_PERMISSIONS grants 'edit' on every
  // module the role can access).
  const levelFor = (u: User | null, module: string): PermissionLevel | null => {
    if (!u) return null
    const override = u.permissions?.[module]
    if (override === 'view' || override === 'edit') return override
    // An explicit 'none' beats the role default — no access at all.
    if (override === 'none') return null
    const perms = ROLE_PERMISSIONS[u.role] ?? []
    return perms.includes('*') || perms.includes(module) ? 'edit' : null
  }

  const can = (module: string) => levelFor(user, module) !== null
  const canEdit = (module: string) => levelFor(user, module) === 'edit'
  const permissionLevel = (module: string) => levelFor(user, module)

  return (
    <AuthContext.Provider value={{ user, users, loading, login, logout, can, canEdit, permissionLevel, refreshUsers }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
