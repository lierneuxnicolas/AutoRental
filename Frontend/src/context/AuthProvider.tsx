import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Alert from '../components/feedback/Alert'
import { getCurrentUser, login as loginRequest, logout as logoutRequest } from '../services/authService'
import { isRejectedSession, sessionErrorMessage } from '../services/api'
import {
  clearSession, readSession, SESSION_CHANGED_EVENT, SESSION_PROBLEM_EVENT, SESSION_VERSION_KEY,
  storeSession, withSessionLock, type SessionProblem,
} from '../services/authSession'
import type { LoginCredentials } from '../types/auth'
import { AuthContext, type AuthContextValue } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState(() => {
    const session = readSession()
    return session.access ? session.user : null
  })
  const version = useRef(readSession().version)
  const [isLoading, setIsLoading] = useState(true)
  const [problem, setProblem] = useState<SessionProblem | null>(null)
  const [retrying, setRetrying] = useState(false)

  const restoreSession = useCallback(async () => {
    const session = readSession()
    try {
      if (!session.access) {
        setUser(null)
        return false
      }
      const currentUser = await getCurrentUser()
      if (readSession().version !== session.version) return false
      setUser(currentUser)
      setProblem(null)
      return true
    } catch (error) {
      if (readSession().version === session.version) {
        if (isRejectedSession(error) && navigator.locks) {
          await withSessionLock(async () => {
            if (readSession().version === session.version) clearSession()
          })
        } else {
          setProblem({ message: sessionErrorMessage(error), retry: 'session' })
        }
      }
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const synchronize = () => {
      const session = readSession()
      if (version.current !== session.version) {
        version.current = session.version
        queryClient.clear()
      }
      setUser(session.access ? session.user : null)
      setProblem(null)
      setIsLoading(false)
    }
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && (event.key === SESSION_VERSION_KEY || event.key === null)) {
        synchronize()
      }
    }
    const onProblem = (event: Event) => setProblem((event as CustomEvent<SessionProblem>).detail)
    window.addEventListener('storage', onStorage)
    window.addEventListener(SESSION_CHANGED_EVENT, synchronize)
    window.addEventListener(SESSION_PROBLEM_EVENT, onProblem)
    const restoreTimer = window.setTimeout(() => void restoreSession(), 0)
    return () => {
      window.clearTimeout(restoreTimer)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(SESSION_CHANGED_EVENT, synchronize)
      window.removeEventListener(SESSION_PROBLEM_EVENT, onProblem)
    }
  }, [queryClient, restoreSession])

  const login = useCallback((credentials: LoginCredentials) => withSessionLock(async () => {
    const response = await loginRequest(credentials)
    storeSession(response)
    return response.user
  }), [])

  const logout = useCallback(async () => {
    const requestedVersion = readSession().version
    try {
      return await withSessionLock(async () => {
        const session = readSession()
        if (session.version !== requestedVersion) return !session.access
        try {
          if (session.refresh && session.access) await logoutRequest(session.refresh, session.access)
        } catch (error) {
          if (!isRejectedSession(error)) throw error
        }
        clearSession()
        return true
      })
    } catch (error) {
      if (readSession().version === requestedVersion) {
        setProblem({ message: sessionErrorMessage(error), retry: 'logout' })
      }
      return false
    }
  }, [])

  async function retryProblem() {
    if (!problem) return
    setRetrying(true)
    try {
      if (problem.retry === 'logout') {
        await logout()
      } else if (await restoreSession()) {
        await queryClient.invalidateQueries()
      }
    } finally {
      setRetrying(false)
    }
  }

  const value = useMemo<AuthContextValue>(() => ({
    user, isAuthenticated: Boolean(user), isLoading, login, logout,
  }), [user, isLoading, login, logout])

  return (
    <AuthContext.Provider value={value}>
      {problem ? (
        <div className="mx-auto max-w-7xl px-4 pt-3" role="status">
          <Alert variant="warning" title="Session temporairement indisponible" message={problem.message}>
            <button type="button" disabled={retrying} onClick={() => void retryProblem()}
              className="mt-2 text-sm font-semibold underline disabled:opacity-60">
              {retrying ? 'Nouvelle tentative…' : 'Réessayer'}
            </button>
          </Alert>
        </div>
      ) : null}
      {children}
    </AuthContext.Provider>
  )
}
