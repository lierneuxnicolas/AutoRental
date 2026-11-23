import { LOCAL_BACKEND_URL, PROD_FALLBACK_BACKEND_URL } from './mediaOrigins'

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

export function getBackendBaseUrl(): string {
  const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim()

  if (configuredBaseUrl.length > 0) {
    return normalizeBaseUrl(configuredBaseUrl)
  }

  if (import.meta.env.PROD) {
    return PROD_FALLBACK_BACKEND_URL
  }

  return LOCAL_BACKEND_URL
}

export function getBackendOrigin(): string {
  return new URL(getBackendBaseUrl()).origin
}
