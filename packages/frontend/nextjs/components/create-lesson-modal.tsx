'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { API, handleApiError } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Loader2 } from 'lucide-react';
import { format } from "date-fns"
import { ru } from "date-fns/locale"

interface CreateLessonModalProps {
  isOpen: boolean;
  onCloseAction: () => void;
  onSubmitAction: (lessonData: any) => void;
}

interface Hall {
  id: number;
  name: string;
  capacity: number;
}

interface Group {
  id: number;
  name: string;
  capacity: number;
  hall_name: string;
}

interface Teacher {
  id: number;
  name: string;
}

export default function CreateLessonModal({ isOpen, onCloseAction, onSubmitAction }: CreateLessonModalProps) {
  const [activeTab, setActiveTab] = useState('details');
  const [lessonType, setLessonType] = useState('group');
  const [halls, setHalls] = useState<Hall[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    type: 'group',
    group: '',
    teacher: '',
    date: '',
    startTime: '',
    duration: '60',
    hall: '',
    direction: '',
    topic: '',
    comment: '',
    repeat: 'none',
    additional: false
  });

  useEffect(() => {
    if (isOpen) {
      fetchDropdownData();
    }
  }, [isOpen]);

  const fetchDropdownData = async () => {
    setLoading(true);
    try {
      let userIsAdmin = false;
      try {
        const userData = await API.users.me();
        userIsAdmin = userData.user.role === 'admin';
        setIsAdmin(userIsAdmin);

      } catch (e) {
        console.error('Failed to get user data:', e);
      }

      try {
        const hallsData = await API.halls.getAll();

        setHalls(hallsData.halls || []);
      } catch (error) {
        console.error('Failed to fetch halls:', error);
      }

      try {
        let groupsData;
        if (userIsAdmin) {

          groupsData = await API.groups.getAll();
        } else {

          groupsData = await API.teachers.getMyGroups();
        }

        const groupsList = groupsData.groups || [];
        setGroups(groupsList);
      } catch (error) {
        console.error('Failed to fetch groups:', error);
      }

      if (userIsAdmin) {
        try {
          const teachersData = await API.teachers.getAll();

          setTeachers(teachersData.teachers || []);
        } catch (error) {
          console.error('Failed to fetch teachers:', error);
        }
      }
    } catch (error) {
      console.error('Error fetching dropdown data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.date || !formData.startTime) {
      alert('Пожалуйста, заполните дату и время начала');
      return;
    }

    if (isAdmin && !formData.teacher) {
      alert('Пожалуйста, выберите учителя');
      return;
    }

    setSubmitting(true);
    try {

      const data = await API.lessons.create(formData);

      onSubmitAction(data);

      setFormData({
        type: 'group',
        group: '',
        teacher: '',
        date: '',
        startTime: '',
        duration: '60',
        hall: '',
        direction: '',
        topic: '',
        comment: '',
        repeat: 'none',
        additional: false
      });
      onCloseAction();
      alert('Урок успешно создан!');
    } catch (error) {
      console.error('Error creating lesson:', error);
      handleApiError(error);
      alert('Ошибка при создании урока');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onCloseAction}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Создать урок
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Детали урока</TabsTrigger>
            <TabsTrigger value="attendance">Посещаемость</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6 mt-6">
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="ml-2">Загрузка данных...</span>
              </div>
            )}

            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <input
                type="checkbox"
                id="additional"
                checked={formData.additional}
                onChange={(e) => handleInputChange('additional', e.target.checked)}
                className="rounded"
              />
              <label htmlFor="additional">Дополнительный урок</label>
            </div>

            <div>
              <Label className="text-base font-medium">Тип урока *</Label>
              <RadioGroup
                value={lessonType}
                onValueChange={(value) => {
                  setLessonType(value);
                  handleInputChange('type', value);
                }}
                className="flex gap-6 mt-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="individual" id="individual" />
                  <label htmlFor="individual">Индивидуальный</label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="group" id="group" />
                  <label htmlFor="group">Групповой</label>
                </div>
              </RadioGroup>
            </div>

            <div>
              <Label htmlFor="group">Группа *</Label>
              <Select value={formData.group} onValueChange={(value) => handleInputChange('group', value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Выберите группу" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.name} - {group.hall_name} ({group.capacity} мест)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isAdmin && (
              <div>
                <Label htmlFor="teacher">Учитель *</Label>
                <Select value={formData.teacher} onValueChange={(value) => handleInputChange('teacher', value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Выберите учителя" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id.toString()}>
                        {teacher.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date">Дата *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal mt-1 h-10"
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {formData.date ? (
                        format(new Date(formData.date), "dd/MM/yyyy", { locale: ru })
                      ) : (
                        <span className="text-gray-500">Выберите дату</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={formData.date ? new Date(formData.date) : undefined}
                      onSelect={(date) => {
                        if (date) {
                          handleInputChange('date', date.toISOString().split('T')[0])
                        }
                      }}
                      locale={ru}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label htmlFor="startTime">Время начала *</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => handleInputChange('startTime', e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="duration">Продолжительность (минуты) *</Label>
              <Input
                id="duration"
                type="number"
                value={formData.duration}
                onChange={(e) => handleInputChange('duration', e.target.value)}
                placeholder="60"
                className="mt-1"
              />
              <p className="text-sm text-gray-500 mt-1">Рекомендуемые значения: 30, 45, 60, 90, 120 минут</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="hall">Зал *</Label>
                <Select value={formData.hall} onValueChange={(value) => handleInputChange('hall', value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Выберите зал" />
                  </SelectTrigger>
                  <SelectContent>
                    {halls.map((hall) => (
                      <SelectItem key={hall.id} value={hall.id.toString()}>
                        {hall.name} ({hall.capacity} мест)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="direction">Направление *</Label>
                <Select value={formData.direction} onValueChange={(value) => handleInputChange('direction', value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Выберите направление" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ballet">Балет</SelectItem>
                    <SelectItem value="contemporary">Современные танцы</SelectItem>
                    <SelectItem value="hip-hop">Хип-хоп</SelectItem>
                    <SelectItem value="latin">Латина</SelectItem>
                    <SelectItem value="jazz">Джаз</SelectItem>
                    <SelectItem value="street">Уличные танцы</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="topic">Тема занятия</Label>
              <Input
                id="topic"
                value={formData.topic}
                onChange={(e) => handleInputChange('topic', e.target.value)}
                placeholder="Например: Базовые движения"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="comment">Комментарий</Label>
              <Textarea
                id="comment"
                value={formData.comment}
                onChange={(e) => handleInputChange('comment', e.target.value)}
                placeholder="Дополнительная информация"
                className="mt-1"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="repeat">Повтор</Label>
              <Select value={formData.repeat} onValueChange={(value) => handleInputChange('repeat', value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Не повторяется" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не повторяется</SelectItem>
                  <SelectItem value="weekly">Еженедельно</SelectItem>
                  <SelectItem value="biweekly">Раз в две недели</SelectItem>
                  <SelectItem value="monthly">Ежемесячно</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="attendance" className="space-y-4 mt-6">
            <div className="text-center py-8">
              <p className="text-gray-500">Данные о посещаемости будут доступны после создания урока</p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onCloseAction} disabled={submitting}>
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || loading}
            className="bg-black text-white hover:bg-gray-800"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Сохранить
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
