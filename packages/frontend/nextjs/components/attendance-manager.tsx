"use client"

import { useState, useEffect } from "react"
import { apiRequest } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Play, Check, X, Clock, UserX, Edit, Trash2, CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format, parse } from "date-fns"
import { ru } from "date-fns/locale"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface AttendanceStudent {
  id: number
  name: string
  email: string
  status?: string
}

interface LessonWithAttendance {
  id: number
  class_name: string
  start_time: string
  duration_minutes: number
  teacher_name?: string
  students: AttendanceStudent[]
  attendance_marked: boolean
}

interface AttendanceManagerProps {
  groupId: number
  onSave?: () => void
}

export default function AttendanceManager({ groupId, onSave }: AttendanceManagerProps) {
  const [lessons, setLessons] = useState<LessonWithAttendance[]>([])
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null)
  const [attendanceData, setAttendanceData] = useState<{ [studentId: number]: string }>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [lessonToDelete, setLessonToDelete] = useState<LessonWithAttendance | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({
    date: '',
    start_time: '',
    end_time: '',
    class_name: ''
  })

  useEffect(() => {
    fetchLessons()
  }, [groupId])

  const fetchLessons = async () => {
    try {
      const data = await apiRequest(`/admin/groups/${groupId}/lessons-attendance`)
      setLessons(data.lessons || [])
    } catch (error) {
      console.error('Error fetching lessons:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLessonSelect = (lessonId: number) => {
    const lesson = lessons.find(l => l.id === lessonId)
    if (!lesson) return

    setSelectedLessonId(lessonId)

    const initialData: { [studentId: number]: string } = {}
    lesson.students.forEach(student => {
      if (student.status) {
        initialData[student.id] = student.status
      }
    })
    setAttendanceData(initialData)
  }

  const handleStatusChange = (studentId: number, status: string) => {
    setAttendanceData(prev => {
      if (prev[studentId] === status) {
        return {
          ...prev,
          [studentId]: ''
        }
      }
      return {
        ...prev,
        [studentId]: status
      }
    })
  }

  const handleSaveAttendance = async () => {
    if (!selectedLessonId) return

    setSaving(true)
    try {
      const attendanceRecords = Object.entries(attendanceData)
        .filter(([_, status]) => status !== '' && status !== null)
        .map(([studentId, status]) => ({
          student_id: parseInt(studentId),
          status
        }))

      await apiRequest(`/admin/groups/${groupId}/lessons/${selectedLessonId}/attendance`, {
        method: 'POST',
        body: JSON.stringify({
          lesson_id: selectedLessonId,
          attendance: attendanceRecords
        })
      })

      await fetchLessons()
      setSelectedLessonId(null)
      setAttendanceData({})

      if (onSave) {
        onSave()
      }
    } catch (error) {
      console.error('Error saving attendance:', error)
    } finally {
      setSaving(false)
    }
  }

  const requestDeleteLesson = (lesson: LessonWithAttendance) => {
    setLessonToDelete(lesson)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteLesson = async () => {
    if (!lessonToDelete) return

    const lessonId = lessonToDelete.id

    setDeleting(lessonId)
    try {
      await apiRequest(`/admin/lessons/${lessonId}`, { method: 'DELETE' })
      await fetchLessons()
      if (selectedLessonId === lessonId) {
        setSelectedLessonId(null)
        setAttendanceData({})
      }
      toast.success('Занятие удалено')
      setDeleteDialogOpen(false)
      setLessonToDelete(null)
    } catch (error) {
      console.error('Error deleting lesson:', error)
      toast.error('Не удалось удалить занятие')
    } finally {
      setDeleting(null)
    }
  }

  const handleEditLesson = (lesson: LessonWithAttendance) => {
    const startTime = new Date(lesson.start_time)
    const endTime = new Date(startTime.getTime() + lesson.duration_minutes * 60000)

    setEditing(lesson.id)
    setEditForm({
      date: startTime.toISOString().split('T')[0],
      start_time: startTime.toTimeString().slice(0, 5),
      end_time: endTime.toTimeString().slice(0, 5),
      class_name: lesson.class_name
    })
  }

  const handleSaveEdit = async (lessonId: number) => {
    setSaving(true)
    try {

      const start = new Date(`2000-01-01T${editForm.start_time}`)
      const end = new Date(`2000-01-01T${editForm.end_time}`)
      const duration_minutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60))

      if (duration_minutes <= 0) {
        alert('Время окончания должно быть позже времени начала')
        setSaving(false)
        return
      }

      const startDateTime = `${editForm.date}T${editForm.start_time}:00`

      await apiRequest(`/admin/lessons/${lessonId}`, {
        method: 'PUT',
        body: JSON.stringify({
          class_name: editForm.class_name,
          start_time: startDateTime,
          duration_minutes: duration_minutes
        })
      })

      await fetchLessons()
      setEditing(null)
      setEditForm({ date: '', start_time: '', end_time: '', class_name: '' })
    } catch (error) {
      console.error('Error updating lesson:', error)
      alert('Error updating lesson')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditing(null)
    setEditForm({ date: '', start_time: '', end_time: '', class_name: '' })
  }

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'P': return <Check className="w-4 h-4 text-green-600" />
      case 'E': return <Clock className="w-4 h-4 text-blue-600" />
      case 'L': return <Clock className="w-4 h-4 text-yellow-600" />
      case 'A': return <UserX className="w-4 h-4 text-red-600" />
      default: return null
    }
  }

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'P': return <Badge variant="default" className="bg-green-600">Присутствовал</Badge>
      case 'E': return <Badge variant="default" className="bg-blue-600">Уважительная</Badge>
      case 'L': return <Badge variant="default" className="bg-yellow-600">Опоздал</Badge>
      case 'A': return <Badge variant="destructive">Отсутствовал</Badge>
      default: return <Badge variant="outline">Не отмечено</Badge>
    }
  }

  const selectedLesson = lessons.find(l => l.id === selectedLessonId)

  if (loading) {
    return <div className="text-center py-4">Загрузка занятий...</div>
  }

  if (lessons.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Занятия для этой группы не найдены.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <h3 className="text-lg font-semibold">Занятия</h3>

        <AlertDialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            setDeleteDialogOpen(open)
            if (!open) setLessonToDelete(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить занятие?</AlertDialogTitle>
              <AlertDialogDescription>
                {lessonToDelete
                  ? `Вы уверены, что хотите удалить занятие "${lessonToDelete.class_name}"? Это действие необратимо.`
                  : "Вы уверены, что хотите удалить это занятие? Это действие необратимо."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={lessonToDelete ? deleting === lessonToDelete.id : false}>
                Отмена
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteLesson}
                disabled={lessonToDelete ? deleting === lessonToDelete.id : false}
                className="bg-red-600 hover:bg-red-700"
              >
                {lessonToDelete && deleting === lessonToDelete.id ? "Удаление..." : "Удалить"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {lessons.map((lesson) => {

          const startTime = new Date(lesson.start_time)
          const endTime = new Date(startTime.getTime() + lesson.duration_minutes * 60000)

          return (
            <div key={lesson.id} className="space-y-4">
              <Card className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h4 className="font-medium">{lesson.class_name}</h4>
                      {lesson.attendance_marked && (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          <Check className="w-3 h-3 mr-1" />
                          Отмечено
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {startTime.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}{' '}
                      {startTime.toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                      {' - '}
                      {endTime.toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                      {lesson.teacher_name && ` • ${lesson.teacher_name}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      variant={selectedLessonId === lesson.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleLessonSelect(lesson.id)}
                      title="Mark Attendance"
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      title="Edit Lesson"
                      onClick={() => handleEditLesson(lesson)}
                      disabled={editing === lesson.id || selectedLessonId === lesson.id}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      title="Delete Lesson"
                      className="text-red-600 hover:text-red-700 hover:border-red-300"
                      onClick={() => requestDeleteLesson(lesson)}
                      disabled={deleting === lesson.id}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>

              {editing === lesson.id && (
                <Card>
                  <CardHeader>
                    <CardTitle>Редактировать занятие - {lesson.class_name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="class_name">Название занятия</Label>
                          <Input
                            id="class_name"
                            value={editForm.class_name}
                            onChange={(e) => setEditForm({ ...editForm, class_name: e.target.value })}
                            placeholder="Введите название занятия"
                          />
                        </div>
                        <div>
                          <Label htmlFor="date">Дата</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="w-full justify-start text-left font-normal"
                              >
                                <CalendarDays className="mr-2 h-4 w-4" />
                                {editForm.date ? format(parse(editForm.date, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy', { locale: ru }) : "Выберите дату"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={editForm.date ? parse(editForm.date, 'yyyy-MM-dd', new Date()) : undefined}
                                onSelect={(date) => {
                                  if (date) {
                                    setEditForm({ ...editForm, date: format(date, 'yyyy-MM-dd') })
                                  }
                                }}
                                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                initialFocus
                                locale={ru}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="start_time">Время начала</Label>
                          <Input
                            id="start_time"
                            type="time"
                            value={editForm.start_time}
                            onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label htmlFor="end_time">Время окончания</Label>
                          <Input
                            id="end_time"
                            type="time"
                            value={editForm.end_time}
                            onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="flex gap-3 pt-4">
                        <Button
                          onClick={() => handleSaveEdit(lesson.id)}
                          disabled={saving || !editForm.class_name || !editForm.date || !editForm.start_time || !editForm.end_time}
                        >
                          {saving ? "Сохранение..." : "Сохранить изменения"}
                        </Button>
                        <Button variant="outline" onClick={handleCancelEdit}>
                          Отмена
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedLessonId === lesson.id && (
                <Card>
                  <CardHeader>
                    <CardTitle>Отметить посещаемость - {lesson.class_name}</CardTitle>
                    <div className="text-sm text-muted-foreground">
                      {startTime.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}{' '}
                      {startTime.toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                      {' - '}
                      {endTime.toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="text-sm text-muted-foreground">
                        <strong>Баллы:</strong> Присутствовал = 2/2, Уважительная = 2/2, Опоздал = 1/2, Отсутствовал = 0/2
                      </div>

                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Студент</TableHead>
                            <TableHead>Текущий статус</TableHead>
                            <TableHead>Отметить</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lesson.students.map((student) => (
                            <TableRow key={student.id}>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{student.name}</div>
                                  <div className="text-sm text-muted-foreground">{student.email}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {getStatusBadge(student.status)}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  {(['P', 'E', 'L', 'A'] as const).map((status) => (
                                    <Button
                                      key={status}
                                      variant={attendanceData[student.id] === status ? "default" : "outline"}
                                      size="sm"
                                      onClick={() => handleStatusChange(student.id, status)}
                                      className={cn(
                                        "w-10 h-10 p-0",
                                        status === 'P' && attendanceData[student.id] === status && "bg-green-600 hover:bg-green-700",
                                        status === 'E' && attendanceData[student.id] === status && "bg-blue-600 hover:bg-blue-700",
                                        status === 'L' && attendanceData[student.id] === status && "bg-yellow-600 hover:bg-yellow-700",
                                        status === 'A' && attendanceData[student.id] === status && "bg-red-600 hover:bg-red-700"
                                      )}
                                      title={
                                        status === 'P' ? 'Присутствовал (2/2)' :
                                        status === 'E' ? 'Уважительная (2/2)' :
                                        status === 'L' ? 'Опоздал (1/2)' :
                                        'Отсутствовал (0/2)'
                                      }
                                    >
                                      {status}
                                    </Button>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      <div className="flex gap-3 pt-4">
                        <Button onClick={handleSaveAttendance} disabled={saving}>
                          {saving ? "Сохранение..." : "Сохранить посещаемость"}
                        </Button>
                        <Button variant="outline" onClick={() => {
                          setSelectedLessonId(null)
                          setAttendanceData({})
                        }}>
                          Отмена
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
