"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AdminSidebar } from "@/components/admin-sidebar"
import { AdminHeader } from "@/components/admin-header"
import { useSidebar } from "@/hooks/use-sidebar"
import {
  TrendUp,
  Users,
  House,
  Calendar,
  ChartBar,
  Clock,
  Tag
} from "@phosphor-icons/react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { API, handleApiError } from "@/lib/api"
import { buildLoginUrl, DEFAULT_SESSION_EXPIRED_MESSAGE } from "@/lib/auth"

interface UserData {
  id: number
  name: string
  email: string
  role: string
}

interface DashboardStats {
  totalUsers: number
  totalTeachers: number
  totalGroups: number
  totalHalls: number
  activeGroups: number
  pendingApplications: number
}

export default function AnalyticsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { sidebarWidth } = useSidebar()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<UserData | null>(null)
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalTeachers: 0,
    totalGroups: 0,
    totalHalls: 0,
    activeGroups: 0,
    pendingApplications: 0
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        let userData: any
        try {
          userData = await API.users.me()
        } catch (err) {
          const message = handleApiError(err)
          if (message.includes('Требуется авторизация')) {
            router.push(buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname }))
            return
          }
          throw err
        }
        setUser(userData.user)

        if (userData.user.role !== "admin") {
          router.push("/")
          return
        }

        try {
          const [hallsData, teachersData, groupsData, usersData] = await Promise.all([
            API.halls.getAll(),
            API.teachers.getAll(),
            API.groups.getAll(),
            API.users.getAll(),
          ])

          const totalUsers = Array.isArray(usersData?.users) ? usersData.users.length : 0

          setStats({
            totalUsers,
            totalTeachers: teachersData.teachers?.length || 0,
            totalGroups: groupsData.groups?.length || 0,
            totalHalls: hallsData.halls?.length || 0,
            activeGroups: groupsData.groups?.filter((g: any) => g.isActive !== false).length || 0,
            pendingApplications: 0
          })
        } catch (err) {
          console.error("Error fetching stats:", err)
        }

        setLoading(false)
      } catch (error) {
        console.error("Error fetching data:", error)
        handleApiError(error)
        setLoading(false)
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

  const statCards = [
  { title: "Всего пользователей", value: stats.totalUsers, icon: Users, color: "text-blue-600", bgColor: "bg-blue-100" },
    { title: "Преподавателей", value: stats.totalTeachers, icon: Users, color: "text-green-600", bgColor: "bg-green-100" },
    { title: "Активных групп", value: stats.activeGroups, icon: TrendUp, color: "text-purple-600", bgColor: "bg-purple-100" },
    { title: "Залов", value: stats.totalHalls, icon: House, color: "text-orange-600", bgColor: "bg-orange-100" },
  ]

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar />

      <div className={sidebarWidth + " transition-all duration-300"}>
        <AdminHeader userName={user?.name} userEmail={user?.email} />

        <main className="p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-foreground">Аналитика</h1>
            <p className="text-sm text-muted-foreground mt-1">Общая статистика академии</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {statCards.map((card, index) => (
              <Card key={index}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{card.title}</p>
                      <p className="text-3xl font-bold mt-1">{card.value}</p>
                    </div>
                    <div className={`w-12 h-12 ${card.bgColor} rounded-lg flex items-center justify-center`}>
                      <card.icon className={`w-6 h-6 ${card.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/analytics/halls")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ChartBar className="w-5 h-5 text-purple-600" />
                  Аналитика залов
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Загрузка залов по дням недели</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/analytics/teachers")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="w-5 h-5 text-green-600" />
                  Аналитика преподавателей
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Нагрузка и статистика преподавателей</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/analytics/groups")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendUp className="w-5 h-5 text-blue-600" />
                  Аналитика групп
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Посещаемость и эффективность групп</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/analytics/schedule")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-orange-600" />
                  Расписание
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Управление расписанием занятий</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/analytics/applications")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-600" />
                  Заявки
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Заявки на перенос занятий</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/analytics/students")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="w-5 h-5 text-pink-600" />
                  Ученики
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Информация обо всех учениках</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/groups")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="w-5 h-5 text-cyan-600" />
                  Группы
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Управление группами академии</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/analytics/categories")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Tag className="w-5 h-5 text-teal-600" />
                  Категории
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Управление категориями групп</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/halls")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <House className="w-5 h-5 text-indigo-600" />
                  Залы
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Управление залами академии</p>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  )
}
