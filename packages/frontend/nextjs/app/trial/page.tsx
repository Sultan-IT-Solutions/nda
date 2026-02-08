"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SignOut } from "@phosphor-icons/react";
import { NotificationBell } from "@/components/notification-bell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  trial_price?: number | null;
  trial_currency?: string | null;
  schedule?: string | null;
  start_time?: string | null;
  upcoming_lessons?: string[];
  recurring_days?: string | null;
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
  const [selectedTrialLessonTime, setSelectedTrialLessonTime] = useState<string | null>(null);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [bookingForm, setBookingForm] = useState({
    name: "",
    email: "",
    phone: "",
    experience: "",
    message: ""
  });

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

  const formatLessonPretty = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;

    const weekdayRaw = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "Asia/Almaty" }).format(d);
    const weekday = weekdayRaw.replace(/\.$/, "");
    const weekdayCapitalized = weekday.length > 0 ? weekday[0].toUpperCase() + weekday.slice(1) : weekday;

    const dateRaw = new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Almaty",
    }).format(d);
    const date = dateRaw.replace(/\s?г\.?$/, "");

    const time = new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Almaty",
    }).format(d);

    return `${weekdayCapitalized} · ${date} · ${time}`;
  };

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
        const times = group.upcoming_lessons ?? [];
        setSelectedTrialLessonTime(times.length > 0 ? times[0] : null);
      } catch (error) {
        console.error('Error checking trial status:', error);
        toast.error("Не удалось проверить статус пробного урока");
      }
    };

    checkTrialStatus();
  };

  const handleSubmitBooking = async () => {
    if (!selectedGroup) return;
    if (submittingBooking) return;

    const availableTimes = selectedGroup.upcoming_lessons ?? [];
    if (availableTimes.length > 0 && !selectedTrialLessonTime) {
      toast.error("Выберите время пробного урока");
      return;
    }

    if (studentData && studentData.trials_used >= studentData.trials_allowed) {
      toast.error("Лимит пробных уроков исчерпан");
      setSelectedGroup(null);
      return;
    }

    setSubmittingBooking(true);
    try {
      const bookingResult = await API.groups.trial(selectedGroup.id, selectedTrialLessonTime);
      toast.success("Пробный урок успешно забронирован! Свяжемся с вами в ближайшее время.");
      setSelectedGroup(null);
      setSelectedTrialLessonTime(null);

      if (
        bookingResult &&
        typeof (bookingResult as any).trials_allowed === "number" &&
        typeof (bookingResult as any).trials_used === "number"
      ) {
        setStudentData((prev) =>
          prev
            ? {
                ...prev,
                trials_allowed: (bookingResult as any).trials_allowed,
                trials_used: (bookingResult as any).trials_used,
                trial_used:
                  (bookingResult as any).trials_used >= (bookingResult as any).trials_allowed,
              }
            : prev
        );
      }

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
      const message = handleApiError(error);
      if (message === AUTH_REQUIRED_MESSAGE) {
        router.push(buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname }));
        return;
      }

      toast.error(message);

      if (
        userRole === 'student' &&
        (message.toLowerCase().includes("не осталось") ||
          message.toLowerCase().includes("лимит") ||
          message.toLowerCase().includes("пробн"))
      ) {
        try {
          const refreshedStudentInfo = await API.students.me();
          setStudentData(refreshedStudentInfo);
        } catch {
          // ignore
        }
      }

      setSelectedGroup(null);
      setSelectedTrialLessonTime(null);
    } finally {
      setSubmittingBooking(false);
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

  return (
    <div className="min-h-screen bg-background">
      {/* Consistent Header Navigation */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <nav className="flex items-center justify-between">
            <div className="flex items-center gap-6">
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
          <h1 data-tour="trial-title" className="text-4xl font-bold mb-4">Пробные уроки</h1>
          <p className="text-xl text-muted-foreground mb-6">
            Приходите познакомиться со школой и преподавателем — разогреемся и разучим базовую связку
          </p>
          <div className="flex justify-center items-center gap-6 text-sm text-muted-foreground flex-wrap">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>Разовый урок — проверьте, подходит ли вам школа</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>Понятное объяснение и поддержка</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>Подходит для новичков и продолжающих</span>
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
        <div data-tour="trial-available" className="mb-12">
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
                      <Calendar className="h-4 w-4" />
                      <span>{(group.schedule && group.schedule !== 'Не назначено') ? group.schedule : 'Расписание уточняется'}</span>
                    </div>

                    {group.is_trial && (
                      <div className="flex items-center gap-2 text-sm">
                        <Star className="h-4 w-4" />
                        <span>
                          Цена: {typeof group.trial_price === 'number'
                            ? `${group.trial_price}${typeof group.trial_currency === 'string' && group.trial_currency.trim().length > 0 ? ` ${group.trial_currency}` : ''}`
                            : 'Не указана'}
                        </span>
                      </div>
                    )}

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
        <Dialog
          open={selectedGroup !== null}
          onOpenChange={() => {
            setSelectedGroup(null);
            setSelectedTrialLessonTime(null);
          }}
        >
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
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium">Дата и время</div>
                <div className="text-muted-foreground">
                  {(selectedGroup?.upcoming_lessons?.length ?? 0) > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">Выберите одно время</div>
                      <div className="space-y-2">
                        {(selectedGroup?.upcoming_lessons ?? []).map((t) => {
                          const label = formatLessonPretty(t) ?? t;
                          const checked = selectedTrialLessonTime === t;
                          return (
                            <div
                              key={t}
                              role="button"
                              tabIndex={0}
                              className="w-full flex items-start gap-2 rounded-md border p-2 text-left hover:bg-muted/50 cursor-pointer"
                              onClick={() => setSelectedTrialLessonTime(checked ? null : t)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedTrialLessonTime(checked ? null : t);
                                }
                              }}
                            >
                              <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) => setSelectedTrialLessonTime(v ? t : null)}
                                  aria-label={label}
                                />
                              </div>
                              <div className="text-sm leading-tight">{label}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    (selectedGroup?.schedule && selectedGroup.schedule !== 'Не назначено')
                      ? selectedGroup.schedule
                      : 'Расписание еще не сформировано'
                  )}
                </div>
              </div>

              {selectedGroup?.is_trial && (
                <div className="rounded-md border p-3 text-sm">
                  <div className="font-medium">Цена</div>
                  <div className="text-muted-foreground">
                    {typeof selectedGroup.trial_price === 'number'
                      ? `${selectedGroup.trial_price}${typeof selectedGroup.trial_currency === 'string' && selectedGroup.trial_currency.trim().length > 0 ? ` ${selectedGroup.trial_currency}` : ''}`
                      : 'Не указана'}
                  </div>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Вы уверены, что хотите записаться на пробный урок?
                После подтверждения один из ваших пробных уроков будет использован.
              </p>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setSelectedGroup(null)}>
                  Отмена
                </Button>
                <Button
                  onClick={handleSubmitBooking}
                  className="bg-[#FF6B35] hover:bg-[#FF6B35]/90"
                  disabled={
                    submittingBooking ||
                    ((selectedGroup?.upcoming_lessons?.length ?? 0) > 0 && !selectedTrialLessonTime)
                  }
                >
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
