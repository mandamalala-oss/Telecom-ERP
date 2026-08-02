import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@/types'
import { ROLE_PERMISSIONS } from '@/types'
import { makeApi } from '@/lib/api/crud'

const usersApi = makeApi<User>('users')

interface AuthContextType {
  user: User | null
  users: User[]
  loading: boolean
  login: (email: string) => boolean
  logout: () => void
  can: (module: string) => boolean
  switchUser: (userId: string) => void
  refreshUsers: () => Promise<User[]>
}

const AuthContext = createContext<AuthContextType | null>(null)

const LAST_USER_KEY = 'telecom-erp-last-user-email'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUsers = async () => {
    const rows = await usersApi.list({ orderBy: 'name', ascending: true })
    setUsers(rows)
    return rows
  }

  useEffect(() => {
    (async () => {
      try {
        const rows = await refreshUsers()
        const lastEmail = localStorage.getItem(LAST_USER_KEY)
        const found = rows.find((u) => u.email === lastEmail) ?? rows[0] ?? null
        setUser(found)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const login = (email: string) => {
    const found = users.find((u) => u.email === email)
    if (found) {
      setUser(found)
      localStorage.setItem(LAST_USER_KEY, found.email)
      return true
    }
    return false
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem(LAST_USER_KEY)
  }

  const can = (module: string) => {
    if (!user) return false
    const perms = ROLE_PERMISSIONS[user.role] ?? []
    return perms.includes('*') || perms.includes(module)
  }

  const switchUser = (userId: string) => {
    const found = users.find((u) => u.id === userId)
    if (found) {
      setUser(found)
      localStorage.setItem(LAST_USER_KEY, found.email)
    }
  }

  return (
    <AuthContext.Provider value={{ user, users, loading, login, logout, can, switchUser, refreshUsers }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
