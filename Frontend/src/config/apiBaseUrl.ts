const LOCAL_BACKEND_URL = 'http://127.0.0.1:8000'
const PROD_FALLBACK_BACKEND_URL = 'https://getacar-backend.salmonmushroom-b250896e.northeurope.azurecontainerapps.io'

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
