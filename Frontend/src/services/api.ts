import axios, { AxiosHeaders, CanceledError, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { AuthTokens } from '../types/auth'
import { getBackendBaseUrl } from '../config/apiBaseUrl'
import { clearSession, readSession, SESSION_VERSION_KEY, showSessionProblem, storeRotatedTokens, withSessionLock } from './authSession'

const api = axios.create({
  baseURL: getBackendBaseUrl() + '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

type SessionRequest = InternalAxiosRequestConfig & {
  _sessionVersion?: string | null
  _retry?: boolean
}
const sessionTimeout = 15000

function isSessionEndpoint(url: string | undefined) {
  return url?.includes('/auth/token/refresh/') || url?.includes('/auth/login/') || url?.includes('/auth/logout/')
}

export function isRejectedSession(error: unknown) {
  if (!axios.isAxiosError(error)) return false
  return error.response?.status === 401 || (
    error.response?.status === 400 && error.response.data?.code === 'token_not_valid'
  )
}

export function sessionErrorMessage(error: unknown) {
  if (!axios.isAxiosError(error) && error instanceof Error && !navigator.locks) return error.message
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  if (status === 429) return 'Trop de demandes de session. Patientez un instant avant de réessayer.'
  if (!status) return 'La connexion au serveur est indisponible. Vérifiez votre réseau et réessayez.'
  return 'Le service de session est temporairement indisponible. Réessayez.'
}

api.interceptors.request.use(async (config: SessionRequest) => {
  if (typeof window === 'undefined') return config

  const headers = config.headers ?? new AxiosHeaders()
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) headers.delete('Content-Type')
  if (!isSessionEndpoint(config.url)) {
    const requestedVersion = config._sessionVersion === undefined
      ? window.localStorage.getItem(SESSION_VERSION_KEY)
      : config._sessionVersion
    // Read the existing localStorage keys together, outside of any in-progress session change.
    const session = navigator.locks ? await withSessionLock(async () => readSession()) : readSession()
    if (requestedVersion !== session.version) {
      throw new CanceledError('Session modifiée')
    }
    if (session.access) {
      config._sessionVersion = session.version
      headers.set('Authorization', 'Bearer ' + session.access)
    }
  }
  config.headers = headers
  return config
})

let pendingRefresh: { version: string | null; promise: Promise<void> } | undefined

function refreshOnce(version: string | null, usedAccess: string | undefined) {
  if (pendingRefresh?.version === version) return pendingRefresh.promise
  const promise = withSessionLock(async () => {
    const session = readSession()
    if (session.version !== version || !session.access) throw new CanceledError('Session modifiée')
    if (usedAccess !== 'Bearer ' + session.access) return
    if (!session.refresh) {
      clearSession()
      throw new CanceledError('Session expirée')
    }
    try {
      const { data } = await api.post<AuthTokens>('/auth/token/refresh/', { refresh: session.refresh }, { timeout: sessionTimeout })
      if (readSession().version !== version) throw new CanceledError('Session modifiée')
      storeRotatedTokens(data)
    } catch (error) {
      if (readSession().version === version && isRejectedSession(error)) clearSession()
      throw error
    }
  }).finally(() => {
    if (pendingRefresh?.promise === promise) pendingRefresh = undefined
  })
  pendingRefresh = { version, promise }
  return promise
}

api.interceptors.response.use(
  (response) => {
    const version = (response.config as SessionRequest)._sessionVersion
    if (version !== undefined && readSession().version !== version) throw new CanceledError('Session modifiée')
    return response
  },
  async (error: AxiosError) => {
    const request = error.config as SessionRequest | undefined
    const version = request?._sessionVersion
    if (!request || request._retry || version === undefined || error.response?.status !== 401 || isSessionEndpoint(request.url)) {
      throw error
    }
    if (readSession().version !== version) throw new CanceledError('Session modifiée')
    try {
      const usedAccess = request.headers.get('Authorization')?.toString()
      await refreshOnce(version, usedAccess)
    } catch (refreshError) {
      if (readSession().version === version && !axios.isCancel(refreshError) && !isRejectedSession(refreshError)) {
        showSessionProblem({ message: sessionErrorMessage(refreshError), retry: 'session' })
      }
      throw refreshError
    }
    request._retry = true
    return api(request)
  },
)

export default api
