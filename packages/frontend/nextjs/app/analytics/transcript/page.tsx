"use client"

import { useEffect, useMemo, useState } from "react"

import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"

import { 
  BookOpen, 
  Users, 
  GraduationCap, 
  Download, 
  UploadCloud, 
  AlertCircle, 
  CheckCircle2, 
  Search, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  History,
  User
} from "lucide-react"

import { AdminHeader } from "@/components/admin-header"
import { AdminSidebar } from "@/components/admin-sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useSidebar } from "@/hooks/use-sidebar"
import { API, AUTH_REQUIRED_MESSAGE, handleApiError, logout } from "@/lib/api"
import { buildLoginUrl, DEFAULT_SESSION_EXPIRED_MESSAGE } from "@/lib/auth"

interface UserData {
  id: number
  name: string
  email: string
  role: string
}

interface GroupItem {
  id: number
  name: string
}

interface TranscriptSubject {
  subject_id: number
  subject_name: string
  subject_color?: string | null
}

interface TranscriptRecord {
  student_id: number
  student_name: string
  average_value: number
  grade_count: number
  grades: Array<{ value: number; lesson_start?: string | null; teacher_name?: string | null }>
  published_at?: string | null
}

interface MissingStudent {
  id: number
  name: string
  missing_lessons?: number
}

interface PublicationHistoryItem {
  id: number
  subject_id?: number | null
  subject_name?: string | null
  total_students: number
  total_lessons: number
  published_at?: string | null
  actor_name?: string | null
}

export default function AdminTranscriptPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { sidebarWidth } = useSidebar()

  const [user, setUser] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [settingsEnabled, setSettingsEnabled] = useState(true)

  const [groups, setGroups] = useState<GroupItem[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)

  const [subjects, setSubjects] = useState<TranscriptSubject[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null)
  const [records, setRecords] = useState<TranscriptRecord[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  const [studentQuery, setStudentQuery] = useState("")
  const [avgSort, setAvgSort] = useState<"desc" | "asc">("desc")
  const [missingStudents, setMissingStudents] = useState<MissingStudent[]>([])
  const [canPublish, setCanPublish] = useState(true)
  const [totalLessons, setTotalLessons] = useState(0)
  const [totalStudents, setTotalStudents] = useState(0)
  const [missingLessonsTotal, setMissingLessonsTotal] = useState(0)
  const [history, setHistory] = useState<PublicationHistoryItem[]>([])

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.subject_id === selectedSubjectId) ?? null,
    [subjects, selectedSubjectId],
  )

  const handleLogout = () => {
    logout()
    toast.success("Вы успешно вышли из системы")
    router.push("/login")
  }

  const loadTranscript = async (groupId: number, subjectId?: number | null) => {
    try {
      const res = await API.admin.getTranscriptGroup(groupId, subjectId ?? undefined)
      const responseSubjects = (res?.subjects ?? []) as TranscriptSubject[]
      setSubjects(responseSubjects)
      const responseSubjectId = res?.subject_id ?? null
      setSelectedSubjectId(responseSubjectId)
      setRecords((res?.records ?? []) as TranscriptRecord[])
      const status = res?.status ?? {}
      setMissingStudents((status.missing_students ?? []) as MissingStudent[])
      setCanPublish(Boolean(status.can_publish ?? true))
      setTotalLessons(Number(status.total_lessons ?? 0))
      setTotalStudents(Number(status.total_students ?? 0))
      setMissingLessonsTotal(Number(status.missing_lessons_total ?? 0))
      setHistory((res?.history ?? []) as PublicationHistoryItem[])
    } catch (err) {
      const message = handleApiError(err)
      toast.error(message)
    }
  }

  const handlePublish = async () => {
    if (!selectedGroupId) return
    if (!selectedSubjectId) {
      toast.error("Выберите предмет для публикации")
      return
    }
    setPublishing(true)
    try {
      await API.admin.publishTranscript(selectedGroupId, { subject_id: selectedSubjectId })
      toast.success("Транскрипт обновлен")
      await loadTranscript(selectedGroupId, selectedSubjectId)
    } catch (err) {
      toast.error(handleApiError(err))
    } finally {
      setPublishing(false)
    }
  }

  const handlePublishAll = async () => {
    if (!selectedGroupId) return
    if (subjects.length === 0) {
      toast.error("Нет предметов для публикации")
      return
    }
    setPublishing(true)
    try {
      await API.admin.publishTranscriptAll(selectedGroupId)
      toast.success("Транскрипт опубликован по всем предметам")
      await loadTranscript(selectedGroupId, selectedSubjectId)
    } catch (err) {
      toast.error(handleApiError(err))
    } finally {
      setPublishing(false)
    }
  }

  const handleExportCsv = () => {
    if (filteredRecords.length === 0) {
      toast.error("Нет данных для экспорта")
      return
    }
    const header = ["Ученик", "Средняя", "Предмет"]
    const rows = filteredRecords.map((record) => [
      record.student_name,
      String(Math.round(record.average_value)),
      selectedSubject?.subject_name || "—",
    ])
    const csv = [header, ...rows].map((row) => row.join(";")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `Транскрипт_${selectedSubject?.subject_name || "класс"}.csv`
    link.click()
    URL.revokeObjectURL(url)
    API.admin.logAuditEvent({
      action_key: "admin.transcript.export.csv",
      action_label: "Экспорт транскрипта (CSV)",
      meta: {
        groupId: selectedGroupId,
        subjectId: selectedSubjectId,
        records: filteredRecords.length,
      },
    })
  }

  const progressTotal = totalLessons * totalStudents
  const progressDone = Math.max(progressTotal - missingLessonsTotal, 0)
  const progressPercent = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0

  const classStats = useMemo(() => {
    if (records.length === 0) return null
    const values = records.map((r) => r.average_value).filter((v) => Number.isFinite(v))
    if (values.length === 0) return null
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length
    const min = Math.min(...values)
    const max = Math.max(...values)
    return { avg, min, max }
  }, [records])

  const filteredRecords = useMemo(() => {
    const query = studentQuery.trim().toLowerCase()
    const base = records.filter((record) => {
      if (selectedStudentId && record.student_id !== selectedStudentId) return false
      if (query && !record.student_name.toLowerCase().includes(query)) return false
      return true
    })
    return base.sort((a, b) =>
      avgSort === "desc"
        ? b.average_value - a.average_value
        : a.average_value - b.average_value
    )
  }, [records, selectedStudentId, studentQuery, avgSort])

  const studentOptions = useMemo(() => {
    return records
      .map((record) => ({ id: record.student_id, name: record.student_name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"))
  }, [records])

  const selectedStudent = useMemo(() => {
    if (!selectedStudentId) return null
    return records.find((record) => record.student_id === selectedStudentId) ?? null
  }, [records, selectedStudentId])

  useEffect(() => {
    const init = async () => {
      try {
        const me = await API.users.me()
        if (me.user.role !== "admin") {
          toast.error("У вас нет доступа")
          router.push("/")
          return
        }
        setUser(me.user)

        const [groupsRes, settingsRes] = await Promise.all([
          API.admin.getGroups(),
          API.admin.getSettings(),
        ])
        setGroups((groupsRes?.groups ?? []) as GroupItem[])
        setSettingsEnabled(typeof settingsRes?.settings?.["transcript.enabled"] === "boolean"
          ? settingsRes.settings["transcript.enabled"]
          : true)
      } catch (err) {
        const message = handleApiError(err)
        if (message === AUTH_REQUIRED_MESSAGE) {
          router.push(buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname }))
          return
        }
        toast.error(message)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [router, pathname])

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const studentParam = params.get("student")
    if (studentParam) {
      const parsed = Number(studentParam)
      setSelectedStudentId(Number.isFinite(parsed) ? parsed : null)
    }
  }, [])

  useEffect(() => {
    if (!selectedGroupId) {
      setSubjects([])
      setRecords([])
      setSelectedSubjectId(null)
      return
    }
    loadTranscript(selectedGroupId, selectedSubjectId)
  }, [selectedGroupId])

  useEffect(() => {
    if (!selectedGroupId) return
    if (!selectedSubjectId) return
    loadTranscript(selectedGroupId, selectedSubjectId)
  }, [selectedSubjectId])

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-medium">Загрузка данных...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50/50">
      <AdminSidebar />
      <div className={sidebarWidth + " transition-all duration-300"}>
        <AdminHeader userName={user?.name} userEmail={user?.email} />

        <main className="p-6 max-w-7xl mx-auto space-y-8">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Транскрипт</h1>
              <p className="text-slate-500 mt-1">Управление и публикация итоговых оценок</p>
            </div>
            
            {/* Global Actions */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleExportCsv}
                disabled={filteredRecords.length === 0}
                className="bg-white shadow-sm"
              >
                <Download className="w-4 h-4 mr-2" />
                Экспорт CSV
              </Button>
            </div>
          </div>

          {/* Settings Warning */}
          {!settingsEnabled && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-amber-800 shadow-sm">
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-medium">Транскрипт отключен</h3>
                <p className="text-sm text-amber-700 mt-1">Включите его в системных настройках, чтобы публиковать оценки.</p>
              </div>
            </div>
          )}

          {/* Filters & Actions Card */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-white p-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Selectors */}
                <div className="md:col-span-5 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                    <Filter className="w-4 h-4 text-slate-400" />
                    Параметры выборки
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Класс</Label>
                      <Select
                        value={selectedGroupId ? String(selectedGroupId) : ""}
                        onValueChange={(value) => setSelectedGroupId(value ? Number(value) : null)}
                      >
                        <SelectTrigger className="bg-slate-50/50">
                          <SelectValue placeholder="Выберите класс" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map((group) => (
                            <SelectItem key={group.id} value={String(group.id)}>
                              {group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Предмет</Label>
                      <Select
                        value={selectedSubjectId ? String(selectedSubjectId) : ""}
                        onValueChange={(value) => setSelectedSubjectId(value ? Number(value) : null)}
                        disabled={subjects.length === 0}
                      >
                        <SelectTrigger className="bg-slate-50/50">
                          <SelectValue placeholder={subjects.length ? "Выберите предмет" : "Нет предметов"} />
                        </SelectTrigger>
                        <SelectContent>
                          {subjects.map((subject) => (
                            <SelectItem key={subject.subject_id} value={String(subject.subject_id)}>
                              {subject.subject_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Divider on desktop */}
                <div className="hidden md:block md:col-span-1 relative">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-slate-100"></div>
                </div>

                {/* Actions */}
                <div className="md:col-span-6 space-y-4 flex flex-col justify-center">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                    <UploadCloud className="w-4 h-4 text-slate-400" />
                    Публикация
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={handlePublish}
                      disabled={!selectedGroupId || !selectedSubjectId || publishing || !settingsEnabled || !canPublish}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                    >
                      {publishing ? "Публикуем..." : "Опубликовать предмет"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handlePublishAll}
                      disabled={!selectedGroupId || subjects.length === 0 || publishing || !settingsEnabled || !canPublish}
                      className="shadow-sm"
                    >
                      Опубликовать все предметы
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Context Bar */}
            <div className="bg-slate-50 border-t border-slate-100 px-6 py-3 flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <Users className="w-4 h-4 text-slate-400" />
                <span>Класс: <strong className="text-slate-900">{selectedGroup?.name || "Не выбран"}</strong></span>
              </div>
              <div className="w-1 h-1 rounded-full bg-slate-300"></div>
              <div className="flex items-center gap-2 text-slate-600">
                <BookOpen className="w-4 h-4 text-slate-400" />
                <span>Предмет: <strong className="text-slate-900">{selectedSubject?.subject_name || "Не выбран"}</strong></span>
              </div>
            </div>
          </Card>

          {/* Main Content Area */}
          {selectedGroupId && selectedSubjectId ? (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Readiness */}
                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-slate-500">Готовность оценок</p>
                        <h3 className="text-2xl font-bold text-slate-900 mt-1">{progressPercent}%</h3>
                      </div>
                      <div className={`p-2 rounded-lg ${progressPercent === 100 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                        {progressPercent === 100 ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                      </div>
                    </div>
                    <div className="mt-4 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${progressPercent === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      {progressDone} из {progressTotal} оценок выставлено
                    </p>
                  </CardContent>
                </Card>

                {/* Average */}
                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-slate-500">Средняя по классу</p>
                        <h3 className="text-2xl font-bold text-slate-900 mt-1">
                          {classStats ? Math.round(classStats.avg) : "—"}
                        </h3>
                      </div>
                      <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                        <GraduationCap className="w-5 h-5" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Max */}
                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-slate-500">Максимальная</p>
                        <h3 className="text-2xl font-bold text-emerald-600 mt-1">
                          {classStats ? Math.round(classStats.max) : "—"}
                        </h3>
                      </div>
                      <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Min */}
                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-slate-500">Минимальная</p>
                        <h3 className="text-2xl font-bold text-rose-600 mt-1">
                          {classStats ? Math.round(classStats.min) : "—"}
                        </h3>
                      </div>
                      <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
                        <TrendingDown className="w-5 h-5" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Missing Students Warning */}
              {!canPublish && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-rose-800 shadow-sm">
                  <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-medium">Публикация недоступна: не все оценки выставлены</h3>
                    {totalLessons === 0 ? (
                      <p className="text-sm text-rose-700 mt-1">В классе пока нет уроков.</p>
                    ) : (
                      <p className="text-sm text-rose-700 mt-1">
                        Ученики без полных оценок: <span className="font-medium">{missingStudents.map((s) => s.name).join(", ")}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Data Section */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Left: Table */}
                <Card className="xl:col-span-2 border-slate-200 shadow-sm flex flex-col overflow-hidden">
                  <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-500" />
                      Успеваемость учеников
                    </h3>
                    
                    {/* Table Filters */}
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          className="h-9 pl-9 pr-3 w-[200px] rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                          value={studentQuery}
                          onChange={(e) => setStudentQuery(e.target.value)}
                          placeholder="Поиск ученика..."
                        />
                      </div>
                      <Select value={avgSort} onValueChange={(value) => setAvgSort(value as "asc" | "desc")}>
                        <SelectTrigger className="h-9 w-[140px]">
                          <SelectValue placeholder="Сортировка" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="desc">По убыванию</SelectItem>
                          <SelectItem value="asc">По возрастанию</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto bg-white">
                    <Table>
                      <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
                        <TableRow className="hover:bg-transparent border-slate-100">
                          <TableHead className="font-medium text-slate-600 pl-6">Ученик</TableHead>
                          <TableHead className="font-medium text-slate-600 text-center">Средняя</TableHead>
                          <TableHead className="font-medium text-slate-600 text-center">Предмет</TableHead>
                          <TableHead className="font-medium text-slate-600 text-right pr-6">Публикация</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRecords.length > 0 ? (
                          filteredRecords.map((record) => (
                            <TableRow 
                              key={record.student_id}
                              className={`cursor-pointer transition-colors ${selectedStudentId === record.student_id ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-slate-50'}`}
                              onClick={() => setSelectedStudentId(record.student_id)}
                            >
                              <TableCell className="font-medium text-slate-900 pl-6">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-medium text-xs">
                                    {record.student_name.charAt(0)}
                                  </div>
                                  {record.student_name}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary" className={`
                                  ${Math.round(record.average_value) >= 85 ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}
                                  ${Math.round(record.average_value) >= 70 && Math.round(record.average_value) < 85 ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' : ''}
                                  ${Math.round(record.average_value) < 70 ? 'bg-amber-100 text-amber-700 hover:bg-amber-100' : ''}
                                `}>
                                  {Math.round(record.average_value)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center text-slate-600">{selectedSubject?.subject_name || "—"}</TableCell>
                              <TableCell className="text-right text-slate-500 text-sm pr-6">
                                {record.published_at
                                  ? new Date(record.published_at).toLocaleDateString("ru-RU", { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="h-32 text-center text-slate-500">
                              Ничего не найдено
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </Card>

                {/* Right: Student Summary */}
                <div className="xl:col-span-1">
                  {selectedStudent ? (
                    <Card className="border-slate-200 shadow-sm sticky top-6">
                      <div className="p-6 flex flex-col items-center text-center border-b border-slate-100">
                        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold mb-4">
                          {selectedStudent.student_name.charAt(0)}
                        </div>
                        <h3 className="text-lg font-bold text-slate-900">{selectedStudent.student_name}</h3>
                        <p className="text-sm text-slate-500 mt-1">Сводка успеваемости</p>
                      </div>
                      <CardContent className="p-6 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-slate-50 rounded-xl p-4 text-center">
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 font-semibold">Средняя</p>
                            <p className="text-2xl font-bold text-slate-900">{Math.round(selectedStudent.average_value)}</p>
                          </div>
                          <div className="bg-slate-50 rounded-xl p-4 text-center flex flex-col justify-center">
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 font-semibold">Предмет</p>
                            <p className="text-sm font-bold text-slate-900 line-clamp-2" title={selectedSubject?.subject_name || "—"}>
                              {selectedSubject?.subject_name || "—"}
                            </p>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Последняя публикация</span>
                            <span className="font-medium text-slate-900">
                              {selectedStudent.published_at
                                ? new Date(selectedStudent.published_at).toLocaleDateString("ru-RU")
                                : "Нет данных"}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Статус</span>
                            <span className="font-medium text-emerald-600">
                              {selectedStudent.grade_count >= totalLessons ? "Готов" : "Ожидает"}
                            </span>
                          </div>
                        </div>

                        <Button
                          className="w-full"
                          onClick={() => router.push(`/analytics/transcript?student=${selectedStudent.student_id}`)}
                        >
                          <User className="w-4 h-4 mr-2" />
                          Подробный транскрипт
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className="border-slate-200 shadow-sm border-dashed bg-slate-50/50 h-full min-h-[400px] flex flex-col items-center justify-center text-center p-6">
                      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                        <User className="w-8 h-8 text-slate-400" />
                      </div>
                      <h3 className="text-slate-900 font-medium">Выберите ученика</h3>
                      <p className="text-sm text-slate-500 mt-2 max-w-[200px]">
                        Нажмите на строку в таблице, чтобы увидеть подробную сводку
                      </p>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Empty State */
            <Card className="border-slate-200 border-dashed shadow-sm bg-slate-50/50">
              <CardContent className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mb-4">
                  <BookOpen className="w-8 h-8 text-slate-400" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900">Выберите класс и предмет</h2>
                <p className="text-slate-500 mt-2 max-w-md">
                  Для просмотра и публикации транскрипта необходимо выбрать класс и предмет в панели фильтров выше.
                </p>
              </CardContent>
            </Card>
          )}

          {/* History Section */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-white pb-4">
              <CardTitle className="text-lg font-semibold flex items-center gap-2 text-slate-900">
                <History className="w-5 h-5 text-slate-500" />
                История публикаций
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 bg-white">
              {history.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  История публикаций пока пуста.
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow className="hover:bg-transparent border-slate-100">
                      <TableHead className="font-medium text-slate-600 pl-6">Дата и время</TableHead>
                      <TableHead className="font-medium text-slate-600">Предмет</TableHead>
                      <TableHead className="font-medium text-slate-600 text-center">Уроков</TableHead>
                      <TableHead className="font-medium text-slate-600 text-center">Учеников</TableHead>
                      <TableHead className="font-medium text-slate-600 pr-6">Автор</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((item) => (
                      <TableRow key={item.id} className="hover:bg-slate-50">
                        <TableCell className="pl-6 text-slate-900">
                          {item.published_at ? new Date(item.published_at).toLocaleString("ru-RU", {
                            day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          }) : "—"}
                        </TableCell>
                        <TableCell className="font-medium text-slate-700">
                          {item.subject_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-center text-slate-600">{item.total_lessons}</TableCell>
                        <TableCell className="text-center text-slate-600">{item.total_students}</TableCell>
                        <TableCell className="pr-6 text-slate-600">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium">
                              {item.actor_name?.charAt(0) || "?"}
                            </div>
                            {item.actor_name ?? "—"}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
