import { getBackendOrigin } from '../config/apiBaseUrl'
import { configuredMediaOrigins, httpOrigin } from '../config/mediaOrigins'

const storageOrigins = configuredMediaOrigins(import.meta.env.VITE_MEDIA_ORIGINS)
const photoDirectory = /^(?:vehicles|inspections|technical_inspections)\/photos\//

export function resolveMediaUrl(value: string | null | undefined): string | null {
  if (!value || value.startsWith('//') || value.includes('\\')) return null
  if ([...value].some((char) => char <= ' ' || char === '\u007f')) return null

  try {
    const backendOrigin = getBackendOrigin()
    const absolute = /^[a-z][a-z\d+.-]*:/i.test(value)
    if (absolute && !/^https?:\/\//i.test(value)) return null
    const url = new URL(absolute || value.startsWith('/') ? value : '/' + value, backendOrigin)
    if (!httpOrigin(url.href, import.meta.env.DEV) || /%(?:00|2f|5c)/i.test(url.pathname)) return null
    if (url.origin === backendOrigin && url.pathname.startsWith('/media/')) {
      return photoDirectory.test(url.pathname.slice('/media/'.length)) ? url.href : null
    }
    // Blob storage paths start with the exact configured account's container name.
    const storagePath = url.pathname.replace(/^\/[^/]+\//, '')
    return absolute && storageOrigins.includes(url.origin) && photoDirectory.test(storagePath)
      ? url.href
      : null
  } catch {
    return null
  }
}
