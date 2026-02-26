"use client"

import { formatAverage00 } from "@/lib/grade-format"
import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { User } from "@phosphor-icons/react"
import { TeacherHeader } from "@/components/teacher-header"
import { StudentHeader } from "@/components/student-header"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Envelope, Phone, Calendar, TrendUp, MapPin, Clock, CheckCircle, Warning, CalendarBlank, XCircle, CaretLeft, CaretRight, CaretDown, ChartBar } from "@phosphor-icons/react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from 'sonner'
import { buildLoginUrl, DEFAULT_SESSION_EXPIRED_MESSAGE } from "@/lib/auth"
import { API, AUTH_REQUIRED_MESSAGE, handleApiError, logout } from "@/lib/api"

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
  is_trial_enrollment?: boolean
  trial_selected_lesson_start_time?: string | null
  start_date?: string | null
  end_date?: string | null
  subjects?: GroupSubject[]
}

interface GroupSubject {
  id: number
  subject_id: number | null
  subject_name: string | null
  subject_color?: string | null
  is_elective?: boolean
  hall_name?: string | null
  teacher_names?: string[]
}

interface SubjectCardItem {
  id: number
  title: string
  groupName: string
  groupId?: number
  hallName: string
  teacherNames: string[]
  badge: string
}

interface TeacherGroupApi {
  id: number
  name: string
  duration_minutes: number
  capacity: number | null
  is_closed: boolean
  is_main?: boolean
  category_name: string | null
  teacher_name?: string | null
  teacher_names?: string[]
  is_trial: boolean
  start_date: string | null
  end_date: string | null
  hall: { id: number; name: string } | null
  hall_name?: string | null
  enrolled?: number
  student_count?: number
  free_slots?: number | null
  schedule?: string | null
  notes?: string | null
}

interface GradeItem {
  id: number
  group_id: number
  group_name: string
  class_subject_id?: number | null
  subject_id?: number | null
  subject_name?: string | null
  subject_color?: string | null
  attendance_record_id?: number | null
  lesson_id?: number | null
  value: number
  comment?: string | null
  grade_date?: string | null
  updated_at?: string | null
  teacher_name?: string | null
}

interface LessonAttendanceItem {
  lesson_id: number
  group_id: number
  start_time: string | null
  class_subject_id?: number | null
  attendance_id?: number | null
}

export default function ProfilePage() {
  const router = useRouter()
  const pathname = usePathname()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<UserData | null>(null)
  const [student, setStudent] = useState<StudentData | null>(null)
  const [groups, setGroups] = useState<GroupData[]>([])
  const [teacherSubjects, setTeacherSubjects] = useState<SubjectCardItem[]>([])
  const [lessonAttendance, setLessonAttendance] = useState<any[]>([])
  const [attendanceData, setAttendanceData] = useState<any[]>([])
  const [grades, setGrades] = useState<GradeItem[]>([])
  const [currentGroupPage, setCurrentGroupPage] = useState(0)
  const groupsPerPage = 3
  const [currentSubscriptionPage, setCurrentSubscriptionPage] = useState(0)
  const subscriptionsPerPage = 3
  const [currentAttendancePage, setCurrentAttendancePage] = useState(0)
  const attendancePerPage = 5
  const [lessonsExpanded, setLessonsExpanded] = useState(false)
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<number | null>(null)
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'P' | 'L' | 'E' | 'A'>('all')
  const [openGradesGroupId, setOpenGradesGroupId] = useState<number | null>(null)

  const handleLogout = () => {
    logout()
    toast.success("Вы успешно вышли из системы")
    router.push("/login")
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
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

          try {
            const gradesInfo = await API.grades.studentMy()
            setGrades(gradesInfo?.grades || [])
          } catch (err) {
            }
        } else if (userData.user.role === 'teacher') {
          try {
            const teacherGroupsData = await API.teachers.getMyGroups() as { groups?: TeacherGroupApi[] }
            const normalizedGroups: GroupData[] = (teacherGroupsData.groups || []).map((group) => {
              const enrolled =
                typeof group.enrolled === 'number'
                  ? group.enrolled
                  : typeof group.student_count === 'number'
                    ? group.student_count
                    : 0

              const freeSlots =
                typeof group.free_slots === 'number'
                  ? group.free_slots
                  : typeof group.capacity === 'number'
                    ? group.capacity - enrolled
                    : null

              const teacherDisplay =
                Array.isArray(group.teacher_names) && group.teacher_names.length > 0
                  ? group.teacher_names.filter(Boolean).join(", ")
                  : (group.teacher_name ?? "Вы")

              return {
                id: group.id,
                name: group.name,
                capacity: typeof group.capacity === 'number' ? group.capacity : 0,
                start_time: null,
                duration_minutes: group.duration_minutes,
                hall_id: group.hall?.id ?? null,
                hall_name: group.hall_name ?? group.hall?.name ?? null,
                teacher_name: teacherDisplay,
                category_name: group.category_name,
                enrolled,
                teacher_ids: [],
                free_slots: freeSlots,
                recurring_days: null,
                schedule: group.schedule ?? undefined,
                isActive: !group.is_closed,
                is_trial: group.is_trial,
                start_date: group.start_date,
                end_date: group.end_date,
              }
            })
            setGroups(normalizedGroups)
          } catch (err) {
            // ignoring
          }

          try {
            const teacherSubjectsData = await API.teachers.getMySubjects() as { subjects?: any[] }
            const normalizedSubjects: SubjectCardItem[] = (teacherSubjectsData.subjects || []).map((subject) => ({
              id: subject.id,
              title: subject.subject_name || "Без названия",
              groupName: subject.group_name || "Без группы",
              groupId: subject.group_id ?? null,
              hallName: subject.hall_name || "Не указан",
              teacherNames: Array.isArray(subject.teacher_names) ? subject.teacher_names : [],
              badge: subject.is_elective ? "Электив" : "Обычный",
            }))
            setTeacherSubjects(normalizedSubjects)
          } catch (err) {
            // ignoring
          }
        }

        setLoading(false)
      } catch (err) {
        const message = handleApiError(err)
        if (message === AUTH_REQUIRED_MESSAGE) {
          router.push(buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname }))
          return
        }

        toast.error(message)
        setError(message)
        setLoading(false)
      }
    }

    fetchData()
  }, [router, pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const welcome = params.get('welcome')
    if (welcome === '1') {
      toast.success('Добро пожаловать! Здесь вы найдете расписание и историю посещений.')

      params.delete('welcome')
      const next = params.toString()
      const nextUrl = next ? `/profile?${next}` : '/profile'
      window.history.replaceState({}, '', nextUrl)
    }
  }, [router])

  const isStudent = user?.role === 'student'
  const isTeacher = user?.role === 'teacher'
  const classNames = isStudent
    ? groups.map((group) => group.name).filter(Boolean).join(', ')
    : ""

  const profile = {
    name: user?.name || "Не указано",
    initials: user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : "НИ",
    status: user?.role === 'student' ? 'Ученик' : user?.role === 'teacher' ? 'Преподаватель' : user?.role === 'admin' ? 'Администратор' : 'Пользователь',
    email: user?.email || "Не указано",
    phone: student?.phone_number || "Не указано",
    registrationDate: user?.created_at ? new Date(user.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : "Не указано",
    groupCount: groups.length
  }

  const gradesByAttendanceId = new Map<number, GradeItem>()
  const gradesByLessonId = new Map<number, GradeItem>()
  for (const grade of grades) {
    if (grade.attendance_record_id) gradesByAttendanceId.set(grade.attendance_record_id, grade)
    if (grade.lesson_id) gradesByLessonId.set(grade.lesson_id, grade)
  }

  const attendanceLessons = (lessonAttendance as LessonAttendanceItem[])
    .filter((lesson) => lesson && typeof lesson.group_id === "number")
    .map((lesson) => ({
      ...lesson,
      start_time: lesson.start_time ?? null,
    }))

  const formatLessonDateTime = (value: string | null, durationMinutes?: number | null) => {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return "—"
    const datePart = d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
    if (!durationMinutes) return datePart
    const end = new Date(d.getTime() + durationMinutes * 60000)
    const startTime = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    const endTime = end.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    return `${datePart} · ${startTime}-${endTime}`
  }

  const formatTrialSelectedLessonPretty = (value: string | null | undefined): string | null => {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null

    const weekdayRaw = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "Asia/Almaty" }).format(d)
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

  const subjectCards = useMemo<SubjectCardItem[]>(() => {
    if (!isStudent) {
      return teacherSubjects
    }

    const items: SubjectCardItem[] = []
    groups.forEach((group) => {
      const subjects = group.subjects || []
      subjects.forEach((subject) => {
        const teacherNames = subject.teacher_names?.length
          ? subject.teacher_names
          : group.teacher_name
            ? [group.teacher_name]
            : []

        items.push({
          id: subject.id,
          title: subject.subject_name || "Без названия",
          groupName: group.name || "Без группы",
          groupId: group.id,
          hallName: subject.hall_name || group.hall_name || "Не указан",
          teacherNames,
          badge: subject.is_elective ? "Электив" : "Обычный",
        })
      })
    })

    return items
  }, [groups, isStudent, teacherSubjects])

  const groupById = useMemo(() => {
    const map = new Map<number, GroupData>()
    groups.forEach((group) => map.set(group.id, group))
    return map
  }, [groups])

  const subjectByGroupId = useMemo(() => {
    const map = new Map<number, SubjectCardItem>()
    subjectCards.forEach((subject) => {
      if (typeof subject.groupId === "number") {
        map.set(subject.groupId, subject)
      }
    })
    return map
  }, [subjectCards])

  const totalGroupPages = Math.ceil(subjectCards.length / groupsPerPage)
  const currentSubjects = subjectCards.slice(
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

  const subscriptions = (isStudent ? subjectCards : []).map(subject => {
    const group = typeof subject.groupId === "number" ? groupById.get(subject.groupId) : undefined
    const subjectLessons = lessonAttendance.filter((lesson) => {
      const lessonSubjectId = lesson.class_subject_id ?? subjectByGroupId.get(lesson.group_id)?.id
      return lessonSubjectId === subject.id
    })

    const remainingLessons = subjectLessons.filter(lesson => lesson.status === null).length
    const attendedLessons = subjectLessons.filter(lesson => lesson.status !== null).length
    const totalLessons = subjectLessons.length

    return {
      id: subject.id,
      title: subject.title,
      category: subject.groupName,
      badge: subject.badge,
      used: attendedLessons,
      total: totalLessons,
      remaining: remainingLessons,
      startDate: group?.start_date
        ? new Date(group.start_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
        : "Не указано",
      endDate: group?.end_date
        ? new Date(group.end_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
        : "Не указано",
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

  const selectedGroupLessons = (selectedGroupFilter == null
    ? []
    : lessonAttendance.filter((lesson) => {
      const lessonSubjectId = lesson.class_subject_id ?? subjectByGroupId.get(lesson.group_id)?.id
      return lessonSubjectId === selectedGroupFilter
    })
  )
    .filter((lesson) => {
      if (selectedStatusFilter === 'all') return true
      return lesson.status === selectedStatusFilter
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  const totalAttendancePages = Math.ceil(selectedGroupLessons.length / attendancePerPage)
  const currentAttendanceLessons = selectedGroupLessons.slice(
    currentAttendancePage * attendancePerPage,
    (currentAttendancePage + 1) * attendancePerPage
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

  const openHistoryFor = (groupId: number, status: 'P' | 'L' | 'E' | 'A') => {
    const sameGroup = selectedGroupFilter === groupId
    const nextStatus = sameGroup && selectedStatusFilter === status ? 'all' : status

    setSelectedGroupFilter(groupId)
    setSelectedStatusFilter(nextStatus)
    setLessonsExpanded(true)
    setCurrentAttendancePage(0)
  }

  const toggleHistoryForGroup = (groupId: number) => {
    const isOpen = lessonsExpanded && selectedGroupFilter === groupId
    if (isOpen) {
      closeInlineHistory()
      return
    }

    setSelectedGroupFilter(groupId)
    setSelectedStatusFilter('all')
    setLessonsExpanded(true)
    setCurrentAttendancePage(0)
  }

  const closeInlineHistory = () => {
    setLessonsExpanded(false)
    setSelectedGroupFilter(null)
    setSelectedStatusFilter('all')
    setCurrentAttendancePage(0)
  }

  const attendance = attendanceData.map(data => ({
    id: data.id,
    title: data.title || "Без названия",
    category: data.category || "Без направления",
    groupId: data.group_id ?? null,
    groupName: data.group_name ?? null,
    classSubjectId: data.class_subject_id ?? null,
    subjectName: data.subject_name ?? null,
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

  const attendanceCards = attendance.map((item) => {
    const group = typeof item.groupId === "number" ? groupById.get(item.groupId) : groupById.get(item.id)
    const subjectNames = item.subjectName
      ? [item.subjectName]
      : group?.subjects?.map((subject) => subject.subject_name).filter(Boolean) || []
    return {
      ...item,
      displayTitle: subjectNames.length > 0 ? subjectNames.join(', ') : item.title,
      displaySubtitle: item.groupName || group?.name || item.category,
    }
  })

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
          <p className="text-sm text-muted-foreground">Убедитесь, что вы авторизованы.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {user?.role === 'teacher' ? (
        <TeacherHeader user={user} onLogout={handleLogout} activePath="/profile" />
      ) : (
        <StudentHeader user={user} onLogout={handleLogout} activePath="/profile" />
      )}

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 data-tour="profile-title" className="text-3xl font-bold text-foreground mb-1">Мой профиль</h1>
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
                  <div className="text-xs text-muted-foreground mb-0.5">
                    {isStudent ? "Класс" : "Групп"}
                  </div>
                  <div className="text-sm text-foreground">
                    {isStudent ? (classNames || "Не назначен") : profile.groupCount}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6 lg:col-span-2 border-0 shadow-sm bg-card/80">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold text-foreground">Мои предметы и преподаватели</h2>
              {subjectCards.length > groupsPerPage && (
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
              {subjectCards.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Нет доступных предметов</p>
              ) : (
                currentSubjects.map((subject) => (
                  <div key={subject.id} className="bg-primary/5 rounded-xl p-5 border border-primary/10 hover:border-primary/20 transition-colors">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-base mb-1 text-foreground">{subject.title}</h3>
                        <p className="text-sm text-primary">{subject.groupName}</p>
                      </div>
                      <Badge className="bg-primary text-white border-0 text-xs font-medium px-3">{subject.badge}</Badge>
                    </div>

                    <div className="space-y-3 text-sm">
                      <div className="flex items-center gap-2">
                        <User size={16} className="text-primary" weight="duotone" />
                        <span className="text-muted-foreground text-xs">Преподаватель:</span>
                        <div className="font-medium text-foreground">
                          {subject.teacherNames.length > 0 ? subject.teacherNames.join(", ") : "Не назначен"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-primary" weight="duotone" />
                        <span className="text-muted-foreground text-xs">Зал:</span>
                        <div className="font-medium text-foreground">{subject.hallName}</div>
                      </div>
                    </div>
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
              <h2 className="text-base font-semibold text-foreground">Мои предметы</h2>
            </div>
            {isStudent && subscriptions.length > subscriptionsPerPage && (
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
            {isTeacher ? (
              groups.length === 0 ? (
                <div className="col-span-3 text-center text-muted-foreground py-8">Нет активных групп</div>
              ) : (
                groups.map((group) => (
                  <div key={group.id} className="bg-primary/5 rounded-xl p-5 border border-primary/10 hover:border-primary/20 transition-colors space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold mb-1 text-foreground">{group.name}</h3>
                        <p className="text-sm text-muted-foreground">{group.category_name || "Без направления"}</p>
                      </div>
                      <Badge className="bg-success/20 text-success border-0 text-xs font-medium">
                        {group.isActive ? (group.is_trial ? "Пробный" : "Активная") : "Закрыта"}
                      </Badge>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <User size={16} className="text-primary" weight="duotone" />
                        <span className="text-muted-foreground text-xs">Ученики:</span>
                        <div className="font-medium text-foreground">
                          {group.enrolled}{group.capacity ? ` / ${group.capacity}` : ""}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-primary" weight="duotone" />
                        <span className="text-muted-foreground text-xs">Расписание:</span>
                        <div className="font-medium text-foreground">
                          {(group.is_trial_enrollment && group.trial_selected_lesson_start_time
                            ? formatTrialSelectedLessonPretty(group.trial_selected_lesson_start_time)
                            : group.schedule) || "Не назначено"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-primary" weight="duotone" />
                        <span className="text-muted-foreground text-xs">Зал:</span>
                        <div className="font-medium text-foreground">{group.hall_name || "Не указан"}</div>
                      </div>
                    </div>
                  </div>
                ))
              )
            ) : (
              subscriptions.length === 0 ? (
                <div className="col-span-3 text-center text-muted-foreground py-8">Нет активных предметов</div>
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
                      <Progress value={sub.total > 0 ? (sub.used / sub.total) * 100 : 0} className="h-2 bg-primary/10" />
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
              )
            )}
          </div>
        </Card>

        {isStudent && (
          <Card className="p-6 mb-8 border-0 shadow-sm bg-card/80">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <ChartBar size={20} className="text-primary" weight="duotone" />
                </div>
                <h2 className="text-base font-semibold text-foreground">Оценки</h2>
              </div>
            </div>

            {grades.length === 0 ? (
              <div className="text-sm text-muted-foreground">Оценок пока нет</div>
            ) : (
              <div className="space-y-6">
                {subjectCards.map((subject) => {
                  const subjectLessons = attendanceLessons
                    .filter((lesson) => {
                      const lessonSubjectId = lesson.class_subject_id ?? subjectByGroupId.get(lesson.group_id)?.id
                      return lessonSubjectId === subject.id
                    })
                    .sort((a, b) => new Date(a.start_time ?? "").getTime() - new Date(b.start_time ?? "").getTime())

                  const subjectGrades = grades.filter((grade) => {
                    const gradeSubjectId = grade.class_subject_id ?? subjectByGroupId.get(grade.group_id)?.id
                    return gradeSubjectId === subject.id
                  })
                  const subjectValues = subjectGrades
                    .map((grade) => (Number.isFinite(grade.value) ? grade.value : null))
                    .filter((value): value is number => value !== null)
                  const subjectAverage = subjectValues.length > 0
                    ? formatAverage00(subjectValues.reduce((sum, value) => sum + value, 0) / subjectValues.length)
                    : null

                  const isOpen = openGradesGroupId === subject.id

                  return (
                    <div key={subject.id} className="rounded-2xl border border-border/50 bg-white/60 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOpenGradesGroupId((prev) => (prev === subject.id ? null : subject.id))}
                        className="w-full px-4 py-3 border-b border-border/60 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-left"
                      >
                        <div>
                          <div className="text-sm font-semibold">{subject.title}</div>
                          <div className="text-xs text-muted-foreground">{subject.groupName}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-sm font-semibold text-primary">
                            Средняя: {subjectAverage ?? "—"}
                          </div>
                          <CaretDown
                            size={16}
                            className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                        </div>
                      </button>

                      {isOpen ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Дата занятия</TableHead>
                              <TableHead className="text-right">Оценка</TableHead>
                              <TableHead>Комментарий</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {subjectLessons.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                                  Нет занятий
                                </TableCell>
                              </TableRow>
                            ) : (
                              subjectLessons.map((lesson: any) => {
                                const attendanceId = lesson.attendance_id ?? lesson.id
                                const grade = attendanceId
                                  ? gradesByAttendanceId.get(attendanceId) ?? gradesByLessonId.get(lesson.lesson_id)
                                  : gradesByLessonId.get(lesson.lesson_id)
                                const commentText = grade?.comment?.trim()
                                return (
                                  <TableRow key={`${subject.id}:${lesson.lesson_id}`}>
                                    <TableCell>
                                      {formatLessonDateTime(lesson.start_time, lesson.duration_minutes)}
                                    </TableCell>
                                    <TableCell className="text-right font-semibold text-primary">
                                      {grade ? grade.value : "—"}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground whitespace-pre-wrap">
                                      {commentText ? commentText : "—"}
                                    </TableCell>
                                  </TableRow>
                                )
                              })
                            )}
                          </TableBody>
                        </Table>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        )}

        {isStudent && (
        <Card data-tour="profile-attendance" className="p-6 border-0 shadow-sm bg-card/80">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 rounded-lg bg-primary/10">
              <CheckCircle size={20} className="text-primary" weight="duotone" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Моя посещаемость</h2>
          </div>

          <div className="space-y-8">
            {attendance.length > 0 && (
              <div className="space-y-8">
                {attendanceCards.map((item) => (
                  <div key={item.id}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold mb-1 text-foreground">{item.displayTitle}</h3>
                        <p className="text-sm text-muted-foreground">{item.displaySubtitle}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground mb-1">Посещаемость</div>
                        <div className="text-2xl font-bold text-primary">{item.percentage}%</div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleHistoryForGroup(item.id)}
                          className="h-8 mt-2"
                        >
                          История посещений
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <button
                        type="button"
                        onClick={() => openHistoryFor(item.id, 'P')}
                        className="bg-green-50 rounded-xl p-4 border border-green-200 text-left hover:bg-green-100/60 transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle size={18} weight="fill" className="text-green-600" />
                          <span className="text-xs font-medium text-green-700">Присутствовал (P)</span>
                        </div>
                        <div className="text-3xl font-bold text-green-700">{item.present || 0}</div>
                        <div className="text-xs text-green-600 mt-1">2/2 балла</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => openHistoryFor(item.id, 'L')}
                        className="bg-yellow-50 rounded-xl p-4 border border-yellow-200 text-left hover:bg-yellow-100/60 transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Warning size={18} weight="fill" className="text-yellow-600" />
                          <span className="text-xs font-medium text-yellow-700">Опоздал (L)</span>
                        </div>
                        <div className="text-3xl font-bold text-yellow-700">{item.late || 0}</div>
                        <div className="text-xs text-yellow-600 mt-1">1/2 балла</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => openHistoryFor(item.id, 'E')}
                        className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-left hover:bg-blue-100/60 transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <CalendarBlank size={18} weight="fill" className="text-blue-600" />
                          <span className="text-xs font-medium text-blue-700">Уваж. причина (E)</span>
                        </div>
                        <div className="text-3xl font-bold text-blue-700">{item.excused || 0}</div>
                        <div className="text-xs text-blue-600 mt-1">2/2 балла</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => openHistoryFor(item.id, 'A')}
                        className="bg-red-50 rounded-xl p-4 border border-red-200 text-left hover:bg-red-100/60 transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <XCircle size={18} weight="fill" className="text-red-600" />
                          <span className="text-xs font-medium text-red-700">Отсутствовал (A)</span>
                        </div>
                        <div className="text-3xl font-bold text-red-700">{item.missed || 0}</div>
                        <div className="text-xs text-red-600 mt-1">0/2 балла</div>
                      </button>
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

                    {lessonsExpanded && selectedGroupFilter === item.id && (
                      <div
                        id={`attendance-history-${item.id}`}
                        className="mt-4 rounded-xl border border-border/60 bg-muted/20 p-4"
                      >
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <h4 className="text-sm font-semibold text-foreground whitespace-nowrap">История посещений</h4>
                            {selectedStatusFilter !== 'all' && (
                              <Badge variant="outline" className="shrink-0">
                                {selectedStatusFilter === 'P'
                                  ? 'Присутствовал'
                                  : selectedStatusFilter === 'E'
                                    ? 'Уваж. причина'
                                    : selectedStatusFilter === 'L'
                                      ? 'Опоздал'
                                      : 'Отсутствовал'}
                              </Badge>
                            )}
                          </div>

                          <Button variant="ghost" size="sm" onClick={closeInlineHistory} className="h-8">
                            Скрыть
                          </Button>
                        </div>

                        {selectedGroupLessons.length === 0 ? (
                          <div className="text-sm text-muted-foreground">Нет занятий по выбранному фильтру.</div>
                        ) : (
                          <>
                            <div className="space-y-3">
                              {currentAttendanceLessons.map((lesson) => {
                                const startDate = new Date(lesson.start_time)
                                const endDate = new Date(lesson.end_time)

                                const getStatusColor = (status: string | null, isCancelled: boolean = false) => {
                                  if (isCancelled) return 'bg-red-50 border-red-200 text-red-700'
                                  switch (status) {
                                    case 'P':
                                      return 'bg-green-50 border-green-200 text-green-700'
                                    case 'E':
                                      return 'bg-blue-50 border-blue-200 text-blue-700'
                                    case 'L':
                                      return 'bg-yellow-50 border-yellow-200 text-yellow-700'
                                    case 'A':
                                      return 'bg-red-50 border-red-200 text-red-700'
                                    default:
                                      return 'bg-gray-50 border-gray-200 text-gray-700'
                                  }
                                }

                                const getStatusIcon = (status: string | null, isCancelled: boolean = false) => {
                                  if (isCancelled) return <XCircle size={16} weight="fill" className="text-red-600" />
                                  switch (status) {
                                    case 'P':
                                      return <CheckCircle size={16} weight="fill" className="text-green-600" />
                                    case 'E':
                                      return <CalendarBlank size={16} weight="fill" className="text-blue-600" />
                                    case 'L':
                                      return <Warning size={16} weight="fill" className="text-yellow-600" />
                                    case 'A':
                                      return <XCircle size={16} weight="fill" className="text-red-600" />
                                    default:
                                      return <Clock size={16} className="text-gray-600" />
                                  }
                                }

                                return (
                                  <div
                                    key={lesson.lesson_id}
                                    className="border border-border rounded-lg p-4 hover:bg-accent/5 transition-colors"
                                  >
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <h3 className="font-semibold text-foreground mb-1">{lesson.class_name}</h3>
                                        <p className="text-sm text-muted-foreground mb-2">
                                          {lesson.group_name} • {lesson.category_name}
                                        </p>

                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                                          <div className="flex items-center gap-1">
                                            <Calendar size={14} />
                                            <span>
                                              {startDate.toLocaleDateString('ru-RU', {
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric',
                                              })}
                                            </span>
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
                                        <div
                                          className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 ${getStatusColor(
                                            lesson.status,
                                            lesson.is_cancelled
                                          )}`}
                                        >
                                          {getStatusIcon(lesson.status, lesson.is_cancelled)}
                                          <span className="text-sm font-medium">
                                            {lesson.is_cancelled ? 'Отменено' : lesson.status_display}
                                          </span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">{lesson.points}/2 балла</div>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>

                            {selectedGroupLessons.length > attendancePerPage && (
                              <div className="flex items-center justify-end gap-2 mt-3">
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
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {lessonAttendance.length === 0 && attendance.length === 0 && (
              <div className="text-center text-muted-foreground py-8">Нет данных о посещаемости</div>
            )}
          </div>
        </Card>
        )}
      </main>
    </div>
  )
}
