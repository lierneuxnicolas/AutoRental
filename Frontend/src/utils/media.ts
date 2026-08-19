const LOCAL_BACKEND_URL = 'http://127.0.0.1:8000'
const backendBaseUrl = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || LOCAL_BACKEND_URL)
  : LOCAL_BACKEND_URL

function getBackendOrigin(): string {
  return new URL(backendBaseUrl).origin
}

export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null
  }

  if (/^https?:\/\//i.test(url)) {
    return url
  }

  const normalizedPath = url.startsWith('/') ? url : `/${url}`
  return `${getBackendOrigin()}${normalizedPath}`
}