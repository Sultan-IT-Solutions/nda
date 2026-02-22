"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AdminSidebar } from "@/components/admin-sidebar"
import { AdminHeader } from "@/components/admin-header"
import { AdminPagination } from "@/components/admin-pagination"
import { useSidebar } from "@/hooks/use-sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { API, handleApiError } from "@/lib/api"
import { buildLoginUrl, DEFAULT_SESSION_EXPIRED_MESSAGE } from "@/lib/auth"
import { toast } from "sonner"
import * as XLSX from "xlsx"

type GroupListItem = {
  groupId: number
  groupName: string
  hallName?: string
  teacherName?: string
  studentCount?: number
  capacity?: number
  isClosed?: boolean
}

type GradeItem = {
  id: number
  student_id: number
  student_name?: string
  group_id: number
  group_name?: string
  attendance_record_id?: number | null
  lesson_id?: number | null
  value: number
  comment?: string | null
  grade_date?: string | null
  recorded_at?: string | null
  teacher_name?: string
  updated_at?: string | null
}

type LessonStudent = {
  id: number
  name: string
}

type Lesson = {
  id: number
  start_time?: string | null
  duration_minutes?: number | null
  teacher_name?: string | null
  students: LessonStudent[]
}

export default function AdminGradesPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { sidebarWidth } = useSidebar()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)

  const [groupQuery, setGroupQuery] = useState<string>("")
  const [groups, setGroups] = useState<GroupListItem[]>([])
  const [selectedGroup, setSelectedGroup] = useState<GroupListItem | null>(null)
  const [grades, setGrades] = useState<GradeItem[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [students, setStudents] = useState<LessonStudent[]>([])
  const [studentQuery, setStudentQuery] = useState("")
  const [page, setPage] = useState(1)
  const itemsPerPage = 5
  const [gradesScale, setGradesScale] = useState<"0-5" | "0-100">("0-5")
  const [exportFilteredOnly, setExportFilteredOnly] = useState(false)

  const loadGroupContext = async (gid: number) => {
    setLoading(true)
    try {
      const [gradesRes, lessonsRes] = await Promise.all([
        API.grades.adminListByGroup(gid),
        API.admin.getGroupLessonsAttendance(gid),
      ])
      const nextLessons = (lessonsRes?.lessons ?? []) as Lesson[]
      const studentsMap = new Map<number, LessonStudent>()
      for (const lesson of nextLessons) {
        for (const student of lesson.students ?? []) {
          studentsMap.set(student.id, student)
        }
      }
      setLessons(nextLessons)
      setStudents(Array.from(studentsMap.values()))
      setGrades(gradesRes?.grades ?? [])
    } catch (e) {
      console.error(e)
      handleApiError(e)
    } finally {
      setLoading(false)
    }
  }

  const selectGroup = async (g: GroupListItem) => {
    setSelectedGroup(g)
    router.push(`/analytics/grades?groupId=${g.groupId}`)
    await loadGroupContext(g.groupId)
  }

  useEffect(() => {
    const init = async () => {
      try {
        let userData: any
        try {
          userData = await API.users.me()
        } catch (err) {
          const message = handleApiError(err)
          if (message.includes("Требуется авторизация")) {
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

        const [groupsRes, settingsRes] = await Promise.all([
          API.admin.getGroupsAnalytics(),
          API.admin.getSettings(),
        ])
        const items = (groupsRes?.groups ?? []) as GroupListItem[]
        setGroups(items)
        const scale = settingsRes?.settings?.["grades.scale"] === "0-100" ? "0-100" : "0-5"
        setGradesScale(scale)

        const qs = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null
        const gidRaw = qs?.get("groupId")
        const gid = gidRaw ? Number(gidRaw) : NaN
        if (Number.isFinite(gid) && gid > 0) {
          const found = items.find((x) => x.groupId === gid) ?? null
          setSelectedGroup(found)
          await loadGroupContext(gid)
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

  const filteredGroups = useMemo(() => {
    const q = groupQuery.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.groupName.toLowerCase().includes(q))
  }, [groups, groupQuery])

  useEffect(() => {
    setPage(1)
  }, [groupQuery])

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / itemsPerPage))
  const paginatedGroups = filteredGroups.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) => s.name.toLowerCase().includes(q))
  }, [students, studentQuery])

  const sortedLessons = useMemo(() => {
    const arr = [...lessons]
    arr.sort((a, b) => {
      const aRaw = a.start_time ?? ""
      const bRaw = b.start_time ?? ""
      return new Date(aRaw).getTime() - new Date(bRaw).getTime()
    })
    return arr
  }, [lessons])

  const gradeByLessonAndStudent = useMemo(() => {
    const map = new Map<string, GradeItem>()
    for (const grade of grades) {
      if (!grade.lesson_id) continue
      map.set(`${grade.lesson_id}:${grade.student_id}`, grade)
    }
    return map
  }, [grades])

  const formatLessonLabel = (lesson: Lesson) => {
    const raw = lesson.start_time
    if (!raw) return `Урок #${lesson.id}`
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return `Урок #${lesson.id}`
    const duration = lesson.duration_minutes ?? 90
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

  const getAverageValueForStudent = (studentId: number) => {
    const values: number[] = []
    for (const lesson of sortedLessons) {
      const grade = gradeByLessonAndStudent.get(`${lesson.id}:${studentId}`)
      if (!grade) continue
      if (Number.isFinite(grade.value)) values.push(grade.value)
    }
    if (values.length === 0) return null
    return values.reduce((sum, v) => sum + v, 0) / values.length
  }

  const getAverageForStudent = (studentId: number) => {
    const avg = getAverageValueForStudent(studentId)
    if (avg === null) return "—"
    return avg.toFixed(2)
  }

  const toScale100 = (value: number) => (gradesScale === "0-5" ? value * 20 : value)

  const getExportStudents = () => {
    if (!exportFilteredOnly) return students
    const q = studentQuery.trim().toLowerCase()
    if (!q) return filteredStudents
    return students.filter((student) => student.name.toLowerCase().includes(q))
  }

  const buildExportSheet = (exportStudents: LessonStudent[]) => {
    const headerRow = [
      "Ученик",
      ...sortedLessons.map((lesson) => formatLessonLabel(lesson)),
      "Средняя",
      "Средняя (0-100)",
    ]

    const rows = exportStudents.map((student) => {
      const row: Array<string | number> = [student.name]
      for (const lesson of sortedLessons) {
        const grade = gradeByLessonAndStudent.get(`${lesson.id}:${student.id}`)
        row.push(grade ? grade.value : "")
      }
      const avg = getAverageValueForStudent(student.id)
      row.push(avg === null ? "" : Number(avg.toFixed(2)))
      row.push(avg === null ? "" : Number(toScale100(avg).toFixed(2)))
      return row
    })

    return XLSX.utils.aoa_to_sheet([headerRow, ...rows])
  }

  const ensureExportable = () => {
    if (!selectedGroup) {
      toast.error("Выберите группу для экспорта")
      return null
    }

    if (students.length === 0 || sortedLessons.length === 0) {
      toast.error("Нет данных для экспорта")
      return null
    }

    const exportStudents = getExportStudents()
    if (exportStudents.length === 0) {
      toast.error("Нет учеников для экспорта")
      return null
    }

    return {
      exportStudents,
      safeGroupName: selectedGroup.groupName.replace(/\s+/g, "_"),
    }
  }

  const handleExportXlsx = () => {
    const exportData = ensureExportable()
    if (!exportData) return

    const worksheet = buildExportSheet(exportData.exportStudents)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Оценки")
    XLSX.writeFile(workbook, `Оценки_${exportData.safeGroupName}.xlsx`)
  }

  const handleExportCsv = () => {
    const exportData = ensureExportable()
    if (!exportData) return

    const worksheet = buildExportSheet(exportData.exportStudents)
    const csv = XLSX.utils.sheet_to_csv(worksheet)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `Оценки_${exportData.safeGroupName}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar />
      <div className={sidebarWidth + " transition-all duration-300"}>
        <AdminHeader userName={user?.name} userEmail={user?.email} />

        <div className="p-4 sm:p-6 space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Оценки</h1>
            <p className="text-muted-foreground">Журнал оценок по группам</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Группы</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={groupQuery}
                  onChange={(e) => setGroupQuery(e.target.value)}
                  placeholder="Поиск по названию группы"
                />
                <Button variant="outline" onClick={() => setGroupQuery("")} className="sm:self-start">
                  Сбросить
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {paginatedGroups.map((g) => {
                  const active = selectedGroup?.groupId === g.groupId
                  return (
                    <button
                      key={g.groupId}
                      type="button"
                      onClick={() => selectGroup(g)}
                      className={
                        "text-left rounded-md border p-3 transition-colors " +
                        (active ? "bg-muted border-primary/40" : "hover:bg-muted/60")
                      }
                    >
                      <div className="font-medium leading-tight">{g.groupName}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {g.teacherName ? `Преподаватель: ${g.teacherName} · ` : ""}
                        {typeof g.studentCount === "number" ? `Ученики: ${g.studentCount}` : ""}
                      </div>
                    </button>
                  )
                })}
              </div>
              {filteredGroups.length > 0 ? (
                <AdminPagination
                  page={page}
                  totalPages={totalPages}
                  onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
                  onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                />
              ) : null}
            </CardContent>
          </Card>

          {loading ? (
            <div className="text-muted-foreground">Загрузка…</div>
          ) : !selectedGroup ? (
            <Card>
              <CardContent className="py-8 text-muted-foreground">Выберите группу, чтобы увидеть оценки</CardContent>
            </Card>
          ) : lessons.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-muted-foreground">Нет уроков для выбранной группы</CardContent>
            </Card>
          ) : students.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-muted-foreground">В группе пока нет учеников</CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle>Журнал — {selectedGroup.groupName}</CardTitle>
                    <div className="text-sm text-muted-foreground">
                      {selectedGroup.teacherName ? `Преподаватель: ${selectedGroup.teacherName}` : ""}
                      {selectedGroup.hallName ? ` · Зал: ${selectedGroup.hallName}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-col sm:items-end gap-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Шкала:</span>
                      <Badge variant="secondary">{gradesScale}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" onClick={handleExportXlsx} type="button">
                        Экспорт в Excel
                      </Button>
                      <Button variant="outline" onClick={handleExportCsv} type="button">
                        Экспорт в CSV
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4" />
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
                      <div
                        className="grid"
                        style={{ gridTemplateColumns: `260px repeat(${sortedLessons.length}, 140px) 140px` }}
                      >
                        <div className="sticky left-0 z-10 bg-background border-b border-r p-2 font-medium">Ученик</div>
                        {sortedLessons.map((lesson) => (
                          <div key={lesson.id} className="border-b border-r p-2 text-xs text-muted-foreground">
                            {formatLessonLabel(lesson)}
                          </div>
                        ))}
                        <div className="border-b border-r p-2 text-xs font-medium">Среднее</div>

                        {(filteredStudents ?? []).map((student) => (
                          <div key={`row:${student.id}`} className="contents">
                            <div className="sticky left-0 z-10 bg-background border-b border-r p-2">
                              <div className="font-medium leading-tight">{student.name}</div>
                            </div>

                            {sortedLessons.map((lesson) => {
                              const grade = gradeByLessonAndStudent.get(`${lesson.id}:${student.id}`)
                              return (
                                <div key={`cell:${lesson.id}:${student.id}`} className="border-b border-r p-2 text-center">
                                  <div className="text-sm font-medium">{grade ? grade.value : ""}</div>
                                  {grade?.comment ? (
                                    <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{grade.comment}</div>
                                  ) : null}
                                </div>
                              )
                            })}

                            <div className="border-b border-r p-2 text-sm font-medium text-center">
                              {getAverageForStudent(student.id)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
