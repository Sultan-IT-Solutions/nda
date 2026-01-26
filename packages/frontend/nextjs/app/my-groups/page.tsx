"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { SignOut, User, MapPin, Clock, Calendar, Plus } from "@phosphor-icons/react"
import { NotificationBell } from "@/components/notification-bell"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Toaster, toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { API, handleApiError, isAuthenticated, logout } from "@/lib/api"

interface UserData {
  id: number
  name: string
  email: string
  role: string
  created_at?: string
}

interface GroupData {
  id: number
  name: string
  capacity: number
  start_time: string | null
  duration_minutes: number
  hall_id: number | null
  hall_name: string | null
  enrolled: number
  teacher_ids: number[]
  free_slots: number | null
}

interface EnrolledGroup {
  id: number
  name: string
  teacher_name: string
  schedule: string
  hall: string
  badge: string
  badgeColor: string
  borderColor: string
}

export default function MyGroupsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<UserData | null>(null)
  const [enrolledGroups, setEnrolledGroups] = useState<EnrolledGroup[]>([])

  const handleLogout = () => {
    logout()
    toast.success("Вы успешно вышли из системы")
    router.push("/login")
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!isAuthenticated()) {
          localStorage.setItem("loginMessage", "Ваша сессия истекла, войдите в систему заново")
          router.push("/login")
          return
        }

        const userData = await API.users.me()
        setUser(userData.user)

        if (userData.user.role === 'teacher') {
          router.push('/teacher-groups')
          return
        }

        if (userData.user.role !== 'student') {
          setError("У вас нет доступа к этой странице")
          setLoading(false)
          return
        }

        const groupsData = await API.students.getMyGroups()

        const transformed = (groupsData.groups || []).map((group: any, index: number) => {
          const badges = ["Обычный", "Пробный", "Занятие перенесено"]
          const colors = [
            { badge: "bg-pink-500", border: "border-pink-500" },
            { badge: "bg-purple-500", border: "border-purple-500" },
            { badge: "bg-orange-500", border: "border-orange-500" },
          ]
          const colorSet = colors[index % colors.length]

          let schedule = group.schedule || "Не указано";
          if (schedule === "Не назначено") {
            schedule = "Не указано";
          }

          return {
            id: group.id,
            name: group.name || "Без названия",
            teacher_name: group.teacher_name || "Не назначен",
            schedule: schedule,
            hall: group.hall_name || "Не указано",
            badge: badges[index % badges.length],
            badgeColor: colorSet.badge,
            borderColor: colorSet.border,
          }
        })

        setEnrolledGroups(transformed)
        setLoading(false)
      } catch (err) {
        logout()
        localStorage.setItem("loginMessage", "Ваша сессия истекла, войдите в систему заново")
        router.push("/login")
      }
    }

    fetchData()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-2">Ошибка: {error}</p>
          <p className="text-sm text-muted-foreground">Убедитесь, что вы авторизованы и сервер запущен.</p>
        </div>
      </div>
    )
  }

  const profile = {
    name: user?.name || "Не указано",
    initials: user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : "НИ",
    email: user?.email || "Не указано",
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster
        position="top-right"
        richColors
        visibleToasts={5}
        expand={true}
        gap={8}
      />
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <nav className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Button
                variant="ghost"
                className="text-foreground/70 hover:text-foreground text-sm"
                onClick={() => router.push("/")}
              >
                Главная
              </Button>
              <Button
                variant="ghost"
                className="text-foreground/70 hover:text-foreground text-sm"
                onClick={() => router.push("/schedule")}
              >
                Расписание групп
              </Button>
              <Button
                className="bg-[#FF6B35] hover:bg-[#FF6B35]/90 text-white text-sm rounded-lg px-6"
              >
                Мои группы
              </Button>
              <Button
                variant="ghost"
                className="text-foreground/70 hover:text-foreground text-sm"
                onClick={() => router.push("/trial")}
              >
                Пробный урок
              </Button>
              <Button
                variant="ghost"
                className="text-foreground/70 hover:text-foreground text-sm"
                onClick={() => router.push("/profile")}
              >
                Профиль
              </Button>
            </div>
            <div className="flex items-center gap-4">
              <NotificationBell accentColor="bg-[#FF6B35]" />
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Уведомления</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-full">
                      <Avatar className="h-9 w-9 cursor-pointer hover:opacity-80 transition-opacity">
                        <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-xs font-semibold">
                          {profile.initials}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{profile.name}</p>
                        <p className="text-xs leading-none text-muted-foreground">{profile.email}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                      <SignOut size={16} className="mr-2" />
                      Выйти
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Ваши группы</h1>
          <p className="text-sm text-muted-foreground">Найдено {enrolledGroups.length} группы</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {enrolledGroups.map((group) => (
            <Card
              key={group.id}
              className={`p-6 border-2 ${group.borderColor} hover:shadow-lg transition-shadow cursor-pointer bg-card/80`}
            >
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-foreground mb-2">{group.name}</h3>
                <Badge className={`${group.badgeColor} text-white border-0 text-xs font-medium`}>
                  {group.badge}
                </Badge>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <User size={16} className="text-primary" weight="duotone" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground mb-0.5">Преподаватель</div>
                    <div className="font-medium text-foreground">{group.teacher_name}</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <MapPin size={16} className="text-primary" weight="duotone" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground mb-0.5">Зал</div>
                    <div className="font-medium text-foreground">{group.hall}</div>
                  </div>
                </div>
              </div>
            </Card>
          ))}

          {}
          <Card className="p-6 border-2 border-dashed border-primary/30 hover:border-primary/50 transition-colors cursor-pointer bg-card/50 flex flex-col items-center justify-center min-h-[280px]">
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Plus size={32} className="text-primary" weight="bold" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-foreground mb-1">Добавить Новую Запись</h3>
                <p className="text-sm text-muted-foreground">Записать на новое занятие</p>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}
