"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { formatDateTimeWithGMT5 } from "@/lib/utils";
import { API, handleApiError } from "@/lib/api";
import { buildLoginUrl, DEFAULT_SESSION_EXPIRED_MESSAGE } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AdminHeader } from "@/components/admin-header";
import { AdminPagination } from "@/components/admin-pagination";
import { useSidebar } from "@/hooks/use-sidebar";
import { Users, UserCircle, Shield, GraduationCap, Chalkboard, Pencil, Trash, X, Check } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface User {
  id: number;
  name: string;
  email: string;
  role: "student" | "teacher" | "admin";
  phone: string;
  created_at: string | null;
  student_id: number | null;
  teacher_id: number | null;
  hourly_rate: number | null;
  bio: string | null;
}

interface Stats {
  totalUsers: number;
  students: number;
  teachers: number;
  admins: number;
}

const roleLabels: Record<string, string> = {
  student: "Ученик",
  teacher: "Преподаватель",
  admin: "Администратор",
};

const roleBadgeStyles: Record<string, string> = {
  student: "bg-blue-100 text-blue-800",
  teacher: "bg-green-100 text-green-800",
  admin: "bg-purple-100 text-purple-800",
};

export default function UsersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { sidebarWidth } = useSidebar();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    students: 0,
    teachers: 0,
    admins: 0,
  });
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string; id: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const itemsPerPage = 5;

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      let userRes: any
      try {
        userRes = await API.users.me();
      } catch (err) {
        const message = handleApiError(err)
        if (message.includes('Требуется авторизация')) {
          router.push(buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname }))
          return
        }
        throw err
      }

      if (userRes.user.role !== "admin") {
        toast.error("У вас нет доступа к этой странице")
        router.push("/")
        return;
      }

      setCurrentUser({ ...userRes.user, id: userRes.user.id });

      const usersData = await API.users.getAll();
      const usersList: User[] = usersData.users || [];

      setUsers(usersList);

      setStats({
        totalUsers: usersList.length,
        students: usersList.filter(u => u.role === "student").length,
        teachers: usersList.filter(u => u.role === "teacher").length,
        admins: usersList.filter(u => u.role === "admin").length,
      });
    } catch (error) {
      console.error("Failed to fetch users data:", error);
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

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Shield className="w-4 h-4" />;
      case "teacher":
        return <Chalkboard className="w-4 h-4" />;
      case "student":
        return <GraduationCap className="w-4 h-4" />;
      default:
        return <UserCircle className="w-4 h-4" />;
    }
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setEditForm({
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      role: user.role,
    });
    setEditModalOpen(true);
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;

    setSaving(true);
    try {
      await API.users.update(editingUser.id, {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
        role: editForm.role,
      });

      toast.success("Пользователь успешно обновлён");
      setEditModalOpen(false);
      fetchData();
    } catch (error) {
      console.error("Failed to update user:", error);
      toast.error("Ошибка при обновлении пользователя");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    try {
      await API.users.delete(userId);
      toast.success("Пользователь успешно удалён");
      fetchData();
    } catch (error) {
      console.error("Failed to delete user:", error);
      toast.error("Ошибка при удалении пользователя");
    }
  };

  const filteredUsers = users
    .filter(user => {
      const matchesSearch =
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.phone && user.phone.includes(searchTerm));

      const matchesRole = roleFilter === "all" || user.role === roleFilter;

      return matchesSearch && matchesRole;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    setPage(1);
  }, [searchTerm, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / itemsPerPage));
  const paginatedUsers = filteredUsers.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <AdminSidebar />

      <div className={sidebarWidth + " transition-all duration-300"}>
        <AdminHeader userName={currentUser?.name} userEmail={currentUser?.email} />
        <main className="p-8">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Пользователи</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Управление всеми пользователями системы
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Всего пользователей
                </CardTitle>
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.totalUsers}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Учеников
                </CardTitle>
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.students}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Преподавателей
                </CardTitle>
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Chalkboard className="w-5 h-5 text-green-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.teachers}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Администраторов
                </CardTitle>
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-purple-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.admins}</div>
              </CardContent>
            </Card>
          </div>

          {/* Filter */}          
          <div className="mb-8 flex flex-col md:flex-row gap-4">
            <div className="relative flex-1 md:max-w-md">
              <input
                type="text"
                placeholder="Поиск по имени, email или телефону..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-4 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Все роли" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все роли</SelectItem>
                <SelectItem value="student">Ученики</SelectItem>
                <SelectItem value="teacher">Преподаватели</SelectItem>
                <SelectItem value="admin">Администраторы</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Users List */}
          <div className="space-y-4">
            {loading ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-gray-500">Загрузка...</p>
                </CardContent>
              </Card>
            ) : filteredUsers.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-gray-500">Нет пользователей</p>
                </CardContent>
              </Card>
            ) : (
              paginatedUsers.map((user) => (
                <Card key={user.id}>
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                      <Avatar className="w-14 h-14">
                        <AvatarFallback className={`${
                          user.role === "admin"
                            ? "bg-purple-100 text-purple-700"
                            : user.role === "teacher"
                              ? "bg-green-100 text-green-700"
                              : "bg-blue-100 text-blue-700"
                        } text-lg`}>
                          {getInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h3 className="text-xl font-semibold">{user.name}</h3>
                          <Badge className={`${roleBadgeStyles[user.role]} flex items-center gap-1`}>
                            {getRoleIcon(user.role)}
                            {roleLabels[user.role]}
                          </Badge>
                          {currentUser?.id === user.id && (
                            <Badge variant="outline">Это вы</Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2 mb-4 text-sm">
                          <div>
                            <span className="text-gray-500">Email:</span>{" "}
                            <span className="text-gray-900 break-all">{user.email}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Телефон:</span>{" "}
                            <span className="text-gray-900 break-words">{user.phone || "Не указан"}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Дата регистрации:</span>{" "}
                            <span className="text-gray-900">
                              {user.created_at
                                ? new Date(user.created_at).toLocaleDateString("ru")
                                : "—"}
                            </span>
                          </div>
                        </div>

                        {/* Additional info based on role */}
                        {user.role === "teacher" && user.hourly_rate && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="text-gray-500">Ставка:</span>{" "}
                            {user.hourly_rate} ₸/час
                          </div>
                        )}
                        {user.role === "teacher" && user.bio && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="text-gray-500">О себе:</span>{" "}
                            {user.bio}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center gap-2 sm:self-start">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditModal(user)}
                        >
                          <Pencil className="w-4 h-4 mr-1" />
                          Редактировать
                        </Button>

                        {currentUser?.id !== user.id && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Удалить пользователя?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Вы уверены, что хотите удалить пользователя{" "}
                                  <strong>{user.name}</strong>? Это действие нельзя
                                  отменить. Все связанные данные будут удалены.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Отмена</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteUser(user.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Удалить
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <AdminPagination
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          />
        </main>
      </div>

      {/* Edit User Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Редактирование пользователя</DialogTitle>
            <DialogDescription>
              Измените данные пользователя и нажмите Сохранить
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Имя</Label>
              <Input
                id="name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Введите имя"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="Введите email"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Телефон</Label>
              <Input
                id="phone"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="Введите телефон"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Роль</Label>
              <Select
                value={editForm.role}
                onValueChange={(value) => setEditForm({ ...editForm, role: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите роль" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Ученик</SelectItem>
                  <SelectItem value="teacher">Преподаватель</SelectItem>
                  <SelectItem value="admin">Администратор</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSaveUser} disabled={saving}>
              {saving ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
