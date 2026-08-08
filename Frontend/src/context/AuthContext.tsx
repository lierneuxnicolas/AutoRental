import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getCurrentUser, login as loginRequest, logout as logoutRequest } from '../services/authService'
import type { AuthResponse, AuthUser, LoginCredentials } from '../types/auth'
import { AUTH_LOGOUT_EVENT } from '../services/api'
import { AuthContext, type AuthContextValue } from './auth-context'

function readStoredAuthUser(): AuthUser | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storedUser = window.localStorage.getItem('authUser')

  if (!storedUser) {
    return null
  }

  try {
    return JSON.parse(storedUser) as AuthUser
  } catch {
    window.localStorage.removeItem('authUser')
    return null
  }
}

function hasStoredAccessToken(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return Boolean(window.localStorage.getItem('accessToken'))
}

function clearAuthStorage() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem('accessToken')
  window.localStorage.removeItem('refreshToken')
  window.localStorage.removeItem('authUser')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredAuthUser())
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => Boolean(readStoredAuthUser() && hasStoredAccessToken()))
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const clearSession = useCallback(() => {
    clearAuthStorage()
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  const restoreSession = useCallback(async () => {
    if (typeof window === 'undefined') {
      setIsLoading(false)
      return
    }

    const accessToken = window.localStorage.getItem('accessToken')

    if (!accessToken) {
      clearSession()
      setIsLoading(false)
      return
    }

    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
      setIsAuthenticated(true)
      window.localStorage.setItem('authUser', JSON.stringify(currentUser))
    } catch {
      clearSession()
    } finally {
      setIsLoading(false)
    }
  }, [clearSession])

  useEffect(() => {
    const restore = async () => {
      await restoreSession()
    }

    void restore()
  }, [restoreSession])

  useEffect(() => {
    const handleLogoutEvent = () => {
      clearSession()
    }

    window.addEventListener(AUTH_LOGOUT_EVENT, handleLogoutEvent)

    return () => {
      window.removeEventListener(AUTH_LOGOUT_EVENT, handleLogoutEvent)
    }
  }, [clearSession])

  const login = useCallback(async (credentials: LoginCredentials) => {
    const response: AuthResponse = await loginRequest(credentials)

    window.localStorage.setItem('accessToken', response.access)
    window.localStorage.setItem('refreshToken', response.refresh)
    window.localStorage.setItem('authUser', JSON.stringify(response.user))

    setUser(response.user)
    setIsAuthenticated(true)
    setIsLoading(false)

    return response.user
  }, [])

  const logout = useCallback(async () => {
    if (typeof window === 'undefined') {
      clearSession()
      return
    }

    const refreshToken = window.localStorage.getItem('refreshToken')

    try {
      if (refreshToken) {
        await logoutRequest(refreshToken)
      }
    } catch {
      // Ignore backend errors and still clear the local session.
    } finally {
      clearSession()
      window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT))
    }
  }, [clearSession])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      login,
      logout,
    }),
    [isAuthenticated, isLoading, login, logout, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
