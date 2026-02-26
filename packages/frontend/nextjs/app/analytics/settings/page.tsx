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
import { Button } from "@/components/ui/button"
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
  gradesScale: "0-5" | "0-100"
  teacherEditEnabled: boolean
  electivesEnabled: boolean
  classRequireTeacher: boolean
  classRequireHall: boolean
  classAllowMultiTeachers: boolean
  transcriptEnabled: boolean
  transcriptRequireComplete: boolean
  transcriptExcludeCancelled: boolean
}

type PendingPatch = {
  key:
    | "registration"
    | "trial"
    | "teacherEdit"
    | "gradesScale"
    | "electives"
    | "classRequireTeacher"
    | "classRequireHall"
    | "classAllowMultiTeachers"
    | "transcriptEnabled"
    | "transcriptRequireComplete"
    | "transcriptExcludeCancelled"
  value: boolean | "0-5" | "0-100"
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
  const [pendingPatch, setPendingPatch] = useState<PendingPatch | null>(null)

  const [settings, setSettings] = useState<SettingsState>({
    registrationEnabled: true,
    trialLessonsEnabled: true,
    gradesScale: "0-5",
    teacherEditEnabled: true,
    electivesEnabled: true,
    classRequireTeacher: false,
    classRequireHall: false,
    classAllowMultiTeachers: true,
    transcriptEnabled: true,
    transcriptRequireComplete: true,
    transcriptExcludeCancelled: true,
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
          gradesScale: s["grades.scale"] === "0-100" ? "0-100" : "0-5",
          teacherEditEnabled: typeof s["grades.teacher_edit_enabled"] === "boolean" ? s["grades.teacher_edit_enabled"] : true,
          electivesEnabled: typeof s["school.electives.enabled"] === "boolean" ? s["school.electives.enabled"] : true,
          classRequireTeacher:
            typeof s["school.class.require_teacher"] === "boolean" ? s["school.class.require_teacher"] : false,
          classRequireHall:
            typeof s["school.class.require_hall"] === "boolean" ? s["school.class.require_hall"] : false,
          classAllowMultiTeachers:
            typeof s["school.class.allow_multi_teachers"] === "boolean" ? s["school.class.allow_multi_teachers"] : true,
          transcriptEnabled:
            typeof s["transcript.enabled"] === "boolean" ? s["transcript.enabled"] : true,
          transcriptRequireComplete:
            typeof s["transcript.require_complete"] === "boolean"
              ? s["transcript.require_complete"]
              : true,
          transcriptExcludeCancelled:
            typeof s["transcript.exclude_cancelled"] === "boolean"
              ? s["transcript.exclude_cancelled"]
              : true,
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

  const openGradesScaleConfirm = (nextScale: "0-5" | "0-100") => {
    if (settings.gradesScale === nextScale) return
    setPendingPatch({ key: "gradesScale", value: nextScale })
    setConfirmTitle("Изменить шкалу оценивания?")
    setConfirmDescription(
      nextScale === "0-100"
        ? "Шкала оценивания будет изменена на 0–100. Это влияет на отображение средних значений и ввод новых оценок. Текущие оценки будут перерасчитаны автоматически."
        : "Шкала оценивания будет изменена на 0–5. Это влияет на отображение средних значений и ввод новых оценок. Текущие оценки будут перерасчитаны автоматически.",
    )
    setConfirmOpen(true)
  }

  const openTeacherEditConfirm = (nextValue: boolean) => {
    setPendingPatch({ key: "teacherEdit", value: nextValue })
    setConfirmTitle(nextValue ? "Разрешить редактирование учителями?" : "Запретить редактирование учителями?")
    setConfirmDescription(
      nextValue
        ? "Учителя смогут выставлять и изменять оценки."
        : "Учителя не смогут выставлять и изменять оценки, пока вы снова не включите эту опцию.",
    )
    setConfirmOpen(true)
  }

  const openSchoolToggleConfirm = (
    key: "electives" | "classRequireTeacher" | "classRequireHall" | "classAllowMultiTeachers",
    nextValue: boolean,
  ) => {
    setPendingPatch({ key, value: nextValue })
    if (key === "electives") {
      setConfirmTitle(nextValue ? "Включить элективные предметы?" : "Отключить элективные предметы?")
      setConfirmDescription(
        nextValue
          ? "Администратор сможет создавать предметы с выбором отдельных учеников."
          : "Создание элективных предметов будет недоступно.",
      )
    } else if (key === "classRequireTeacher") {
      setConfirmTitle(nextValue ? "Требовать учителя для класса?" : "Снять требование учителя?")
      setConfirmDescription(
        nextValue
          ? "Без назначенного учителя класс нельзя будет сохранить."
          : "Класс можно будет сохранить без учителя.",
      )
    } else if (key === "classRequireHall") {
      setConfirmTitle(nextValue ? "Требовать зал для класса?" : "Снять требование зала?")
      setConfirmDescription(
        nextValue
          ? "Без выбранного зала класс нельзя будет сохранить."
          : "Класс можно будет сохранить без зала.",
      )
    } else {
      setConfirmTitle(nextValue ? "Разрешить несколько учителей?" : "Запретить несколько учителей?")
      setConfirmDescription(
        nextValue
          ? "К классу можно будет назначать нескольких учителей."
          : "Класс будет хранить только одного основного учителя.",
      )
    }
    setConfirmOpen(true)
  }

  const openTranscriptConfirm = (nextValue: boolean) => {
    setPendingPatch({ key: "transcriptEnabled", value: nextValue })
    setConfirmTitle(nextValue ? "Включить транскрипт?" : "Отключить транскрипт?")
    setConfirmDescription(
      nextValue
        ? "Студенты смогут видеть опубликованные оценки в транскрипте."
        : "Страница транскрипта будет недоступна для студентов, а публикация отключена.",
    )
    setConfirmOpen(true)
  }

  const openTranscriptToggleConfirm = (
    key: "transcriptRequireComplete" | "transcriptExcludeCancelled",
    nextValue: boolean,
  ) => {
    setPendingPatch({ key, value: nextValue })
    if (key === "transcriptRequireComplete") {
      setConfirmTitle(nextValue ? "Требовать полный журнал?" : "Разрешить неполный журнал?")
      setConfirmDescription(
        nextValue
          ? "Публикация транскрипта будет доступна только если у всех учеников есть оценки по всем урокам."
          : "Можно публиковать транскрипт даже при неполных оценках.",
      )
    } else {
      setConfirmTitle(nextValue ? "Исключать отмененные уроки?" : "Учитывать отмененные уроки?")
      setConfirmDescription(
        nextValue
          ? "Отмененные уроки не будут участвовать в проверке полноты оценок."
          : "Отмененные уроки будут учитываться в проверке полноты оценок.",
      )
    }
    setConfirmOpen(true)
  }

  const applyPendingPatch = async () => {
    if (!pendingPatch) return
    setUpdatingKey(pendingPatch.key)
    try {
      let res: any
      if (pendingPatch.key === "registration") {
        res = await API.admin.updateSettings({ registration_enabled: Boolean(pendingPatch.value) })
      } else if (pendingPatch.key === "trial") {
        res = await API.admin.updateSettings({ trial_lessons_enabled: Boolean(pendingPatch.value) })
      } else if (pendingPatch.key === "gradesScale") {
        res = await API.admin.updateSettings({ grades_scale: pendingPatch.value as "0-5" | "0-100" })
      } else if (pendingPatch.key === "teacherEdit") {
        res = await API.admin.updateSettings({ teacher_edit_enabled: Boolean(pendingPatch.value) })
      } else if (pendingPatch.key === "electives") {
        res = await API.admin.updateSettings({ electives_enabled: Boolean(pendingPatch.value) })
      } else if (pendingPatch.key === "transcriptEnabled") {
        res = await API.admin.updateSettings({ transcript_enabled: Boolean(pendingPatch.value) })
      } else if (pendingPatch.key === "transcriptRequireComplete") {
        res = await API.admin.updateSettings({ transcript_require_complete: Boolean(pendingPatch.value) })
      } else if (pendingPatch.key === "transcriptExcludeCancelled") {
        res = await API.admin.updateSettings({ transcript_exclude_cancelled: Boolean(pendingPatch.value) })
      } else if (pendingPatch.key === "classRequireTeacher") {
        res = await API.admin.updateSettings({ class_require_teacher: Boolean(pendingPatch.value) })
      } else if (pendingPatch.key === "classRequireHall") {
        res = await API.admin.updateSettings({ class_require_hall: Boolean(pendingPatch.value) })
      } else {
        res = await API.admin.updateSettings({ class_allow_multi_teachers: Boolean(pendingPatch.value) })
      }

      const s = res?.settings ?? {}
      setSettings((prev) => ({
        ...prev,
        registrationEnabled: typeof s["registration.enabled"] === "boolean" ? s["registration.enabled"] : prev.registrationEnabled,
        trialLessonsEnabled: typeof s["trial_lessons.enabled"] === "boolean" ? s["trial_lessons.enabled"] : prev.trialLessonsEnabled,
        gradesScale: s["grades.scale"] === "0-100" ? "0-100" : "0-5",
        teacherEditEnabled:
          typeof s["grades.teacher_edit_enabled"] === "boolean" ? s["grades.teacher_edit_enabled"] : prev.teacherEditEnabled,
        electivesEnabled: typeof s["school.electives.enabled"] === "boolean" ? s["school.electives.enabled"] : prev.electivesEnabled,
        classRequireTeacher:
          typeof s["school.class.require_teacher"] === "boolean" ? s["school.class.require_teacher"] : prev.classRequireTeacher,
        classRequireHall:
          typeof s["school.class.require_hall"] === "boolean" ? s["school.class.require_hall"] : prev.classRequireHall,
        classAllowMultiTeachers:
          typeof s["school.class.allow_multi_teachers"] === "boolean"
            ? s["school.class.allow_multi_teachers"]
            : prev.classAllowMultiTeachers,
        transcriptEnabled:
          typeof s["transcript.enabled"] === "boolean" ? s["transcript.enabled"] : prev.transcriptEnabled,
        transcriptRequireComplete:
          typeof s["transcript.require_complete"] === "boolean"
            ? s["transcript.require_complete"]
            : prev.transcriptRequireComplete,
        transcriptExcludeCancelled:
          typeof s["transcript.exclude_cancelled"] === "boolean"
            ? s["transcript.exclude_cancelled"]
            : prev.transcriptExcludeCancelled,
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

  const updateGradesScale = (nextScale: "0-5" | "0-100") => {
    openGradesScaleConfirm(nextScale)
  }

  const toggleTeacherEdit = (nextValue: boolean) => {
    openTeacherEditConfirm(nextValue)
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
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Оценивание</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col gap-4">
                <div>
                  <Label>Оценки</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    Управляйте шкалой и доступом преподавателей к редактированию.
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="min-w-[160px]">Шкала оценивания</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={settings.gradesScale === "0-5" ? "default" : "outline"}
                        onClick={() => updateGradesScale("0-5")}
                        disabled={updatingKey !== null}
                        type="button"
                      >
                        0–5
                      </Button>
                      <Button
                        variant={settings.gradesScale === "0-100" ? "default" : "outline"}
                        onClick={() => updateGradesScale("0-100")}
                        disabled={updatingKey !== null}
                        type="button"
                      >
                        0–100
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-6">
                    <div>
                      <Label htmlFor="teacherEditEnabled">Редактирование учителями</Label>
                      <div className="text-sm text-muted-foreground mt-1">
                        Разрешает учителям выставлять и изменять оценки.
                      </div>
                    </div>
                    <Switch
                      id="teacherEditEnabled"
                      checked={settings.teacherEditEnabled}
                      disabled={updatingKey !== null}
                      onCheckedChange={(v) => toggleTeacherEdit(Boolean(v))}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Школьная логика</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-6">
                <div>
                  <Label htmlFor="electivesEnabled">Элективные предметы</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    Позволяет создавать предметы с выбором отдельных учеников.
                  </div>
                </div>
                <Switch
                  id="electivesEnabled"
                  checked={settings.electivesEnabled}
                  disabled={updatingKey !== null}
                  onCheckedChange={(v) => openSchoolToggleConfirm("electives", Boolean(v))}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-6">
                <div>
                  <Label htmlFor="classRequireTeacher">Обязательный учитель</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    Требует назначения учителя для каждого класса.
                  </div>
                </div>
                <Switch
                  id="classRequireTeacher"
                  checked={settings.classRequireTeacher}
                  disabled={updatingKey !== null}
                  onCheckedChange={(v) => openSchoolToggleConfirm("classRequireTeacher", Boolean(v))}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-6">
                <div>
                  <Label htmlFor="classRequireHall">Обязательный зал</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    Требует выбора зала для каждого класса.
                  </div>
                </div>
                <Switch
                  id="classRequireHall"
                  checked={settings.classRequireHall}
                  disabled={updatingKey !== null}
                  onCheckedChange={(v) => openSchoolToggleConfirm("classRequireHall", Boolean(v))}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-6">
                <div>
                  <Label htmlFor="classAllowMultiTeachers">Несколько учителей</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    Позволяет назначать нескольких учителей на класс.
                  </div>
                </div>
                <Switch
                  id="classAllowMultiTeachers"
                  checked={settings.classAllowMultiTeachers}
                  disabled={updatingKey !== null}
                  onCheckedChange={(v) => openSchoolToggleConfirm("classAllowMultiTeachers", Boolean(v))}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Транскрипт</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-6">
                <div>
                  <Label htmlFor="transcriptEnabled">Публикация транскрипта</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    Разрешает администраторам публиковать оценки в транскрипт и показывать их студентам.
                  </div>
                </div>
                <Switch
                  id="transcriptEnabled"
                  checked={settings.transcriptEnabled}
                  disabled={updatingKey !== null}
                  onCheckedChange={(v) => openTranscriptConfirm(Boolean(v))}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-6">
                <div>
                  <Label htmlFor="transcriptRequireComplete">Полная проверка оценок</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    Требовать оценки по каждому уроку для публикации.
                  </div>
                </div>
                <Switch
                  id="transcriptRequireComplete"
                  checked={settings.transcriptRequireComplete}
                  disabled={updatingKey !== null}
                  onCheckedChange={(v) => openTranscriptToggleConfirm("transcriptRequireComplete", Boolean(v))}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-6">
                <div>
                  <Label htmlFor="transcriptExcludeCancelled">Исключать отмененные уроки</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    Отмененные занятия не учитываются при проверке полноты.
                  </div>
                </div>
                <Switch
                  id="transcriptExcludeCancelled"
                  checked={settings.transcriptExcludeCancelled}
                  disabled={updatingKey !== null}
                  onCheckedChange={(v) => openTranscriptToggleConfirm("transcriptExcludeCancelled", Boolean(v))}
                />
              </div>
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
                <AlertDialogAction onClick={applyPendingPatch} disabled={updatingKey !== null}>
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
