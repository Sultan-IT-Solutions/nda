"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  ChartBar,
  ChartPie,
  Users,
  CalendarBlank,
  Clock,
  Tag,
  MapPin,
  UserCircle,
  CaretLeft,
  CaretRight
} from "@phosphor-icons/react"

const navItems = [
  { label: "Аналитика", icon: ChartPie, path: "/analytics" },
  { label: "Аналитика залов", icon: ChartBar, path: "/analytics/halls" },
  { label: "Аналитика преподавателей", icon: Users, path: "/analytics/teachers" },
  { label: "Аналитика групп", icon: Users, path: "/analytics/groups" },
  { label: "Расписание", icon: CalendarBlank, path: "/analytics/schedule" },
  { label: "Заявки", icon: Clock, path: "/analytics/applications" },
  { label: "Ученики", icon: Users, path: "/analytics/students" },
  { label: "Пользователи", icon: UserCircle, path: "/analytics/users" },
  { label: "Группы", icon: Users, path: "/groups" },
  { label: "Категории", icon: Tag, path: "/analytics/categories" },
  { label: "Залы", icon: MapPin, path: "/halls" },
]

export function AdminSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved !== null) {
      setIsCollapsed(saved === 'true')
    }
  }, [])

  const toggleCollapsed = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    localStorage.setItem('sidebar-collapsed', String(newState))
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { collapsed: newState } }))
  }

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-gray-900 text-white p-4 z-50 transition-all duration-300 ${
        isCollapsed ? 'w-16' : 'w-72'
      }`}
    >
      <div className="mb-6">
        {!isCollapsed && (
          <>
            <h1 className="text-xl font-bold">Nomad Dance Academy</h1>
            <p className="text-sm text-gray-400">Админ панель</p>
          </>
        )}
      </div>

      <nav className="space-y-1">
        {navItems.map((item) => {
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
