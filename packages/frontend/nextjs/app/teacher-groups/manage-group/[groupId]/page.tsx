'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Clock, MapPin, Calendar, BookOpen, Settings, BarChart, Loader2, ArrowLeft } from 'lucide-react';
import TeacherAttendanceManager from '@/components/teacher-attendance-manager';
import { API } from '@/lib/api';

interface Student {
  id: number;
  name: string;
  email?: string;
  phone_number?: string | null;
  is_trial?: boolean;
  joined_at?: string | null;
  trial_selected_lesson_start_time?: string | null;
}

interface GroupStats {
  total_students: number;
  active_students: number;
  average_attendance: number;
  total_lessons: number;
  upcoming_lessons: number;
}

interface Lesson {
  id: number;
  lesson_date: string;
  start_time: string;
  duration_minutes: number;
  class_name: string;
  hall_name: string;
  is_cancelled: boolean;
  attendance_records: AttendanceRecord[];
}

interface AttendanceRecord {
  id: number;
  student_id: number;
  student_name: string;
  attended: boolean;
  status: 'P' | 'E' | 'L' | 'A' | null;
  recorded_at: string;
}

interface GroupDetails {
  id: number;
  name: string;
  notes: string;
  capacity: number;
  hall_name: string;
}

export default function ManageGroupPage() {
  const params = useParams();
  const router = useRouter();
  const groupId = params.groupId as string;

  const [activeTab, setActiveTab] = useState('overview');
  const [students, setStudents] = useState<Student[]>([]);
  const [groupStats, setGroupStats] = useState<GroupStats | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [groupDetails, setGroupDetails] = useState<GroupDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [groupNotes, setGroupNotes] = useState('');

  const formatTrialSelectedLessonPretty = (value: string | null | undefined): string | null => {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null

    const weekdayRaw = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "Asia/Almaty" }).format(d)
    const weekday = weekdayRaw.replace(/\.$/, "")
    const weekdayCapitalized = weekday.length > 0 ? weekday[0].toUpperCase() + weekday.slice(1) : weekday

    const dateRaw = new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Almaty",
    }).format(d)
    const date = dateRaw.replace(/\s?г\.?$/, "")

    const time = new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Almaty",
    }).format(d)

    return `${weekdayCapitalized} · ${date} · ${time}`
  }

  useEffect(() => {
    if (groupId) {
      fetchGroupData();
    }
  }, [groupId]);

  const fetchGroupData = async () => {
    setLoading(true);
    try {
      const [studentsData, statsData, groupData, lessonsData] = await Promise.all([
        API.teachers.getGroupStudents(Number(groupId)),
        API.teachers.getGroupStats(Number(groupId)),
        API.teachers.getGroupDetails(Number(groupId)),
        API.teachers.getGroupLessons(Number(groupId)),
      ])

      setStudents(studentsData.students || [])
      setGroupStats(statsData.stats || null)
      setGroupDetails(groupData)
      setGroupNotes(groupData.notes || '')
      setLessons(lessonsData.lessons || [])
    } catch (error) {
      console.error('Error fetching group data:', error);
      setStudents([]);
      setGroupStats(null);
      setLessons([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      await API.teachers.saveGroupNotes(Number(groupId), groupNotes)
      alert('Заметки сохранены!');
    } catch (error) {
      console.error('Error saving notes:', error);
    }
  };

  const handleAttendanceUpdate = async (lessonId: number, studentId: number, status: 'P' | 'E' | 'L' | 'A') => {
    setAttendanceLoading(true);
    try {
      await API.teachers.saveLessonAttendance(lessonId, {
        attendance_records: [{
          student_id: studentId,
          status: status
        }]
      })

        setLessons(prev => prev.map(lesson => {
          if (lesson.id === lessonId) {
            const existingRecordIndex = lesson.attendance_records?.findIndex(
              r => r.student_id === studentId
            );

            const newRecord: AttendanceRecord = {
              id: 0,
              student_id: studentId,
              student_name: students.find(s => s.id === studentId)?.name || '',
              attended: status === 'P' || status === 'E' || status === 'L',
              status: status,
              recorded_at: new Date().toISOString()
            };

            if (existingRecordIndex !== undefined && existingRecordIndex >= 0) {
              const updatedRecords = [...(lesson.attendance_records || [])];
              updatedRecords[existingRecordIndex] = newRecord;
              return { ...lesson, attendance_records: updatedRecords };
            } else {
              return {
                ...lesson,
                attendance_records: [...(lesson.attendance_records || []), newRecord]
              };
            }
          }
          return lesson;
        }));
    } catch (error) {
      console.error('Error updating attendance:', error);
    } finally {
      setAttendanceLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => router.push('/teacher-groups')}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Назад к группам
              </Button>
              <div>
                <h1 className="text-2xl font-bold">
                  Управление группой: {groupDetails?.name || 'Загрузка...'}
                </h1>
                <p className="text-gray-600">
                  {groupDetails?.hall_name && `Зал: ${groupDetails.hall_name} • `}
                  Вместимость: {groupDetails?.capacity || 0} человек
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart className="w-4 h-4" />
              Обзор
            </TabsTrigger>
            <TabsTrigger value="attendance" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Посещаемость
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Заметки
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupStats ? (
                <>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Всего студентов</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{groupStats.total_students}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Активных студентов</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{groupStats.active_students}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Средняя посещаемость</CardTitle>
                      <BarChart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{groupStats.average_attendance}%</div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <div className="col-span-3 text-center py-8">
                  {loading ? (
                    <div className="flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span className="ml-2">Загрузка статистики...</span>
                    </div>
                  ) : (
                    <p className="text-gray-500">Нет данных для отображения</p>
                  )}
                </div>
              )}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Пробные записи</CardTitle>
                <CardDescription>Выбранное время пробного урока для учеников</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span className="ml-2">Загрузка...</span>
                  </div>
                ) : (
                  (() => {
                    const trialStudents = (students || []).filter((s) => Boolean(s.is_trial))
                    if (trialStudents.length === 0) {
                      return <p className="text-sm text-muted-foreground">Нет пробных учеников</p>
                    }

                    return (
                      <div className="space-y-3">
                        {trialStudents.map((s) => (
                          <div key={s.id} className="flex items-center justify-between rounded-lg border bg-white p-3">
                            <div>
                              <div className="font-medium text-gray-900">{s.name}</div>
                              {s.email && <div className="text-xs text-gray-500">{s.email}</div>}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium text-gray-900">
                                {formatTrialSelectedLessonPretty(s.trial_selected_lesson_start_time) || "—"}
                              </div>
                              <div className="text-xs text-gray-500">выбранное время</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="attendance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Посещаемость</CardTitle>
                <CardDescription>
                  Отмечать посещаемость студентов
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TeacherAttendanceManager groupId={parseInt(groupId)} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Заметки к группе</CardTitle>
                <CardDescription>
                  Добавьте заметки о группе, особенности студентов, планы на занятия...
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="groupNotes">Заметки</Label>
                  <Textarea
                    id="groupNotes"
                    value={groupNotes}
                    onChange={(e) => setGroupNotes(e.target.value)}
                    placeholder="Введите ваши заметки..."
                    rows={12}
                    className="mt-1"
                  />
                </div>
                <Button onClick={handleSaveNotes} className="w-full">
                  Сохранить заметки
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
