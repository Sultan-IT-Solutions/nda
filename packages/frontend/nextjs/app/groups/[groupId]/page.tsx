"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Users, Calendar, MapPin, Clock, Plus, PencilSimple, Trash, X, Tag } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Toaster, toast } from 'sonner'
import AttendanceManager from "@/components/attendance-manager"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { API, isAuthenticated, logout, handleApiError } from "@/lib/api"

interface Group {
  id: number
  name: string
  capacity: number
  duration_minutes: number
  hall_id: number | null
  hall_name: string | null
  teacher_name: string | null
  teachers?: { id: number; name: string; is_main: boolean }[]
  category_name: string | null
  category_id: number | null
  enrolled: number
  isActive: boolean
  is_trial: boolean
  start_date: string | null
  end_date: string | null
  students: Student[]
  schedule: string
}

interface Student {
  id: number
  name: string
  email: string
  attendance_percentage: number
  total_points?: number
  max_points?: number
}

interface Hall {
  id: number
  name: string
  capacity: number
}

interface Teacher {
  id: number
  name: string
  email: string
}

interface AvailableStudent {
  id: number
  name: string
  email: string
}

export default function GroupDetailPage() {
  const router = useRouter()
  const params = useParams()
  const groupId = parseInt(params.groupId as string)

  const [loading, setLoading] = useState(true)
  const [group, setGroup] = useState<Group | null>(null)
  const [allHalls, setAllHalls] = useState<Hall[]>([])
  const [allTeachers, setAllTeachers] = useState<Teacher[]>([])
  const [allCategories, setAllCategories] = useState<any[]>([])
  const [availableStudents, setAvailableStudents] = useState<AvailableStudent[]>([])

  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    capacity: '',
    duration_minutes: '',
    hall_id: '',
    teacher_id: '',
    category_id: '',
    is_trial: false,
    start_date: '',
    end_date: ''
  })

  const [showAddStudentDialog, setShowAddStudentDialog] = useState(false)
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([])
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)

  const [scheduleForm, setScheduleForm] = useState({
    date: '',
    start_time: '15:00',
    end_time: '16:00',
    repeat_enabled: false,
    repeat_frequency: 'weekly',
    repeat_until: ''
  })

  const [attendanceRefreshKey, setAttendanceRefreshKey] = useState(0)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login")
      return
    }
    fetchGroupDetails()
    fetchHalls()
    fetchTeachers()
    fetchCategories()
    fetchAvailableStudents()
  }, [groupId])

  const fetchGroupDetails = async () => {
    try {
      const groupData = await API.admin.getGroupDetails(groupId)

      const formattedGroup: Group = {
        id: groupData.id,
        name: groupData.name,
        capacity: groupData.studentLimit,
        duration_minutes: groupData.duration_minutes,
        hall_id: groupData.hallId,
        hall_name: groupData.hallName,
        teacher_name: groupData.teacherName,
        teachers: groupData.teachers || [],
        category_name: groupData.category_name,
        category_id: groupData.category_id,
        enrolled: groupData.students?.length || 0,
        isActive: groupData.isActive,
        is_trial: groupData.is_trial || false,
        start_date: groupData.start_date || null,
        end_date: groupData.recurring_until || null,
        students: groupData.students || [],
        schedule: groupData.schedule || ""
      }

      setGroup(formattedGroup)

      setEditForm({
        name: groupData.name || '',
        capacity: groupData.studentLimit?.toString() || '',
        duration_minutes: groupData.duration_minutes?.toString() || '',
        hall_id: groupData.hallId?.toString() || '',
        teacher_id: groupData.teacherId?.toString() || '',
        category_id: groupData.category_id?.toString() || '',
        is_trial: groupData.is_trial || false,
        start_date: groupData.start_date || '',
        end_date: groupData.recurring_until || ''
      })

      setLoading(false)
    } catch (err) {
      console.error("Error fetching group details:", err)
      toast.error("Ошибка при загрузке данных группы")
      setLoading(false)
    }
  }

  const fetchHalls = async () => {
    try {
      const response = await API.admin.getHalls()
      setAllHalls(response.halls || [])
    } catch (err) {
      console.error("Error fetching halls:", err)
    }
  }

  const fetchTeachers = async () => {
    try {
      const response = await API.admin.getTeachers()
      setAllTeachers(response.teachers || [])
    } catch (err) {
      console.error("Error fetching teachers:", err)
    }
  }

  const fetchCategories = async () => {
    try {
      const response = await API.categories.getAll()
      setAllCategories(response || [])
    } catch (err) {
      console.error("Error fetching categories:", err)
    }
  }

  const fetchAvailableStudents = async () => {
    try {
      const response = await API.admin.getStudents()
      setAvailableStudents(response.students || [])
    } catch (err) {
      console.error("Error fetching students:", err)
    }
  }

  const handleSaveChanges = async () => {
    try {
      const updateData = {
        name: editForm.name,
        capacity: parseInt(editForm.capacity),
        duration_minutes: parseInt(editForm.duration_minutes),
        hall_id: editForm.hall_id ? parseInt(editForm.hall_id) : null,
        main_teacher_id: editForm.teacher_id && editForm.teacher_id !== "none" ? parseInt(editForm.teacher_id) : null,
        category_id: editForm.category_id && editForm.category_id !== "none" ? parseInt(editForm.category_id) : null,
        is_trial: editForm.is_trial,
        start_date: editForm.start_date || null,
        recurring_until: editForm.end_date || null
      }

      await API.admin.updateGroup(groupId, updateData)
      toast.success("Группа успешно обновлена")
      setIsEditing(false)
      fetchGroupDetails()
    } catch (err) {
      console.error("Error updating group:", err)
      toast.error("Ошибка при обновлении группы")
    }
  }

  const handleToggleGroupStatus = async () => {
    try {
      if (group?.isActive) {
        await API.admin.closeGroup(groupId)
        toast.success("Группа закрыта")
      } else {
        await API.admin.openGroup(groupId)
        toast.success("Группа открыта")
      }
      fetchGroupDetails()
    } catch (err) {
      console.error("Error toggling group status:", err)
      toast.error("Ошибка при изменении статуса группы")
    }
  }

  const handleDeleteGroup = async () => {
    try {
      await API.groups.delete(groupId, true)
      toast.success("Группа удалена")
      router.push("/groups")
    } catch (err: any) {
      console.error("Error deleting group:", err)
      const errorMessage = err.response?.data?.detail || err.message || "Ошибка при удалении группы"
      toast.error(errorMessage)
    }
  }

  const handleRemoveStudent = async (studentId: number) => {
    try {
      await API.admin.removeStudentFromGroup(groupId, studentId)
      toast.success("Студент удален из группы")
      fetchGroupDetails()
    } catch (err) {
      console.error("Error removing student:", err)
      toast.error("Ошибка при удалении студента")
    }
  }

  const handleAddTeacher = async (teacherId: number) => {
    try {
      await API.admin.addTeacherToGroup(groupId, teacherId)
      toast.success("Преподаватель добавлен к группе")
      setEditForm({...editForm, teacher_id: ""})
      fetchGroupDetails()
    } catch (err) {
      console.error("Error adding teacher:", err)
      toast.error("Ошибка при добавлении преподавателя")
    }
  }

  const handleRemoveTeacher = async (teacherId: number) => {
    try {
      await API.admin.removeTeacherFromGroup(groupId, teacherId)
      toast.success("Преподаватель удален из группы")
      fetchGroupDetails()
    } catch (err) {
      console.error("Error removing teacher:", err)
      toast.error("Ошибка при удалении преподавателя")
    }
  }

  const handleAddStudent = async () => {
    if (selectedStudentIds.length === 0) return

    try {
      for (const studentId of selectedStudentIds) {
        await API.admin.addStudentToGroup(groupId, studentId)
      }

      const count = selectedStudentIds.length
      toast.success(`${count} студент${count === 1 ? '' : count < 5 ? 'а' : 'ов'} добавлен${count === 1 ? '' : 'о'} в группу`)
      setShowAddStudentDialog(false)
      setSelectedStudentIds([])
      fetchGroupDetails()
    } catch (err) {
      console.error("Error adding students:", err)
      toast.error("Ошибка при добавлении студентов")
    }
  }

  const handleAddSchedule = async () => {

    if (!scheduleForm.date || !scheduleForm.start_time || !scheduleForm.end_time) {
      toast.error("Пожалуйста, заполните все обязательные поля")
      return
    }

    if (scheduleForm.start_time >= scheduleForm.end_time) {
      toast.error("Время начала должно быть раньше времени окончания")
      return
    }

    if (group?.start_date && group?.end_date) {
      const selectedDate = new Date(scheduleForm.date)
      const startDate = new Date(group.start_date)
      const endDate = new Date(group.end_date)

      if (selectedDate < startDate || selectedDate > endDate) {
        const formatDate = (date: string) => new Date(date).toLocaleDateString('ru-RU')
        toast.error(`Выбранная дата должна быть в пределах периода активности группы (${formatDate(group.start_date)} - ${formatDate(group.end_date)})`)
        return
      }
    }

    if (scheduleForm.repeat_enabled && scheduleForm.repeat_until) {
      const repeatUntilDate = new Date(scheduleForm.repeat_until)
      const selectedDate = new Date(scheduleForm.date)

      if (repeatUntilDate <= selectedDate) {
        toast.error("Дата окончания повтора должна быть позже первого занятия")
        return
      }

      if (group?.end_date && repeatUntilDate > new Date(group.end_date)) {
        const formatDate = (date: string) => new Date(date).toLocaleDateString('ru-RU')
        toast.error(`Дата окончания повтора не может быть позже окончания активности группы (${formatDate(group.end_date)})`)
        return
      }
    }

    try {
      const scheduleData = {
        date: scheduleForm.date,
        start_time: scheduleForm.start_time,
        end_time: scheduleForm.end_time,
        repeat_enabled: scheduleForm.repeat_enabled,
        repeat_frequency: scheduleForm.repeat_enabled ? scheduleForm.repeat_frequency : null,
        repeat_until: scheduleForm.repeat_enabled ? (scheduleForm.repeat_until || group?.end_date) : null
      }

      await API.admin.createGroupLessons(groupId, scheduleData)

      toast.success("Расписание добавлено")
      setShowScheduleDialog(false)
      setScheduleForm({ date: '', start_time: '15:00', end_time: '16:00', repeat_enabled: false, repeat_frequency: 'weekly', repeat_until: '' })
      fetchGroupDetails()

      setAttendanceRefreshKey(prev => prev + 1)
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.log("Schedule creation error:", err)
      }
      const errorMessage = handleApiError(err)
      toast.error(errorMessage)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Загрузка данных группы...</p>
        </div>
      </div>
    )
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">Группа не найдена</p>
          <Button onClick={() => router.push("/groups")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Вернуться к группам
          </Button>
        </div>
      </div>
    )
  }

  const dayNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"]

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" richColors />

      {}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => router.push("/groups")}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Назад к группам
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
                <p className="text-sm text-gray-500">{group.category_name || "Без категории"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge
                className={`${
                  group.isActive
                    ? "bg-green-100 text-green-800 border-green-200"
                    : "bg-red-100 text-red-800 border-red-200"
                }`}
              >
                {group.isActive ? "Активна" : "Закрыта"}
              </Badge>

              {isEditing ? (
                <div className="flex gap-2">
                  <Button onClick={handleSaveChanges} className="bg-green-600 hover:bg-green-700">
                    Сохранить
                  </Button>
                  <Button variant="outline" onClick={() => setIsEditing(false)}>
                    Отмена
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setIsEditing(true)} variant="outline">
                  <PencilSimple className="w-4 h-4 mr-2" />
                  Редактировать
                </Button>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant={group.isActive ? "destructive" : "default"}>
                    {group.isActive ? "Закрыть группу" : "Открыть группу"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {group.isActive ? "Закрыть группу?" : "Открыть группу?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {group.isActive
                        ? `Вы уверены, что хотите закрыть группу "${group.name}"? Новые студенты больше не смогут присоединиться в эту группу.`
                        : `Вы уверены, что хотите открыть группу "${group.name}"? Группа снова станет активной.`
                      }
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={handleToggleGroupStatus}>
                      {group.isActive ? "Закрыть" : "Открыть"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash className="w-4 h-4 mr-2" />
                    Удалить группу
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить группу?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Вы уверены, что хотите удалить группу "{group.name}"? Это действие необратимо и приведет к удалению всех данных группы, включая студентов и расписание.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteGroup} className="bg-red-600 hover:bg-red-700">
                      Удалить
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </div>

      {}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Информация о группе
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <>
                    <div>
                      <Label>Название:</Label>
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Вместимость:</Label>
                      <Input
                        type="number"
                        value={editForm.capacity}
                        onChange={(e) => setEditForm({...editForm, capacity: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Длительность (минуты):</Label>
                      <Input
                        type="number"
                        value={editForm.duration_minutes}
                        onChange={(e) => setEditForm({...editForm, duration_minutes: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Зал:</Label>
                      <Select value={editForm.hall_id || "none"} onValueChange={(value) => setEditForm({...editForm, hall_id: value === "none" ? "" : value})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите зал" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Не назначен</SelectItem>
                          {allHalls.map((hall) => (
                            <SelectItem key={hall.id} value={hall.id.toString()}>
                              {hall.name} (до {hall.capacity} чел.)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Преподаватель:</Label>
                      <div className="flex gap-2">
                        <Select
                          value={editForm.teacher_id || "none"}
                          onValueChange={(value) => {
                            if (value !== "none") {
                              handleAddTeacher(parseInt(value))
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите преподавателя" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Добавить преподавателя</SelectItem>
                            {allTeachers
                              .filter(t => !group?.teachers?.some(gt => gt.id === t.id))
                              .map((teacher) => (
                                <SelectItem key={teacher.id} value={teacher.id.toString()}>
                                  {teacher.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {group?.teachers && group.teachers.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {group.teachers.map((teacher) => (
                            <Badge key={teacher.id} variant="secondary" className="flex items-center gap-1 pr-1">
                              {teacher.name}
                              {teacher.is_main && <span className="text-xs">(основной)</span>}
                              <button
                                onClick={() => handleRemoveTeacher(teacher.id)}
                                className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                              >
                                <X size={14} />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <Label>Направление:</Label>
                      <Select value={editForm.category_id || "none"} onValueChange={(value) => setEditForm({...editForm, category_id: value === "none" ? "" : value})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите направление" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Не назначено</SelectItem>
                          {allCategories.map((category) => (
                            <SelectItem key={category.id} value={category.id.toString()}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Дата начала:</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal mt-1 h-10"
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            {editForm.start_date ? (
                              format(new Date(editForm.start_date), "dd/MM/yyyy", { locale: ru })
                            ) : (
                              <span className="text-gray-500">Выберите дату</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={editForm.start_date ? new Date(editForm.start_date) : undefined}
                            onSelect={(date) => {
                              if (date) {
                                setEditForm({...editForm, start_date: format(date, 'yyyy-MM-dd')})
                              }
                            }}
                            locale={ru}
                            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <Label>Дата окончания:</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal mt-1 h-10"
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            {editForm.end_date ? (
                              format(new Date(editForm.end_date), "dd/MM/yyyy", { locale: ru })
                            ) : (
                              <span className="text-gray-500">Выберите дату</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={editForm.end_date ? new Date(editForm.end_date) : undefined}
                            onSelect={(date) => {
                              if (date) {
                                setEditForm({...editForm, end_date: format(date, 'yyyy-MM-dd')})
                              } else {
                                setEditForm({...editForm, end_date: ''})
                              }
                            }}
                            locale={ru}
                            disabled={(date) => editForm.start_date ? date < new Date(editForm.start_date) : date < new Date(new Date().setHours(0, 0, 0, 0))}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is-trial"
                        checked={editForm.is_trial}
                        onChange={(e) => setEditForm({...editForm, is_trial: e.target.checked})}
                        className="rounded border-gray-300"
                      />
                      <Label htmlFor="is-trial" className="text-sm font-medium">
                        Пробный
                      </Label>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-600">Зал:</span>
                      <span className="font-medium">{group.hall_name || "Не назначен"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-600">Преподаватель:</span>
                      <span className="font-medium">{group.teacher_name || "Не назначен"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-600">Вместимость:</span>
                      <span className="font-medium">{group.enrolled}/{group.capacity}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-600">Длительность:</span>
                      <span className="font-medium">{group.duration_minutes} мин</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-600">Направление:</span>
                      <span className="font-medium">{group.category_name || "Не назначено"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-600">Дата начала:</span>
                      <span className="font-medium">{group.start_date ? new Date(group.start_date).toLocaleDateString('ru-RU') : "Не указана"}</span>
                    </div>
                    {group.end_date && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-600">Дата окончания:</span>
                        <span className="font-medium">{new Date(group.end_date).toLocaleDateString('ru-RU')}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-600">Тип:</span>
                      <Badge
                        variant={group.is_trial ? "default" : "secondary"}
                        className={group.is_trial ? "bg-purple-600" : ""}
                      >
                        {group.is_trial ? "Пробный" : "Обычный"}
                      </Badge>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Расписание
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setScheduleForm({
                        date: '',
                        start_time: '15:00',
                        end_time: '16:00',
                        repeat_enabled: false,
                        repeat_frequency: 'weekly',
                        repeat_until: ''
                      })
                      setShowScheduleDialog(true)
                    }}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              {group.schedule && group.schedule !== "Не назначено" && (
                <CardContent>
                  <div className="p-2 bg-gray-50 rounded">
                    <span className="text-sm">{group.schedule}</span>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>

          {}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Список студентов ({group.students.length})</CardTitle>
                  <Button onClick={() => setShowAddStudentDialog(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Добавить студента
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {group.students.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">Нет студентов в группе</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Имя</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Посещаемость</TableHead>
                        <TableHead className="text-right">Действия</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.students.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">{student.name}</TableCell>
                          <TableCell>{student.email}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Badge variant={student.attendance_percentage >= 80 ? "default" : "destructive"}>
                                {student.attendance_percentage}%
                              </Badge>
                              {student.max_points !== undefined && student.max_points > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  <div>Баллов: {student.total_points}/{student.max_points}</div>
                                  <div>За все занятия: {Math.round((student.total_points || 0) / student.max_points * 100)}%</div>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Trash className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Удалить студента?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Вы уверены, что хотите удалить {student.name} из группы?
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleRemoveStudent(student.id)}>
                                    Удалить
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Посещаемость</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Отметьте посещаемость занятий. Присутствовал=2/2, Уважительная=2/2, Опоздал=1/2, Отсутствовал=0/2.
                </p>
              </CardHeader>
              <CardContent>
                <AttendanceManager key={attendanceRefreshKey} groupId={groupId} onSave={fetchGroupDetails} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {}
      <Dialog open={showAddStudentDialog} onOpenChange={setShowAddStudentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить студента в группу</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="max-h-[300px] overflow-y-auto border rounded-lg">
              {availableStudents
                .filter(s => !group.students.some(gs => gs.id === s.id))
                .map((student) => {
                  const isSelected = selectedStudentIds.includes(student.id)
                  return (
                    <div
                      key={student.id}
                      className={`p-3 cursor-pointer hover:bg-gray-50 border-b last:border-b-0 flex items-center gap-3 ${
                        isSelected ? "bg-blue-50 border-blue-200" : ""
                      }`}
                      onClick={() => {
                        setSelectedStudentIds(prev =>
                          isSelected
                            ? prev.filter(id => id !== student.id)
                            : [...prev, student.id]
                        )
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium">{student.name}</div>
                        <div className="text-sm text-gray-600">{student.email}</div>
                      </div>
                    </div>
                  )
                })}
            </div>

            {/* Select All / Deselect All buttons */}
            {availableStudents.filter(s => !group.students.some(gs => gs.id === s.id)).length > 0 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const availableIds = availableStudents
                      .filter(s => !group.students.some(gs => gs.id === s.id))
                      .map(s => s.id)
                    setSelectedStudentIds(availableIds)
                  }}
                >
                  Выбрать всех
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedStudentIds([])}
                >
                  Снять выделение
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleAddStudent}
                disabled={selectedStudentIds.length === 0}
                className="flex-1"
              >
                Добавить {selectedStudentIds.length > 0 ? `(${selectedStudentIds.length})` : ''}
              </Button>
              <Button variant="outline" onClick={() => {
                setShowAddStudentDialog(false)
                setSelectedStudentIds([])
              }}>
                Отмена
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Добавить расписание</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {}
            {group?.start_date && group?.end_date && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-sm font-medium text-blue-900 mb-1">Период активности группы:</div>
                <div className="text-sm text-blue-700">
                  {new Date(group.start_date).toLocaleDateString('ru-RU')} - {new Date(group.end_date).toLocaleDateString('ru-RU')}
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  Занятия можно создавать только в рамках этого периода
                </div>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium">Дата занятия *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal mt-1 h-10"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {scheduleForm.date ? (
                      format(new Date(scheduleForm.date), "dd/MM/yyyy", { locale: ru })
                    ) : (
                      <span className="text-gray-500">Выберите дату</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={scheduleForm.date ? new Date(scheduleForm.date) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setScheduleForm({...scheduleForm, date: format(date, 'yyyy-MM-dd')})
                      }
                    }}
                    locale={ru}
                    disabled={(date) => {
                      const today = new Date(new Date().setHours(0, 0, 0, 0))
                      const startDate = group?.start_date ? new Date(group.start_date) : today
                      const endDate = group?.end_date ? new Date(group.end_date) : null
                      const minDate = startDate > today ? startDate : today
                      return date < minDate || (endDate ? date > endDate : false)
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">Время начала *</Label>
                <Input
                  type="time"
                  value={scheduleForm.start_time}
                  onChange={(e) => setScheduleForm({...scheduleForm, start_time: e.target.value})}
                  className="mt-1"
                  min="06:00"
                  max="23:00"
                  step="300"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Время окончания *</Label>
                <Input
                  type="time"
                  value={scheduleForm.end_time}
                  onChange={(e) => setScheduleForm({...scheduleForm, end_time: e.target.value})}
                  className="mt-1"
                  min="06:00"
                  max="23:59"
                  step="300"
                />
              </div>
            </div>

            {}
            {scheduleForm.start_time && scheduleForm.end_time && scheduleForm.start_time < scheduleForm.end_time && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-2">
                <div className="text-sm text-green-700">
                  Длительность: {Math.round((new Date(`2000-01-01T${scheduleForm.end_time}`).getTime() - new Date(`2000-01-01T${scheduleForm.start_time}`).getTime()) / (1000 * 60))} минут
                </div>
              </div>
            )}

            {}
            <div className="border-t pt-4">
              <div className="flex items-center space-x-2 mb-3">
                <input
                  type="checkbox"
                  id="repeat_enabled"
                  checked={scheduleForm.repeat_enabled}
                  onChange={(e) => setScheduleForm({...scheduleForm, repeat_enabled: e.target.checked})}
                  className="rounded"
                />
                <Label htmlFor="repeat_enabled" className="text-sm font-medium">Повторяющееся расписание</Label>
              </div>

              {scheduleForm.repeat_enabled && (
                <div className="space-y-3 bg-gray-50 rounded-lg p-3">
                  <div>
                    <Label className="text-sm font-medium">Частота повтора</Label>
                    <Select
                      value={scheduleForm.repeat_frequency}
                      onValueChange={(value) => setScheduleForm({...scheduleForm, repeat_frequency: value})}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Еженедельно</SelectItem>
                        <SelectItem value="biweekly">Каждые 2 недели</SelectItem>
                        <SelectItem value="monthly">Ежемесячно</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Повторять до</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal mt-1 h-10"
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {scheduleForm.repeat_until ? (
                            format(new Date(scheduleForm.repeat_until), "dd/MM/yyyy", { locale: ru })
                          ) : (
                            <span className="text-gray-500">Выберите дату</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={scheduleForm.repeat_until ? new Date(scheduleForm.repeat_until) : undefined}
                          onSelect={(date) => {
                            if (date) {
                              setScheduleForm({...scheduleForm, repeat_until: format(date, 'yyyy-MM-dd')})
                            } else {
                              setScheduleForm({...scheduleForm, repeat_until: ''})
                            }
                          }}
                          locale={ru}
                          disabled={(date) => {
                            const startDate = scheduleForm.date ? new Date(scheduleForm.date) : new Date()
                            const endDate = group?.end_date ? new Date(group.end_date) : null
                            return date < startDate || (endDate ? date > endDate : false)
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {scheduleForm.date && scheduleForm.repeat_until && scheduleForm.repeat_frequency && (
                    <div className="text-xs text-gray-600 bg-white rounded p-2">
                      <div className="font-medium mb-1">Предварительный план занятий:</div>
                      <div>
                        {(() => {
                          const startDate = new Date(scheduleForm.date)
                          const endDate = new Date(scheduleForm.repeat_until)
                          const frequency = scheduleForm.repeat_frequency
                          let count = 1
                          let current = new Date(startDate)

                          while (current <= endDate && count <= 10) {
                            if (count === 1) {
                              return `Первое: ${current.toLocaleDateString('ru-RU')} и еще ${frequency === 'weekly' ? 'еженедельно' : frequency === 'biweekly' ? 'каждые 2 недели' : 'ежемесячно'} до ${endDate.toLocaleDateString('ru-RU')}`
                            }
                            count++
                            if (frequency === 'weekly') current.setDate(current.getDate() + 7)
                            else if (frequency === 'biweekly') current.setDate(current.getDate() + 14)
                            else current.setMonth(current.getMonth() + 1)
                          }
                          return ''
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleAddSchedule}
                className="flex-1"
                disabled={!scheduleForm.date || !scheduleForm.start_time || !scheduleForm.end_time}
              >
                {scheduleForm.repeat_enabled ? 'Создать расписание' : 'Добавить занятие'}
              </Button>
              <Button variant="outline" onClick={() => {
                setShowScheduleDialog(false)
                setScheduleForm({ date: '', start_time: '15:00', end_time: '16:00', repeat_enabled: false, repeat_frequency: 'weekly', repeat_until: '' })
              }}>
                Отмена
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
