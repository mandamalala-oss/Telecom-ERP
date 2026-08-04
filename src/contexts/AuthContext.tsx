import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@/types'
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
  can: (module: string) => boolean
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

/**
 * Pull a human-readable message out of ANY thrown/returned error — Supabase
 * AuthError, plain Error (non-enumerable props — JSON.stringify gives "{}"),
 * strings, or unexpected objects. Pure + unit-tested.
 */
export function describeAuthError(e: unknown): string {
  if (e === null || e === undefined) return 'Unknown error'
  if (typeof e === 'string') return e
  const err = e as Record<string, any>
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
        setUser(profile ?? {
          id: uid,
          name: session.user.email ?? 'User',
          email: session.user.email ?? '',
          role: 'viewer',
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
        setUser(profile ?? {
          id: uid,
          name: session.user.email ?? 'User',
          email: session.user.email ?? '',
          role: 'viewer',
          avatar: '',
          department: '',
          phone: '',
        } as User)
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

  const can = (module: string) => {
    if (!user) return false
    const perms = ROLE_PERMISSIONS[user.role] ?? []
    return perms.includes('*') || perms.includes(module)
  }

  return (
    <AuthContext.Provider value={{ user, users, loading, login, logout, can, refreshUsers }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
