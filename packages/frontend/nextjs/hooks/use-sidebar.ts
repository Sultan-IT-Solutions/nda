"use client"

import { useState, useEffect } from "react"

export function useSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved !== null) {
      setIsCollapsed(saved === 'true')
    }

    const handleToggle = (e: CustomEvent<{ collapsed: boolean }>) => {
      setIsCollapsed(e.detail.collapsed)
    }

    window.addEventListener('sidebar-toggle', handleToggle as EventListener)
    return () => window.removeEventListener('sidebar-toggle', handleToggle as EventListener)
  }, [])

  return { isCollapsed, sidebarWidth: isCollapsed ? 'ml-16' : 'ml-72' }
}
