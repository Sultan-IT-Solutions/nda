"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"

import { AdminHeader } from "@/components/admin-header"
import { AdminSidebar } from "@/components/admin-sidebar"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { useSidebar } from "@/hooks/use-sidebar"
import { API, AUTH_REQUIRED_MESSAGE, handleApiError } from "@/lib/api"
import { buildLoginUrl, DEFAULT_SESSION_EXPIRED_MESSAGE } from "@/lib/auth"

type SettingsState = {
  registrationEnabled: boolean
  trialLessonsEnabled: boolean
}

export default function AdminSettingsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { sidebarWidth } = useSidebar()

  const [user, setUser] = useState<{ name: string; email: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatingKey, setUpdatingKey] = useState<string | null>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTitle, setConfirmTitle] = useState("")
  const [confirmDescription, setConfirmDescription] = useState("")
  const [pendingPatch, setPendingPatch] = useState<{
    key: "registration" | "trial"
    value: boolean
  } | null>(null)

  const [settings, setSettings] = useState<SettingsState>({
    registrationEnabled: true,
    trialLessonsEnabled: true,
  })

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

        const res = await API.admin.getSettings()
        const s = res?.settings ?? {}

        setSettings({
          registrationEnabled: typeof s["registration.enabled"] === "boolean" ? s["registration.enabled"] : true,
          trialLessonsEnabled: typeof s["trial_lessons.enabled"] === "boolean" ? s["trial_lessons.enabled"] : true,
        })
      } catch (err) {
        const message = handleApiError(err)
        toast.error(message)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [router, pathname])

  const openToggleConfirm = (key: "registration" | "trial", nextValue: boolean) => {
    setPendingPatch({ key, value: nextValue })
    if (key === "registration") {
      setConfirmTitle(nextValue ? "Включить регистрацию?" : "Отключить регистрацию?")
      setConfirmDescription(
        nextValue
          ? "Новые пользователи смогут регистрироваться."
          : "Новые пользователи не смогут регистрироваться, пока вы снова не включите регистрацию.",
      )
    } else {
      setConfirmTitle(nextValue ? "Включить пробные уроки?" : "Отключить пробные уроки?")
      setConfirmDescription(
        nextValue
          ? "Ученики смогут записываться на пробные уроки, и админ аналитика будет доступна."
          : "Запись учениками на пробные уроки, а так же админ аналитика пробных уроков будут отключены.",
      )
    }
    setConfirmOpen(true)
  }

  const applyPendingToggle = async () => {
    if (!pendingPatch) return
    setUpdatingKey(pendingPatch.key)
    try {
      const res =
        pendingPatch.key === "registration"
          ? await API.admin.updateSettings({ registration_enabled: pendingPatch.value })
          : await API.admin.updateSettings({ trial_lessons_enabled: pendingPatch.value })

      const s = res?.settings ?? {}
      setSettings((prev) => ({
        ...prev,
        registrationEnabled: typeof s["registration.enabled"] === "boolean" ? s["registration.enabled"] : prev.registrationEnabled,
        trialLessonsEnabled: typeof s["trial_lessons.enabled"] === "boolean" ? s["trial_lessons.enabled"] : prev.trialLessonsEnabled,
      }))
      toast.success("Изменение применено")
    } catch (err) {
      const message = handleApiError(err)
      toast.error(message)
    } finally {
      setUpdatingKey(null)
      setConfirmOpen(false)
      setPendingPatch(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar />

      <div className={sidebarWidth + " transition-all duration-300"}>
        <AdminHeader userName={user?.name} userEmail={user?.email} />

        <main className="p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-8">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Настройки</h1>
              <p className="text-sm text-muted-foreground mt-1">Системные переключатели</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Основное</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-6">
                <div>
                  <Label htmlFor="registrationEnabled">Регистрация</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    Включает/отключает регистрацию новых пользователей.
                  </div>
                </div>
                <Switch
                  id="registrationEnabled"
                  checked={settings.registrationEnabled}
                  disabled={updatingKey !== null}
                  onCheckedChange={(v) => openToggleConfirm("registration", Boolean(v))}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-6">
                <div>
                  <Label htmlFor="trialLessonsEnabled">Пробные уроки</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    Включает/отключает запись и аналитику пробных уроков.
                  </div>
                </div>
                <Switch
                  id="trialLessonsEnabled"
                  checked={settings.trialLessonsEnabled}
                  disabled={updatingKey !== null}
                  onCheckedChange={(v) => openToggleConfirm("trial", Boolean(v))}
                />
              </div>

              <Separator />
            </CardContent>
          </Card>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
                <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={updatingKey !== null}>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={applyPendingToggle} disabled={updatingKey !== null}>
                  Подтвердить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </main>
      </div>
    </div>
  )
}
