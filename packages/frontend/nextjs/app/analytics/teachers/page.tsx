"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { API, handleApiError, logout } from "@/lib/api"
import { AdminSidebar } from "@/components/admin-sidebar"
import { AdminHeader } from "@/components/admin-header"
import { useSidebar } from "@/hooks/use-sidebar"
import {
  Clock,
  CalendarBlank,
  ChartBar,
  Download,
  Users,
  Chalkboard,
  MapPin
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from 'sonner'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface UserData {
  id: number
  name: string
  email: string
  role: string
  created_at?: string
}

interface TeacherAnalytics {
  teacherId: number
  teacherName: string
  totalHours: number
  studentCount: number
  groupCount: number
}

export default function TeacherAnalyticsPage() {
  const router = useRouter()
  const { sidebarWidth } = useSidebar()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<UserData | null>(null)
  const [teachersData, setTeachersData] = useState<TeacherAnalytics[]>([])
  const [selectedMonth, setSelectedMonth] = useState("october")
  const [totalHours, setTotalHours] = useState(0)
  const [totalTeachers, setTotalTeachers] = useState(0)
  const [totalStudents, setTotalStudents] = useState(0)
  const [totalGroups, setTotalGroups] = useState(0)

  const handleLogout = () => {
    logout()
    toast.success("Вы успешно вышли из системы")
    router.push("/login")
  }

  const downloadExcel = () => {
    if (teachersData.length === 0) {
      toast.error("Нет данных для экспорта")
      return
    }

    const BOM = '\uFEFF'
    const headers = ['Преподаватель', 'Всего часов', 'Учеников', 'Групп']

    const rows = teachersData.map(teacher => [
      teacher.teacherName,
      teacher.totalHours,
      teacher.studentCount,
      teacher.groupCount || 0
    ])

    const totalsRow = [
      'ИТОГО',
      totalHours,
      totalStudents,
      totalGroups
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
    link.download = `Аналитика_преподавателей_${date}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    toast.success("Файл успешно загружен!")
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userData = await API.users.me();
        setUser(userData.user);

        if (userData.user.role !== "admin") {
          setError("Доступ запрещен. Только для администраторов.");
          router.push("/");
          return;
        }

        const data = await API.admin.getTeachersAnalytics()

        const teachers: TeacherAnalytics[] = data.teachers || []
        setTeachersData(teachers);

        const total = teachers.reduce((sum, t) => sum + t.totalHours, 0);
        setTotalHours(total);
        setTotalTeachers(teachers.length);

        const uniqueStudents = teachers.reduce((sum, t) => sum + t.studentCount, 0)
        setTotalStudents(uniqueStudents)

        const groups = teachers.reduce((sum, t) => sum + (t.groupCount || 0), 0)
        setTotalGroups(groups)

        setLoading(false);
      } catch (err) {
        console.error("Ошибка загрузки данных:", err);
        handleApiError(err);
        setError(err instanceof Error ? err.message : "Произошла ошибка");
        setLoading(false);
      }
    }

    fetchData();
  }, [router]);

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

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar />
      <div className={sidebarWidth + " transition-all duration-300"}>
        <AdminHeader userName={user?.name} userEmail={user?.email} />
        <main className="p-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Аналитика преподавателей</h1>
              <p className="text-sm text-muted-foreground mt-1">Нагрузка и распределение групп</p>
            </div>
            <Button onClick={downloadExcel} variant="outline" className="gap-2">
              <Download size={16} />
              Экспорт в Excel
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-blue-50">
                    <Users size={22} className="text-blue-600" weight="duotone" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Преподавателей</p>
                    <p className="text-2xl font-semibold mt-0.5">{totalTeachers}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-green-50">
                    <Clock size={22} className="text-green-600" weight="duotone" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Часов в неделю</p>
                    <p className="text-2xl font-semibold mt-0.5">{totalHours}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-purple-50">
                    <Chalkboard size={22} className="text-purple-600" weight="duotone" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Всего групп</p>
                    <p className="text-2xl font-semibold mt-0.5">{totalGroups}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-orange-50">
                    <Users size={22} className="text-orange-600" weight="duotone" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Всего учеников</p>
                    <p className="text-2xl font-semibold mt-0.5">{totalStudents}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6 border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Нагрузка преподавателей</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[200px]">Преподаватель</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Групп</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Часов/нед</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Учеников</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teachersData.map((teacher, index) => (
                    <TableRow key={teacher.teacherId} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full bg-blue-500`} />
                          {teacher.teacherName}
                        </div>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{teacher.groupCount || 0}</TableCell>
                      <TableCell className="text-center tabular-nums font-semibold">{teacher.totalHours}ч</TableCell>
                      <TableCell className="text-center tabular-nums">{teacher.studentCount}</TableCell>
                    </TableRow>
                  ))}
                  {teachersData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Нет данных о преподавателях
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Распределение нагрузки</CardTitle>
              <p className="text-sm text-muted-foreground">Сравнение рабочей нагрузки преподавателей</p>
            </CardHeader>
            <CardContent className="pt-0">
              {teachersData.length > 0 ? (
                <div className="space-y-6">
                  <div className="space-y-4">
                    {teachersData.slice(0, 8).map((teacher, index) => {
                      const maxHours = Math.max(...teachersData.map(t => t.totalHours));
                      const percentage = maxHours > 0 ? (teacher.totalHours / maxHours) * 100 : 0;
                      const colors = [
                        'from-blue-500 to-blue-400',
                        'from-green-500 to-green-400',
                        'from-purple-500 to-purple-400',
                        'from-orange-500 to-orange-400',
                        'from-pink-500 to-pink-400',
                        'from-indigo-500 to-indigo-400',
                        'from-red-500 to-red-400',
                        'from-teal-500 to-teal-400'
                      ];

                      return (
                        <div key={teacher.teacherId} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${colors[index % colors.length]} flex-shrink-0`} />
                              <span className="text-sm font-medium text-foreground truncate">{teacher.teacherName}</span>
                            </div>
                            <div className="flex items-center gap-4 flex-shrink-0">
                              <span className="text-xs text-muted-foreground">{teacher.groupCount} групп</span>
                              <span className="text-sm font-semibold tabular-nums">{teacher.totalHours}ч/нед</span>
                            </div>
                          </div>

                          <div className="relative">
                            <div className="w-full bg-muted/30 rounded-full h-3 overflow-hidden">
                              <div
                                className={`h-full bg-gradient-to-r ${colors[index % colors.length]} transition-all duration-500 ease-out relative`}
                                style={{ width: `${percentage}%` }}
                              >
                                <div className="absolute inset-0 bg-white/20 opacity-0 hover:opacity-100 transition-opacity duration-200" />
                              </div>
                            </div>

                            <div className="absolute right-2 top-0 bottom-0 flex items-center">
                              <span className="text-xs font-medium text-white/90 drop-shadow-sm">
                                {Math.round(percentage)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-4 gap-4 pt-4 border-t">
                    <div className="text-center">
                      <div className="text-lg font-semibold text-foreground">{teachersData.reduce((sum, t) => sum + t.totalHours, 0)}</div>
                      <div className="text-xs text-muted-foreground">Всего часов</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-foreground">{Math.round(teachersData.reduce((sum, t) => sum + t.totalHours, 0) / teachersData.length)}</div>
                      <div className="text-xs text-muted-foreground">Среднее</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-foreground">{Math.max(...teachersData.map(t => t.totalHours))}</div>
                      <div className="text-xs text-muted-foreground">Максимум</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-foreground">{teachersData.reduce((sum, t) => sum + t.groupCount, 0)}</div>
                      <div className="text-xs text-muted-foreground">Всего групп</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <ChartBar className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p>Нет данных для отображения графика</p>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
