'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { buildLoginUrl, DEFAULT_SESSION_EXPIRED_MESSAGE } from '@/lib/auth'
import { logout } from '@/lib/api'

const AUTH_REQUIRED_EVENT = 'nda:auth-required'

export function AuthRequiredRedirect() {
  const router = useRouter()
  const pathname = usePathname()
  const redirecting = useRef(false)

  useEffect(() => {
    const handler = (e: Event) => {
      if (redirecting.current) return
      if (pathname.startsWith('/login')) return

      redirecting.current = true

      const custom = e as CustomEvent<{ message?: string }>
      const message = custom.detail?.message

      logout()
      router.push(
        buildLoginUrl({
          message: message || DEFAULT_SESSION_EXPIRED_MESSAGE,
          next: pathname,
        })
      )
    }

    window.addEventListener(AUTH_REQUIRED_EVENT, handler)
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, handler)
  }, [pathname, router])

  return null
}
