"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { CaretLeft, CaretRight, CalendarBlank } from "@phosphor-icons/react"
import { TeacherHeader } from "@/components/teacher-header"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { buildLoginUrl, DEFAULT_SESSION_EXPIRED_MESSAGE } from "@/lib/auth"
import { API, AUTH_REQUIRED_MESSAGE, handleApiError, logout } from "@/lib/api"

type ScheduleEntry = {
  lessonId: number
  groupId: number
  groupName: string
  className: string
  dayIndex: number
  date: string
  startTime: string
  endTime: string
  duration: number
  hallId: number | null
  hallName: string
  isCancelled: boolean
  isRescheduled: boolean
  status?: string | null
}

type HallsOccupancy = {
  weekStart: string
  weekEnd: string
  hours: number[]
  halls: Array<{ id: number; name: string; occupied: boolean[][] }>
}

export default function TeacherCalendarPage() {
  const router = useRouter()
  const pathname = usePathname()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ name: string; email: string; role: string } | null>(null)

  const [mode, setMode] = useState<"lessons" | "halls">("lessons")

  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getWeekStart(new Date()))
  const [entries, setEntries] = useState<ScheduleEntry[]>([])

  const [occupancy, setOccupancy] = useState<HallsOccupancy | null>(null)
  const [selectedHallId, setSelectedHallId] = useState<string>("all")

  function getWeekStart(date: Date): Date {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(d.setDate(diff))
  }

  function getWeekDays(startDate: Date): Date[] {
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + i)
      days.push(date)
    }
    return days
  }

  const weekDays = useMemo(() => getWeekDays(currentWeekStart), [currentWeekStart])
  const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

  const timeSlots = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const hour = 8 + i
      return {
        hour,
        label: `${hour.toString().padStart(2, "0")}:00`,
      }
    })
  }, [])

  const weekStartStr = useMemo(() => {
    return currentWeekStart.toISOString().split("T")[0]
  }, [currentWeekStart])

  const handleLogout = () => {
    logout()
    toast.success("Вы успешно вышли из системы")
    router.push("/login")
  }

  const handlePreviousWeek = () => {
    const newDate = new Date(currentWeekStart)
    newDate.setDate(newDate.getDate() - 7)
    setCurrentWeekStart(newDate)
  }

  const handleNextWeek = () => {
    const newDate = new Date(currentWeekStart)
    newDate.setDate(newDate.getDate() + 7)
    setCurrentWeekStart(newDate)
  }

  useEffect(() => {
    const boot = async () => {
      try {
        const userData = await API.users.me()
        setUser(userData.user)

        if (userData.user.role !== "teacher") {
          toast.error("У вас нет доступа к этой странице")
          router.push("/")
          return
        }

        setLoading(false)
      } catch (e) {
        const message = handleApiError(e)
        if (message === AUTH_REQUIRED_MESSAGE) {
          router.push(buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname }))
          return
        }

        toast.error(message)
        setLoading(false)
      }
    }

    boot()
  }, [router, pathname])

  useEffect(() => {
    const fetchWeek = async () => {
      if (!user) return
      try {
        if (mode === "lessons") {
          const data = await API.teachers.getWeeklySchedule(weekStartStr)
          setEntries((data.entries || []) as ScheduleEntry[])
        } else {
          const data = (await API.teachers.getHallsOccupancyWeekly(weekStartStr)) as HallsOccupancy
          setOccupancy(data)
          if (data.halls.length > 0 && selectedHallId === "all") {
            setSelectedHallId(String(data.halls[0].id))
          }
        }
      } catch (e) {
        console.error(e)
        handleApiError(e)
      }
    }

    fetchWeek()
  }, [user, mode, weekStartStr])

  const selectedHall = useMemo(() => {
    if (!occupancy) return null
    const id = Number(selectedHallId)
    return occupancy.halls.find((h) => h.id === id) || null
  }, [occupancy, selectedHallId])

  const getLessonsForSlot = (dayIndex: number, slotHour: number) => {
    return entries.filter((e) => {
      if (e.dayIndex !== dayIndex) return false
      const [h] = e.startTime.split(":")
      return Number(h) === slotHour
    })
  }

  const getLessonTimeInfo = (entry: ScheduleEntry) => {
    return {
      startTime: entry.startTime,
      endTime: entry.endTime,
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <TeacherHeader user={user} onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto p-6">
  <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">Расписание</h1>
            <p className="text-gray-600">Календарь преподавателя</p>
          </div>

          <div className="flex flex-col gap-3 w-full sm:flex-row sm:flex-wrap sm:items-center lg:w-auto">
            <Select value={mode} onValueChange={(v) => setMode(v as any)}>
              <SelectTrigger className="w-full sm:w-[240px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lessons">Мои занятия</SelectItem>
                <SelectItem value="halls">Занятость залов</SelectItem>
              </SelectContent>
            </Select>

            {mode === "halls" && occupancy && (
              <Select value={selectedHallId} onValueChange={setSelectedHallId}>
                <SelectTrigger className="w-full sm:w-[240px] bg-white">
                  <SelectValue placeholder="Выберите зал" />
                </SelectTrigger>
                <SelectContent>
                  {occupancy.halls.map((h) => (
                    <SelectItem key={h.id} value={String(h.id)}>
                      Зал {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 mb-6">
          <Button variant="outline" size="icon" onClick={handlePreviousWeek}>
            <CaretLeft size={20} />
          </Button>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border">
            <CalendarBlank size={20} className="text-gray-600" />
            <span className="font-medium">
              {weekDays[0].toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} - {weekDays[6].toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
            </span>
          </div>
          <Button variant="outline" size="icon" onClick={handleNextWeek}>
            <CaretRight size={20} />
          </Button>
        </div>

        <div className="bg-white rounded-lg border overflow-x-auto">
          <div className="grid grid-cols-[80px_repeat(7,minmax(180px,1fr))] border-b bg-gray-50">
            <div className="p-4 text-center border-r">
              <div className="font-medium text-gray-500 text-sm">Время</div>
            </div>
            {dayNames.map((day, index) => (
              <div key={day} className="p-4 text-center border-r last:border-r-0">
                <div className="font-medium text-gray-900">{day}</div>
                <div className="text-sm text-gray-500">{weekDays[index].getDate()}</div>
              </div>
            ))}
          </div>

          {timeSlots.map((slot) => (
            <div key={slot.hour} className="grid grid-cols-[80px_repeat(7,minmax(180px,1fr))] border-b last:border-b-0" style={{ minHeight: "80px" }}>
              <div className="border-r flex items-start justify-center pt-2">
                <span className="text-xs text-gray-500 font-medium">{slot.label}</span>
              </div>

              {weekDays.map((_, dayIndex) => {
                if (mode === "halls") {
                  const hourIdx = slot.hour - 8
                  const isBusy = !!selectedHall?.occupied?.[dayIndex]?.[hourIdx]
                  return (
                    <div key={dayIndex} className="border-r last:border-r-0 p-2">
                      <div className={`h-full rounded-lg border flex items-center justify-center text-xs font-semibold ${isBusy ? "bg-red-50 border-red-200 text-red-700" : "bg-green-50 border-green-200 text-green-700"}`}>
                        {isBusy ? "ЗАНЯТ" : "СВОБОДЕН"}
                      </div>
                    </div>
                  )
                }

                const slotLessons = getLessonsForSlot(dayIndex, slot.hour)
                return (
                  <div key={dayIndex} className="border-r last:border-r-0 p-1 flex flex-col gap-1">
                    {slotLessons.map((lesson) => {
                      const timeInfo = getLessonTimeInfo(lesson)
                      const cancelled = lesson.isCancelled || lesson.status === "Отменён"
                      const rescheduled = lesson.isRescheduled || lesson.status === "Перенесён"

                      return (
                        <div key={lesson.lessonId} style={{ height: "85px" }}>
                          <div
                            className={`h-full p-2 rounded-lg border transition-all overflow-hidden ${
                              cancelled
                                ? "bg-red-500 border-red-600 text-white"
                                : rescheduled
                                  ? "bg-blue-500 border-blue-600 text-white"
                                  : "bg-purple-600 border-purple-700 text-white"
                            }`}
                          >
                            <div className="flex justify-between items-start h-full">
                              <div className="flex-1 overflow-hidden">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-semibold truncate">{lesson.groupName}</span>
                                  {cancelled ? (
                                    <span className="text-[8px] bg-white/20 text-white px-1 rounded flex-shrink-0">ОТМЕНЁН</span>
                                  ) : rescheduled ? (
                                    <span className="text-[8px] bg-white/20 text-white px-1 rounded flex-shrink-0">ПЕРЕНЕСЁН</span>
                                  ) : null}
                                </div>
                                <div className="text-[10px] font-bold">{timeInfo.startTime}-{timeInfo.endTime}</div>
                                <div className="text-[10px] opacity-90 truncate">{lesson.hallName}</div>
                                {lesson.className ? <div className="text-[10px] opacity-90 truncate">{lesson.className}</div> : null}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-white hover:bg-white/20"
                                onClick={() => router.push(`/teacher-groups/manage-group/${lesson.groupId}`)}
                              >
                                Открыть
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
