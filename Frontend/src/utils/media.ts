const API_BASE_URL = 'http://127.0.0.1:8000/api/v1'

function getBackendOrigin(): string {
  return new URL(API_BASE_URL).origin
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