"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { buildLoginUrl, DEFAULT_SESSION_EXPIRED_MESSAGE } from "@/lib/auth"
import { getAccessToken, logout } from "@/lib/api"

const IDLE_TIMEOUT_MS = 10 * 60 * 1000
const AUTH_REQUIRED_MESSAGE = "Сессия завершена из-за неактивности"

export function IdleLogout() {
  const router = useRouter()
  const pathname = usePathname()
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!getAccessToken()) return
    if (pathname.startsWith("/login")) return

    const clearTimer = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const startTimer = () => {
      clearTimer()
      timerRef.current = window.setTimeout(() => {
        logout()
        router.push(
          buildLoginUrl({
            message: AUTH_REQUIRED_MESSAGE || DEFAULT_SESSION_EXPIRED_MESSAGE,
            next: pathname,
          })
        )
      }, IDLE_TIMEOUT_MS)
    }

    const handleActivity = () => {
      startTimer()
    }

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "focus",
    ]

    events.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }))
    startTimer()

    return () => {
      events.forEach((event) => window.removeEventListener(event, handleActivity))
      clearTimer()
    }
  }, [pathname, router])

  return null
}
