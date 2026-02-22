'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { API } from '@/lib/api'

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
  attendance_records: AttendanceRecord[]
}

type GradeItem = {
  id: number
  student_id: number
  attendance_record_id?: number | null
  value: number
  comment?: string | null
  grade_date?: string | null
  recorded_at?: string | null
  updated_at?: string | null
}

export function GradesTab({
  groupId,
  students,
  lessons,
}: {
  groupId: number
  students: Student[]
  lessons: Lesson[]
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [grades, setGrades] = useState<GradeItem[]>([])

  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null)

  const [draftValue, setDraftValue] = useState<Record<number, string>>({})
  const [draftComment, setDraftComment] = useState<Record<number, string>>({})

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

  const formatLessonLabel = (l: Lesson) => {
    const raw = l.start_time ?? l.lesson_date
    if (!raw) return `Урок #${l.id}`
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return `Урок #${l.id}`
    return d.toLocaleString('ru-RU')
  }

  useEffect(() => {
    const fetchGrades = async () => {
      setLoading(true)
      try {
        const res = await API.grades.teacherListByGroup(groupId)
        setGrades(res?.grades ?? [])

        const nextValue: Record<number, string> = {}
        const nextComment: Record<number, string> = {}
        for (const s of students) {
          nextValue[s.id] = ''
          nextComment[s.id] = ''
        }
        setDraftValue((prev) => ({ ...nextValue, ...prev }))
        setDraftComment((prev) => ({ ...nextComment, ...prev }))
      } catch (e) {
        console.error('Failed to load grades', e)
        setGrades([])
      } finally {
        setLoading(false)
      }
    }

    fetchGrades()
  }, [groupId, students])

  useEffect(() => {
    if (selectedLessonId == null && lessons && lessons.length > 0) {
      setSelectedLessonId(lessons[0]?.id ?? null)
    }
  }, [lessons, selectedLessonId])

  useEffect(() => {
    if (!selectedLesson) return

    const nextValue: Record<number, string> = {}
    const nextComment: Record<number, string> = {}
    for (const s of students) {
      const ar = attendanceByStudent.get(s.id)
      const g = ar ? gradeByAttendanceRecord.get(ar.id) : undefined

      nextValue[s.id] = g ? String(g.value) : ''
      nextComment[s.id] = g ? g.comment ?? '' : ''
    }
    setDraftValue(nextValue)
    setDraftComment(nextComment)
  }, [selectedLesson, students, attendanceByStudent, gradeByAttendanceRecord])

  const saveForStudent = async (studentId: number) => {
    const ar = attendanceByStudent.get(studentId)
    if (!ar) {
      alert('Сначала отметьте посещаемость (нет attendance записи для этого ученика на выбранный урок)')
      return
    }

    const raw = draftValue[studentId]
    const value = Number(raw)
    if (!Number.isFinite(value)) {
      alert('Введите число для оценки')
      return
    }

    setSaving(true)
    try {
      await API.grades.upsert({
        attendance_record_id: ar.id,
        value,
        comment: draftComment[studentId] ?? null,
      })

      const res = await API.grades.teacherListByGroup(groupId)
      setGrades(res?.grades ?? [])
      alert('Оценка сохранена')
    } catch (e) {
      console.error('Failed to save grade', e)
      alert('Не удалось сохранить оценку')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Оценки</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Оценка привязана к записи посещаемости (attendance). Выберите урок/дату и ставьте оценку тем
            ученикам, у кого уже сохранена посещаемость на выбранный урок.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Выбор урока</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2 items-center">
          <Label className="min-w-[80px]">Урок</Label>
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={selectedLesson?.id ?? ''}
            onChange={(e) => setSelectedLessonId(Number(e.target.value))}
          >
            {(lessons ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {formatLessonLabel(l)}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-sm text-muted-foreground">Загрузка оценок…</div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {students.map((s) => {
            const ar = attendanceByStudent.get(s.id)
            const existing = ar ? gradeByAttendanceRecord.get(ar.id) : undefined
            return (
              <Card key={s.id}>
                <CardHeader>
                  <CardTitle className="text-base">{s.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label>Оценка</Label>
                      <Input
                        value={draftValue[s.id] ?? ''}
                        onChange={(e) => setDraftValue((p) => ({ ...p, [s.id]: e.target.value }))}
                        placeholder="Напр. 10"
                      />
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <Label>Комментарий (опционально)</Label>
                      <Textarea
                        value={draftComment[s.id] ?? ''}
                        onChange={(e) => setDraftComment((p) => ({ ...p, [s.id]: e.target.value }))}
                        placeholder="Напр. хорошо держит ритм"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {!ar ? (
                        <span>Нет посещаемости на выбранный урок</span>
                      ) : null}
                      {existing ? (
                        <span>
                          Текущая: <b>{existing.value}</b>
                          {existing.comment ? ` — ${existing.comment}` : ''}
                        </span>
                      ) : (
                        <span>Оценки ещё нет</span>
                      )}
                    </div>

                    <Button disabled={saving} onClick={() => saveForStudent(s.id)}>
                      {saving ? 'Сохранение…' : 'Сохранить'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
