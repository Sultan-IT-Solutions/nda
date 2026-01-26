"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { API, handleApiError } from "@/lib/api"
import { AdminSidebar } from "@/components/admin-sidebar"
import { AdminHeader } from "@/components/admin-header"
import { useSidebar } from "@/hooks/use-sidebar"
import { CaretLeft, CaretRight, CalendarBlank, ChartBar, Clock, User, Users, UserSwitch, X, Copy, Trash, Calendar as CalendarIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Toaster, toast } from 'sonner'
import { formatTimeWithGMT5 } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format, parse } from "date-fns"
import { ru } from "date-fns/locale"

interface UserData {
  id: number
  name: string
  email: string
  role: string
}

interface ScheduleLesson {
  lesson_id?: number
  group_id: number
  group_name: string
  class_name?: string
  start_time: string | null
  duration_minutes: number
  is_additional: boolean
  hall: { id: number; name: string } | null
  teacher_name?: string
  is_cancelled?: boolean
  is_rescheduled?: boolean
  substitute_teacher_name?: string
  recurring_days?: string
  status?: string
}

export default function AnalyticsSchedulePage() {
  const router = useRouter()
  const { sidebarWidth } = useSidebar()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<UserData | null>(null)
  const [lessons, setLessons] = useState<ScheduleLesson[]>([])
  const [halls, setHalls] = useState<{ id: number; name: string }[]>([])
  const [teachers, setTeachers] = useState<{ id: number; name: string }[]>([])
  const [selectedHall, setSelectedHall] = useState<string>("all")
  const [selectedTeacher, setSelectedTeacher] = useState<string>("all")
  const [selectedGroup, setSelectedGroup] = useState<string>("all")
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getWeekStart(new Date()))
  const [substituteDialogOpen, setSubstituteDialogOpen] = useState(false)
  const [selectedLessonForAction, setSelectedLessonForAction] = useState<ScheduleLesson | null>(null)
  const [selectedSubstituteTeacher, setSelectedSubstituteTeacher] = useState<string>("")

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {})
  const [confirmTitle, setConfirmTitle] = useState("")
  const [confirmMessage, setConfirmMessage] = useState("")

  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false)
  const [newLessonDate, setNewLessonDate] = useState<string>("")
  const [newLessonTime, setNewLessonTime] = useState<string>("")

  const showConfirmDialog = (title: string, message: string, onConfirm: () => void) => {
    setConfirmTitle(title)
    setConfirmMessage(message)
    setConfirmAction(() => onConfirm)
    setConfirmDialogOpen(true)
  }

  const refetchScheduleData = async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 100));

      setLoading(true);

      const today = new Date();
      const dayOfWeek = today.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today);
      monday.setDate(today.getDate() + mondayOffset);
      const weekStart = monday.toISOString().split('T')[0];

      const scheduleData = await API.schedule.getWeekly(weekStart);

      const transformedLessons: ScheduleLesson[] = scheduleData.entries.map((entry: any) => ({
        lesson_id: entry.lessonId,
        group_id: entry.groupId,
        group_name: entry.groupName,
        class_name: entry.className,
        start_time: `${entry.date}T${entry.startTime}:00`,
        duration_minutes: entry.duration,
        is_additional: false,
        hall: entry.hallId ? { id: entry.hallId, name: entry.hallName } : null,
        teacher_name: entry.teacherName,
        is_cancelled: entry.isCancelled || false,
        is_rescheduled: entry.isRescheduled || false,
        substitute_teacher_name: entry.substituteTeacherName,
        recurring_days: entry.dayIndex.toString(),
        status: entry.status
      }));

      setLessons(transformedLessons);
      setLoading(false);
    } catch (error) {
      console.error('Error refetching schedule data:', error);
      setLoading(false);
    }
  }

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

  const handleLogout = () => {
    localStorage.removeItem("token")
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

  const handleSubstituteLesson = (lesson: ScheduleLesson) => {
    setSelectedLessonForAction(lesson)
    setSubstituteDialogOpen(true)
  }

  const handleSaveSubstitute = async () => {
    if (!selectedLessonForAction || !selectedSubstituteTeacher) {
      toast.error("Выберите преподавателя для замены")
      return
    }

    try {
      if (selectedLessonForAction.lesson_id) {
        await API.lessons.substitute(
          selectedLessonForAction.lesson_id,
          parseInt(selectedSubstituteTeacher)
        )

        await refetchScheduleData()

        toast.success("Замена успешно назначена")
      } else {
        toast.error("Невозможно назначить замену для регулярного занятия. Пожалуйста, создайте индивидуальное занятие.")
      }

      setSubstituteDialogOpen(false)
      setSelectedSubstituteTeacher("")
      setSelectedLessonForAction(null)

    } catch (error) {
      console.error("Error setting substitute:", error)
      handleApiError(error);

      if (error instanceof Error && error.message.includes('не найден')) {
        toast.error("Занятие не найдено")
      } else {
        toast.error("Произошла ошибка при назначении замены")
      }
    }
  }

    const handleCancelLesson = async (lesson: ScheduleLesson) => {
    const performCancel = async () => {
      try {
        if (lesson.lesson_id) {
          await API.lessons.cancel(lesson.lesson_id)
        } else {

          console.warn('Cannot cancel recurring lesson without lesson_id')
          toast.error("Невозможно отменить регулярное занятие без ID урока")
          return
        }

        await refetchScheduleData()

        toast.success("Урок успешно отменён")
      } catch (error) {
        console.error("Error canceling lesson:", error)
        handleApiError(error);
        toast.error("Произошла ошибка при отмене урока")
      }
    }

    showConfirmDialog(
      "Отменить занятие",
      `Вы уверены, что хотите отменить урок "${lesson.class_name ? `${lesson.class_name} - ${lesson.group_name}` : lesson.group_name}"?`,
      performCancel
    )
  }

  const handleRescheduleLesson = (lesson: ScheduleLesson) => {
    setSelectedLessonForAction(lesson)
    setNewLessonDate(new Date().toISOString().split('T')[0])
    setNewLessonTime(lesson.start_time ? new Date(lesson.start_time).toTimeString().slice(0, 5) : "09:00")
    setRescheduleDialogOpen(true)
  }

  const handleSaveReschedule = async () => {
    if (!selectedLessonForAction || !newLessonDate || !newLessonTime) {
      toast.error("Заполните дату и время")
      return
    }

    try {
      if (selectedLessonForAction.lesson_id) {
        await API.lessons.reschedule(
          selectedLessonForAction.lesson_id,
          newLessonDate,
          newLessonTime
        )

        toast.success("Занятие успешно перенесено на новую дату и время")

        setRescheduleDialogOpen(false)
        setNewLessonDate("")
        setNewLessonTime("")
        setSelectedLessonForAction(null)

        setTimeout(async () => {
          try {
            const weekStart = format(currentWeekStart, 'yyyy-MM-dd');
            const scheduleData = await API.schedule.getWeekly(weekStart);

            const transformedLessons: ScheduleLesson[] = scheduleData.entries.map((entry: any) => ({
              lesson_id: entry.lessonId,
              group_id: entry.groupId,
              group_name: entry.groupName,
              class_name: entry.className,
              start_time: `${entry.date}T${entry.startTime}:00`,
              duration_minutes: entry.duration,
              is_additional: false,
              hall: entry.hallId ? { id: entry.hallId, name: entry.hallName } : null,
              teacher_name: entry.teacherName,
              is_cancelled: entry.isCancelled || false,
              is_rescheduled: entry.isRescheduled || false,
              substitute_teacher_name: entry.substituteTeacherName,
              recurring_days: entry.dayIndex.toString(),
              status: entry.status
            }));
            setLessons(transformedLessons);
          } catch (err) {
          }
        }, 3000);
      } else {
        toast.error("Невозможно перенести регулярное занятие без ID урока")
      }

    } catch (error: any) {
      const errorMessage = error?.message || error?.detail || "";
      if (errorMessage.includes("пересекается")) {
        toast.error(errorMessage)
      } else {
        toast.error("Произошла ошибка при переносе урока")
      }
    }
  }


  const handleDeleteLesson = async (lesson: ScheduleLesson) => {
    const performDelete = async () => {
      try {
        if (lesson.lesson_id) {
          await API.lessons.delete(lesson.lesson_id);
          await refetchScheduleData()
          toast.success("Урок успешно удален");
        } else {

          if (lesson.group_id) {
            const confirmGroupDeletion = confirm(
              "Это регулярное занятие группы. Удаление удалит всю группу и все связанные с ней данные. Продолжить?"
            );

            if (confirmGroupDeletion) {
              await API.groups.delete(lesson.group_id, false);
              await refetchScheduleData()
              toast.success("Группа успешно удалена");
            } else {
              return;
            }
          } else {
            toast.error("Невозможно удалить это занятие - отсутствует идентификатор");
            return;
          }
        }
      } catch (error) {
        console.error("Error deleting:", error);
        handleApiError(error);

        if (error instanceof Error && error.message.includes('не найден')) {
          toast.error("Занятие не найдено");
        } else if (lesson.lesson_id) {
          toast.error("Ошибка при удалении урока");
        } else {
          toast.error("Ошибка при удалении группы");
        }
      }
    }

    const itemType = lesson.lesson_id ? "урок" : "группу";
    const itemName = lesson.class_name
      ? `${lesson.class_name} - ${lesson.group_name}`
      : lesson.group_name;

    const warningText = lesson.lesson_id
      ? `Вы уверены, что хотите УДАЛИТЬ ${itemType} "${itemName}"? Это действие нельзя отменить.`
      : `Внимание! Это удалит всю группу "${itemName}" и все связанные данные. Это действие нельзя отменить.`;

    showConfirmDialog(
      `Удалить ${itemType}`,
      warningText,
      performDelete
    );
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userData = await API.users.me();
        setUser(userData.user);

        if (userData.user.role !== 'admin') {
          router.push("/");
          return;
        }

        const today = new Date();
        const dayOfWeek = today.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(today);
        monday.setDate(today.getDate() + mondayOffset);
        const weekStart = monday.toISOString().split('T')[0];

        const scheduleData = await API.schedule.getWeekly(weekStart);

        const transformedLessons: ScheduleLesson[] = scheduleData.entries.map((entry: any) => ({
          lesson_id: entry.lessonId,
          group_id: entry.groupId,
          group_name: entry.groupName,
          class_name: entry.className,
          start_time: `${entry.date}T${entry.startTime}:00`,
          duration_minutes: entry.duration,
          is_additional: false,
          hall: entry.hallId ? { id: entry.hallId, name: entry.hallName } : null,
          teacher_name: entry.teacherName,
          is_cancelled: entry.isCancelled || false,
          is_rescheduled: entry.isRescheduled || false,
          substitute_teacher_name: entry.substituteTeacherName,
          recurring_days: entry.dayIndex.toString(),
          status: entry.status
        }));
        setLessons(transformedLessons);

        const hallsData = await API.halls.getAll();
        setHalls(hallsData.halls || []);

        const teachersData = await API.teachers.getAll();
        setTeachers(teachersData.teachers || []);

        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        handleApiError(error);
        setLoading(false);
      }
    }

    fetchData();
  }, [router]);

  useEffect(() => {
    const fetchScheduleForWeek = async () => {
      try {
        const weekStart = format(currentWeekStart, 'yyyy-MM-dd');
        const scheduleData = await API.schedule.getWeekly(weekStart);

        const transformedLessons: ScheduleLesson[] = scheduleData.entries.map((entry: any) => ({
          lesson_id: entry.lessonId,
          group_id: entry.groupId,
          group_name: entry.groupName,
          class_name: entry.className,
          start_time: `${entry.date}T${entry.startTime}:00`,
          duration_minutes: entry.duration,
          is_additional: false,
          hall: entry.hallId ? { id: entry.hallId, name: entry.hallName } : null,
          teacher_name: entry.teacherName,
          is_cancelled: entry.isCancelled || false,
          is_rescheduled: entry.isRescheduled || false,
          substitute_teacher_name: entry.substituteTeacherName,
          recurring_days: entry.dayIndex.toString(),
          status: entry.status
        }));
        setLessons(transformedLessons);
      } catch (error) {
        console.error("Error fetching schedule for week:", error);
      }
    };

    if (user) {
      fetchScheduleForWeek();
    }
  }, [currentWeekStart, user]);

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

  const profile = {
    name: user?.name || "Не указано",
    initials: user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : "НИ",
    email: user?.email || "Не указано",
  }

  const weekDays = getWeekDays(currentWeekStart)
  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  const filteredLessons = lessons.filter(lesson => {
    if (selectedHall !== "all" && lesson.hall?.name !== selectedHall) return false
    if (selectedTeacher !== "all" && lesson.teacher_name !== selectedTeacher) return false
    if (selectedGroup !== "all" && lesson.group_name !== selectedGroup) return false
    return true
  })

  const uniqueGroups = Array.from(new Set(lessons.map(l => l.group_name)))

  const getLessonsForDay = (dayIndex: number) => {
    return filteredLessons.filter(lesson => {
      if (!lesson.start_time) return false

      if (lesson.recurring_days !== undefined && lesson.recurring_days !== null) {
        return lesson.recurring_days === dayIndex.toString()
      }

      const lessonDate = new Date(lesson.start_time)
      const lessonDay = lessonDate.getDay()
      const adjustedDay = lessonDay === 0 ? 6 : lessonDay - 1
      return adjustedDay === dayIndex
    })
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

      <AdminSidebar />

      {}
      <div className={sidebarWidth + " transition-all duration-300"}>
        <AdminHeader userName={user?.name} userEmail={user?.email} />

        {}
        <main className="p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Расписание</h1>
          <p className="text-gray-600">Отображается в окошке календаря</p>
        </div>

        {}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <label className="text-sm font-medium mb-2 block">Зал</label>
            <Select value={selectedHall} onValueChange={setSelectedHall}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Все залы" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все залы</SelectItem>
                {halls.map(hall => (
                  <SelectItem key={hall.id} value={hall.name}>Зал {hall.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Учитель</label>
            <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Все учителя" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все учителя</SelectItem>
                {teachers.map(teacher => (
                  <SelectItem key={teacher.id} value={teacher.name}>{teacher.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Группа</label>
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Все группы" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все группы</SelectItem>
                {uniqueGroups.map(group => (
                  <SelectItem key={group} value={group}>{group}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {}
        <div className="flex items-center justify-center gap-4 mb-6">
          <Button variant="outline" size="icon" onClick={handlePreviousWeek}>
            <CaretLeft size={20} />
          </Button>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border">
            <CalendarBlank size={20} className="text-gray-600" />
            <span className="font-medium">
              {currentWeekStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} - {weekDays[6].toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
            </span>
          </div>
          <Button variant="outline" size="icon" onClick={handleNextWeek}>
            <CaretRight size={20} />
          </Button>
        </div>

        {}
        {(() => {
          const HOUR_HEIGHT = 80;
          const CARD_HEIGHT = 85;
          const CARD_GAP = 4;
          const timeSlots = Array.from({ length: 15 }, (_, i) => {
            const hour = 8 + i;
            return {
              hour,
              label: `${hour.toString().padStart(2, '0')}:00`,
              endLabel: `${(hour + 1).toString().padStart(2, '0')}:00`
            };
          });

          const getLessonsForSlot = (dayIndex: number, slotHour: number) => {
            return filteredLessons.filter(lesson => {
              if (!lesson.start_time) return false;

              let dayMatch = false;
              if (lesson.recurring_days !== undefined && lesson.recurring_days !== null) {
                dayMatch = lesson.recurring_days === dayIndex.toString();
              } else {
                const lessonDate = new Date(lesson.start_time);
                const lessonDay = lessonDate.getDay();
                const adjustedDay = lessonDay === 0 ? 6 : lessonDay - 1;
                dayMatch = adjustedDay === dayIndex;
              }
              if (!dayMatch) return false;

              const date = new Date(lesson.start_time);
              const hours = date.getHours();
              return hours === slotHour;
            });
          };

          const slotMaxLessons = timeSlots.map(slot => {
            let maxCount = 1;
            for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
              const count = getLessonsForSlot(dayIndex, slot.hour).length;
              if (count > maxCount) maxCount = count;
            }
            return maxCount;
          });

          const slotHeights = slotMaxLessons.map(count =>
            Math.max(HOUR_HEIGHT, count * (CARD_HEIGHT + CARD_GAP) + CARD_GAP)
          );

          const getLessonTimeInfo = (lesson: ScheduleLesson) => {
            if (!lesson.start_time) return null;
            const date = new Date(lesson.start_time);
            const hours = date.getHours();
            const minutes = date.getMinutes();
            const duration = lesson.duration_minutes || 60;
            const endDate = new Date(date.getTime() + duration * 60000);
            return {
              startTime: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
              endTime: `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`
            };
          };

          return (
            <div className="bg-white rounded-lg border overflow-x-auto">
              {}
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

              {}
              {timeSlots.map((slot, slotIndex) => (
                <div
                  key={slot.hour}
                  className="grid grid-cols-[80px_repeat(7,minmax(180px,1fr))] border-b last:border-b-0"
                  style={{ minHeight: `${slotHeights[slotIndex]}px` }}
                >
                  {}
                  <div className="border-r flex items-start justify-center pt-2">
                    <span className="text-xs text-gray-500 font-medium">
                      {slot.label}
                    </span>
                  </div>

                  {}
                  {weekDays.map((day, dayIndex) => {
                    const slotLessons = getLessonsForSlot(dayIndex, slot.hour);

                    return (
                      <div
                        key={dayIndex}
                        className="border-r last:border-r-0 p-1 flex flex-col gap-1"
                      >
                        {slotLessons.map((lesson, lessonIdx) => {
                          const timeInfo = getLessonTimeInfo(lesson);
                          if (!timeInfo) return null;
                          const lessonKey = `${lesson.lesson_id || lesson.group_id}-${slotIndex}-${lessonIdx}-${lesson.is_cancelled}-${lesson.status}`;

                          return (
                            <div
                              key={lessonKey}
                              style={{ height: `${CARD_HEIGHT}px` }}
                            >
                              <div
                                className={`h-full p-2 rounded-lg border transition-all overflow-hidden ${
                                  lesson.is_additional
                                    ? 'bg-gray-400 border-gray-500 text-white hover:bg-gray-500'
                                    : 'bg-purple-600 border-purple-700 text-white hover:bg-purple-700'
                                }`}
                              >
                                <div className="flex justify-between items-start h-full">
                                  <div className="flex-1 overflow-hidden">
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs font-semibold truncate">
                                        {lesson.group_name}
                                      </span>
                                      {(lesson.is_cancelled === true || lesson.status === "Отменён") ? (
                                        <span className="text-[8px] bg-red-500 text-white px-1 rounded flex-shrink-0">ОТМЕНЁН</span>
                                      ) : (lesson.is_rescheduled === true || lesson.status === "Перенесён") ? (
                                        <span className="text-[8px] bg-blue-400 text-white px-1 rounded flex-shrink-0">ПЕРЕНЕСЁН</span>
                                      ) : null}
                                    </div>
                                    <div className="text-[10px] font-bold">
                                      {timeInfo.startTime}-{timeInfo.endTime}
                                    </div>
                                    <div className="text-[10px] opacity-90 truncate">{lesson.hall?.name || "Зал не указан"}</div>
                                    <div className="text-[10px] opacity-90 truncate">
                                      {(() => {
                                        if (lesson.substitute_teacher_name || lesson.teacher_name?.includes("Замена:")) {
                                          const substituteTeacher = lesson.substitute_teacher_name || lesson.teacher_name?.replace("Замена: ", "");
                                          return <span className="text-yellow-200 font-bold text-[10px]">Замена: {substituteTeacher}</span>;
                                        }
                                        return lesson.teacher_name || "Преподаватель";
                                      })()}
                                    </div>
                                  </div>

                                  <DropdownMenu>
                                    <DropdownMenuTrigger
                                      asChild
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 w-5 p-0 text-white hover:bg-white/20 flex-shrink-0"
                                      >
                                        <span className="text-sm">⋮</span>
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-56" align="end">
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleSubstituteLesson(lesson)
                                        }}
                                        className="flex items-center gap-2"
                                      >
                                        <UserSwitch size={16} />
                                        Разово поставить замену
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleCancelLesson(lesson)
                                        }}
                                        className="flex items-center gap-2"
                                      >
                                        <X size={16} />
                                        Разово отменить занятие
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleRescheduleLesson(lesson)
                                        }}
                                        className="flex items-center gap-2"
                                      >
                                        <CalendarIcon size={16} />
                                        Разово перенести занятие
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleDeleteLesson(lesson)
                                        }}
                                        className="flex items-center gap-2 text-red-600 focus:text-red-600"
                                      >
                                        <Trash size={16} />
                                        Удалить занятие
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })()}

        {}
        {/* Lesson detail dialog removed - use 3-dots menu instead */}

        {}
        <Dialog open={substituteDialogOpen} onOpenChange={setSubstituteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Назначить замену</DialogTitle>
              <DialogDescription>
                Группа: {selectedLessonForAction?.group_name}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Преподаватель-заместитель</label>
                <Select value={selectedSubstituteTeacher} onValueChange={setSelectedSubstituteTeacher}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Выберите преподавателя" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers
                      .filter(teacher => teacher.name !== selectedLessonForAction?.teacher_name)
                      .map(teacher => (
                        <SelectItem key={teacher.id} value={teacher.id.toString()}>
                          {teacher.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSubstituteDialogOpen(false)}
                >
                  Отмена
                </Button>
                <Button
                  className="flex-1 bg-black hover:bg-gray-800 text-white"
                  onClick={handleSaveSubstitute}
                >
                  Назначить замену
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {}
        {}
        <Dialog open={rescheduleDialogOpen} onOpenChange={setRescheduleDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Перенести урок</DialogTitle>
              <DialogDescription>
                Группа: {selectedLessonForAction?.group_name}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Новая дата</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal bg-white"
                    >
                      <CalendarBlank className="mr-2 h-4 w-4" />
                      {newLessonDate ? format(parse(newLessonDate, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy', { locale: ru }) : "Выберите дату"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={newLessonDate ? parse(newLessonDate, 'yyyy-MM-dd', new Date()) : undefined}
                      onSelect={(date: Date | undefined) => {
                        if (date) {
                          setNewLessonDate(format(date, 'yyyy-MM-dd'))
                        }
                      }}
                      disabled={(date: Date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      locale={ru}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Новое время</label>
                <Input
                  type="time"
                  value={newLessonTime}
                  onChange={(e) => setNewLessonTime(e.target.value)}
                  className="bg-white"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setRescheduleDialogOpen(false)}
                >
                  Отмена
                </Button>
                <Button
                  className="flex-1 bg-black hover:bg-gray-800 text-white"
                  onClick={handleSaveReschedule}
                >
                  Перенести
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {}
        {}
        <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{confirmTitle}</DialogTitle>
              <DialogDescription>
                {confirmMessage}
              </DialogDescription>
            </DialogHeader>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmDialogOpen(false)}
              >
                Отмена
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={() => {
                  confirmAction()
                  setConfirmDialogOpen(false)
                }}
              >
                Подтвердить
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        </main>
      </div>
    </div>
  )
}
