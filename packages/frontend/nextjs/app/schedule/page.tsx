"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { User, MapPin, Clock, CalendarBlank, Tag } from "@phosphor-icons/react"
import { StudentHeader } from "@/components/student-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  trial_price?: number | null
  trial_currency?: string | null
  schedule?: string
  upcoming_lessons?: string[]
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
  startTime: string | null
  upcomingLessons?: string[]
  trialPrice?: number | null
  trialCurrency?: string | null
  durationMinutes: number
  freeSlots: number | null
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

  const [selectedGroup, setSelectedGroup] = useState<ScheduleGroup | null>(null)
  const [enrolling, setEnrolling] = useState(false)
  const [selectedTrialLessonTime, setSelectedTrialLessonTime] = useState<string | null>(null)

  const [selectedTeacher, setSelectedTeacher] = useState<string>("all")
  const [selectedHall, setSelectedHall] = useState<string>("all")
  const [selectedType, setSelectedType] = useState<string>("all")

  const handleLogout = () => {
    logout()
    toast.success("Вы успешно вышли из системы")
    router.push("/login")
  }

  const handleEnroll = async (
    groupId: number,
    groupName: string,
    isTrial: boolean,
    trialLessonTime?: string | null
  ) => {
    try {
      if (isTrial) {
        await API.groups.trial(groupId, trialLessonTime ?? null)
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

  const formatStartTime = (value: string | null): string | null => {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Asia/Almaty",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d)
  }

  const formatLessonPretty = (value: string | null): string | null => {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null

    const weekdayRaw = new Intl.DateTimeFormat("ru-RU", {
      weekday: "short",
      timeZone: "Asia/Almaty",
    }).format(d)
    const weekday = weekdayRaw.replace(/\.$/, "")
    const weekdayCapitalized = weekday.length > 0 ? weekday[0].toUpperCase() + weekday.slice(1) : weekday

    const dateRaw = new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Almaty",
    }).format(d)
    const date = dateRaw.replace(/\s?г\.?$/, "")

    const time = new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Almaty",
    }).format(d)

    return `${weekdayCapitalized} · ${date} · ${time}`
  }

  const openGroupDetails = (group: ScheduleGroup) => {
    setSelectedGroup(group)
    if (group.isTrial) {
      const times = group.upcomingLessons ?? []
      setSelectedTrialLessonTime(times.length > 0 ? times[0] : null)
    } else {
      setSelectedTrialLessonTime(null)
    }
  }

  const confirmEnroll = async () => {
    if (!selectedGroup) return
    setEnrolling(true)
    try {
      await handleEnroll(
        selectedGroup.id,
        selectedGroup.name,
        selectedGroup.isTrial,
        selectedGroup.isTrial ? selectedTrialLessonTime : null
      )
      setSelectedGroup(null)
    } finally {
      setEnrolling(false)
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

        const groupsData = await API.groups.getAvailable()

        const teachersSet = new Set<string>()
        const hallsSet = new Set<string>()

        for (const group of groupsData as GroupData[]) {
          for (const name of group.teacher_names || []) {
            if (name) teachersSet.add(name)
          }
          if (group.hall?.name) hallsSet.add(group.hall.name)
        }

        setFilters({
          teachers: Array.from(teachersSet).sort().map((name, idx) => ({ id: idx + 1, name })),
          halls: Array.from(hallsSet).sort().map((name, idx) => ({ id: idx + 1, name })),
        })

        const transformed = (groupsData as GroupData[]).map((group: GroupData, index: number) => {

          const badgeType = group.is_trial
            ? { name: "Пробный", color: "bg-purple-100 text-purple-700", border: "border-purple-300", bg: "bg-purple-50/30", type: "trial" }
            : { name: "Регулярный", color: "bg-gray-100 text-gray-700", border: "border-gray-300", bg: "bg-white", type: "regular" }

          const isHighlighted = group.is_trial

          const schedule = (group as any).schedule || "Не указано";
          const upcomingLessons = Array.isArray((group as any).upcoming_lessons)
            ? ((group as any).upcoming_lessons as string[]).filter((v) => typeof v === 'string' && v.trim().length > 0)
            : []

          const startTime = group.start_time ?? (upcomingLessons.length > 0 ? upcomingLessons[0] : null)

          return {
            id: group.id,
            name: group.name || "Без названия",
            teacher_name: group.teacher_names?.length > 0 ? group.teacher_names.join(", ") : "Не назначен",
            schedule: schedule,
            hall: group.hall ? group.hall.name : "Не назначен",
            badge: badgeType.name,
            badgeColor: badgeType.color,
            borderColor: isHighlighted ? "border-purple-300 border-2" : "border-border",
            bgColor: badgeType.bg,
            isAvailable: (group.free_slots === null || group.free_slots > 0),
            isTrial: group.is_trial,
            trialPrice: typeof group.trial_price === 'number' ? group.trial_price : null,
            trialCurrency: typeof group.trial_currency === 'string' ? group.trial_currency : null,
            isRescheduled: false,
            startTime,
            upcomingLessons,
            durationMinutes: group.duration_minutes,
            freeSlots: group.free_slots,
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
  }, [selectedTeacher, selectedHall, selectedType, groups])

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
          <p className="text-sm text-muted-foreground">Убедитесь, что вы авторизованы.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <StudentHeader user={user} onLogout={handleLogout} activePath="/schedule" />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div data-tour="schedule-filters" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground mb-2 block">Преподаватели</label>
              <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
                <SelectTrigger className="bg-white border-gray-200 h-11 w-full">
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

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground mb-2 block">Залы</label>
              <Select value={selectedHall} onValueChange={setSelectedHall}>
                <SelectTrigger className="bg-white border-gray-200 h-11 w-full">
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

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground mb-2 block">Тип</label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="bg-white border-gray-200 h-11 w-full">
                  <SelectValue placeholder="Выбрать" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="all">Выбрать</SelectItem>
                  <SelectItem value="Регулярный">Регулярный</SelectItem>
                  <SelectItem value="Пробный">Пробный</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mt-4">Найдено {filteredGroups.length} групп</p>
        </div>

        <div data-tour="schedule-cards" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGroups.map((group) => (
            <Card
              key={group.id}
              onClick={() => openGroupDetails(group)}
              className={`p-6 border ${group.borderColor} hover:shadow-lg transition-all ${group.bgColor} relative overflow-hidden cursor-pointer`}
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

                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <Clock size={14} className="text-primary" weight="duotone" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-foreground">Длительность: {group.durationMinutes} мин</div>
                  </div>
                </div>
              </div>

              <div className="mt-2">
                <Button
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation()
                    openGroupDetails(group)
                  }}
                  className="w-full"
                >
                  Просмотреть расписание
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {filteredGroups.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Нет групп, соответствующих выбранным фильтрам</p>
          </div>
        )}
      </main>

      <Dialog open={selectedGroup !== null} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedGroup?.name}</DialogTitle>
            <DialogDescription>
              {selectedGroup?.isTrial ? 'Пробный урок' : 'Запись в группу'}
            </DialogDescription>
          </DialogHeader>
          {selectedGroup && (
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <User size={16} className="text-primary" weight="duotone" />
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">Преподаватель</div>
                  <div className="font-medium text-foreground">{selectedGroup.teacher_name}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin size={16} className="text-primary" weight="duotone" />
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">Зал</div>
                  <div className="font-medium text-foreground">{selectedGroup.hall}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CalendarBlank size={16} className="text-primary" weight="duotone" />
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">Расписание</div>
                  <div className="font-medium text-foreground">
                    {selectedGroup.isTrial && (selectedGroup.upcomingLessons?.length ?? 0) > 0 ? (
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground font-normal">Выберите одно время</div>
                        <div className="space-y-2">
                          {(selectedGroup.upcomingLessons ?? []).map((t) => {
                            const label = formatLessonPretty(t) ?? formatStartTime(t) ?? t
                            const checked = selectedTrialLessonTime === t
                            return (
                              <div
                                key={t}
                                role="button"
                                tabIndex={0}
                                className="w-full flex items-start gap-2 rounded-md border p-2 text-left hover:bg-muted/50 cursor-pointer"
                                onClick={() => setSelectedTrialLessonTime(checked ? null : t)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault()
                                    setSelectedTrialLessonTime(checked ? null : t)
                                  }
                                }}
                              >
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(v) => setSelectedTrialLessonTime(v ? t : null)}
                                    aria-label={label}
                                  />
                                </div>
                                <div className="text-sm leading-tight">{label}</div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : (selectedGroup.upcomingLessons?.length ?? 0) > 0 ? (
                      <div className="space-y-1">
                        {(selectedGroup.upcomingLessons ?? []).map((t) => (
                          <div key={t}>{formatLessonPretty(t) ?? formatStartTime(t) ?? t}</div>
                        ))}
                      </div>
                    ) : (
                      formatLessonPretty(selectedGroup.startTime) ??
                      formatStartTime(selectedGroup.startTime) ??
                      selectedGroup.schedule ??
                      "Не указано"
                    )}
                  </div>
                </div>
              </div>

              {selectedGroup.isTrial && (
                <div className="flex items-start gap-3">
                  <Tag size={16} className="text-primary" weight="duotone" />
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground">Цена пробного урока</div>
                    <div className="font-medium text-foreground">
                      {typeof selectedGroup.trialPrice === 'number'
                        ? `${selectedGroup.trialPrice}${selectedGroup.trialCurrency ? ` ${selectedGroup.trialCurrency}` : ''}`
                        : 'Не указана'}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <Clock size={16} className="text-primary" weight="duotone" />
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">Длительность</div>
                  <div className="font-medium text-foreground">{selectedGroup.durationMinutes} минут</div>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  className="w-full bg-gradient-to-br from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white font-medium"
                  onClick={confirmEnroll}
                  disabled={
                    !selectedGroup.isAvailable ||
                    enrolling ||
                    (selectedGroup.isTrial && (selectedGroup.upcomingLessons?.length ?? 0) > 0 && !selectedTrialLessonTime)
                  }
                >
                  {selectedGroup.isTrial ? 'Записаться на пробный урок' : 'Записаться'}
                </Button>
                {!selectedGroup.isAvailable && (
                  <p className="text-xs text-muted-foreground mt-2">Нет свободных мест</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
