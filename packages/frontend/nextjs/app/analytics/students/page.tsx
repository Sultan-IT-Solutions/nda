"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTimeWithGMT5 } from "@/lib/utils";
import { API, handleApiError } from "@/lib/api";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AdminHeader } from "@/components/admin-header";
import { useSidebar } from "@/hooks/use-sidebar";
import { Users, TrendUp, Calendar, X } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast, Toaster } from "sonner";

interface StudentGroup {
  groupName: string;
  teacher: string;
  schedule: string;
  attendance: number;
  hall: string;
}

interface Student {
  id: number;
  name: string;
  email: string;
  phone: string;
  parentPhone: string;
  groups: StudentGroup[];
  lessonsRemaining: number;
  subscriptionUntil: string | null;
  isActive: boolean;
  registeredAt: string;
}

interface Stats {
  totalStudents: number;
  activeStudents: number;
  newThisMonth: number;
  avgAttendance: number;
}

export default function StudentsAnalyticsPage() {
  const router = useRouter();
  const { sidebarWidth } = useSidebar();
  const [students, setStudents] = useState<Student[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalStudents: 0,
    activeStudents: 0,
    newThisMonth: 0,
    avgAttendance: 0,
  });
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);

  const removeStudentFromGroup = async (studentId: number, groupName: string) => {
    try {
      const groupsResponse = await API.admin.getGroupsAnalytics();
      const group = groupsResponse.groups.find((g: any) => g.groupName === groupName);

      if (!group) {
        toast.error("Группа не найдена");
        console.error("Available groups:", groupsResponse.groups.map((g: any) => g.groupName));
        console.error("Looking for group:", groupName);
        return;
      }

      await API.admin.removeStudentFromGroup(group.groupId, studentId);
      toast.success(`Студент успешно удален из группы ${groupName}`);

      setStudents(prev => prev.map(s => {
        if (s.id === studentId) {
          const updatedGroups = s.groups.filter(g => g.groupName !== groupName);
          return {
            ...s,
            groups: updatedGroups,
            isActive: updatedGroups.length > 0
          };
        }
        return s;
      }));

    } catch (error) {
      console.error("Failed to remove student from group:", error);
      toast.error("Ошибка при удалении студента из группы");
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const userRes = await API.users.me();

      if (userRes.user.role !== "admin") {
        localStorage.setItem("loginMessage", "У вас нет доступа к этой странице")
        router.push("/login")
        return
      }

      setUser(userRes.user);

      const studentsData = await API.admin.getStudentsAnalytics();

      setStudents(studentsData.students?.map((student: Student) => ({
        ...student,
        isActive: (student.groups?.length || 0) > 0
      })) || []);
      setStats(studentsData.stats || stats);
    } catch (error) {
      console.error("Failed to fetch students data:", error);
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    return parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : name.substring(0, 2).toUpperCase();
  };

  const filteredAndSortedStudents = students
    .filter(student => {

      const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase());

      let matchesLetter = true;
      if (selectedLetter) {
        const firstLetter = student.name.charAt(0).toUpperCase();
        matchesLetter = firstLetter === selectedLetter;
      }

      return matchesSearch && matchesLetter;
    })
    .sort((a, b) => {
      if (a.isActive !== b.isActive) {
        return a.isActive ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Toaster
        position="top-right"
        richColors
        visibleToasts={5}
        expand={true}
        gap={8}
      />

      <AdminSidebar />

      <div className={sidebarWidth + " transition-all duration-300"}>
        <AdminHeader userName={user?.name} userEmail={user?.email} />
        <main className="p-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Ученики</h1>
              <p className="text-sm text-muted-foreground mt-1">Информация обо всех учениках</p>
            </div>
          </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Всего учеников
              </CardTitle>
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalStudents}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Активных учеников
              </CardTitle>
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <TrendUp className="w-5 h-5 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.activeStudents}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Новых за месяц
              </CardTitle>
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.newThisMonth}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Средняя посещаемость
              </CardTitle>
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-orange-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.avgAttendance}%</div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="mb-8">
          <div className="relative max-w-md">
            <input
              type="text"
              placeholder="Поиск по имени..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-4 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>

        {/* Students List */}
        <div className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-center text-gray-500">Загрузка...</p>
              </CardContent>
            </Card>
          ) : students
              .filter(student => {

                return student.name.toLowerCase().includes(searchTerm.toLowerCase());
              })
              .sort((a, b) => {
                if (a.isActive !== b.isActive) {
                  return a.isActive ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
              }).length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-center text-gray-500">Нет учеников</p>
              </CardContent>
            </Card>
          ) : (
            students
              .filter(student => {

                return student.name.toLowerCase().includes(searchTerm.toLowerCase());
              })
              .sort((a, b) => {
                if (a.isActive !== b.isActive) {
                  return a.isActive ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
              })
              .map((student) => (
              <Card key={student.id} className={!student.isActive ? "opacity-60" : ""}>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <Avatar className="w-16 h-16">
                      <AvatarFallback className="bg-purple-100 text-purple-700 text-lg">
                        {getInitials(student.name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold">{student.name}</h3>
                        {student.isActive ? (
                          <Badge className="bg-green-100 text-green-800">Активен</Badge>
                        ) : (
                          <Badge variant="secondary">Не активен</Badge>
                        )}
                      </div>

                      {/* Student Details */}
                      <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-4 text-sm">
                        <div>
                          <span className="text-gray-500">Email:</span>{" "}
                          <span className="text-gray-900">{student.email}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Телефон:</span>{" "}
                          <span className="text-gray-900">{student.phone || "Не указано"}</span>
                        </div>
                      </div>

                      {/* Groups */}
                      {student.groups.length > 0 ? (
                        <div className="space-y-3 mb-4">
                          {student.groups.map((group, idx) => (
                            <div key={idx} className="bg-gray-50 p-3 rounded-lg">
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex-1">
                                  <p className="font-semibold text-gray-900">{group.groupName}</p>
                                  <p className="text-sm text-gray-600">
                                    Преподаватель: {group.teacher}
                                  </p>
                                  <p className="text-sm text-gray-600">
                                    {group.schedule} • {group.hall}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="ml-2">
                                    {group.attendance}% посещаемость
                                  </Badge>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                      >
                                        <X size={16} />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Удалить студента из группы?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Вы уверены, что хотите удалить студента <strong>{student.name}</strong> из группы <strong>{group.groupName}</strong>? Это действие нельзя отменить.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Отмена</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => removeStudentFromGroup(student.id, group.groupName)}
                                          className="bg-red-600 hover:bg-red-700"
                                        >
                                          Удалить
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 mb-4">Не записан в группы</p>
                      )}

                      {/* Additional Info */}
                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-600">
                            Осталось занятий: <span className="font-semibold">{student.lessonsRemaining}</span>
                          </span>
                        </div>
                        {student.subscriptionUntil && (
                          <div>
                            <span className="text-gray-600">
                              Абонемент до: <span className="font-semibold">
                                {new Date(student.subscriptionUntil).toLocaleDateString("ru")}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
    </div>
  );
}
