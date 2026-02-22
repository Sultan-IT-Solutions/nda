"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { API, AUTH_REQUIRED_MESSAGE, handleApiError, logout } from "@/lib/api"
import { buildLoginUrl, DEFAULT_SESSION_EXPIRED_MESSAGE } from "@/lib/auth"
import { toast } from "sonner"
import { TeacherHeader } from "@/components/teacher-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Check, MessageSquarePlus, Pencil, X } from "lucide-react"

type JournalCellDraft = {
  value: string
  comment: string
  dirty: boolean
}

type Group = {
  id: number
  name: string
  hall_name?: string
  student_count: number
  capacity: number
  is_closed: boolean
}

type Student = {
  id: number
  name: string
}

type AttendanceRecord = {
  id: number
  student_id: number
  recorded_at: string
}

type Lesson = {
  id: number
  lesson_date?: string
  start_time?: string
  duration_minutes?: number
  attendance_records: AttendanceRecord[]
}

type GradeItem = {
  id: number
  student_id: number
  attendance_record_id?: number | null
  lesson_id?: number | null
  value: number
  comment?: string | null
  recorded_at?: string | null
  updated_at?: string | null
}

type UserData = {
  id: number
  name: string
  email: string
  role: string
}

export default function TeacherGradesPage() {
  const router = useRouter()
  const pathname = usePathname()

  const [user, setUser] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [groups, setGroups] = useState<Group[]>([])
  const [groupQuery, setGroupQuery] = useState("")
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)

  const [studentQuery, setStudentQuery] = useState("")

  const [students, setStudents] = useState<Student[]>([])

  const handleLogout = () => {
    logout()
    toast.success("Вы успешно вышли из системы")
    router.push("/login")
  }
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [grades, setGrades] = useState<GradeItem[]>([])

  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null)

  const [draftValue, setDraftValue] = useState<Record<number, string>>({})
  const [draftComment, setDraftComment] = useState<Record<number, string>>({})

  const [viewMode, setViewMode] = useState<"journal" | "lesson">("journal")
  const [journalDrafts, setJournalDrafts] = useState<Record<string, JournalCellDraft>>({})
  const [openCommentEditors, setOpenCommentEditors] = useState<Record<string, boolean>>({})
  const [editingEnabled, setEditingEnabled] = useState(false)
  const [journalView, setJournalView] = useState<"horizontal" | "vertical">("horizontal")
  const [gradeScale, setGradeScale] = useState<"0-5" | "0-100">("0-5")
  const [teacherEditEnabled, setTeacherEditEnabled] = useState(true)

  const selectedGroup = useMemo(() => {
    if (selectedGroupId == null) return null
    return groups.find((g) => g.id === selectedGroupId) ?? null
  }, [groups, selectedGroupId])

  const selectedLesson = useMemo(() => {
    if (!lessons || lessons.length === 0) return null
    if (selectedLessonId == null) return lessons[0] ?? null
    return lessons.find((l) => l.id === selectedLessonId) ?? lessons[0] ?? null
  }, [lessons, selectedLessonId])

  const attendanceByStudent = useMemo(() => {
    const m = new Map<number, AttendanceRecord>()
    for (const ar of selectedLesson?.attendance_records ?? []) {
      m.set(ar.student_id, ar)
    }
    return m
  }, [selectedLesson])

  const gradeByAttendanceRecord = useMemo(() => {
    const m = new Map<number, GradeItem>()
    for (const g of grades) {
      if (!g.attendance_record_id) continue
      m.set(g.attendance_record_id, g)
    }
    return m
  }, [grades])

  const attendanceRecordByLessonAndStudent = useMemo(() => {
    const m = new Map<string, AttendanceRecord>()
    for (const l of lessons ?? []) {
      for (const ar of l.attendance_records ?? []) {
        m.set(`${l.id}:${ar.student_id}`, ar)
      }
    }
    return m
  }, [lessons])

  const sortedLessons = useMemo(() => {
    const arr = [...(lessons ?? [])]
    arr.sort((a, b) => {
      const aRaw = a.start_time ?? a.lesson_date
      const bRaw = b.start_time ?? b.lesson_date
      const aT = aRaw ? new Date(aRaw).getTime() : 0
      const bT = bRaw ? new Date(bRaw).getTime() : 0
      return aT - bT
    })
    return arr
  }, [lessons])

  const gradeByLessonAndStudent = useMemo(() => {
    const m = new Map<string, GradeItem>()
    for (const g of grades ?? []) {
      const lessonId = g.lesson_id ?? null
      if (!lessonId) continue
      m.set(`${lessonId}:${g.student_id}`, g)
    }
    return m
  }, [grades])

  const resetJournalDrafts = () => {
    const nextDrafts: Record<string, JournalCellDraft> = {}
    const gByLessonAndStudent = new Map<string, GradeItem>()
    for (const g of grades ?? []) {
      const lessonId = g.lesson_id ?? null
      if (!lessonId) continue
      gByLessonAndStudent.set(`${lessonId}:${g.student_id}`, g)
    }

    for (const lesson of sortedLessons) {
      for (const student of students) {
        const key = `${lesson.id}:${student.id}`
        const existing = gByLessonAndStudent.get(key)
        nextDrafts[key] = {
          value: existing ? String(existing.value) : "",
          comment: existing ? existing.comment ?? "" : "",
          dirty: false,
        }
      }
    }
    setJournalDrafts(nextDrafts)
  }

  const getAverageForStudent = (studentId: number) => {
    const values: number[] = []
    for (const lesson of sortedLessons) {
      const key = `${lesson.id}:${studentId}`
      const draft = journalDrafts[key]
      const raw = draft?.value ?? gradeByLessonAndStudent.get(key)?.value
      if (raw === "" || raw === null || raw === undefined) continue
      const val = typeof raw === "number" ? raw : Number(raw)
      if (Number.isFinite(val)) values.push(val)
    }
    if (values.length === 0) return "—"
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length
    return avg.toFixed(2)
  }

  const getAverageClass = (value: string) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return "text-muted-foreground"
    if (numeric >= 4) return "text-emerald-600"
    if (numeric < 3) return "text-rose-600"
    return "text-amber-600"
  }

  const filteredGroups = useMemo(() => {
    const q = groupQuery.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.name.toLowerCase().includes(q))
  }, [groups, groupQuery])

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) => s.name.toLowerCase().includes(q))
  }, [students, studentQuery])

  const formatLessonLabel = (l: Lesson) => {
    const raw = l.start_time ?? l.lesson_date
    if (!raw) return `Урок #${l.id}`
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return `Урок #${l.id}`
    const duration = l.duration_minutes ?? 90
    const end = new Date(d.getTime() + duration * 60000)
    const datePart = d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
    const startTime = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    const endTime = end.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    return `${datePart}, ${startTime} - ${endTime}`
  }

  const clampGrade = (value: string) => {
    if (value.trim() === "") return ""
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return ""
    const maxValue = gradeScale === "0-100" ? 100 : 5
    const clamped = Math.min(maxValue, Math.max(0, numeric))
    return clamped.toString()
  }

  const gradeMax = gradeScale === "0-100" ? 100 : 5
  const gradeStep = gradeScale === "0-100" ? 1 : 0.5

  const loadGroups = async () => {
    try {
      const res = await API.teachers.getMyGroups()
      setGroups((res?.groups ?? []) as Group[])
    } catch (e) {
      const message = handleApiError(e)
      toast.error(message)
    }
  }

  const loadGroupContext = async (groupId: number) => {
    let studentsData: any
    let lessonsData: any
    let gradesData: any

    try {
      ;[studentsData, lessonsData, gradesData] = await Promise.all([
        API.teachers.getGroupStudents(groupId),
        API.teachers.getGroupLessons(groupId),
        API.grades.teacherListByGroup(groupId),
      ])
    } catch (e) {
      const message = handleApiError(e)
      toast.error(message)
      throw e
    }

    const nextStudents = (studentsData?.students ?? []).map((s: any) => ({ id: s.id, name: s.name })) as Student[]
    const nextLessons = (lessonsData?.lessons ?? []) as Lesson[]
    const nextGrades = (gradesData?.grades ?? []) as GradeItem[]

    setStudents(nextStudents)
    setLessons(nextLessons)
    setGrades(nextGrades)

    const nextValue: Record<number, string> = {}
    const nextComment: Record<number, string> = {}

    const firstLesson = nextLessons[0] ?? null
    const lessonToUse = nextLessons.find((l) => l.id === selectedLessonId) ?? firstLesson

    const arByStudent = new Map<number, AttendanceRecord>()
    for (const ar of lessonToUse?.attendance_records ?? []) {
      arByStudent.set(ar.student_id, ar)
    }

    const gByAr = new Map<number, GradeItem>()
    for (const g of nextGrades) {
      if (!g.attendance_record_id) continue
      gByAr.set(g.attendance_record_id, g)
    }

    for (const s of nextStudents) {
      const ar = arByStudent.get(s.id)
      const g = ar ? gByAr.get(ar.id) : undefined
      nextValue[s.id] = g ? String(g.value) : ""
      nextComment[s.id] = g ? g.comment ?? "" : ""
    }

    setDraftValue(nextValue)
    setDraftComment(nextComment)

    const nextJournalDrafts: Record<string, JournalCellDraft> = {}
    const gByLessonAndStudent = new Map<string, GradeItem>()
    for (const g of nextGrades) {
      const lessonId = g.lesson_id ?? null
      if (!lessonId) continue
      gByLessonAndStudent.set(`${lessonId}:${g.student_id}`, g)
    }

    for (const l of nextLessons) {
      for (const s of nextStudents) {
        const g = gByLessonAndStudent.get(`${l.id}:${s.id}`)
        const key = `${l.id}:${s.id}`
        nextJournalDrafts[key] = {
          value: g ? String(g.value) : "",
          comment: g ? g.comment ?? "" : "",
          dirty: false,
        }
      }
    }
    setJournalDrafts(nextJournalDrafts)

    if (lessonToUse) setSelectedLessonId(lessonToUse.id)
  }

  const selectGroup = async (groupId: number) => {
    setSelectedGroupId(groupId)
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "")
    params.set("groupId", String(groupId))
    router.push(`/teacher-grades?${params.toString()}`)

    setLoading(true)
    try {
      await loadGroupContext(groupId)
    } finally {
      setLoading(false)
    }
  }

  const refreshGrades = async () => {
    if (!selectedGroupId) return
    try {
      const res = await API.grades.teacherListByGroup(selectedGroupId)
      setGrades((res?.grades ?? []) as GradeItem[])
    } catch (e) {
      const message = handleApiError(e)
      toast.error(message)
    }
  }

  const saveJournalCell = async (key: string) => {
    const cell = journalDrafts[key]
    if (!cell) return

    if (cell.value.trim() === "") {
      const [lessonIdRaw, studentIdRaw] = key.split(":")
      const lessonId = Number(lessonIdRaw)
      const studentId = Number(studentIdRaw)
      if (!Number.isFinite(lessonId) || !Number.isFinite(studentId)) return
      if (!selectedGroupId) return

      const ar = attendanceRecordByLessonAndStudent.get(`${lessonId}:${studentId}`)

      setSaving(true)
      try {
        await API.grades.delete({
          attendance_record_id: ar?.id ?? null,
          group_id: selectedGroupId,
          student_id: studentId,
          lesson_id: lessonId,
        })

        setJournalDrafts((p) => ({
          ...p,
          [key]: { ...p[key], dirty: false, value: "" },
        }))

        await refreshGrades()
        toast.success("Оценка удалена")
      } catch (e) {
        const message = handleApiError(e)
        toast.error(message)
      } finally {
        setSaving(false)
      }
      return
    }

    const value = Number(cell.value)
    if (!Number.isFinite(value)) {
      toast.error("Введите число для оценки")
      return
    }

    const [lessonIdRaw, studentIdRaw] = key.split(":")
    const lessonId = Number(lessonIdRaw)
    const studentId = Number(studentIdRaw)
    if (!Number.isFinite(lessonId) || !Number.isFinite(studentId)) return
    if (!selectedGroupId) return

    const ar = attendanceRecordByLessonAndStudent.get(`${lessonId}:${studentId}`)

    setSaving(true)
    try {
      await API.grades.upsert({
        attendance_record_id: ar?.id ?? null,
        group_id: selectedGroupId,
        student_id: studentId,
        lesson_id: lessonId,
        value,
        comment: cell.comment ?? null,
      })

      setJournalDrafts((p) => ({
        ...p,
        [key]: { ...p[key], dirty: false },
      }))

      await refreshGrades()
      toast.success("Сохранено")
    } catch (e) {
      const message = handleApiError(e)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const dirtyCount = useMemo(() => {
    let c = 0
    for (const k of Object.keys(journalDrafts)) {
      if (journalDrafts[k]?.dirty) c++
    }
    return c
  }, [journalDrafts])

  const saveAllDirty = async () => {
    const dirtyIds = Object.entries(journalDrafts)
      .filter(([, v]) => v.dirty)
      .map(([k]) => k)

    if (dirtyIds.length === 0) {
      toast.message("Нет изменений")
      return
    }

    setSaving(true)
    try {
      for (const key of dirtyIds) {
        const cell = journalDrafts[key]
        if (!cell) continue
        if (cell.value.trim() === "") continue
        const value = Number(cell.value)
        if (!Number.isFinite(value)) {
          toast.error("Есть неверные оценки. Проверьте ячейки")
          return
        }
      }

      for (const key of dirtyIds) {
        const cell = journalDrafts[key]
        if (!cell) continue
        if (cell.value.trim() === "") {
          const [lessonIdRaw, studentIdRaw] = key.split(":")
          const lessonId = Number(lessonIdRaw)
          const studentId = Number(studentIdRaw)
          if (!Number.isFinite(lessonId) || !Number.isFinite(studentId)) continue
          if (!selectedGroupId) continue

          const ar = attendanceRecordByLessonAndStudent.get(`${lessonId}:${studentId}`)
          await API.grades.delete({
            attendance_record_id: ar?.id ?? null,
            group_id: selectedGroupId,
            student_id: studentId,
            lesson_id: lessonId,
          })
          continue
        }

        const [lessonIdRaw, studentIdRaw] = key.split(":")
        const lessonId = Number(lessonIdRaw)
        const studentId = Number(studentIdRaw)
        if (!Number.isFinite(lessonId) || !Number.isFinite(studentId)) continue
        if (!selectedGroupId) continue

        const ar = attendanceRecordByLessonAndStudent.get(`${lessonId}:${studentId}`)

        await API.grades.upsert({
          attendance_record_id: ar?.id ?? null,
          group_id: selectedGroupId,
          student_id: studentId,
          lesson_id: lessonId,
          value: Number(cell.value),
          comment: cell.comment ?? null,
        })
      }

      setJournalDrafts((p) => {
        const next = { ...p }
        for (const key of dirtyIds) {
          if (next[key]) next[key] = { ...next[key], dirty: false }
        }
        return next
      })

      await refreshGrades()
      toast.success("Все изменения сохранены")
    } catch (e) {
      const message = handleApiError(e)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }


  const saveForStudent = async (studentId: number) => {
    const ar = attendanceByStudent.get(studentId)
    if (!ar) {
      toast.error("Сначала отметьте посещаемость для этого ученика на выбранный урок")
      return
    }

    const raw = draftValue[studentId]
    const value = Number(raw)
    if (!Number.isFinite(value)) {
      toast.error("Введите число для оценки")
      return
    }

    setSaving(true)
    try {
      await API.grades.upsert({
        attendance_record_id: ar.id,
        value,
        comment: draftComment[studentId] ?? null,
      })

      await refreshGrades()
      toast.success("Оценка сохранена")
    } catch (e) {
      const message = handleApiError(e)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const init = async () => {
      try {
        let userData: any
        try {
          userData = await API.users.me()
        } catch (err) {
          const message = handleApiError(err)
          if (message === AUTH_REQUIRED_MESSAGE) {
            router.push(buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname }))
            return
          }
          throw err
        }

        setUser(userData.user)
        if (userData.user.role !== "teacher") {
          router.push("/")
          return
        }

        try {
          const settingsRes = await API.settings.getPublic()
          const s = settingsRes?.settings ?? {}
          setGradeScale(s["grades.scale"] === "0-100" ? "0-100" : "0-5")
          setTeacherEditEnabled(typeof s["grades.teacher_edit_enabled"] === "boolean" ? s["grades.teacher_edit_enabled"] : true)
        } catch (e) {
          console.warn(e)
        }

        await loadGroups()

        const qs = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null
        const gidRaw = qs?.get("groupId")
        const gid = gidRaw ? Number(gidRaw) : NaN
        if (Number.isFinite(gid) && gid > 0) {
          await selectGroup(gid)
          return
        }

        setLoading(false)
      } catch (e) {
        console.error(e)
        setLoading(false)
      }
    }

    init()
  }, [router])

  useEffect(() => {
    if (!teacherEditEnabled && editingEnabled) {
      resetJournalDrafts()
      setEditingEnabled(false)
    }
  }, [teacherEditEnabled, editingEnabled])

  useEffect(() => {
    if (!selectedGroupId) return

    const nextValue: Record<number, string> = {}
    const nextComment: Record<number, string> = {}

    for (const s of students) {
      const ar = attendanceByStudent.get(s.id)
      const g = ar ? gradeByAttendanceRecord.get(ar.id) : undefined
      nextValue[s.id] = g ? String(g.value) : ""
      nextComment[s.id] = g ? g.comment ?? "" : ""
    }

    setDraftValue(nextValue)
    setDraftComment(nextComment)
  }, [selectedLessonId, selectedGroupId, students, attendanceByStudent, gradeByAttendanceRecord])

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem("teacherGradesJournalView")
    if (stored === "horizontal" || stored === "vertical") {
      setJournalView(stored)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem("teacherGradesJournalView", journalView)
  }, [journalView])


  return (
    <div className="min-h-screen bg-gray-50">
      <TeacherHeader user={user} onLogout={handleLogout} />

      <div className="container mx-auto px-4 py-8 space-y-6">
        {viewMode === "journal" ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Группа</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
                  <div className="space-y-2">
                    <Input
                      value={groupQuery}
                      onChange={(e) => setGroupQuery(e.target.value)}
                      placeholder="Поиск по названию"
                    />
                    <div className="space-y-2">
                      {filteredGroups.map((g) => {
                        const active = selectedGroupId === g.id
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => selectGroup(g.id)}
                            className={
                              "w-full text-left rounded-lg border p-3 transition-colors " +
                              (active
                                ? "bg-primary/5 border-primary/40 shadow-sm"
                                : "hover:bg-muted/60")
                            }
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-medium leading-tight">{g.name}</div>
                              <span
                                className={
                                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                                  (g.is_closed
                                    ? "bg-muted text-muted-foreground"
                                    : "bg-emerald-50 text-emerald-600")
                                }
                              >
                                {g.is_closed ? "Закрыта" : "Активна"}
                              </span>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                              <div>{g.hall_name ? `Зал: ${g.hall_name}` : "Зал не указан"}</div>
                              <div className="text-right">{g.student_count}/{g.capacity} учеников</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg border bg-gradient-to-br from-background to-muted/40 p-4">
                    {selectedGroup ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-lg font-semibold">{selectedGroup.name}</div>
                            <div className="text-sm text-muted-foreground">Журнал выбранной группы</div>
                          </div>
                          <span
                            className={
                              "rounded-full px-2.5 py-1 text-xs font-semibold " +
                              (selectedGroup.is_closed
                                ? "bg-muted text-muted-foreground"
                                : "bg-emerald-50 text-emerald-600")
                            }
                          >
                            {selectedGroup.is_closed ? "Закрыта" : "Активна"}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          <div className="rounded-md border bg-background/70 px-3 py-2">
                            <div className="text-xs text-muted-foreground">Зал</div>
                            <div className="font-medium">{selectedGroup.hall_name || "Не указан"}</div>
                          </div>
                          <div className="rounded-md border bg-background/70 px-3 py-2">
                            <div className="text-xs text-muted-foreground">Ученики</div>
                            <div className="font-medium">
                              {selectedGroup.student_count}/{selectedGroup.capacity}
                            </div>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Оценки можно выставлять и редактировать прямо в журнале.
                        </div>
                        {dirtyCount > 0 ? (
                          <div className="text-sm text-amber-600">Несохранённых изменений: {dirtyCount}</div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-muted-foreground">Выберите группу слева</div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {!selectedGroup ? null : loading ? (
              <div className="text-sm text-muted-foreground">Загрузка…</div>
            ) : students.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-muted-foreground">В группе пока нет учеников</CardContent>
              </Card>
            ) : lessons.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-muted-foreground">Нет уроков для этой группы</CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle>Журнал</CardTitle>
                      <div className="flex flex-wrap items-center gap-2">
                        {dirtyCount > 0 ? (
                          <div className="text-xs text-amber-600">Есть несохранённые изменения</div>
                        ) : null}
                        <Button
                          variant={editingEnabled ? "secondary" : "outline"}
                          className={editingEnabled ? "bg-amber-500 text-white hover:bg-amber-600" : "border-amber-300 text-amber-700 hover:bg-amber-50"}
                          onClick={() => {
                            if (!teacherEditEnabled) return
                            if (editingEnabled) {
                              resetJournalDrafts()
                            }
                            setEditingEnabled((p) => !p)
                          }}
                          disabled={!teacherEditEnabled}
                        >
                          {teacherEditEnabled
                            ? editingEnabled
                              ? "Выключить редактирование"
                              : "Включить редактирование"
                            : "Редактирование отключено"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setJournalView((p) => (p === "horizontal" ? "vertical" : "horizontal"))}
                        >
                          {journalView === "horizontal" ? "Вид: вертикальный" : "Вид: горизонтальный"}
                        </Button>
                        <Button onClick={saveAllDirty} disabled={saving || dirtyCount === 0}>
                          {saving ? "Сохранение…" : "Сохранить"}
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">Шкала оценок: {gradeScale === "0-100" ? "0–100" : "0–5"}</div>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 max-w-xs">
                      <Input
                        value={studentQuery}
                        onChange={(e) => setStudentQuery(e.target.value)}
                        placeholder="Поиск ученика"
                      />
                    </div>
                    {studentQuery.trim() && filteredStudents.length === 0 ? (
                      <div className="text-sm text-muted-foreground">Не найдено</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <div className="min-w-[900px]">
                          {journalView === "horizontal" ? (
                          <div
                            className="grid"
                            style={{ gridTemplateColumns: `260px repeat(${sortedLessons.length}, 120px) 140px` }}
                          >
                            <div className="md:sticky md:left-0 md:z-10 bg-background border-b border-r p-2 font-medium">Ученик</div>
                            {sortedLessons.map((l) => (
                              <div key={l.id} className="border-b border-r p-2 text-xs text-muted-foreground">
                                {formatLessonLabel(l)}
                              </div>
                            ))}
                            <div className="border-b border-r p-2 text-xs font-medium">Общая оценка</div>

                            {(filteredStudents ?? []).map((s) => (
                              <div key={`row:${s.id}`} className="contents">
                                <div className="md:sticky md:left-0 md:z-10 bg-background border-b border-r p-2">
                                  <div className="font-medium leading-tight">{s.name}</div>
                                </div>

                                {sortedLessons.map((l) => {
                                  const key = `${l.id}:${s.id}`
                                  const existing = gradeByLessonAndStudent.get(key)
                                  const draft = journalDrafts[key] ?? {
                                    value: existing ? String(existing.value) : "",
                                    comment: existing ? existing.comment ?? "" : "",
                                    dirty: false,
                                  }

                                  const hasComment = Boolean(draft.comment?.trim())
                                  const isCommentOpen = Boolean(openCommentEditors[key])

                                  return (
                                    <div key={`c:${s.id}:${l.id}`} className="group relative border-b border-r p-1">
                                      <Input
                                        className={
                                          "h-8 text-center " +
                                          (draft.dirty ? "border-primary " : "") +
                                          (!editingEnabled
                                            ? "appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            : "")
                                        }
                                        type="number"
                                        min={0}
                                        max={gradeMax}
                                        step={gradeStep}
                                        value={draft.value}
                                        onChange={(e) =>
                                          setJournalDrafts((p) => ({
                                            ...p,
                                            [key]: {
                                              value: clampGrade(e.target.value),
                                              comment: p[key]?.comment ?? draft.comment,
                                              dirty: true,
                                            },
                                          }))
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" && editingEnabled) {
                                            e.preventDefault()
                                            saveJournalCell(key)
                                          }
                                        }}
                                        placeholder=""
                                        disabled={saving || !editingEnabled}
                                      />
                                      {editingEnabled && !isCommentOpen ? (
                                        <div className="absolute left-1 top-1 flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            className="h-7 w-7"
                                            onClick={() =>
                                              setOpenCommentEditors((p) => ({
                                                ...p,
                                                [key]: true,
                                              }))
                                            }
                                            disabled={saving}
                                            aria-label={hasComment ? "Изменить комментарий" : "Добавить комментарий"}
                                          >
                                            {hasComment ? <Pencil className="h-3.5 w-3.5" /> : <MessageSquarePlus className="h-3.5 w-3.5" />}
                                          </Button>
                                        </div>
                                      ) : null}
                                      {editingEnabled && isCommentOpen ? (
                                        <div className="mt-2 space-y-2">
                                          <Textarea
                                            value={draft.comment ?? ""}
                                            onChange={(e) =>
                                              setJournalDrafts((p) => ({
                                                ...p,
                                                [key]: {
                                                  value: p[key]?.value ?? draft.value,
                                                  comment: e.target.value,
                                                  dirty: true,
                                                },
                                              }))
                                            }
                                            placeholder="Короткий фидбек ученику"
                                            disabled={saving}
                                          />
                                          <div className="flex items-center justify-end gap-2">
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon-sm"
                                              className="h-7 w-7"
                                              onClick={() => {
                                                if (draft.value.trim() !== "") {
                                                  void saveJournalCell(key)
                                                }
                                                setOpenCommentEditors((p) => ({
                                                  ...p,
                                                  [key]: false,
                                                }))
                                              }}
                                              disabled={saving}
                                              aria-label="Сохранить комментарий"
                                            >
                                              <Check className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon-sm"
                                              className="h-7 w-7 text-destructive"
                                              onClick={() =>
                                                setOpenCommentEditors((p) => ({
                                                  ...p,
                                                  [key]: false,
                                                }))
                                              }
                                              disabled={saving}
                                              aria-label="Закрыть редактор комментария"
                                            >
                                              <X className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  )
                                })}
                                {(() => {
                                  const avg = getAverageForStudent(s.id)
                                  return (
                                    <div
                                      className={
                                        "border-b border-r p-2 text-center text-sm font-semibold " +
                                        getAverageClass(avg)
                                      }
                                    >
                                      {avg}
                                    </div>
                                  )
                                })()}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div
                            className="grid"
                            style={{ gridTemplateColumns: `260px repeat(${filteredStudents.length}, 120px)` }}
                          >
                            <div className="md:sticky md:left-0 md:z-10 bg-background border-b border-r p-2 font-medium">Дата</div>
                            {filteredStudents.map((s) => (
                              <div key={s.id} className="border-b border-r p-2 text-xs text-muted-foreground">
                                {s.name}
                              </div>
                            ))}

                            {sortedLessons.map((l) => (
                              <div key={`row:${l.id}`} className="contents">
                                <div className="md:sticky md:left-0 md:z-10 bg-background border-b border-r p-2 text-xs">
                                  {formatLessonLabel(l)}
                                </div>
                                {filteredStudents.map((s) => {
                                  const key = `${l.id}:${s.id}`
                                  const existing = gradeByLessonAndStudent.get(key)
                                  const draft = journalDrafts[key] ?? {
                                    value: existing ? String(existing.value) : "",
                                    comment: existing ? existing.comment ?? "" : "",
                                    dirty: false,
                                  }
                                  const hasComment = Boolean(draft.comment?.trim())
                                  const isCommentOpen = Boolean(openCommentEditors[key])

                                  return (
                                    <div key={`c:${l.id}:${s.id}`} className="group relative border-b border-r p-1">
                                      <Input
                                        className={
                                          "h-8 text-center " +
                                          (draft.dirty ? "border-primary " : "") +
                                          (!editingEnabled
                                            ? "appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            : "")
                                        }
                                        type="number"
                                        min={0}
                                        max={gradeMax}
                                        step={gradeStep}
                                        value={draft.value}
                                        onChange={(e) =>
                                          setJournalDrafts((p) => ({
                                            ...p,
                                            [key]: {
                                              value: clampGrade(e.target.value),
                                              comment: p[key]?.comment ?? draft.comment,
                                              dirty: true,
                                            },
                                          }))
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" && editingEnabled) {
                                            e.preventDefault()
                                            saveJournalCell(key)
                                          }
                                        }}
                                        placeholder=""
                                        disabled={saving || !editingEnabled}
                                      />
                                      {editingEnabled && !isCommentOpen ? (
                                        <div className="absolute left-1 top-1 flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            className="h-7 w-7"
                                            onClick={() =>
                                              setOpenCommentEditors((p) => ({
                                                ...p,
                                                [key]: true,
                                              }))
                                            }
                                            disabled={saving}
                                            aria-label={hasComment ? "Изменить комментарий" : "Добавить комментарий"}
                                          >
                                            {hasComment ? <Pencil className="h-3.5 w-3.5" /> : <MessageSquarePlus className="h-3.5 w-3.5" />}
                                          </Button>
                                        </div>
                                      ) : null}
                                      {editingEnabled && isCommentOpen ? (
                                        <div className="mt-2 space-y-2">
                                          <Textarea
                                            value={draft.comment ?? ""}
                                            onChange={(e) =>
                                              setJournalDrafts((p) => ({
                                                ...p,
                                                [key]: {
                                                  value: p[key]?.value ?? draft.value,
                                                  comment: e.target.value,
                                                  dirty: true,
                                                },
                                              }))
                                            }
                                            placeholder="Короткий фидбек ученику"
                                            disabled={saving}
                                          />
                                          <div className="flex items-center justify-end gap-2">
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon-sm"
                                              className="h-7 w-7"
                                              onClick={() => {
                                                if (draft.value.trim() !== "") {
                                                  void saveJournalCell(key)
                                                }
                                                setOpenCommentEditors((p) => ({
                                                  ...p,
                                                  [key]: false,
                                                }))
                                              }}
                                              disabled={saving}
                                              aria-label="Сохранить комментарий"
                                            >
                                              <Check className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon-sm"
                                              className="h-7 w-7 text-destructive"
                                              onClick={() =>
                                                setOpenCommentEditors((p) => ({
                                                  ...p,
                                                  [key]: false,
                                                }))
                                              }
                                              disabled={saving}
                                              aria-label="Закрыть редактор комментария"
                                            >
                                              <X className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  )
                                })}
                              </div>
                            ))}

                            <div className="md:sticky md:left-0 md:z-10 bg-background border-b border-r p-2 text-sm font-medium">
                              Общая оценка
                            </div>
                            {filteredStudents.map((s) => {
                              const avg = getAverageForStudent(s.id)
                              return (
                                <div
                                  key={`avg:${s.id}`}
                                  className={
                                    "border-b border-r p-2 text-center text-sm font-semibold " +
                                    getAverageClass(avg)
                                  }
                                >
                                  {avg}
                                </div>
                              )
                            })}
                          </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

              </>
            )}
          </>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Мои группы</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input value={groupQuery} onChange={(e) => setGroupQuery(e.target.value)} placeholder="Поиск по названию" />

                <div className="space-y-2">
                  {filteredGroups.map((g) => {
                    const active = selectedGroupId === g.id
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => selectGroup(g.id)}
                        className={
                          "w-full text-left rounded-md border p-3 transition-colors " +
                          (active ? "bg-muted border-primary/40" : "hover:bg-muted/60")
                        }
                      >
                        <div className="font-medium leading-tight">{g.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {g.hall_name ? `Зал: ${g.hall_name} · ` : ""}
                          Ученики: {g.student_count}/{g.capacity}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              {!selectedGroup ? (
                <Card>
                  <CardContent className="py-10 text-muted-foreground">Выберите группу слева</CardContent>
                </Card>
              ) : (
                <>
                <Card>
                  <CardHeader>
                    <CardTitle>{selectedGroup.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <Label className="min-w-[90px]">Урок</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={selectedLesson?.id ?? ""}
                        onChange={(e) => setSelectedLessonId(Number(e.target.value))}
                      >
                        {sortedLessons.map((l) => (
                          <option key={l.id} value={l.id}>
                            {formatLessonLabel(l)}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="outline"
                        onClick={() => selectedGroupId && loadGroupContext(selectedGroupId)}
                        disabled={loading}
                      >
                        Обновить
                      </Button>
                    </div>

                    <div className="text-sm text-muted-foreground">Оценки можно выставлять и без отметки посещаемости.</div>
                  </CardContent>
                </Card>

                {loading ? (
                  <div className="text-sm text-muted-foreground">Загрузка…</div>
                ) : students.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-muted-foreground">В группе пока нет учеников</CardContent>
                  </Card>
                ) : !selectedLesson ? (
                  <Card>
                    <CardContent className="py-10 text-muted-foreground">Нет уроков для этой группы</CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {students.map((s) => {
                      const ar = attendanceByStudent.get(s.id)
                      const existing = ar ? gradeByAttendanceRecord.get(ar.id) : undefined

                      return (
                        <Card key={s.id}>
                          <CardContent className="py-4 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <div>
                                <div className="font-medium">{s.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {!ar ? "Нет посещаемости на выбранный урок" : `attendance #${ar.id}`}
                                  {existing?.updated_at
                                    ? ` · Обновлено: ${new Date(existing.updated_at).toLocaleString("ru-RU")}`
                                    : ""}
                                </div>
                              </div>
                              <div className="text-xl font-bold">
                                {existing ? existing.value : draftValue[s.id] ? Number(draftValue[s.id]) : "—"}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <Label>Оценка</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={gradeMax}
                                  step={gradeStep}
                                  value={draftValue[s.id] ?? ""}
                                  onChange={(e) =>
                                    setDraftValue((p) => ({ ...p, [s.id]: clampGrade(e.target.value) }))
                                  }
                                  placeholder="Напр. 4.5"
                                  disabled={!ar}
                                />
                              </div>
                              <div className="md:col-span-2 space-y-1">
                                <Label>Комментарий</Label>
                                <Textarea
                                  value={draftComment[s.id] ?? ""}
                                  onChange={(e) => setDraftComment((p) => ({ ...p, [s.id]: e.target.value }))}
                                  placeholder="Короткий фидбек ученику"
                                  disabled={!ar}
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-end">
                              <Button disabled={saving || !ar} onClick={() => saveForStudent(s.id)}>
                                {saving ? "Сохранение…" : "Сохранить"}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
          </div>
        )}
      </div>
    </div>
  )
}
