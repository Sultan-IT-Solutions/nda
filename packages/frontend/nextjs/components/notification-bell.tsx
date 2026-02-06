"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, Check, Trash, Calendar, CheckCircle, XCircle, Users, Lightning, Clock } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { API } from "@/lib/api"

interface Notification {
  id: number
  type: string
  group_id: number | null
  title: string
  message: string
  is_read: boolean
  action_url: string | null
  created_at: string
}

interface NotificationBellProps {
  accentColor?: string
}

export function NotificationBell({ accentColor = "bg-red-500" }: NotificationBellProps) {
  const router = useRouter()
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const fetchNotifications = async () => {
    try {
      setIsLoading(true)
      const data = await API.notifications.getAll(20)
      setNotifications(data.notifications || [])
      setUnreadCount(data.unread_count || 0)
    } catch (err) {
      console.error("Error fetching notifications:", err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const data = await API.notifications.getUnreadCount()
        setUnreadCount(data.unread_count || 0)
      } catch (err) {
        console.error("Error fetching unread count:", err)
      }
    }
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchNotifications()
    }
  }, [isOpen])

  const markAsRead = async (notificationId: number) => {
    try {
      await API.notifications.markAsRead(notificationId)
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (err) {
      console.error("Error marking notification as read:", err)
    }
  }

  const markAllAsRead = async () => {
    try {
      await API.notifications.markAllAsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (err) {
      console.error("Error marking all as read:", err)
    }
  }

  const deleteNotification = async (notificationId: number) => {
    try {
      await API.notifications.delete(notificationId)
      const notification = notifications.find(n => n.id === notificationId)
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId))
      if (notification && !notification.is_read) {
        setUnreadCount((prev) => Math.max(0, prev - 1))
      }
    } catch (err) {
      console.error("Error deleting notification:", err)
    }
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id)
    }
    if (notification.action_url) {
      setIsOpen(false)
      router.push(notification.action_url)
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "reschedule_request_approved":
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case "reschedule_request_rejected":
        return <XCircle className="w-5 h-5 text-red-600" />
      case "reschedule_request_submitted":
        return <Calendar className="w-5 h-5 text-orange-600" />
      case "lesson_rescheduled":
        return <Calendar className="w-5 h-5 text-blue-600" />
      case "lesson_cancelled":
        return <XCircle className="w-5 h-5 text-red-600" />
      case "added_to_group":
      case "removed_from_group":
        return <Users className="w-5 h-5 text-purple-600" />
      case "welcome":
        return <Lightning className="w-5 h-5 text-yellow-600" />
      default:
        return <Bell className="w-5 h-5 text-gray-600" />
    }
  }

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)

      if (diffMins < 1) return "Только что"
      if (diffMins < 60) return `${diffMins} мин.`
      if (diffHours < 24) return `${diffHours} ч.`
      if (diffDays < 7) return `${diffDays} дн.`

      return date.toLocaleDateString("ru-RU", { month: "short", day: "numeric" })
    } catch {
      return ""
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-tour="notifications"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className={`absolute -top-1 -right-1 min-w-5 h-5 px-1 ${accentColor} text-white text-xs rounded-full flex items-center justify-center font-medium`}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[450px] p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold">Уведомления</SheetTitle>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs">
                <Check className="w-3 h-3 mr-1" />
                Прочитать все
              </Button>
            )}
          </div>
          {unreadCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {unreadCount} непрочитанн{unreadCount === 1 ? "ое" : "ых"}
            </p>
          )}
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <Bell className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-muted-foreground text-sm">Нет уведомлений</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex gap-3 p-4 cursor-pointer transition-colors hover:bg-muted/50 ${
                    !notification.is_read ? "bg-blue-50/50" : ""
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-tight ${!notification.is_read ? "font-semibold" : "font-medium"}`}>
                      {notification.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {notification.message}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(notification.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {!notification.is_read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          markAsRead(notification.id)
                        }}
                        className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-green-600"
                        title="Отметить как прочитанное"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteNotification(notification.id)
                      }}
                      className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-red-600"
                      title="Удалить"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                  {!notification.is_read && (
                    <div className="flex-shrink-0 w-2 h-2 bg-purple-600 rounded-full mt-2" />
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
