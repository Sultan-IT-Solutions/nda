"use client"

import { useState, useEffect } from "react"
import { getCookie } from "@/lib/client-cookies"

const SIDEBAR_COLLAPSED_COOKIE = "nda_sidebar_collapsed"

export function useSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const saved = getCookie(SIDEBAR_COLLAPSED_COOKIE)
    if (saved !== null) setIsCollapsed(saved === 'true')

    const handleToggle = (e: CustomEvent<{ collapsed: boolean }>) => {
      setIsCollapsed(e.detail.collapsed)
    }

    window.addEventListener('sidebar-toggle', handleToggle as EventListener)
    return () => window.removeEventListener('sidebar-toggle', handleToggle as EventListener)
  }, [])

  return { isCollapsed, sidebarWidth: isCollapsed ? 'ml-0 md:ml-16' : 'ml-0 md:ml-72' }
}
