import axios, { AxiosHeaders, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { AuthTokens } from '../types/auth'
import { getBackendBaseUrl } from '../config/apiBaseUrl'

export const AUTH_LOGOUT_EVENT = 'auth:logout'

const api = axios.create({
  baseURL: `${getBackendBaseUrl()}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
})

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean }

let isRefreshing = false
let pendingRequests: Array<(token: string | null) => void> = []

function clearAuthSession() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem('accessToken')
  window.localStorage.removeItem('refreshToken')
  window.localStorage.removeItem('authUser')
  window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT))
}

api.interceptors.request.use((config) => {
  if (typeof window === 'undefined') {
    return config
  }

  const headers = config.headers ?? new AxiosHeaders()

  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    // Let the browser generate multipart boundaries for file uploads.
    headers.delete('Content-Type')
  }

  if (config.url?.includes('/auth/token/refresh/') || config.url?.includes('/auth/login/')) {
    config.headers = headers
    return config
  }

  const accessToken = window.localStorage.getItem('accessToken')

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  config.headers = headers

  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined

    if (!originalRequest || originalRequest._retry) {
      return Promise.reject(error)
    }

    if (
      error.response?.status !== 401
      || originalRequest.url?.includes('/auth/token/refresh/')
      || originalRequest.url?.includes('/auth/logout/')
    ) {
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingRequests.push((token) => {
          if (!token) {
            reject(error)
            return
          }

          const headers = originalRequest.headers ?? new AxiosHeaders()
          headers.set('Authorization', `Bearer ${token}`)
          originalRequest.headers = headers
          resolve(api(originalRequest))
        })
      })
    }

    isRefreshing = true

    try {
      const refreshToken = window.localStorage.getItem('refreshToken')

      if (!refreshToken) {
        clearAuthSession()
        return Promise.reject(error)
      }

      const { data } = await api.post<AuthTokens>('/auth/token/refresh/', { refresh: refreshToken })
      window.localStorage.setItem('accessToken', data.access)

      if (data.refresh) {
        window.localStorage.setItem('refreshToken', data.refresh)
      }

      pendingRequests.forEach((resolveRequest) => resolveRequest(data.access))
      pendingRequests = []

      const headers = originalRequest.headers ?? new AxiosHeaders()
      headers.set('Authorization', `Bearer ${data.access}`)
      originalRequest.headers = headers
      originalRequest._retry = true

      return api(originalRequest)
    } catch (refreshError) {
      pendingRequests.forEach((resolveRequest) => resolveRequest(null))
      pendingRequests = []
      clearAuthSession()
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)

export default api
