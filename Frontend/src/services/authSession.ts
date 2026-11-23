import type { AuthResponse, AuthTokens, AuthUser } from '../types/auth'

export const SESSION_CHANGED_EVENT = 'auth:session-changed'
export const SESSION_PROBLEM_EVENT = 'auth:session-problem'
export const SESSION_VERSION_KEY = 'authSessionVersion'

export interface SessionProblem {
  message: string
  retry: 'session' | 'logout'
}

export function readSession() {
  const storage = window.localStorage
  const access = storage.getItem('accessToken')
  const refresh = storage.getItem('refreshToken')
  const version = storage.getItem(SESSION_VERSION_KEY)
  const profile = storage.getItem('authUser')
  let user: AuthUser | null = null
  if (profile) {
    try {
      user = JSON.parse(profile) as AuthUser | null
    } catch {
      // Ignore corrupt profile data.
    }
  }
  return { access, refresh, user, version }
}

export function storeRotatedTokens(tokens: AuthTokens) {
  window.localStorage.setItem('accessToken', tokens.access)
  if (tokens.refresh) window.localStorage.setItem('refreshToken', tokens.refresh)
}

function notifySessionChanged() {
  window.localStorage.setItem(SESSION_VERSION_KEY, crypto.randomUUID())
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
}

export function storeSession(response: AuthResponse) {
  storeRotatedTokens(response)
  window.localStorage.setItem('authUser', JSON.stringify(response.user))
  notifySessionChanged()
}

export function clearSession() {
  for (const key of ['accessToken', 'refreshToken', 'authUser']) window.localStorage.removeItem(key)
  notifySessionChanged()
}

export function withSessionLock<T>(operation: () => Promise<T>): Promise<T> {
  if (!navigator.locks) {
    return Promise.reject(new Error('Utilisez un navigateur récent avec une connexion HTTPS pour synchroniser la session.'))
  }
  return navigator.locks.request('getacar:auth-session', operation)
}

export function showSessionProblem(problem: SessionProblem) {
  window.dispatchEvent(new CustomEvent<SessionProblem>(SESSION_PROBLEM_EVENT, { detail: problem }))
}
