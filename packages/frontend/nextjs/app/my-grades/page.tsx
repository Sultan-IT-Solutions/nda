"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { API, handleApiError } from "@/lib/api"
import { buildLoginUrl, DEFAULT_SESSION_EXPIRED_MESSAGE } from "@/lib/auth"

type GradeItem = {
  id: number
  group_id: number
  group_name: string
  value: number
  comment?: string | null
  grade_date?: string | null
  updated_at?: string | null
  teacher_name?: string | null
}

export default function MyGradesPage() {
  const router = useRouter()
  const pathname = usePathname()

  const [loading, setLoading] = useState(true)
  const [grades, setGrades] = useState<GradeItem[]>([])

  useEffect(() => {
    const run = async () => {
      try {
        let me: any
        try {
          me = await API.users.me()
        } catch (err) {
          const message = handleApiError(err)
          if (message.includes("Требуется авторизация")) {
            router.push(buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname }))
            return
          }
          throw err
        }

        if (me?.user?.role !== "student") {
          router.push("/")
          return
        }

        const res = await API.grades.studentMy()
        setGrades(res?.grades ?? [])
      } catch (e) {
        console.error(e)
        handleApiError(e)
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <h1 className="text-3xl font-bold">Мои оценки</h1>

        {loading ? (
          <div className="text-muted-foreground">Загрузка…</div>
        ) : grades.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-muted-foreground">Оценок пока нет</CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {grades.map((g) => (
              <Card key={g.id}>
                <CardHeader>
                  <CardTitle className="text-base">{g.group_name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-2xl font-bold">{g.value}</div>
                  {g.comment ? <div className="text-sm">{g.comment}</div> : null}
                  <div className="text-xs text-muted-foreground">
                    {g.teacher_name ? `Преподаватель: ${g.teacher_name} · ` : ""}
                    {g.updated_at ? `Обновлено: ${new Date(g.updated_at).toLocaleString("ru-RU")}` : ""}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
