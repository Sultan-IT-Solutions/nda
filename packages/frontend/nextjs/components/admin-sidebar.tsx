"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { getCookie, setCookie } from "@/lib/client-cookies"
import { CaretLeft, CaretRight } from "@phosphor-icons/react"
import { adminNavItems } from "@/components/admin-nav"

const SIDEBAR_COLLAPSED_COOKIE = "nda_sidebar_collapsed"
const SIDEBAR_COLLAPSED_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export function AdminSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const saved = getCookie(SIDEBAR_COLLAPSED_COOKIE)
    if (saved !== null) setIsCollapsed(saved === 'true')
  }, [])

  const toggleCollapsed = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    setCookie(SIDEBAR_COLLAPSED_COOKIE, String(newState), {
      maxAgeSeconds: SIDEBAR_COLLAPSED_MAX_AGE_SECONDS,
      sameSite: 'Lax',
      secure: typeof window !== 'undefined' ? window.location.protocol === 'https:' : false,
    })
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { collapsed: newState } }))
  }

  return (
    <aside
      className={`hidden md:block fixed left-0 top-0 h-screen bg-gray-900 text-white p-4 z-50 transition-all duration-300 ${
        isCollapsed ? 'w-16' : 'w-72'
      }`}
    >
      <div className="mb-6">
        {!isCollapsed && (
          <>
            <h1 className="text-xl font-bold">Nomad Dance Academy</h1>
            <p className="text-sm text-gray-400">Администраторская панель</p>
          </>
        )}
      </div>

      <nav className="space-y-1">
        {adminNavItems.map((item) => {
          const isActive = pathname === item.path
          const Icon = item.icon

          return (
            <Button
              key={item.path}
              variant="ghost"
              title={isCollapsed ? item.label : undefined}
              className={`w-full text-sm ${
                isCollapsed ? 'justify-center px-2' : 'justify-start'
              } ${
                isActive
                  ? "text-white bg-gray-800"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
              onClick={() => !isActive && router.push(item.path)}
            >
              <Icon size={20} className={isCollapsed ? '' : 'mr-3 flex-shrink-0'} />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </Button>
          )
        })}
      </nav>

      {/* Toggle button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleCollapsed}
        className="absolute bottom-4 right-2 text-gray-400 hover:text-white hover:bg-gray-800 p-2"
        title={isCollapsed ? "Развернуть" : "Свернуть"}
      >
        {isCollapsed ? <CaretRight size={20} /> : <CaretLeft size={20} />}
      </Button>
    </aside>
  )
}
