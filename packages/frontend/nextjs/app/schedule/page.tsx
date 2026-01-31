"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { SignOut, User, MapPin, Clock } from "@phosphor-icons/react"
import { NotificationBell } from "@/components/notification-bell"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { API, AUTH_REQUIRED_MESSAGE, handleApiError, logout } from "@/lib/api"
import { DEFAULT_SESSION_EXPIRED_MESSAGE, buildLoginUrl } from "@/lib/auth"

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
  is_trial: boolean
  hall: {
    id: number
    name: string
    capacity: number
  } | null
  enrolled: number
  teacher_ids: number[]
  teacher_names: string[]
  free_slots: number | null
}

interface FilterData {
  teachers: { id: number; name: string }[]
  halls: { id: number; name: string }[]
}

interface ScheduleGroup {
  id: number
  name: string
  teacher_name: string
  schedule: string
  hall: string
  badge: string
  badgeColor: string
  borderColor: string
  bgColor: string
  isAvailable: boolean
  isTrial: boolean
  isRescheduled: boolean
}

export default function SchedulePage() {
  const router = useRouter()
  const pathname = usePathname()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<UserData | null>(null)
  const [groups, setGroups] = useState<ScheduleGroup[]>([])
  const [filteredGroups, setFilteredGroups] = useState<ScheduleGroup[]>([])
  const [filters, setFilters] = useState<FilterData>({ teachers: [], halls: [] })

  const [selectedTeacher, setSelectedTeacher] = useState<string>("all")
  const [selectedHall, setSelectedHall] = useState<string>("all")
  const [selectedTime, setSelectedTime] = useState<string>("all")
  const [selectedType, setSelectedType] = useState<string>("all")

  const handleLogout = () => {
    logout()
    toast.success("Вы успешно вышли из системы")
    router.push("/login")
  }

  const handleEnroll = async (groupId: number, groupName: string, isTrial: boolean) => {
    try {
      if (isTrial) {
        await API.groups.trial(groupId)
        toast.success(`Записаны на пробный урок: ${groupName}`)
      } else {
        await API.groups.join(groupId)
        toast.success(`Записаны в группу: ${groupName}`)
      }
    } catch (err) {
      const message = handleApiError(err)
      if (message === AUTH_REQUIRED_MESSAGE) {
        router.push(
          buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname })
        )
        return
      }
      toast.error(message)
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userData = await API.users.me()
        setUser(userData.user)

        if (userData.user.role === 'teacher') {
          router.push('/')
          return
        }

        try {
          const filtersData = await API.groups.getAvailable()
          setFilters({ teachers: [], halls: [] })
        } catch (err) {
          }

        const groupsData = await API.groups.getAvailable()

        const transformed = groupsData.map((group: GroupData, index: number) => {

          const badgeType = group.is_trial
            ? { name: "Пробный", color: "bg-purple-100 text-purple-700", border: "border-purple-300", bg: "bg-purple-50/30", type: "trial" }
            : { name: "Обычный", color: "bg-gray-100 text-gray-700", border: "border-gray-300", bg: "bg-white", type: "regular" }

          const isHighlighted = group.is_trial

          const schedule = (group as any).schedule || "Не назначено";

          return {
            id: group.id,
            name: group.name || "Без названия",
            teacher_name: group.teacher_names?.length > 0 ? group.teacher_names.join(", ") : "Преподаватель не назначен",
            schedule: schedule,
            hall: group.hall ? group.hall.name : "Не назначен",
            badge: badgeType.name,
            badgeColor: badgeType.color,
            borderColor: isHighlighted ? "border-purple-300 border-2" : "border-border",
            bgColor: badgeType.bg,
            isAvailable: (group.free_slots === null || group.free_slots > 0),
            isTrial: group.is_trial,
            isRescheduled: false,
          }
        })

        setGroups(transformed)
        setFilteredGroups(transformed)
        setLoading(false)
      } catch (err) {
        console.error("Ошибка загрузки данных:", err)
        const message = handleApiError(err)
        if (message === AUTH_REQUIRED_MESSAGE) {
          router.push(
            buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname })
          )
          return
        }
        setError(message)
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  useEffect(() => {
    let filtered = [...groups]

    if (selectedTeacher && selectedTeacher !== "all") {
      filtered = filtered.filter(g => g.teacher_name.includes(selectedTeacher))
    }

    if (selectedHall && selectedHall !== "all") {
      filtered = filtered.filter(g => g.hall.includes(selectedHall))
    }

    if (selectedType && selectedType !== "all") {
      filtered = filtered.filter(g => g.badge === selectedType)
    }

    setFilteredGroups(filtered)
  }, [selectedTeacher, selectedHall, selectedTime, selectedType, groups])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Загрузка расписания...</p>
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
                className="bg-[#FF6B35] hover:bg-[#FF6B35]/90 text-white text-sm rounded-lg px-6"
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Преподаватели</label>
              <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
                <SelectTrigger className="bg-white border-gray-200 h-11">
                  <SelectValue placeholder="Выбрать" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="all">Выбрать</SelectItem>
                  {filters.teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.name}>
                      {teacher.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Залы</label>
              <Select value={selectedHall} onValueChange={setSelectedHall}>
                <SelectTrigger className="bg-white border-gray-200 h-11">
                  <SelectValue placeholder="Выбрать" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="all">Выбрать</SelectItem>
                  {filters.halls.map((hall) => (
                    <SelectItem key={hall.id} value={hall.name}>
                      Зал {hall.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Время</label>
              <Select value={selectedTime} onValueChange={setSelectedTime}>
                <SelectTrigger className="bg-white border-gray-200 h-11">
                  <SelectValue placeholder="Выбрать" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="all">Выбрать</SelectItem>
                  <SelectItem value="morning">Утро (10:00-12:00)</SelectItem>
                  <SelectItem value="afternoon">День (12:00-18:00)</SelectItem>
                  <SelectItem value="evening">Вечер (18:00-22:00)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Тип</label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="bg-white border-gray-200 h-11">
                  <SelectValue placeholder="Выбрать" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="all">Выбрать</SelectItem>
                  <SelectItem value="Обычный">Обычный</SelectItem>
                  <SelectItem value="Пробный">Пробный</SelectItem>
                  <SelectItem value="Рекомендованный">Рекомендованный</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mt-4">Найдено {filteredGroups.length} групп</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGroups.map((group) => (
            <Card
              key={group.id}
              className={`p-6 border ${group.borderColor} hover:shadow-lg transition-all ${group.bgColor} relative overflow-hidden`}
            >
              <div className="absolute top-4 right-4">
                <div className={`w-3 h-3 rounded-full ${group.isAvailable ? 'bg-green-500' : 'bg-gray-300'}`} />
              </div>

              <div className="mb-4">
                <h3 className="text-lg font-semibold text-foreground mb-2 pr-6">{group.name}</h3>
                <Badge className={`${group.badgeColor} border-0 text-xs font-medium`}>
                  {group.badge}
                </Badge>
              </div>

              <div className="space-y-3 text-sm mb-6">
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <User size={14} className="text-primary" weight="duotone" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-foreground">Преподаватель: {group.teacher_name}</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <MapPin size={14} className="text-primary" weight="duotone" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-foreground">Зал: {group.hall}</div>
                  </div>
                </div>
              </div>

              {group.isTrial ? (
                <Button
                  onClick={() => handleEnroll(group.id, group.name, true)}
                  className="w-full bg-gradient-to-br from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white font-medium"
                  disabled={!group.isAvailable}
                >
                  Пробный урок
                </Button>
              ) : (
                <Button
                  onClick={() => handleEnroll(group.id, group.name, false)}
                  className="w-full bg-gradient-to-br from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white font-medium"
                  disabled={!group.isAvailable}
                >
                  Записаться
                </Button>
              )}
            </Card>
          ))}
        </div>

        {filteredGroups.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Нет групп, соответствующих выбранным фильтрам</p>
          </div>
        )}
      </main>
    </div>
  )
}
