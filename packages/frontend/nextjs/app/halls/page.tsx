"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AdminHeader } from "@/components/admin-header";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  Users,
  Calendar,
  Clock,
  MapPin,
  Plus,
  Trash,
  PencilSimple,
  House,
  TrendUp,
  CaretDown,
  CaretUp,
  ChalkboardTeacher,
  Student,
  CalendarBlank,
  Info,
  Tag
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { buildLoginUrl, DEFAULT_SESSION_EXPIRED_MESSAGE } from "@/lib/auth";
import { API, AUTH_REQUIRED_MESSAGE, handleApiError } from "@/lib/api";

interface Hall {
  id: number;
  name: string;
  capacity: number;
}

interface HallGroup {
  id: number;
  name: string;
  className: string;
  capacity: number;
  studentCount: number;
  durationMinutes: number;
  teacherId: number | null;
  teacherName: string;
  schedule: string;
}

interface HallDetails {
  id: number;
  name: string;
  capacity: number;
  groups: HallGroup[];
  todayLessons: any[];
  stats: {
    totalGroups: number;
    totalStudents: number;
    uniqueTeachers: number;
  };
}

export default function HallsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { sidebarWidth } = useSidebar();
  const [halls, setHalls] = useState<Hall[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedHall, setSelectedHall] = useState<Hall | null>(null);
  const [formData, setFormData] = useState({ name: "", capacity: "" });
  const [saving, setSaving] = useState(false);

  const [expandedHallId, setExpandedHallId] = useState<number | null>(null);
  const [hallDetails, setHallDetails] = useState<HallDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    checkAuthAndFetchData();
  }, []);

  const checkAuthAndFetchData = async () => {
    try {
      let userData: any
      try {
        userData = await API.users.me();
      } catch (err) {
        const message = handleApiError(err)
        if (message === AUTH_REQUIRED_MESSAGE) {
          router.push(buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname }))
          return
        }
        throw err
      }
      if (userData.user.role !== "admin") {
        toast.error("Доступ запрещен. Только для администраторов.");
        router.push("/");
        return;
      }

      setUser(userData.user);

      await fetchHalls();
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHalls = async () => {
    try {
      const data = await API.halls.getAll();
      setHalls(data.halls || []);
    } catch (error) {
      handleApiError(error);
    }
  };

  const fetchHallDetails = async (hallId: number) => {
    setLoadingDetails(true);
    try {
      const data = await API.halls.getDetails(hallId);
      setHallDetails(data);
    } catch (error) {
      console.error("Error fetching hall details:", error);
      toast.error("Не удалось загрузить информацию о зале");
    } finally {
      setLoadingDetails(false);
    }
  };

  const toggleHallExpand = async (hallId: number) => {
    if (expandedHallId === hallId) {
      setExpandedHallId(null);
      setHallDetails(null);
    } else {
      setExpandedHallId(hallId);
      await fetchHallDetails(hallId);
    }
  };

  const handleCreateHall = async () => {
    if (!formData.name.trim()) {
      toast.error("Введите название зала");
      return;
    }
    if (!formData.capacity || parseInt(formData.capacity) <= 0) {
      toast.error("Введите корректную вместимость");
      return;
    }

    setSaving(true);
    try {
      await API.halls.create({
        name: formData.name.trim(),
        capacity: parseInt(formData.capacity)
      });
      toast.success("Зал успешно создан");
      setCreateDialogOpen(false);
      setFormData({ name: "", capacity: "" });
      await fetchHalls();
    } catch (error) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  };

  const handleEditHall = async () => {
    if (!selectedHall) return;

    if (!formData.name.trim()) {
      toast.error("Введите название зала");
      return;
    }
    if (!formData.capacity || parseInt(formData.capacity) <= 0) {
      toast.error("Введите корректную вместимость");
      return;
    }

    setSaving(true);
    try {
      await API.halls.update(selectedHall.id, {
        name: formData.name.trim(),
        capacity: parseInt(formData.capacity)
      });
      toast.success("Зал успешно обновлен");
      setEditDialogOpen(false);
      setSelectedHall(null);
      setFormData({ name: "", capacity: "" });
      await fetchHalls();
      if (expandedHallId === selectedHall.id) {
        await fetchHallDetails(selectedHall.id);
      }
    } catch (error) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHall = async () => {
    if (!selectedHall) return;

    setSaving(true);
    try {
      await API.halls.delete(selectedHall.id);
      toast.success("Зал успешно удален");
      setDeleteDialogOpen(false);
      setSelectedHall(null);
      if (expandedHallId === selectedHall.id) {
        setExpandedHallId(null);
        setHallDetails(null);
      }
      await fetchHalls();
    } catch (error) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = (hall: Hall, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedHall(hall);
    setFormData({ name: hall.name, capacity: hall.capacity.toString() });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (hall: Hall, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedHall(hall);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <AdminSidebar />

      <div className={sidebarWidth + " transition-all duration-300"}>
        <AdminHeader userName={user?.name} userEmail={user?.email} />
        <main className="p-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Залы</h2>
              <p className="text-gray-500 mt-1">Управление залами академии</p>
            </div>
            <Button onClick={() => { setFormData({ name: "", capacity: "" }); setCreateDialogOpen(true); }}>
              <Plus className="w-5 h-5 mr-2" />Создать зал
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-500">Загрузка залов...</p>
            </div>
          ) : halls.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <House className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">Залы не найдены</p>
                  <Button onClick={() => { setFormData({ name: "", capacity: "" }); setCreateDialogOpen(true); }}>
                    <Plus className="w-5 h-5 mr-2" />Создать первый зал
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {halls.map((hall) => (
                <Card key={hall.id} className="overflow-hidden">
                  <div className="p-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => toggleHallExpand(hall.id)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                          <House className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{hall.name}</h3>
                          <p className="text-sm text-gray-500"><Users className="w-4 h-4 inline mr-1" />Вместимость: {hall.capacity} чел.</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button variant="outline" size="sm" onClick={(e) => openEditDialog(hall, e)}><PencilSimple className="w-4 h-4" /></Button>
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={(e) => openDeleteDialog(hall, e)}><Trash className="w-4 h-4" /></Button>
                        <div className="w-8 h-8 flex items-center justify-center text-gray-400">
                          {expandedHallId === hall.id ? <CaretUp className="w-5 h-5" /> : <CaretDown className="w-5 h-5" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {expandedHallId === hall.id && (
                    <div className="border-t bg-gray-50">
                      {loadingDetails ? (
                        <div className="p-8 text-center">
                          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                          <p className="text-gray-500 text-sm">Загрузка информации...</p>
                        </div>
                      ) : hallDetails ? (
                        <div className="p-4 space-y-6">
                          <div className="grid grid-cols-3 gap-4">
                            <div className="bg-white rounded-lg p-4 border">
                              <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Users className="w-5 h-5 text-blue-600" /></div>
                                <div><p className="text-2xl font-bold text-gray-900">{hallDetails.stats.totalGroups}</p><p className="text-sm text-gray-500">Активных групп</p></div>
                              </div>
                            </div>
                            <div className="bg-white rounded-lg p-4 border">
                              <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center"><Student className="w-5 h-5 text-green-600" /></div>
                                <div><p className="text-2xl font-bold text-gray-900">{hallDetails.stats.totalStudents}</p><p className="text-sm text-gray-500">Всего учеников</p></div>
                              </div>
                            </div>
                            <div className="bg-white rounded-lg p-4 border">
                              <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><ChalkboardTeacher className="w-5 h-5 text-purple-600" /></div>
                                <div><p className="text-2xl font-bold text-gray-900">{hallDetails.stats.uniqueTeachers}</p><p className="text-sm text-gray-500">Преподавателей</p></div>
                              </div>
                            </div>
                          </div>

                          <div className="bg-white rounded-lg border">
                            <div className="p-4 border-b"><h4 className="font-semibold text-gray-900 flex items-center"><CalendarBlank className="w-5 h-5 mr-2 text-purple-600" />Группы и расписание в этом зале</h4></div>
                            {hallDetails.groups.length === 0 ? (
                              <div className="p-8 text-center text-gray-500"><Info className="w-8 h-8 mx-auto mb-2 text-gray-400" /><p>В этом зале пока нет групп</p></div>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Группа</TableHead>
                                    <TableHead>Направление</TableHead>
                                    <TableHead>Преподаватель</TableHead>
                                    <TableHead>Расписание</TableHead>
                                    <TableHead>Учеников</TableHead>
                                    <TableHead>Длительность</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {hallDetails.groups.map((group) => (
                                    <TableRow key={group.id} className="cursor-pointer hover:bg-gray-50" onClick={() => router.push("/groups?selected=" + group.id)}>
                                      <TableCell className="font-medium"><span className="text-purple-600 hover:underline">{group.name}</span></TableCell>
                                      <TableCell>{group.className ? <Badge variant="outline">{group.className}</Badge> : <span className="text-gray-400">—</span>}</TableCell>
                                      <TableCell>
                                        <div className="flex items-center space-x-2">
                                          <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center"><ChalkboardTeacher className="w-3 h-3 text-purple-600" /></div>
                                          <span className={group.teacherId ? "" : "text-gray-400"}>{group.teacherName}</span>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        {group.schedule !== "Не назначено" ? (
                                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100"><Clock className="w-3 h-3 mr-1" />{group.schedule}</Badge>
                                        ) : (<span className="text-gray-400 text-sm">Не назначено</span>)}
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center space-x-1">
                                          <span className={"font-medium " + (group.studentCount >= group.capacity ? "text-red-600" : "")}>{group.studentCount}</span>
                                          <span className="text-gray-400">/ {group.capacity}</span>
                                        </div>
                                      </TableCell>
                                      <TableCell><span className="text-gray-600">{group.durationMinutes} мин</span></TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </div>

                          {hallDetails.todayLessons.length > 0 && (
                            <div className="bg-white rounded-lg border">
                              <div className="p-4 border-b"><h4 className="font-semibold text-gray-900 flex items-center"><Calendar className="w-5 h-5 mr-2 text-blue-600" />Занятия сегодня</h4></div>
                              <div className="p-4">
                                <div className="space-y-2">
                                  {hallDetails.todayLessons.map((lesson) => (
                                    <div key={lesson.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                      <div className="flex items-center space-x-3">
                                        <div className="text-sm font-medium text-gray-900">{new Date(lesson.startTime).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</div>
                                        <div><p className="font-medium">{lesson.groupName}</p><p className="text-sm text-gray-500">{lesson.className} • {lesson.teacherName}</p></div>
                                      </div>
                                      <Badge variant="outline">{lesson.duration} мин</Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Создать новый зал</DialogTitle><DialogDescription>Введите информацию о новом зале</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label htmlFor="name">Название зала</Label><Input id="name" placeholder="Например: Зал 1" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="capacity">Вместимость (человек)</Label><Input id="capacity" type="number" placeholder="Например: 20" min="1" value={formData.capacity} onChange={(e) => setFormData({ ...formData, capacity: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Отмена</Button><Button onClick={handleCreateHall} disabled={saving}>{saving ? "Создание..." : "Создать"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Редактировать зал</DialogTitle><DialogDescription>Измените информацию о зале</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label htmlFor="edit-name">Название зала</Label><Input id="edit-name" placeholder="Например: Зал 1" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="edit-capacity">Вместимость (человек)</Label><Input id="edit-capacity" type="number" placeholder="Например: 20" min="1" value={formData.capacity} onChange={(e) => setFormData({ ...formData, capacity: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditDialogOpen(false)}>Отмена</Button><Button onClick={handleEditHall} disabled={saving}>{saving ? "Сохранение..." : "Сохранить"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Удалить зал?</AlertDialogTitle><AlertDialogDescription>Вы уверены, что хотите удалить зал "{selectedHall?.name}"? Это действие нельзя отменить. Если зал используется группами, удаление будет невозможно.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={handleDeleteHall} className="bg-red-600 hover:bg-red-700" disabled={saving}>{saving ? "Удаление..." : "Удалить"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
