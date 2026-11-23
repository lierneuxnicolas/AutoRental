export const LOCAL_BACKEND_URL = 'http://127.0.0.1:8000'
export const PROD_FALLBACK_BACKEND_URL = 'https://getacar-backend.salmonmushroom-b250896e.northeurope.azurecontainerapps.io'

export function httpOrigin(value: string, allowHttp = false): string | null {
  try {
    const url = new URL(value)
    const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    const protocolAllowed = url.protocol === 'https:' || (allowHttp && isLoopback && url.protocol === 'http:')
    if (protocolAllowed && !url.username && !url.password) return url.origin
  } catch {
    return null
  }
  return null
}

export function configuredMediaOrigins(value: string | undefined): string[] {
  return [...new Set((value ?? '').split(',').map((item) => httpOrigin(item.trim())).filter(
    (origin): origin is string => origin !== null,
  ))]
}
