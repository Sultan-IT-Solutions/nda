"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminSidebar } from "@/components/admin-sidebar"
import { AdminHeader } from "@/components/admin-header"
import { useSidebar } from "@/hooks/use-sidebar"
import {
  Clock,
  CalendarBlank,
  ChartBar,
  Download,
  Users,
  MapPin
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Toaster, toast } from 'sonner'
import { API, handleApiError, isAuthenticated, logout } from "@/lib/api"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface UserData {
  id: number
  name: string
  email: string
  role: string
  created_at?: string
}

interface HallAnalytics {
  id: number
  hallId: number
  hallName: string
  name: string
  capacity: number
  monday: number
  tuesday: number
  wednesday: number
  thursday: number
  friday: number
  saturday: number
  sunday: number
  total: number
}

export default function HallAnalyticsPage() {
  const router = useRouter()
  const { sidebarWidth } = useSidebar()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<UserData | null>(null)
  const [hallsData, setHallsData] = useState<HallAnalytics[]>([])
  const [totalHours, setTotalHours] = useState(0)
  const [activeHalls, setActiveHalls] = useState(0)
  const [avgLoad, setAvgLoad] = useState(0)
  const [peakDay, setPeakDay] = useState("")

  const handleLogout = () => {
    localStorage.removeItem("token")
    toast.success("Вы успешно вышли из системы")
    router.push("/login")
  }

  const downloadExcel = () => {
    if (hallsData.length === 0) {
      toast.error("Нет данных для экспорта")
      return
    }

    const BOM = '\uFEFF'
    const headers = ['Зал', 'Вместимость', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс', 'Всего часов']

    const rows = hallsData.map(hall => [
      hall.hallName,
      hall.capacity,
      hall.monday,
      hall.tuesday,
      hall.wednesday,
      hall.thursday,
      hall.friday,
      hall.saturday,
      hall.sunday,
      hall.total
    ])

    const totalsRow = [
      'ИТОГО',
      '',
      hallsData.reduce((sum, h) => sum + h.monday, 0),
      hallsData.reduce((sum, h) => sum + h.tuesday, 0),
      hallsData.reduce((sum, h) => sum + h.wednesday, 0),
      hallsData.reduce((sum, h) => sum + h.thursday, 0),
      hallsData.reduce((sum, h) => sum + h.friday, 0),
      hallsData.reduce((sum, h) => sum + h.saturday, 0),
      hallsData.reduce((sum, h) => sum + h.sunday, 0),
      totalHours
    ]
    rows.push(totalsRow)

    const csvContent = BOM + [
      headers.join(';'),
      ...rows.map(row => row.join(';'))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const date = new Date().toISOString().split('T')[0]
    link.download = `Аналитика_залов_${date}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    toast.success("Файл успешно загружен!")
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

        if (userData.user.role !== "admin") {
          setError("Доступ запрещен. Только для администраторов.")
          router.push("/")
          return
        }

        const data = await API.halls.getAnalytics()

        const halls: HallAnalytics[] = (data.halls || []).map((hall: any) => ({
          id: hall.hallId,
          hallId: hall.hallId,
          hallName: hall.hallName,
          name: hall.hallName,
          capacity: hall.capacity || 0,
          monday: hall.monday || 0,
          tuesday: hall.tuesday || 0,
          wednesday: hall.wednesday || 0,
          thursday: hall.thursday || 0,
          friday: hall.friday || 0,
          saturday: hall.saturday || 0,
          sunday: hall.sunday || 0,
          total: hall.total || 0,
        }))
        setHallsData(halls)

        const total = halls.reduce((sum, hall) => sum + hall.total, 0)
        setTotalHours(total)
        setActiveHalls(halls.length)

        const avg = halls.length > 0 ? total / halls.length : 0
        setAvgLoad(parseFloat(avg.toFixed(1)))

        const dayTotals = {
          Понедельник: halls.reduce((sum, h) => sum + h.monday, 0),
          Вторник: halls.reduce((sum, h) => sum + h.tuesday, 0),
          Среда: halls.reduce((sum, h) => sum + h.wednesday, 0),
          Четверг: halls.reduce((sum, h) => sum + h.thursday, 0),
          Пятница: halls.reduce((sum, h) => sum + h.friday, 0),
          Суббота: halls.reduce((sum, h) => sum + h.saturday, 0),
          Воскресенье: halls.reduce((sum, h) => sum + h.sunday, 0),
        }

        const peak = Object.entries(dayTotals).reduce((max, [day, hours]) =>
          hours > max.hours ? { day, hours } : max,
          { day: "", hours: 0 }
        )

        setPeakDay(peak.day)

        setLoading(false)
      } catch (err) {
        console.error("Ошибка загрузки данных:", err)
        handleApiError(err)
        setError(err instanceof Error ? err.message : "Произошла ошибка")
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
          <p className="text-muted-foreground">Загрузка аналитики...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-2">Ошибка: {error}</p>
          <Button onClick={() => router.push("/")}>Вернуться на главную</Button>
        </div>
      </div>
    )
  }

  const profile = {
    name: user?.name || "Администратор",
    initials: user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : "АД",
    email: user?.email || "Не указано",
  }

  const dayColors = [
    "bg-orange-500",
    "bg-purple-500",
    "bg-blue-500",
  ]

  return (
    <div className="min-h-screen bg-background">
      <Toaster
        position="top-right"
        richColors
        visibleToasts={5}
        expand={true}
        gap={8}
      />

      <AdminSidebar />

      {}
      <div className={sidebarWidth + " transition-all duration-300"}>
        <AdminHeader userName={user?.name} userEmail={user?.email} />

        {}
        <main className="p-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Аналитика залов</h1>
              <p className="text-sm text-muted-foreground mt-1">Загрузка залов по дням недели</p>
            </div>
            <Button onClick={downloadExcel} variant="outline" className="gap-2">
              <Download size={16} />
              Экспорт в Excel
            </Button>
          </div>

          {}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-blue-50">
                    <Clock size={22} className="text-blue-600" weight="duotone" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Всего часов</p>
                    <p className="text-2xl font-semibold mt-0.5">{totalHours}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-green-50">
                    <ChartBar size={22} className="text-green-600" weight="duotone" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Залов активно</p>
                    <p className="text-2xl font-semibold mt-0.5">{activeHalls}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-purple-50">
                    <ChartBar size={22} className="text-purple-600" weight="duotone" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Средняя загрузка</p>
                    <p className="text-2xl font-semibold mt-0.5">{avgLoad}<span className="text-base font-normal text-muted-foreground ml-0.5">ч</span></p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-orange-50">
                    <CalendarBlank size={22} className="text-orange-600" weight="duotone" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Пик загрузки</p>
                    <p className="text-2xl font-semibold mt-0.5">{peakDay || "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {}
          <Card className="mb-6 border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Загрузка залов по дням</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[140px]">Зал</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Пн</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Вт</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Ср</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Чт</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Пт</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Сб</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Вс</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Итого</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hallsData.map((hall, index) => (
                    <TableRow key={`table-${hall.id}`} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${dayColors[index % dayColors.length]}`} />
                          {hall.hallName}
                        </div>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{hall.monday > 0 ? `${hall.monday}ч` : "—"}</TableCell>
                      <TableCell className="text-center tabular-nums">{hall.tuesday > 0 ? `${hall.tuesday}ч` : "—"}</TableCell>
                      <TableCell className="text-center tabular-nums">{hall.wednesday > 0 ? `${hall.wednesday}ч` : "—"}</TableCell>
                      <TableCell className="text-center tabular-nums">{hall.thursday > 0 ? `${hall.thursday}ч` : "—"}</TableCell>
                      <TableCell className="text-center tabular-nums">{hall.friday > 0 ? `${hall.friday}ч` : "—"}</TableCell>
                      <TableCell className="text-center tabular-nums">{hall.saturday > 0 ? `${hall.saturday}ч` : "—"}</TableCell>
                      <TableCell className="text-center tabular-nums">{hall.sunday > 0 ? `${hall.sunday}ч` : "—"}</TableCell>
                      <TableCell className="text-center font-semibold tabular-nums">{hall.total}ч</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Визуализация загрузки</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {}
                {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day, dayIndex) => (
                  <div key={day} className="flex items-center gap-3">
                    <div className="w-8 text-xs font-medium text-muted-foreground">{day}</div>
                    <div className="flex-1 flex gap-1 h-7 bg-muted/30 rounded-md overflow-hidden">
                      {hallsData.map((hall, hallIndex) => {
                        const hours = [
                          hall.monday,
                          hall.tuesday,
                          hall.wednesday,
                          hall.thursday,
                          hall.friday,
                          hall.saturday,
                          hall.sunday,
                        ][dayIndex] || 0

                        const maxHours = 12
                        const widthPercent = Math.min((hours / maxHours) * 100, 100)

                        if (hours === 0) return null

                        return (
                          <div
                            key={`${day}-${hall.id}`}
                            className={`h-full rounded-md ${dayColors[hallIndex % dayColors.length]} flex items-center justify-center transition-all`}
                            style={{ width: `${widthPercent}%`, minWidth: hours > 0 ? '32px' : '0' }}
                            title={`${hall.hallName}: ${hours}ч`}
                          >
                            {hours > 0 && (
                              <span className="text-xs font-medium text-white">{hours}ч</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {}
                <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t">
                  {hallsData.map((hall, index) => (
                    <div key={`legend-${hall.id}`} className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded ${dayColors[index % dayColors.length]}`} />
                      <span className="text-sm font-medium text-muted-foreground">{hall.hallName}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
