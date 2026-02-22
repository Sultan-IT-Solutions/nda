"use client"

import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Users, Clock, MapPin, Plus, Loader } from "lucide-react"
import RescheduleLessonModal from "@/components/reschedule-lesson-modal"
import CreateGroupModal from "@/components/create-group-modal"
import { TeacherHeader } from "@/components/teacher-header"
import { Button } from "@/components/ui/button"
import { toast } from 'sonner'
import { formatTimeWithGMT5, formatDateWithGMT5 } from "@/lib/utils"
import { buildLoginUrl, DEFAULT_SESSION_EXPIRED_MESSAGE } from "@/lib/auth"
import { API, AUTH_REQUIRED_MESSAGE, handleApiError, logout } from "@/lib/api"

interface Group {
  id: number
  name: string
  start_time: string
  end_time: string
  duration_minutes: number
  hall_name?: string
  student_count: number
  capacity: number
  is_closed: boolean
  schedule?: string
  recurring_days?: string
  recurring_until?: string
}

interface UserData {
  id: number
  name: string
  email: string
  role: string
}

export default function TeacherGroupsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<UserData | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false)
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false)
  const [selectedLesson, setSelectedLesson] = useState<any>(null)

  const handleLogout = () => {
    logout()
    toast.success("Вы успешно вышли из системы")
    router.push("/login")
  }

  useEffect(() => {
    const checkRoleAndFetch = async () => {
      try {
        const userData = await API.users.me()
        setUser(userData.user)

        if (userData.user.role === 'student') {
          router.push('/my-groups')
          return
        }

        if (userData.user.role !== 'teacher') {
          setError("У вас нет доступа к этой странице")
          setIsLoading(false)
          return
        }

        await fetchTeacherGroups()
      } catch (err) {
        console.error("Error checking role:", err)
        const message = handleApiError(err)
        if (message === AUTH_REQUIRED_MESSAGE) {
          router.push(buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname }))
          return
        }

        toast.error(message)
        setError("Ошибка при проверке доступа")
        setIsLoading(false)
      }
    }

    checkRoleAndFetch()
  }, [])

  const fetchTeacherGroups = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const groupsData = await API.teachers.getMyGroups()

      setGroups(groupsData.groups || [])
    } catch (err) {
      console.error("[Teacher Groups] Error fetching groups:", err)
      handleApiError(err)
      setError(err instanceof Error ? err.message : "Ошибка при загрузке данных")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRescheduleLesson = (rescheduleData: any) => {
    }

  const openRescheduleModal = (group: Group) => {

    let date, time;

    if (!group.start_time || group.start_time === '') {

      const now = new Date();
      date = now.toISOString().split('T')[0];
      time = '09:00';

      alert('Внимание: У группы не указано расписание. Используется время по умолчанию: сегодня в 09:00. Вы можете изменить его в форме переноса.');
    } else {
      date = formatDateForInput(group.start_time);
      time = formatTimeForInput(group.start_time);
    }

    const mockLesson = {
      groupId: group.id,
      groupName: group.name,
      date: date,
      time: time,
      duration: group.duration_minutes || 60
    }
    setSelectedLesson(mockLesson)
    setIsRescheduleOpen(true)
  }

  const handleCreateGroup = (groupData: any) => {
    fetchTeacherGroups()
  }

  const handleManageGroup = (groupId: number, groupName: string) => {
    router.push(`/teacher-groups/manage-group/${groupId}`)
  }

  const formatTime = (startTime: string) => {
    return formatTimeWithGMT5(startTime)
  }

  const formatDate = (startTime: string) => {
    return formatDateWithGMT5(startTime)
  }

  const formatDateForInput = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toISOString().split('T')[0]
    } catch {
      return new Date().toISOString().split('T')[0]
    }
  }

  const formatTimeForInput = (dateString: string) => {
    try {
      const date = new Date(dateString)
      const hours = date.getHours().toString().padStart(2, '0')
      const minutes = date.getMinutes().toString().padStart(2, '0')
      return `${hours}:${minutes}`
    } catch {
      return '09:00'
    }
  }

  const getAttendanceButtonClass = (baseClass: string, isSelected: boolean) => {
    return `${baseClass} ${isSelected ? 'ring-2 ring-offset-1' : 'hover:scale-105'} transition-all`
  }

  return (
    <div className="min-h-screen bg-background">
      <TeacherHeader user={user} onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Мои группы</h1>
          <p className="text-gray-600 text-sm">Управляйте вашими группами и расписанием</p>
        </div>

        {isLoading && (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <Loader className="animate-spin w-8 h-8 mx-auto mb-4 text-blue-600" />
                  <p className="text-gray-600">Загрузка групп...</p>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-red-600 text-sm">{error}</p>
                {error.includes("teachers may view") && (
                  <p className="text-red-500 text-xs mt-1">
                    Возможно, проблема с аутентификацией. Попробуйте войти заново.
                  </p>
                )}
              </div>
            )}

            {!isLoading && !error && groups.length === 0 && (
              <div className="text-center py-16">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-lg font-medium mb-2">Нет назначенных групп</p>
                <p className="text-gray-500 text-sm mb-6">
                  К вам пока не назначены группы для преподавания.
                </p>
              </div>
            )}

            {!isLoading && !error && groups.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groups.map((group) => (
                  <div
                    key={group.id}
                    className={`bg-white rounded-2xl border-2 p-6 transition-all hover:shadow-lg cursor-pointer ${
                      group.is_closed
                        ? 'border-gray-300 bg-gray-50 opacity-75'
                        : 'border-purple-200 hover:border-purple-400'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-lg font-bold text-gray-900">{group.name}</h3>
                      {group.is_closed && (
                        <span className="px-2 py-1 bg-gray-200 text-gray-600 text-xs font-medium rounded-full">
                          Закрыта
                        </span>
                      )}
                    </div>

                    <div className="space-y-3 mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                          <Clock className="w-4 h-4 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Расписание</p>
                          <p className="text-sm font-medium text-gray-900">
                            {group.schedule || "Не назначено"}
                          </p>
                        </div>
                      </div>

                      {group.hall_name && (
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                            <MapPin className="w-4 h-4 text-orange-600" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-600">Зал</p>
                            <p className="text-sm font-medium text-gray-900">{group.hall_name}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center">
                          <Users className="w-4 h-4 text-pink-600" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Студенты</p>
                          <p className="text-sm font-medium text-gray-900">
                            {group.student_count} / {group.capacity}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-gray-600 mb-4">Продолжительность: {group.duration_minutes} минут</div>

                    <div className="space-y-2">
                      <Button
                        onClick={() => handleManageGroup(group.id, group.name)}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-2 rounded-lg transition"
                      >
                        Управлять группой
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
      </main>

      <RescheduleLessonModal
        isOpen={isRescheduleOpen}
        onCloseAction={() => setIsRescheduleOpen(false)}
        onSubmitAction={handleRescheduleLesson}
        currentLesson={selectedLesson}
      />

      <CreateGroupModal
        isOpen={isCreateGroupOpen}
        onCloseAction={() => setIsCreateGroupOpen(false)}
        onSubmitAction={handleCreateGroup}
      />
    </div>
  )
}
