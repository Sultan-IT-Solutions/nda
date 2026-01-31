export type CookieOptions = {
  path?: string
  maxAgeSeconds?: number
  sameSite?: 'Lax' | 'Strict' | 'None'
  secure?: boolean
}

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null

  const cookies = document.cookie ? document.cookie.split('; ') : []
  const prefix = `${name}=`

  for (const cookie of cookies) {
    if (!cookie.startsWith(prefix)) continue
    return decodeURIComponent(cookie.slice(prefix.length))
  }

  return null
}

export function setCookie(name: string, value: string, options: CookieOptions = {}): void {
  if (typeof document === 'undefined') return

  const parts: string[] = [`${name}=${encodeURIComponent(value)}`]
  parts.push(`Path=${options.path ?? '/'}`)

  if (typeof options.maxAgeSeconds === 'number') {
    parts.push(`Max-Age=${options.maxAgeSeconds}`)
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`)
  }

  if (options.secure) {
    parts.push('Secure')
  }

  document.cookie = parts.join('; ')
}

export function deleteCookie(name: string, path: string = '/'): void {
  setCookie(name, '', { path, maxAgeSeconds: 0 })
}
