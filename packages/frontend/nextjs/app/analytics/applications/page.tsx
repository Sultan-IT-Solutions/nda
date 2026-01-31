"use client"

import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AdminSidebar } from "@/components/admin-sidebar"
import { AdminHeader } from "@/components/admin-header"
import { useSidebar } from "@/hooks/use-sidebar"
import {
  Calendar,
  Clock,
  Users,
  CheckCircle,
  XCircle,
  Loader,
  AlertCircle,
  ChartBar
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { formatTimeWithGMT5, formatDateWithGMT5 } from "@/lib/utils"
import { API, AUTH_REQUIRED_MESSAGE, handleApiError, logout } from "@/lib/api"
import { DEFAULT_SESSION_EXPIRED_MESSAGE, buildLoginUrl } from "@/lib/auth"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface UserData {
  id: number
  name: string
  email: string
  role: string
}

interface RescheduleRequest {
  id: number
  type?: string
  lesson_id?: number
  group_id?: number
  group_name: string
  teacher_id?: number
  teacher_name: string
  requested_by: string
  current_time: string
  new_time: string
  new_date?: string
  original_start_time?: string
  new_start_time?: string
  reason: string
  status: "pending" | "approved" | "rejected"
  created_at: string
  admin_response?: string
  class_name: string
}

export default function ApplicationsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { sidebarWidth } = useSidebar()
  const [user, setUser] = useState<UserData | null>(null)
  const [requests, setRequests] = useState<RescheduleRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const userData = await API.users.me()
        setUser(userData.user)

        if (userData.user.role !== "admin") {
          router.push("/")
          return
        }

        await fetchRescheduleRequests()
      } catch (error) {
        console.error("Failed to fetch user data:", error)
        const message = handleApiError(error)
        if (message === AUTH_REQUIRED_MESSAGE) {
          router.push(
            buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname })
          )
          return
        }
        router.push("/login")
      }
    }

    checkAuth()
  }, [router])

  const fetchRescheduleRequests = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const data = await API.admin.getRescheduleRequests()
      setRequests(data.requests || [])
    } catch (err) {
      console.error("[Applications] Error fetching requests:", err)
      handleApiError(err)
      setError(err instanceof Error ? err.message : "Ошибка при загрузке заявок")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRequestAction = async (
    requestId: number,
    action: "approve" | "reject",
    comment?: string
  ) => {
    try {
      if (action === "approve") {
        await API.admin.approveRescheduleRequest(requestId)
      } else {
        await API.admin.rejectRescheduleRequest(requestId)
      }

      await fetchRescheduleRequests()
    } catch (err) {
      console.error(`Error ${action}ing request:`, err)
      handleApiError(err)
      setError(err instanceof Error ? err.message : "Ошибка при обработке заявки")
    }
  }

  const handleLogout = () => {
    logout()
    router.push("/login")
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "text-yellow-600 bg-yellow-100"
      case "approved":
        return "text-green-600 bg-green-100"
      case "rejected":
        return "text-red-600 bg-red-100"
      default:
        return "text-gray-600 bg-gray-100"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "pending":
        return "Ожидает рассмотрения"
      case "approved":
        return "Одобрено"
      case "rejected":
        return "Отклонено"
      default:
        return status
    }
  }

  const userProfile = {
    initials: user?.name
      ? user.name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)
      : "АД",
    email: user?.email || "Не указано",
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar />


      <main className={sidebarWidth + " transition-all duration-300 min-h-screen"}>
        <AdminHeader userName={user?.name} userEmail={user?.email} />

        
        <div className="p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Заявки на перенос занятий</h1>
            <p className="text-gray-600 text-sm mt-1">
              Управление заявками от преподавателей на изменение расписания
            </p>
          </div>

          
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Loader className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Загрузка заявок...</p>
              </div>
            </div>
          )}

        
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-600 text-sm font-medium">Ошибка: {error}</p>
            </div>
          )}

        
          {!isLoading && !error && requests.length === 0 && (
            <div className="text-center py-16">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 text-lg font-medium mb-2">Нет заявок</p>
              <p className="text-gray-500 text-sm">
                На данный момент нет заявок от преподавателей на перенос занятий.
              </p>
            </div>
          )}

        
          {!isLoading && !error && requests.length > 0 && (
            <div className="space-y-6">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        {request.group_name}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Преподаватель: {request.teacher_name}
                      </p>
                    </div>
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                        request.status
                      )}`}
                    >
                      {getStatusText(request.status)}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Запланированное время
                      </h4>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-sm font-medium">
                          {request.current_time ? formatDateWithGMT5(request.current_time) : "Не указано"}
                        </p>
                        <p className="text-sm text-gray-600">
                          {request.current_time ? formatTimeWithGMT5(request.current_time) : ""}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Предлагаемое время
                      </h4>
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <p className="text-sm font-medium text-blue-900">
                          {formatDateWithGMT5(request.new_start_time || request.new_time)}
                        </p>
                        <p className="text-sm text-blue-700">
                          {formatTimeWithGMT5(request.new_start_time || request.new_time)}
                        </p>
                      </div>
                    </div>
                  </div>

                  
                  {request.reason && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Причина переноса
                      </h4>
                      <div className="bg-yellow-50 p-3 rounded-lg">
                        <p className="text-sm text-gray-700">{request.reason}</p>
                      </div>
                    </div>
                  )}

                
                  {request.admin_response && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">
                        Комментарий администратора
                      </h4>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-sm text-gray-700">
                          {request.admin_response}
                        </p>
                      </div>
                    </div>
                  )}

                
                  {request.status === "pending" && (
                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                      <Button
                        onClick={() =>
                          handleRequestAction(request.id, "approve")
                        }
                        className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Одобрить
                      </Button>
                      <Button
                        onClick={() =>
                          handleRequestAction(
                            request.id,
                            "reject",
                            "Заявка отклонена администратором"
                          )
                        }
                        variant="outline"
                        className="border-red-300 text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <XCircle className="w-4 h-4" />
                        Отклонить
                      </Button>
                    </div>
                  )}

                  
                  <div className="pt-4 border-t border-gray-100 mt-4">
                    <p className="text-xs text-gray-500">
                      Заявка подана:{" "}
                      {formatDateWithGMT5(request.created_at)} в{" "}
                      {formatTimeWithGMT5(request.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
