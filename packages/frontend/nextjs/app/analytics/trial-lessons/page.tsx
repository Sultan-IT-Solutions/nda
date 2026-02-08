"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AdminHeader } from "@/components/admin-header"
import { AdminSidebar } from "@/components/admin-sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useSidebar } from "@/hooks/use-sidebar"
import { API, AUTH_REQUIRED_MESSAGE, handleApiError } from "@/lib/api"
import { buildLoginUrl, DEFAULT_SESSION_EXPIRED_MESSAGE } from "@/lib/auth"
import { CaretDown, CaretUp, Minus, Plus } from "@phosphor-icons/react"
import { toast } from "sonner"

type TrialStudent = {
  id: number
  name: string
  email: string
  phone_number: string | null
  trials_allowed: number
  trials_used: number
  trials_remaining: number
}

type TrialUsage = {
  id: number
  used_at: string | null
  lesson_start_time: string | null
  group_name: string | null
  lesson_name: string | null
}

export default function TrialLessonsAdminPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { sidebarWidth } = useSidebar()

  const [user, setUser] = useState<{ name: string; email: string } | null>(null)
  const [students, setStudents] = useState<TrialStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingStudentId, setUpdatingStudentId] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const [expandedStudentId, setExpandedStudentId] = useState<number | null>(null)
  const [historyByStudentId, setHistoryByStudentId] = useState<Record<number, TrialUsage[]>>({})
  const [historyLoadingId, setHistoryLoadingId] = useState<number | null>(null)

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
  }, [students, search])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        let me: any
        try {
          me = await API.users.me()
        } catch (err) {
          const message = handleApiError(err)
          if (message === AUTH_REQUIRED_MESSAGE) {
            router.push(buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname }))
            return
          }
          throw err
        }

        if (me.user.role !== "admin") {
          toast.error("У вас нет доступа к этой странице")
          router.push("/")
          return
        }

        setUser(me.user)

        const data = await API.admin.getTrialLessonsStudents()
        setStudents((data.students || []) as TrialStudent[])
      } catch (err) {
        const message = handleApiError(err)
        toast.error(message)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [router, pathname])

  const adjust = async (student: TrialStudent, delta: number) => {
    setUpdatingStudentId(student.id)
    try {
      const res = await API.admin.adjustTrialLessons(student.id, delta)
      const updated = res.student as TrialStudent
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
      toast.success(delta > 0 ? "Добавлен пробный урок" : "Убран пробный урок")
    } catch (err) {
      const message = handleApiError(err)
      toast.error(message)
    } finally {
      setUpdatingStudentId(null)
    }
  }

  const toggleHistory = async (student: TrialStudent) => {
    const nextExpanded = expandedStudentId === student.id ? null : student.id
    setExpandedStudentId(nextExpanded)
    if (nextExpanded === null) return
    if (historyByStudentId[student.id]) return

    setHistoryLoadingId(student.id)
    try {
      const res = await API.admin.getTrialLessonsHistory(student.id)
      setHistoryByStudentId((prev) => ({ ...prev, [student.id]: (res.history || []) as TrialUsage[] }))
    } catch (err) {
      const message = handleApiError(err)
      toast.error(message)
    } finally {
      setHistoryLoadingId(null)
    }
  }

  const formatRuDateTime = (iso: string | null) => {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleString("ru-RU", {
      timeZone: "Asia/Almaty",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <AdminSidebar />

      <div className={sidebarWidth + " transition-all duration-300"}>
        <AdminHeader userName={user?.name} userEmail={user?.email} />

        <main className="p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-8">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Пробные уроки</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Остаток пробных уроков по ученикам
              </p>
            </div>

            <div className="w-full sm:w-[320px]">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по имени или email..."
              />
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ученики</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-muted-foreground">Загрузка...</div>
              ) : (
                <div className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ученик</TableHead>
                        <TableHead className="hidden md:table-cell">Email</TableHead>
                        <TableHead className="hidden lg:table-cell">Телефон</TableHead>
                        <TableHead className="text-right">Осталось</TableHead>
                        <TableHead className="hidden md:table-cell text-right">Разрешено</TableHead>
                        <TableHead className="hidden md:table-cell text-right">Использовано</TableHead>
                        <TableHead className="text-right">Действия</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                            Ничего не найдено
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredStudents.map((s) => {
                          const canDecrement = s.trials_allowed > s.trials_used
                          const busy = updatingStudentId === s.id
                          const isExpanded = expandedStudentId === s.id
                          const history = historyByStudentId[s.id]
                          const historyBusy = historyLoadingId === s.id
                          return (
                            <Fragment key={s.id}>
                              <TableRow>
                                <TableCell className="font-medium">{s.name}</TableCell>
                                <TableCell className="hidden md:table-cell">{s.email}</TableCell>
                                <TableCell className="hidden lg:table-cell">{s.phone_number || "—"}</TableCell>
                                <TableCell className="text-right tabular-nums">{s.trials_remaining}</TableCell>
                                <TableCell className="hidden md:table-cell text-right tabular-nums">{s.trials_allowed}</TableCell>
                                <TableCell className="hidden md:table-cell text-right tabular-nums">{s.trials_used}</TableCell>
                                <TableCell className="text-right">
                                  <div className="inline-flex items-center gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => toggleHistory(s)}
                                      disabled={historyBusy}
                                      title="История пробных уроков"
                                    >
                                      {isExpanded ? (
                                        <CaretUp className="w-4 h-4" />
                                      ) : (
                                        <CaretDown className="w-4 h-4" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => adjust(s, -1)}
                                      disabled={!canDecrement || busy}
                                      title="Убрать 1 пробный урок"
                                    >
                                      <Minus className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => adjust(s, +1)}
                                      disabled={busy}
                                      title="Добавить 1 пробный урок"
                                    >
                                      <Plus className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>

                              {isExpanded && (
                                <TableRow>
                                  <TableCell colSpan={7} className="bg-muted/30">
                                    {historyBusy ? (
                                      <div className="py-3 text-sm text-muted-foreground">Загрузка истории...</div>
                                    ) : history && history.length > 0 ? (
                                      <div className="py-2">
                                        <div className="text-xs text-muted-foreground mb-2">
                                          История списаний (показывает дату урока и дату списания) — последние {history.length}:
                                        </div>
                                        <div className="space-y-1 text-sm">
                                          {history.map((h) => (
                                            <div key={h.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                              <div className="font-medium">
                                                {h.lesson_name || h.group_name || "Пробный урок"}
                                              </div>
                                              <div className="text-muted-foreground">
                                                <div>
                                                  Урок: {h.lesson_start_time ? formatRuDateTime(h.lesson_start_time) : "—"}
                                                </div>
                                                <div>
                                                  Списано: {h.used_at ? formatRuDateTime(h.used_at) : "—"}
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="py-3 text-sm text-muted-foreground">История пока пустая</div>
                                    )}
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
