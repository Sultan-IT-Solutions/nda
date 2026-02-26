"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import { StudentHeader } from "@/components/student-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { API, AUTH_REQUIRED_MESSAGE, handleApiError, logout } from "@/lib/api"
import { buildLoginUrl, DEFAULT_SESSION_EXPIRED_MESSAGE } from "@/lib/auth"

interface UserData {
  id: number
  name: string
  email: string
  role: string
}

interface TranscriptItem {
  id: number
  group_id: number
  group_name: string
  subject_id: number
  subject_name: string
  subject_color?: string | null
  average_value: number
  grade_count: number
  published_at?: string | null
}

export default function TranscriptPage() {
  const router = useRouter()
  const pathname = usePathname()

  const [user, setUser] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<TranscriptItem[]>([])

  const handleLogout = () => {
    logout()
    toast.success("Вы успешно вышли из системы")
    router.push("/login")
  }

  useEffect(() => {
    const load = async () => {
      try {
        const me = await API.users.me()
        if (me.user.role !== "student") {
          router.push("/")
          return
        }
        setUser(me.user)

        const res = await API.transcript.getMy()
        setItems((res?.items ?? []) as TranscriptItem[])
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

    load()
  }, [router, pathname])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Загрузка транскрипта...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <StudentHeader user={user ?? undefined} onLogout={handleLogout} activePath="/transcript" />
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Транскрипт</h1>
          <p className="text-muted-foreground">Ваши опубликованные оценки по предметам</p>
        </div>

        {items.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Пока нет опубликованных оценок.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Опубликованные оценки</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-2 px-3">Класс</th>
                      <th className="py-2 px-3">Предмет</th>
                      <th className="py-2 px-3 text-center">Оценка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-t border-border/60 hover:bg-muted/40">
                        <td className="py-3 px-3">
                          <Badge variant="secondary">{item.group_name}</Badge>
                        </td>
                        <td className="py-3 px-3 font-medium">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: item.subject_color || "#6366F1" }}
                            />
                            {item.subject_name}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center font-semibold">
                          {Math.round(item.average_value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
