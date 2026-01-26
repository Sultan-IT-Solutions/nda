"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { User, SignOut } from "@phosphor-icons/react"
import { NotificationBell } from "@/components/notification-bell"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Envelope, Phone, Calendar, TrendUp, MapPin, Clock, CheckCircle, Warning, CalendarBlank, XCircle, CaretLeft, CaretRight, CaretDown } from "@phosphor-icons/react"
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

interface StudentData {
  id: number
  user_id: number
  name?: string
  email?: string
  phone_number?: string
  comment: string | null
  trial_used: boolean
  subscription_until: string | null
}

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
  teacher_name: string | null
  category_name: string | null
  enrolled: number
  teacher_ids: number[]
  free_slots: number | null
  recurring_days: string | null
  schedule?: string
  isActive?: boolean
  is_trial?: boolean
  start_date?: string | null
  end_date?: string | null
}

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<UserData | null>(null)
  const [student, setStudent] = useState<StudentData | null>(null)
  const [groups, setGroups] = useState<GroupData[]>([])
  const [lessonAttendance, setLessonAttendance] = useState<any[]>([])
  const [attendanceData, setAttendanceData] = useState<any[]>([])
  const [currentGroupPage, setCurrentGroupPage] = useState(0)
  const groupsPerPage = 3
  const [currentSubscriptionPage, setCurrentSubscriptionPage] = useState(0)
  const subscriptionsPerPage = 3
  const [currentAttendancePage, setCurrentAttendancePage] = useState(0)
  const attendancePerPage = 5
  const [lessonsExpanded, setLessonsExpanded] = useState(false)
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<number | 'all'>('all')

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

        if (userData.user.role === 'student') {
          try {
            const studentData = await API.students.me()
            setStudent(studentData)
          } catch (err) {
            }

          try {
            const groupsData = await API.students.getMyGroups()
            setGroups(groupsData.groups || [])
          } catch (err) {
            }

          try {
            const attendanceInfo = await API.students.getMyAttendance()
            setLessonAttendance(attendanceInfo.lessons || [])
            setAttendanceData(attendanceInfo.attendance || [])
          } catch (err) {
            }
        }

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
          <p className="text-muted-foreground">Загрузка профиля...</p>
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
    status: user?.role === 'student' ? 'Ученик' : user?.role === 'teacher' ? 'Преподаватель' : user?.role === 'admin' ? 'Администратор' : 'Пользователь',
    email: user?.email || "Не указано",
    phone: student?.phone_number || "Не указано",
    registrationDate: user?.created_at ? new Date(user.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : "Не указано",
    groupCount: groups.length
  }

  const myGroups = groups.map(group => {
    let schedule = group.schedule || "Не указано";
    let dayOfWeek = "Не указано";
    let time = "Не указано";

    if (group.schedule && group.schedule !== "Не назначено") {
      try {

        const scheduleEntries = group.schedule.split(", ");
        const dayNames: string[] = [];
        const times: string[] = [];

        scheduleEntries.forEach((entry: string) => {
          const parts = entry.trim().split(" ");
          if (parts.length >= 2) {
            dayNames.push(parts[0]);
            times.push(parts[1]);
          }
        });

        if (dayNames.length > 0) {
          dayOfWeek = dayNames.join(", ");
          time = times.length > 0 ? times.join(", ") : "Не указано";
        }
      } catch (e) {
        console.error('Error parsing schedule:', e);
      }
    }

    return {
      id: group.id,
      title: group.name || "Без названия",
      category: group.category_name || "Без направления",
      badge: group.isActive
        ? (group.is_trial ? "Пробный" : "Обычный")
        : "Группа закрыта",
      instructor: group.teacher_name || "Не назначен",
      participants: [],
      location: schedule,
      day: dayOfWeek,
      time: time,
      hall: group.hall_name || "Не указан"
    };
  })

  const totalGroupPages = Math.ceil(myGroups.length / groupsPerPage)
  const currentGroups = myGroups.slice(
    currentGroupPage * groupsPerPage,
    (currentGroupPage + 1) * groupsPerPage
  )

  const goToNextGroupPage = () => {
    if (currentGroupPage < totalGroupPages - 1) {
      setCurrentGroupPage(prev => prev + 1)
    }
  }

  const goToPrevGroupPage = () => {
    if (currentGroupPage > 0) {
      setCurrentGroupPage(prev => prev - 1)
    }
  }

  const subscriptions = groups.slice(0, 3).map(group => {

    const groupLessons = lessonAttendance.filter(lesson => lesson.group_id === group.id)

    const remainingLessons = groupLessons.filter(lesson => lesson.status === null).length

    const attendedLessons = groupLessons.filter(lesson => lesson.status !== null).length

    const totalLessons = groupLessons.length

    return {
      id: group.id,
      title: group.name || "Без названия",
      category: group.category_name || "Без направления",
      badge: group.is_trial ? "Пробный" : (group.isActive ? "Обычный" : "Группа закрыта"),
      used: attendedLessons,
      total: totalLessons,
      remaining: remainingLessons,
      startDate: group.start_date ? new Date(group.start_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : "Не указано",
      endDate: group.end_date ? new Date(group.end_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : "Не указано"
    }
  })

  const totalSubscriptionPages = Math.ceil(subscriptions.length / subscriptionsPerPage)
  const currentSubscriptions = subscriptions.slice(
    currentSubscriptionPage * subscriptionsPerPage,
    (currentSubscriptionPage + 1) * subscriptionsPerPage
  )

  const goToNextSubscriptionPage = () => {
    if (currentSubscriptionPage < totalSubscriptionPages - 1) {
      setCurrentSubscriptionPage(prev => prev + 1)
    }
  }

  const goToPrevSubscriptionPage = () => {
    if (currentSubscriptionPage > 0) {
      setCurrentSubscriptionPage(prev => prev - 1)
    }
  }

  const filteredLessons = (selectedGroupFilter === 'all'
    ? lessonAttendance
    : lessonAttendance.filter(lesson => lesson.group_id === selectedGroupFilter)
  ).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  const totalAttendancePages = Math.ceil(filteredLessons.length / attendancePerPage)
  const currentAttendanceLessons = filteredLessons.slice(
    currentAttendancePage * attendancePerPage,
    (currentAttendancePage + 1) * attendancePerPage
  )

  const availableGroups = Array.from(
    new Map(lessonAttendance.map(lesson => [lesson.group_id, { id: lesson.group_id, name: lesson.group_name }])).values()
  )

  const goToNextAttendancePage = () => {
    if (currentAttendancePage < totalAttendancePages - 1) {
      setCurrentAttendancePage(prev => prev + 1)
    }
  }

  const goToPrevAttendancePage = () => {
    if (currentAttendancePage > 0) {
      setCurrentAttendancePage(prev => prev - 1)
    }
  }

  const handleGroupFilterChange = (value: string) => {
    setSelectedGroupFilter(value === 'all' ? 'all' : parseInt(value))
    setCurrentAttendancePage(0)
  }

  const attendance = attendanceData.map(data => ({
    id: data.id,
    title: data.title || "Без названия",
    category: data.category || "Без направления",
    attended: data.attended,
    present: data.present,
    excused: data.excused,
    missed: data.missed,
    late: data.late,
    total: data.total,
    percentage: data.percentage,
    points: data.points,
    maxPoints: data.maxPoints
  }))

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
              {user?.role === 'teacher' ? (
                <>
                  <Button
                    variant="ghost"
                    className="text-foreground/70 hover:text-foreground text-sm"
                    onClick={() => router.push("/teacher-groups")}
                  >
                    Мои группы
                  </Button>
                  <Button className="bg-[#FF6B35] hover:bg-[#FF6B35]/90 text-white text-sm rounded-lg px-6">
                    Профиль
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    className="text-foreground/70 hover:text-foreground text-sm"
                    onClick={() => router.push("/schedule")}
                  >
                    Расписание групп
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-foreground/70 hover:text-foreground text-sm"
                    onClick={() => router.push("/my-groups")}
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
                  <Button className="bg-[#FF6B35] hover:bg-[#FF6B35]/90 text-white text-sm rounded-lg px-6">
                    Профиль
                  </Button>
                </>
              )}
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
          <h1 className="text-3xl font-bold text-foreground mb-1">Мой профиль</h1>
          <p className="text-sm text-primary">Личная информация и статистика</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 lg:col-span-1 border-0 shadow-sm bg-card/80">
            <h2 className="text-base font-semibold mb-6 text-foreground">Личные данные</h2>

            <div className="flex flex-col items-center mb-6">
              <Avatar className="h-28 w-28 mb-4">
                <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-3xl font-bold">
                  {profile.initials}
                </AvatarFallback>
              </Avatar>
              <h3 className="text-lg font-semibold mb-2 text-foreground">{profile.name}</h3>
              <Badge className="bg-primary/10 text-primary border-0 font-medium">{profile.status}</Badge>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Envelope size={18} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground mb-0.5">Email</div>
                  <div className="text-sm text-foreground break-all">{profile.email}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Phone size={18} className="text-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground mb-0.5">Телефон</div>
                  <div className="text-sm text-foreground">{profile.phone}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Calendar size={18} className="text-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground mb-0.5">Дата регистрации</div>
                  <div className="text-sm text-foreground">{profile.registrationDate}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <TrendUp size={18} className="text-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground mb-0.5">Групп</div>
                  <div className="text-sm text-foreground">{profile.groupCount}</div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6 lg:col-span-2 border-0 shadow-sm bg-card/80">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold text-foreground">Мои группы и преподаватели</h2>
              {myGroups.length > groupsPerPage && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={goToPrevGroupPage}
                    disabled={currentGroupPage === 0}
                    className="p-1.5 rounded-lg border border-border/50 hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <CaretLeft size={16} className="text-muted-foreground" />
                  </button>
                  <span className="text-xs text-muted-foreground px-2">
                    {currentGroupPage + 1} / {totalGroupPages}
                  </span>
                  <button
                    onClick={goToNextGroupPage}
                    disabled={currentGroupPage === totalGroupPages - 1}
                    className="p-1.5 rounded-lg border border-border/50 hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <CaretRight size={16} className="text-muted-foreground" />
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {myGroups.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Нет доступных групп</p>
              ) : (
                currentGroups.map((group) => (
                <div key={group.id} className="bg-primary/5 rounded-xl p-5 border border-primary/10 hover:border-primary/20 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-base mb-1 text-foreground">{group.title}</h3>
                      <p className="text-sm text-primary">{group.category}</p>
                    </div>
                    <Badge className="bg-primary text-white border-0 text-xs font-medium px-3">{group.badge}</Badge>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <User size={16} className="text-primary" weight="duotone" />
                      <span className="text-muted-foreground text-xs">Преподаватель:</span>
                      <div className="font-medium text-foreground">{group.instructor}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <MapPin size={16} className="text-primary" weight="duotone" />
                      <span className="text-muted-foreground text-xs">Зал:</span>
                      <div className="font-medium text-foreground">{group.hall}</div>
                    </div>
                  </div>

                  {group.participants.length > 1 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="text-xs text-muted-foreground mb-2">Участники:</div>
                      <div className="flex flex-wrap gap-2">
                        {group.participants.map((participant, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {participant}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <Card className="p-6 mb-8 border-0 shadow-sm bg-card/80">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Calendar size={20} className="text-primary" weight="duotone" />
              </div>
              <h2 className="text-base font-semibold text-foreground">Мои группы</h2>
            </div>
            {subscriptions.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={goToPrevSubscriptionPage}
                  disabled={currentSubscriptionPage === 0}
                  className="p-1.5 rounded-lg border border-border/50 hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <CaretLeft size={16} className="text-muted-foreground" />
                </button>
                <span className="text-xs text-muted-foreground px-2">
                  {currentSubscriptionPage + 1} / {Math.max(1, totalSubscriptionPages)}
                </span>
                <button
                  onClick={goToNextSubscriptionPage}
                  disabled={currentSubscriptionPage >= totalSubscriptionPages - 1}
                  className="p-1.5 rounded-lg border border-border/50 hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <CaretRight size={16} className="text-muted-foreground" />
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {subscriptions.length === 0 ? (
              <div className="col-span-3 text-center text-muted-foreground py-8">Нет активных групп</div>
            ) : (
              currentSubscriptions.map((sub) => (
              <div key={sub.id} className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold mb-1 text-foreground">{sub.title}</h3>
                    <p className="text-sm text-muted-foreground">{sub.category}</p>
                  </div>
                  <Badge className="bg-success/20 text-success border-0 text-xs font-medium">{sub.badge}</Badge>
                </div>

                <div>
                  <div className="flex justify-between items-center text-sm mb-2">
                    <span className="text-muted-foreground">Использовано</span>
                    <span className="font-semibold text-foreground">{sub.used} из {sub.total}</span>
                  </div>
                  <Progress value={(sub.used / sub.total) * 100} className="h-2 bg-primary/10" />
                </div>

                <div className="bg-gradient-to-br from-purple-600 to-purple-500 text-white rounded-xl p-5 text-center shadow-lg">
                  <div className="text-xs mb-1 opacity-90">Осталось занятий</div>
                  <div className="text-4xl font-bold">{sub.remaining}</div>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Начало: {sub.startDate}</div>
                  <div>Окончание: {sub.endDate}</div>
                </div>
              </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-6 border-0 shadow-sm bg-card/80">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 rounded-lg bg-primary/10">
              <CheckCircle size={20} className="text-primary" weight="duotone" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Моя посещаемость</h2>
          </div>

          <div className="space-y-8">
            {}
            {attendance.length > 0 && (
              <div className="space-y-8">
                {attendance.map((item) => (
                  <div key={item.id}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold mb-1 text-foreground">{item.title}</h3>
                        <p className="text-sm text-muted-foreground">{item.category}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground mb-1">Посещаемость</div>
                        <div className="text-2xl font-bold text-primary">{item.percentage}%</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle size={18} weight="fill" className="text-green-600" />
                          <span className="text-xs font-medium text-green-700">Присутствовал (P)</span>
                        </div>
                        <div className="text-3xl font-bold text-green-700">{item.present || 0}</div>
                        <div className="text-xs text-green-600 mt-1">2/2 балла</div>
                      </div>

                      <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                        <div className="flex items-center gap-2 mb-2">
                          <Warning size={18} weight="fill" className="text-yellow-600" />
                          <span className="text-xs font-medium text-yellow-700">Опоздал (L)</span>
                        </div>
                        <div className="text-3xl font-bold text-yellow-700">{item.late || 0}</div>
                        <div className="text-xs text-yellow-600 mt-1">1/2 балла</div>
                      </div>

                      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                        <div className="flex items-center gap-2 mb-2">
                          <CalendarBlank size={18} weight="fill" className="text-blue-600" />
                          <span className="text-xs font-medium text-blue-700">Уваж. причина (E)</span>
                        </div>
                        <div className="text-3xl font-bold text-blue-700">{item.excused || 0}</div>
                        <div className="text-xs text-blue-600 mt-1">2/2 балла</div>
                      </div>

                      <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                        <div className="flex items-center gap-2 mb-2">
                          <XCircle size={18} weight="fill" className="text-red-600" />
                          <span className="text-xs font-medium text-red-700">Отсутствовал (A)</span>
                        </div>
                        <div className="text-3xl font-bold text-red-700">{item.missed || 0}</div>
                        <div className="text-xs text-red-600 mt-1">0/2 балла</div>
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="flex justify-between items-center text-sm mb-2">
                        <span className="text-muted-foreground">Прогресс посещаемости</span>
                        <span className="font-semibold text-foreground">{item.attended} / {item.total} занятий</span>
                      </div>
                      <Progress value={item.total > 0 ? (item.attended / item.total) * 100 : 0} className="h-2.5 bg-primary/10" />
                      {item.maxPoints > 0 && (
                        <div className="text-xs text-muted-foreground mt-2">
                          <span>Баллов: {item.points}/{item.maxPoints}</span>
                          <span className="ml-3">За все занятия: {Math.round(item.points / item.maxPoints * 100)}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {}
            {lessonAttendance.length > 0 && (
              <div className="border-t border-border pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLessonsExpanded(!lessonsExpanded)}
                      className="p-1 h-8 w-8"
                    >
                      <CaretDown
                        size={16}
                        className={`transition-transform duration-200 ${lessonsExpanded ? 'rotate-0' : '-rotate-90'}`}
                      />
                    </Button>
                    <h3 className="text-lg font-semibold text-foreground">Занятия</h3>
                    {lessonsExpanded && availableGroups.length > 1 && (
                      <Select
                        value={selectedGroupFilter.toString()}
                        onValueChange={handleGroupFilterChange}
                      >
                        <SelectTrigger className="w-48 h-8 text-sm">
                          <SelectValue placeholder="Выберите группу" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Все группы</SelectItem>
                          {availableGroups.map((group) => (
                            <SelectItem key={group.id} value={group.id.toString()}>
                              {group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  {lessonsExpanded && filteredLessons.length > attendancePerPage && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goToPrevAttendancePage}
                        disabled={currentAttendancePage === 0}
                        className="h-8 w-8 p-0"
                      >
                        <CaretLeft size={14} />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {currentAttendancePage + 1} из {totalAttendancePages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goToNextAttendancePage}
                        disabled={currentAttendancePage === totalAttendancePages - 1}
                        className="h-8 w-8 p-0"
                      >
                        <CaretRight size={14} />
                      </Button>
                    </div>
                  )}
                </div>

                {lessonsExpanded && (
                  <div className="space-y-4">
                    {currentAttendanceLessons.map((lesson) => {
                      const startDate = new Date(lesson.start_time)
                    const endDate = new Date(lesson.end_time)

                    const getStatusColor = (status: string | null, isCancelled: boolean = false) => {
                      if (isCancelled) return 'bg-red-50 border-red-200 text-red-700'
                      switch (status) {
                        case 'P': return 'bg-green-50 border-green-200 text-green-700'
                        case 'E': return 'bg-blue-50 border-blue-200 text-blue-700'
                        case 'L': return 'bg-yellow-50 border-yellow-200 text-yellow-700'
                        case 'A': return 'bg-red-50 border-red-200 text-red-700'
                        default: return 'bg-gray-50 border-gray-200 text-gray-700'
                      }
                    }

                    const getStatusIcon = (status: string | null, isCancelled: boolean = false) => {
                      if (isCancelled) return <XCircle size={16} weight="fill" className="text-red-600" />
                      switch (status) {
                        case 'P': return <CheckCircle size={16} weight="fill" className="text-green-600" />
                        case 'E': return <CalendarBlank size={16} weight="fill" className="text-blue-600" />
                        case 'L': return <Warning size={16} weight="fill" className="text-yellow-600" />
                        case 'A': return <XCircle size={16} weight="fill" className="text-red-600" />
                        default: return <Clock size={16} className="text-gray-600" />
                      }
                    }

                    return (
                      <div key={lesson.lesson_id} className="border border-border rounded-lg p-4 hover:bg-accent/5 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-foreground mb-1">{lesson.class_name}</h3>
                            <p className="text-sm text-muted-foreground mb-2">{lesson.group_name} • {lesson.category_name}</p>

                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar size={14} />
                                <span>{startDate.toLocaleDateString('ru-RU', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric'
                                })}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock size={14} />
                                <span>
                                  {startDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                  {' - '}
                                  {endDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {lesson.hall_name && (
                                <div className="flex items-center gap-1">
                                  <MapPin size={14} />
                                  <span>{lesson.hall_name}</span>
                                </div>
                              )}
                              {lesson.teacher_name && (
                                <div className="flex items-center gap-1">
                                  <User size={14} />
                                  <span>{lesson.teacher_name}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <div className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 ${getStatusColor(lesson.status, lesson.is_cancelled)}`}>
                              {getStatusIcon(lesson.status, lesson.is_cancelled)}
                              <span className="text-sm font-medium">
                                {lesson.is_cancelled ? 'Отменено' : lesson.status_display}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {lesson.points}/2 балла
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  </div>
                )}
              </div>
            )}

            {lessonAttendance.length === 0 && attendance.length === 0 && (
              <div className="text-center text-muted-foreground py-8">Нет данных о посещаемости</div>
            )}
          </div>
        </Card>
      </main>
    </div>
  )
}
