type Json = Record<string, unknown> | unknown[] | string | number | boolean | null

let accessToken: string | null = null
let refreshPromise: Promise<string | null> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      if (!res.ok) return null
      const data = (await res.json()) as { access_token?: string }
      const token = data?.access_token ?? null
      accessToken = token
      return token
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

type ApiFetchOptions = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>
  retryOn401?: boolean
}

export async function apiFetch<T = Json>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const url = path.startsWith('/api/') ? path : `/api/${path.replace(/^\/+/, '')}`

  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  const retryOn401 = options.retryOn401 ?? true

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (res.status !== 401 || !retryOn401) {
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `Request failed: ${res.status}`)
    }
    return (await res.json()) as T
  }

  const newToken = await refreshAccessToken()
  if (!newToken) {
    const text = await res.text().catch(() => '')
    throw new Error(text || 'Unauthorized')
  }

  return apiFetch<T>(path, {
    ...options,
    retryOn401: false,
  })
}

export async function login(email: string, password: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Login failed: ${res.status}`)
  }

  const data = (await res.json()) as { access_token?: string; token?: string; user?: unknown }
  const token = data.access_token ?? data.token ?? null
  accessToken = token
  return data
}

export async function logout() {
  accessToken = null
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {})
}
