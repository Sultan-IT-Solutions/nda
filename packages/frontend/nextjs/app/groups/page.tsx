"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Users,
  Calendar,
  MapPin,
  Plus,
  Tag,
  ChartBar,
  Clock
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { API, AUTH_REQUIRED_MESSAGE, handleApiError } from "@/lib/api";
import { DEFAULT_SESSION_EXPIRED_MESSAGE, buildLoginUrl } from "@/lib/auth";
import CreateGroupModal from "@/components/create-group-modal";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AdminHeader } from "@/components/admin-header";
import { useSidebar } from "@/hooks/use-sidebar";

interface Group {
  id: number;
  name: string;
  teacherName: string;
  schedule: string;
  hallName: string;
  hallId: number | null;
  studentLimit: number;
  studentCount: number;
  isActive: boolean;
  is_trial: boolean;
  trial_price?: number | null;
  trial_currency?: string | null;
}

export default function GroupsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { sidebarWidth } = useSidebar();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [createGroupModalOpen, setCreateGroupModalOpen] = useState(false);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const userData = await API.users.me();
      setUser(userData.user);

      const data = await API.groups.getAll();
      setGroups(data.groups || []);
    } catch (error) {
      console.error("Error fetching groups:", error);
      const message = handleApiError(error);
      if (message === AUTH_REQUIRED_MESSAGE) {
        router.push(
          buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname })
        );
        return;
      }
  toast.error("Не удалось загрузить классы");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (groupData: any) => {
    try {
      await API.groups.create(groupData);
  toast.success("Класс успешно создан");
      setCreateGroupModalOpen(false);
      fetchGroups();
    } catch (error) {
      console.error("Error creating group:", error);
      handleApiError(error);
  toast.error("Не удалось создать класс");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <AdminSidebar />

      
      <div className={sidebarWidth + " transition-all duration-300"}>
        <AdminHeader userName={user?.name} userEmail={user?.email} />
        <main className="p-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Классы</h2>
              <p className="text-gray-500 mt-1">Управление классами и списками</p>
            </div>
            <Button onClick={() => setCreateGroupModalOpen(true)}>
              <Plus className="w-5 h-5 mr-2" />
              Создать класс
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-500">Загрузка классов...</p>
            </div>
          ) : groups.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <p className="text-center text-gray-500">Нет классов</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groups.map((group) => (
                <Card
                  key={group.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => router.push(`/groups/${group.id}`)}
                >
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-xl">{group.name}</CardTitle>
                      <Badge variant={group.isActive ? "default" : "secondary"}>
                        {group.isActive ? "Класс открыт" : "Класс закрыт"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center text-sm text-gray-600">
                      <Users className="w-4 h-4 mr-2" />
                      <span>Преподаватель: {group.teacherName}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <MapPin className="w-4 h-4 mr-2" />
                      <span>Зал: {group.hallName}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <Tag className="w-4 h-4 mr-2" />
                      <span>Тип:</span>
                      <Badge
                        variant={group.is_trial ? "default" : "secondary"}
                        className={`ml-2 ${group.is_trial ? "bg-purple-600" : ""}`}
                      >
                        {group.is_trial ? "Пробный" : "Регулярный"}
                      </Badge>
                    </div>

                    {group.is_trial && typeof group.trial_price === 'number' && (
                      <div className="flex items-center text-sm text-gray-600">
                        <Tag className="w-4 h-4 mr-2" />
                        <span>Цена пробного: {group.trial_price}{group.trial_currency ? ` ${group.trial_currency}` : ''}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-sm text-gray-600">
                        Учеников: {group.studentCount}/{group.studentLimit}
                      </span>
                      <Badge variant="outline">
                        {Math.round((group.studentCount / group.studentLimit) * 100)}%
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <CreateGroupModal
            isOpen={createGroupModalOpen}
            onCloseAction={() => setCreateGroupModalOpen(false)}
            onSubmitAction={handleCreateGroup}
          />
        </main>
      </div>
    </div>
  );
}
