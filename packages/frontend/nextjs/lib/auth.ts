export const DEFAULT_SESSION_EXPIRED_MESSAGE = 'Ваша сессия истекла, войдите в систему заново'

export function buildLoginUrl(options?: { message?: string; next?: string }) {
  const params = new URLSearchParams()
  if (options?.message) params.set('message', options.message)
  if (options?.next) params.set('next', options.next)
  const query = params.toString()
  return `/login${query ? `?${query}` : ''}`
}
