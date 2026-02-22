"use client"

import { useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { List, SignOut } from "@phosphor-icons/react"
import { NotificationBell } from "@/components/notification-bell"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"

export type TeacherHeaderUser = {
  name?: string | null
  email?: string | null
}

type TeacherHeaderProps = {
  user?: TeacherHeaderUser | null
  onLogout?: () => void
  activePath?: string
}

const navItems = [
  { label: "Главная", path: "/" },
  { label: "Мои группы", path: "/teacher-groups" },
  { label: "Расписание", path: "/teacher-groups/calendar" },
  { label: "Оценки", path: "/teacher-grades" },
  { label: "Профиль", path: "/profile" },
]

export function TeacherHeader({ user, onLogout, activePath }: TeacherHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  const active = activePath ?? pathname

  const initials = useMemo(() => {
    if (!user?.name) return "U"
    return user.name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }, [user?.name])

  const isActivePath = (path: string) => {
    if (path === "/") return active === "/"
    return active.startsWith(path)
  }

  const goTo = (path: string) => {
    setIsMobileNavOpen(false)
    router.push(path)
  }

  return (
    <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <nav className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 md:hidden">
            <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <List size={22} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[320px] p-0">
                <SheetHeader className="px-5 py-4 border-b">
                  <SheetTitle className="text-base font-semibold">Nomad Dance Academy</SheetTitle>
                  <div className="text-xs text-muted-foreground">Учительская зона</div>
                </SheetHeader>

                <ScrollArea className="h-[calc(100vh-160px)]">
                  <div className="p-3 space-y-3">
                    <div className="space-y-1">
                      {navItems.map((item) => (
                        <Button
                          key={item.path}
                          variant={isActivePath(item.path) ? "secondary" : "ghost"}
                          className="w-full justify-start text-sm"
                          onClick={() => goTo(item.path)}
                        >
                          {item.label}
                        </Button>
                      ))}
                    </div>

                    <div className="h-px bg-border" />

                    <div className="px-1">
                      <div className="text-xs text-muted-foreground mb-2">Аккаунт</div>
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-sm text-destructive"
                        onClick={onLogout}
                      >
                        <SignOut size={16} className="mr-2" />
                        Выйти
                      </Button>
                    </div>
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
            <div className="text-sm font-semibold">Nomad Dance Academy</div>
          </div>

          <div className="hidden md:flex items-center gap-6">
            {navItems.map((item) => {
              const activeItem = isActivePath(item.path)
              return (
                <Button
                  key={item.path}
                  variant={activeItem ? "default" : "ghost"}
                  className={
                    activeItem
                      ? "bg-[#FF6B35] hover:bg-[#FF6B35]/90 text-white text-sm rounded-lg px-6"
                      : "text-foreground/70 hover:text-foreground text-sm"
                  }
                  onClick={() => router.push(item.path)}
                >
                  {item.label}
                </Button>
              )
            })}
          </div>

          <div className="flex items-center gap-4">
            <NotificationBell accentColor="bg-[#FF6B35]" />
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-sm text-muted-foreground">Уведомления</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-full">
                    <Avatar className="h-9 w-9 cursor-pointer hover:opacity-80 transition-opacity">
                      <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-xs font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user?.name || "Пользователь"}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user?.email || ""}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push("/profile")}>
                    Профиль
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onLogout}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <SignOut size={16} className="mr-2" />
                    Выйти
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </nav>
      </div>
    </header>
  )
}
