import { getBackendOrigin } from '../config/apiBaseUrl'

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