'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Clock, MapPin, Calendar, BookOpen, Settings, BarChart, Loader2 } from 'lucide-react';
import { API, handleApiError } from '@/lib/api';

interface GroupManagementModalProps {
  isOpen: boolean;
  onCloseAction: () => void;
  groupId: number;
  groupName: string;
}

interface Student {
  id: number;
  name: string;
  attendance_rate: number;
  last_attendance: string;
  status: string;
}

interface GroupStats {
  total_students: number;
  active_students: number;
  average_attendance: number;
  total_lessons: number;
  upcoming_lessons: number;
}

interface ScheduledLesson {
  groupId: number;
  groupName: string;
  lessonDate: string;
  lessonTime: string;
  lessonDateTime: string;
  hallName: string;
  students: {
    studentId: number;
    studentName: string;
    attendance?: boolean | null;
  }[];
  isCompleted: boolean;
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

export default function GroupManagementModal({
  isOpen,
  onCloseAction,
  groupId,
  groupName
}: GroupManagementModalProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [students, setStudents] = useState<Student[]>([]);
  const [groupStats, setGroupStats] = useState<GroupStats | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [attendanceData, setAttendanceData] = useState<Record<string, Record<number, string>>>({});
  const [loading, setLoading] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [groupNotes, setGroupNotes] = useState('');

  useEffect(() => {
    if (isOpen && groupId) {
      fetchGroupData();
    }
  }, [isOpen, groupId]);

  const fetchGroupData = async () => {
    setLoading(true);
    try {
      const [studentsRes, statsRes, groupRes, lessonsRes] = await Promise.all([
        API.teachers.getGroupStudents(groupId),
        API.teachers.getGroupStats(groupId),
        API.teachers.getGroupDetails(groupId),
        API.teachers.getGroupLessons(groupId)
      ]);

      setStudents(studentsRes.students || []);
      setGroupStats(statsRes.stats || null);
      setGroupNotes(groupRes.notes || '');
      setLessons(lessonsRes.lessons || []);

    } catch (error) {
      console.error('Error fetching group data:', error);
      handleApiError(error);
      setStudents([]);
      setGroupStats(null);
      setLessons([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      await API.teachers.saveGroupNotes(groupId!, groupNotes);
      alert('Заметки сохранены!');
    } catch (error) {
      console.error('Error saving notes:', error);
      handleApiError(error);
      alert('Ошибка при сохранении заметок');
    }
  };

  const updateAttendance = (lessonKey: string, studentId: number, status: string) => {
    setAttendanceData(prev => ({
      ...prev,
      [lessonKey]: {
        ...prev[lessonKey],
        [studentId]: status
      }
    }))
  }

  const saveAttendance = async (lesson: Lesson) => {
    const lessonKey = `${groupId}-${lesson.lesson_date}`
    const attendanceRecords = attendanceData[lessonKey] || {}

    try {
      const attendance_records = Object.entries(attendanceRecords).map(([studentId, status]) => ({
        student_id: parseInt(studentId),
        status: status
      }))

      await API.teachers.saveAttendance(groupId!, {
        lesson_date: lesson.lesson_date,
        attendance_records
      });

      alert('Посещаемость сохранена!');
      fetchGroupData();
    } catch (err) {
      console.error('Error saving attendance:', err);
      alert('Ошибка при сохранении посещаемости');
    }
  }

  const getAttendanceButtonClass = (baseClass: string, isSelected: boolean) => {
    return `${baseClass} ${isSelected ? 'ring-2 ring-offset-1' : 'hover:scale-105'} transition-all`
  }

  const handleAttendanceUpdate = async (lessonId: number, studentId: number, status: 'P' | 'E' | 'L' | 'A') => {

    setAttendanceLoading(true);
    try {
      await API.teachers.saveLessonAttendance(lessonId, {
        attendance_records: [{
          student_id: studentId,
          status: status
        }]
      });

      setLessons(prev => prev.map(lesson => {
        if (lesson.id === lessonId) {
          return {
            ...lesson,
            attendance_records: lesson.attendance_records.map(record =>
              record.student_id === studentId
                ? { ...record, status, attended: status === 'P' || status === 'E' || status === 'L' }
                : record
            )
          };
        }
        return lesson;
      }));

    } catch (error) {
      console.error('Error updating attendance:', error);
      handleApiError(error);
      alert('Ошибка при сохранении посещаемости');
    } finally {
      setAttendanceLoading(false);
    }
  };

  const hasData = students.length > 0 || groupStats !== null;

  return (
    <Dialog open={isOpen} onOpenChange={onCloseAction}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">`
            <Users className="w-5 h-5" />
            Управление группой: {groupName}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Обзор</TabsTrigger>
            <TabsTrigger value="students">Студенты</TabsTrigger>
            <TabsTrigger value="schedule">Расписание</TabsTrigger>
            <TabsTrigger value="notes">Заметки</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="ml-2">Загрузка данных...</span>
              </div>
            ) : groupStats ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-blue-600" />
                      <span className="text-sm text-blue-600 font-medium">Всего студентов</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-900">{groupStats.total_students}</p>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart className="w-4 h-4 text-green-600" />
                      <span className="text-sm text-green-600 font-medium">Посещаемость</span>
                    </div>
                    <p className="text-2xl font-bold text-green-900">{groupStats.average_attendance}%</p>
                  </div>

                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen className="w-4 h-4 text-purple-600" />
                      <span className="text-sm text-purple-600 font-medium">Проведено уроков</span>
                    </div>
                    <p className="text-2xl font-bold text-purple-900">{groupStats.total_lessons}</p>
                  </div>

                  <div className="bg-orange-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4 text-orange-600" />
                      <span className="text-sm text-orange-600 font-medium">Предстоящие</span>
                    </div>
                    <p className="text-2xl font-bold text-orange-900">{groupStats.upcoming_lessons}</p>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">Быстрые действия</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <Button variant="outline" className="justify-start">
                      <Calendar className="w-4 h-4 mr-2" />
                      Создать урок
                    </Button>
                    <Button variant="outline" className="justify-start">
                      <Users className="w-4 h-4 mr-2" />
                      Добавить студента
                    </Button>
                    <Button variant="outline" className="justify-start">
                      <BarChart className="w-4 h-4 mr-2" />
                      Отчет по группе
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">Нет данных о группе или ошибка загрузки</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="students" className="space-y-4 mt-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Список студентов</h3>
              <Button>
                <Users className="w-4 h-4 mr-2" />
                Добавить студента
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="ml-2">Загрузка студентов...</span>
              </div>
            ) : students.length > 0 ? (
              <div className="space-y-2">
                {students.map((student: Student) => (
                  <div key={student.id} className="flex items-center justify-between p-3 bg-white border rounded-lg">
                    <div>
                      <p className="font-medium">{student.name}</p>
                      <p className="text-sm text-gray-500">
                        Последнее посещение: {new Date(student.last_attendance).toLocaleDateString('ru-RU')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${
                        student.attendance_rate >= 90 ? 'text-green-600' :
                        student.attendance_rate >= 75 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {student.attendance_rate}% посещаемость
                      </p>
                      <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                        student.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {student.status === 'active' ? 'Активен' : 'Неактивен'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Нет данных о студентах или ошибка загрузки</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="schedule" className="space-y-4 mt-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Расписание и посещаемость</h3>
                <div className="flex gap-2 text-sm text-gray-600">
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded">P - Присутствовал</span>
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">E - Уважительная</span>
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">L - Опоздал</span>
                  <span className="px-2 py-1 bg-red-100 text-red-700 rounded">A - Отсутствовал</span>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="ml-2">Загрузка расписания...</span>
                </div>
              ) : lessons.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {lessons.map((lesson, index) => {
                    const lessonKey = `${groupId}-${lesson.lesson_date}`
                    const currentAttendance = attendanceData[lessonKey] || {}

                    return (
                      <div key={lesson.id} className="border rounded-lg p-4 bg-white">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-semibold text-lg">{lesson.class_name}</h4>
                            <p className="text-sm text-gray-600">
                              {lesson.lesson_date} в {lesson.start_time} ({lesson.duration_minutes} мин) - {lesson.hall_name}
                            </p>
                            {lesson.is_cancelled && (
                              <span className="inline-block px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full mt-1">
                                Отменено
                              </span>
                            )}
                          </div>
                        </div>

                        {!lesson.is_cancelled && (
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-gray-700">Отметить посещаемость:</p>
                            <div className="grid gap-2">
                              {lesson.attendance_records.map((record) => (
                                <div key={record.student_id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                  <span className="font-medium">{record.student_name}</span>
                                  <div className="flex gap-1">
                                    {['P', 'E', 'L', 'A'].map((status) => (
                                      <button
                                        key={status}
                                        disabled={attendanceLoading}
                                        onClick={() => handleAttendanceUpdate(lesson.id, record.student_id, status as 'P' | 'E' | 'L' | 'A')}
                                        className={getAttendanceButtonClass(
                                          `w-8 h-8 text-xs font-bold rounded ${
                                            record.status === status
                                              ? status === 'P' ? 'bg-green-500 text-white' :
                                                status === 'E' ? 'bg-blue-500 text-white' :
                                                status === 'L' ? 'bg-yellow-500 text-white' :
                                                'bg-red-500 text-white'
                                              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                          }`,
                                          record.status === status
                                        )}
                                        title={
                                          status === 'P' ? 'Присутствовал' :
                                          status === 'E' ? 'Уважительная причина' :
                                          status === 'L' ? 'Опоздал' : 'Отсутствовал'
                                        }
                                      >
                                        {status}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {Object.keys(currentAttendance).length > 0 && (
                              <button
                                onClick={() => saveAttendance(lesson)}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors mt-3"
                              >
                                Сохранить посещаемость
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Нет запланированных занятий</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Убедитесь, что у группы установлено расписание с датами начала и окончания.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="notes" className="space-y-4 mt-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="groupNotes">Заметки к группе</Label>
                <Textarea
                  id="groupNotes"
                  value={groupNotes}
                  onChange={(e) => setGroupNotes(e.target.value)}
                  placeholder="Добавьте заметки о группе, особенности студентов, планы на занятия..."
                  rows={8}
                  className="mt-1"
                />
              </div>
              <Button onClick={handleSaveNotes}>
                Сохранить заметки
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onCloseAction}>
            Закрыть
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
