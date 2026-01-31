'use client'

import { useEffect, useRef } from 'react'
import { Toaster, toast } from 'sonner'

const AUTH_REQUIRED_EVENT = 'nda:auth-required'

export function GlobalToaster() {
  const lastAuthToastAt = useRef<number>(0)

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<{ message?: string }>
      const message = custom.detail?.message
      if (!message) return

      const now = Date.now()
      if (now - lastAuthToastAt.current < 10_000) return
      lastAuthToastAt.current = now

      toast.error(message)
    }

    window.addEventListener(AUTH_REQUIRED_EVENT, handler)
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, handler)
  }, [])

  return (
    <Toaster position="top-right" richColors visibleToasts={5} expand gap={8} />
  )
}
