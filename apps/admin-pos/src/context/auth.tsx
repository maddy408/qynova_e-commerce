import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, clearToken, getToken, setToken, setRefreshToken } from '../lib/api'
import type { StaffUser } from '../lib/types'
import { removeDeviceToken, syncDeviceToken } from '../hooks/useDeviceToken'

interface AuthContextValue {
  user: StaffUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  hasPermission: (code: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }

    api
      .get('/auth/me')
      .then((res) => {
        setUser(res.data.user)
        syncDeviceToken()
      })
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  }, [])

  async function login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password })
    setToken(res.data.token)
    if (res.data.refresh_token) {
      setRefreshToken(res.data.refresh_token)
    }
    setUser(res.data.user)
    syncDeviceToken()
  }

  function logout() {
    // Revoke the refresh token server-side so the cookie can't silently
    // mint new access tokens after this — but clear local state
    // immediately either way, since the user should appear logged out
    // even if this network call fails.
    api.post('/auth/logout').catch(() => {})
    removeDeviceToken()
    clearToken()
    setUser(null)
  }

  function hasPermission(code: string) {
    return user?.role === 'ADMIN' || user?.permissions?.includes(code) === true
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
