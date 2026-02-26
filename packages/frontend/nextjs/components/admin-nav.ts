import {
  ChartBar,
  ChartPie,
  Users,
  CalendarBlank,
  Clock,
  ClipboardText,
  Tag,
  MapPin,
  Gear,
  UserCircle,
  Notebook,
  BookOpenText,
} from "@phosphor-icons/react"

export type AdminNavItem = {
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  path: string
}

export const adminNavItems: AdminNavItem[] = [
  { label: "Аналитика", icon: ChartPie, path: "/analytics" },
  { label: "Аналитика залов", icon: ChartBar, path: "/analytics/halls" },
  { label: "Аналитика преподавателей", icon: Users, path: "/analytics/teachers" },
  { label: "Аналитика классов", icon: Users, path: "/analytics/groups" },
  { label: "Расписание", icon: CalendarBlank, path: "/analytics/schedule" },
  { label: "Оценки", icon: ChartBar, path: "/analytics/grades" },
  { label: "Транскрипт", icon: ClipboardText, path: "/analytics/transcript" },
  { label: "Ученики", icon: Users, path: "/analytics/students" },
  { label: "Пробные уроки", icon: Users, path: "/analytics/trial-lessons" },
  { label: "Пользователи", icon: UserCircle, path: "/analytics/users" },
  { label: "Классы", icon: Users, path: "/groups" },
  { label: "Категории", icon: Tag, path: "/analytics/categories" },
  { label: "Предметы", icon: BookOpenText, path: "/analytics/subjects" },
  { label: "Залы", icon: MapPin, path: "/halls" },
  { label: "Заявки", icon: Clock, path: "/analytics/applications" },
  { label: "Системные настройки", icon: Gear, path: "/analytics/settings" },
  { label: "Логи", icon: Notebook, path: "/analytics/logs" },
]
