"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { List, SignOut } from "@phosphor-icons/react";
import { NotificationBell } from "@/components/notification-bell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Star,
  Phone,
  Envelope,
  CheckCircle
} from "@phosphor-icons/react";
import { API, AUTH_REQUIRED_MESSAGE, handleApiError, logout } from "@/lib/api";
import { DEFAULT_SESSION_EXPIRED_MESSAGE, buildLoginUrl } from "@/lib/auth";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface UserData {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at?: string;
  initials?: string;
}

interface Group {
  id: number;
  name: string;
  capacity: number;
  duration_minutes: number;
  is_trial: boolean;
  hall: {
    id: number;
    name: string;
    capacity: number;
  } | null;
  enrolled: number;
  teacher_ids: number[];
  teacher_names: string[];
  free_slots: number | null;
}

interface StudentData {
  id: number;
  user_id: number;
  name: string;
  email: string;
  phone_number: string | null;
  comment: string | null;
  trial_used: boolean;
  trials_allowed: number;
  trials_used: number;
  subscription_until: string | null;
}

export default function TrialPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuth, setIsAuth] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserData | null>(null);
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [availableGroups, setAvailableGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bookingForm, setBookingForm] = useState({
    name: "",
    email: "",
    phone: "",
    experience: "",
    message: ""
  });
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);

      try {
        const [groupsData, userData] = await Promise.all([
          API.groups.getAvailable(),
          API.users.meOptional(),
        ]);

        const trialGroups = (groupsData as Group[]).filter(
          (group) => group.is_trial === true
        );
        setAvailableGroups(trialGroups);

        if (!userData) {
          setIsAuth(false);
          setUserRole(null);
          setProfile(null);
          setStudentData(null);
          return;
        }

        console.log('User data:', userData);

        const me = userData as { user: UserData }

        setIsAuth(true);
        setUserRole(me.user.role);

        if (me.user.role === 'teacher') {
          router.push('/');
          return;
        }

        const userProfile = {
          ...me.user,
          initials: me.user.name
            ? me.user.name
                .split(' ')
                .map((n: string) => n[0])
                .join('')
                .toUpperCase()
            : 'U',
        };

        console.log('Setting profile:', userProfile);
        setProfile(userProfile);

        if (me.user.role === 'student') {
          try {
            const studentInfo = await API.students.me();
            console.log('Student trial info loaded:', {
              trials_used: studentInfo.trials_used,
              trials_allowed: studentInfo.trials_allowed,
              trial_used: studentInfo.trial_used,
            });
            setStudentData(studentInfo);
          } catch (err) {
            const message = handleApiError(err);
            if (message === AUTH_REQUIRED_MESSAGE) {
              router.push(
                buildLoginUrl({
                  message: DEFAULT_SESSION_EXPIRED_MESSAGE,
                  next: pathname,
                })
              );
              return;
            }
            toast.error(message);
          }
        }
      } catch (err) {
        const message = handleApiError(err);

        if (message === AUTH_REQUIRED_MESSAGE) {
          router.push(
            buildLoginUrl({
              message: DEFAULT_SESSION_EXPIRED_MESSAGE,
              next: pathname,
            })
          );
          return;
        }

        toast.error(message || 'Не удалось загрузить доступные группы');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [router, pathname]);

  const handleLogout = () => {
    logout();
    setIsAuth(false);
    setUserRole(null);
    router.push('/login');
  };

  const handleBookTrial = (group: Group) => {
    if (!isAuth) {
      toast.error("Войдите в систему для записи на пробный урок");
      router.push('/login');
      return;
    }

    if (userRole !== 'student') {
      toast.error("Только ученики могут записаться на пробный урок");
      return;
    }

    const checkTrialStatus = async () => {
      try {
        if (userRole === 'student') {
          const freshStudentInfo = await API.students.me();
          setStudentData(freshStudentInfo);

          if (freshStudentInfo.trials_used >= freshStudentInfo.trials_allowed) {
            toast.error("Лимит пробных уроков исчерпан");
            return;
          }
        }
        setSelectedGroup(group);
      } catch (error) {
        console.error('Error checking trial status:', error);
        toast.error("Не удалось проверить статус пробного урока");
      }
    };

    checkTrialStatus();
  };

  const handleSubmitBooking = async () => {
    if (!selectedGroup) return;

    if (studentData && studentData.trials_used >= studentData.trials_allowed) {
      toast.error("Лимит пробных уроков исчерпан");
      setSelectedGroup(null);
      return;
    }

    try {
      await API.groups.trial(selectedGroup.id);
      toast.success("Пробный урок успешно забронирован! Свяжемся с вами в ближайшее время.");
      setSelectedGroup(null);

      if (userRole === 'student') {
        const updatedStudentInfo = await API.students.me();
        console.log('Student data after booking:', {
          trials_used: updatedStudentInfo.trials_used,
          trials_allowed: updatedStudentInfo.trials_allowed,
          trial_used: updatedStudentInfo.trial_used
        });
        setStudentData(updatedStudentInfo);

        if (updatedStudentInfo.trials_used >= updatedStudentInfo.trials_allowed) {
          setTimeout(() => {
            toast.info("Лимит пробных уроков исчерпан");
          }, 1000);
        }
      }
    } catch (error: any) {
      console.error('Error booking trial:', error);

      if (error.message && error.message.includes("No trial lessons remaining")) {
        toast.error("Лимит пробных уроков исчерпан");
        if (userRole === 'student') {
          try {
            const refreshedStudentInfo = await API.students.me();
            setStudentData(refreshedStudentInfo);
          } catch (refreshError) {
            console.error('Error refreshing student data:', refreshError);
          }
        }
      } else if (error.message && error.message.includes("Trial lesson already used")) {
        toast.error("Пробный урок уже использован");
      } else if (error.message && (error.message.includes("already registered") || error.message.includes("Already registered"))) {
        toast.error("Вы уже записаны на урок в этой группе");
      } else {
        toast.error("Не удалось записаться на пробный урок. Попробуйте еще раз.");
      }
      setSelectedGroup(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
            <p className="mt-4 text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  const mobileNavItems = [
    { label: "Главная", path: "/" },
    { label: "Расписание групп", path: "/schedule" },
    { label: "Мои группы", path: "/my-groups" },
    { label: "Пробный урок", path: "/trial" },
    { label: "Профиль", path: "/profile" },
  ];

  const goTo = (path: string) => {
    setIsMobileNavOpen(false);
    router.push(path);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Consistent Header Navigation */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <nav className="flex items-center justify-between">
            <div className="md:hidden">
              <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <List size={22} />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[320px] p-0">
                  <SheetHeader className="px-5 py-4 border-b">
                    <SheetTitle className="text-base font-semibold">Nomad Dance Academy</SheetTitle>
                    <div className="text-xs text-muted-foreground">Пробный урок</div>
                  </SheetHeader>

                  <div className="p-3 space-y-1">
                    {mobileNavItems.map((item) => (
                      <Button
                        key={item.path}
                        variant={item.path === "/trial" ? "secondary" : "ghost"}
                        className="w-full justify-start text-sm text-foreground hover:bg-muted"
                        onClick={() => goTo(item.path)}
                      >
                        <span className="truncate">{item.label}</span>
                      </Button>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            <div className="hidden md:flex items-center gap-6">
              <Button
                variant="ghost"
                className="text-foreground/70 hover:text-foreground text-sm"
                onClick={() => router.push("/")}
              >
                Главная
              </Button>
              <Button
                variant="ghost"
                className="text-foreground/70 hover:text-foreground text-sm"
                onClick={() => router.push("/schedule")}
              >
                Расписание групп
              </Button>
              <Button
                variant="ghost"
                className="text-foreground/70 hover:text-foreground text-sm"
                onClick={() => router.push("/my-groups")}
              >
                Мои группы
              </Button>
              <Button
                className="bg-[#FF6B35] hover:bg-[#FF6B35]/90 text-white text-sm rounded-lg px-6"
              >
                Пробный урок
              </Button>
              <Button
                variant="ghost"
                className="text-foreground/70 hover:text-foreground text-sm"
                onClick={() => router.push("/profile")}
              >
                Профиль
              </Button>
            </div>

            {isAuth && profile && (
              <div className="flex items-center gap-4">
                <NotificationBell accentColor="bg-[#FF6B35]" />
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Уведомления</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-full">
                        <Avatar className="h-9 w-9 cursor-pointer hover:opacity-80 transition-opacity">
                          <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-xs font-semibold">
                            {profile?.initials || 'U'}
                          </AvatarFallback>
                        </Avatar>
                      </button>
                    </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{profile?.name || 'User'}</p>
                        <p className="text-xs leading-none text-muted-foreground">{profile?.email || ''}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                      <SignOut size={16} className="mr-2" />
                      Выйти
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                </div>
              </div>
            )}

            {!isAuth && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => router.push("/login")}>
                  Войти
                </Button>
                <Button onClick={() => router.push("/register")}>
                  Регистрация
                </Button>
              </div>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Пробные уроки</h1>
          <p className="text-xl text-muted-foreground mb-6">
            Попробуйте наши танцевальные занятия бесплатно
          </p>
          <div className="flex justify-center items-center gap-6 text-sm text-muted-foreground flex-wrap">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>Без обязательств</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>Профессиональные преподаватели</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>Все уровни подготовки</span>
            </div>
          </div>
        </div>

        {/* Trial Status for Students */}
        {userRole === 'student' && studentData && (
          <div className="mb-8">
            <Card className={`border ${studentData.trials_used >= studentData.trials_allowed ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  {studentData.trials_used >= studentData.trials_allowed ? (
                    <>
                      <div className="h-4 w-4 bg-red-500 rounded-full"></div>
                      <span className="font-medium text-red-700">
                        Лимит пробных уроков исчерпан ({studentData.trials_used} из {studentData.trials_allowed})
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="h-4 w-4 bg-green-500 rounded-full"></div>
                      <span className="font-medium text-green-700">
                        Доступно пробных уроков: {studentData.trials_allowed - studentData.trials_used} из {studentData.trials_allowed}
                      </span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Available Groups */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Доступные группы для пробного урока</h2>
          {availableGroups.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {availableGroups.map((group) => (
                <Card key={group.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex justify-between items-start mb-2">
                      <CardTitle className="text-lg">{group.name}</CardTitle>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {group.teacher_names.length > 0 ? `с ${group.teacher_names.join(', ')}` : 'Преподаватель не назначен'}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4" />
                      <span>{group.duration_minutes} минут</span>
                    </div>
                    {group.hall && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4" />
                        <span>{group.hall.name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4" />
                      <span>{group.enrolled}/{group.capacity} мест занято</span>
                    </div>
                    <Button
                      className="w-full mt-4"
                      onClick={() => handleBookTrial(group)}
                      disabled={
                        !isAuth ||
                        userRole !== 'student' ||
                        (userRole === 'student' && studentData && studentData.trials_used >= studentData.trials_allowed) ||
                        group.enrolled >= group.capacity
                      }
                    >
                      {!isAuth ? "Войдите для записи" :
                       userRole !== 'student' ? "Только для учеников" :
                       (userRole === 'student' && studentData && studentData.trials_used >= studentData.trials_allowed) ? "Лимит пробных уроков исчерпан" :
                       group.enrolled >= group.capacity ? "Нет мест" : "Записаться на пробный урок"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <p className="text-lg text-muted-foreground">
                  На данный момент нет доступных групп для пробного урока
                </p>
              </CardContent>
            </Card>
          )}
        </div>


        {/* Booking Confirmation Dialog */}
        <Dialog open={selectedGroup !== null} onOpenChange={() => setSelectedGroup(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Подтверждение записи на пробный урок</DialogTitle>
              <DialogDescription>
                Группа: {selectedGroup?.name}
                {selectedGroup?.teacher_names?.length && selectedGroup.teacher_names.length > 0 && (
                  <> • Преподаватель: {selectedGroup.teacher_names.join(', ')}</>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Вы уверены, что хотите записаться на пробный урок?
                После подтверждения один из ваших пробных уроков будет использован.
              </p>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setSelectedGroup(null)}>
                  Отмена
                </Button>
                <Button onClick={handleSubmitBooking} className="bg-[#FF6B35] hover:bg-[#FF6B35]/90">
                  Подтвердить запись
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
