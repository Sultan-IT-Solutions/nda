'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar, Clock, Info, Loader2 } from 'lucide-react';
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { API, handleApiError } from '@/lib/api';

interface RescheduleLessonModalProps {
  isOpen: boolean;
  onCloseAction: () => void;
  onSubmitAction: (rescheduleData: any) => void;
  currentLesson?: {
    lessonId?: number;
    groupId?: number;
    groupName?: string;
    date: string;
    time: string;
    duration: number;
  } | null;
}

export default function RescheduleLessonModal({
  isOpen,
  onCloseAction,
  onSubmitAction,
  currentLesson
}: RescheduleLessonModalProps) {
  const [formData, setFormData] = useState({
    newDate: '',
    newTime: '',
    reason: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!currentLesson) {
      alert('Пожалуйста, выберите урок для переноса');
      return;
    }

    if (!formData.newDate || !formData.newTime || !formData.reason.trim()) {
      alert('Пожалуйста, заполните все обязательные поля');
      return;
    }

    setSubmitting(true);
    try {
      const rescheduleData: {
        lesson_id?: number;
        group_id?: number;
        new_start_time: string;
        reason: string;
      } = {
        new_start_time: `${formData.newDate}T${formData.newTime}:00`,
        reason: formData.reason
      };

      if (currentLesson.lessonId) {
        rescheduleData.lesson_id = currentLesson.lessonId;
      } else if (currentLesson.groupId) {
        rescheduleData.group_id = currentLesson.groupId;
      }

      const data = await API.teachers.rescheduleRequest(rescheduleData);

      onSubmitAction({
        ...formData,
        originalLesson: currentLesson
      });

      setFormData({
        newDate: '',
        newTime: '',
        reason: ''
      });
      onCloseAction();
      alert('Запрос на перенос отправлен успешно! Администратор рассмотрит вашу заявку.');
    } catch (error) {
      console.error('Error creating reschedule request:', error);
      handleApiError(error);
      alert('Ошибка при отправке запроса на перенос');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onCloseAction}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Перенос урока
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Info className="w-4 h-4 text-blue-500" />
              <span className="font-medium text-sm">Текущее время:</span>
            </div>
            <p className="text-sm text-gray-600">
              {currentLesson?.date ? new Date(currentLesson.date).toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              }) : "Урок не выбран"}
            </p>
            <p className="text-sm text-gray-600">
              {currentLesson?.time ? `${currentLesson.time} (${currentLesson.duration} мин)` : "Время не указано"}
            </p>
          </div>

          <div>
            <Label htmlFor="newDate" className="text-sm font-medium">
              Новая дата <span className="text-red-500">*</span>
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal mt-1 h-10"
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {formData.newDate ? (
                    format(new Date(formData.newDate), "dd/MM/yyyy", { locale: ru })
                  ) : (
                    <span className="text-gray-500">Выберите дату</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={formData.newDate ? new Date(formData.newDate) : undefined}
                  onSelect={(date) => {
                    if (date) {
                      handleInputChange('newDate', date.toISOString().split('T')[0])
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
            <Label htmlFor="newTime" className="text-sm font-medium">
              Новое время начала <span className="text-red-500">*</span>
            </Label>
            <Input
              id="newTime"
              type="time"
              value={formData.newTime}
              onChange={(e) => handleInputChange('newTime', e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">Урок закончится в 11:00</p>
          </div>

          <div>
            <Label htmlFor="reason" className="text-sm font-medium">
              Причина переноса <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reason"
              value={formData.reason}
              onChange={(e) => handleInputChange('reason', e.target.value)}
              placeholder="Укажите причину переноса урока..."
              className="mt-1"
              rows={3}
            />
          </div>

          <Alert className="border-blue-200 bg-blue-50">
            <Info className="w-4 h-4 text-blue-500" />
            <AlertDescription className="text-sm text-blue-700">
              Запрос будет отправлен администратору на рассмотрение.
              Вы получите уведомление о решении.
            </AlertDescription>
          </Alert>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onCloseAction} disabled={submitting}>
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-black text-white hover:bg-gray-800"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Отправить запрос
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
