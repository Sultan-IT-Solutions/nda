'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Plus, Loader2, Calendar } from 'lucide-react';
import { format, parse } from "date-fns"
import { ru } from "date-fns/locale"
import { API, handleApiError } from '@/lib/api';

interface CreateGroupModalProps {
  isOpen: boolean;
  onCloseAction: () => void;
  onSubmitAction: (groupData: any) => void;
}

export default function CreateGroupModal({ isOpen, onCloseAction, onSubmitAction }: CreateGroupModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    capacity: '15',
    description: '',
    level: 'beginner',
    direction: '',
    hall_id: '',
    duration_minutes: '60',
    is_trial: false,
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
  });

  const handleSubmit = async () => {
    if (!formData.name || !formData.start_date) {
      alert('Пожалуйста, заполните название группы и дату начала');
      return;
    }

    if (formData.end_date && formData.end_date <= formData.start_date) {
      alert('Дата окончания должна быть позже даты начала');
      return;
    }

    setSubmitting(true);
    try {
      const groupData = {
        name: formData.name,
        category_id: formData.direction ? parseInt(formData.direction) : null,
        hall_id: formData.hall_id ? parseInt(formData.hall_id) : null,
        main_teacher_id: null,
        start_time: null,
        capacity: parseInt(formData.capacity),
        duration_minutes: parseInt(formData.duration_minutes),
        recurring_days: null,
        class_name: categories.find(cat => cat.id.toString() === formData.direction)?.name || formData.name,
        is_trial: formData.is_trial,
        start_date: formData.start_date,
        end_date: formData.end_date || null,
      };

      await onSubmitAction(groupData);

      setFormData({
        name: '',
        capacity: '15',
        description: '',
        level: 'beginner',
        direction: '',
        hall_id: '',
        duration_minutes: '60',
        is_trial: false,
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
      });

    } catch (error) {
      console.error('Error creating group:', error);
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await API.categories.getAll();
        setCategories(response || []);
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    };

    if (isOpen) {
      fetchCategories();
    }
  }, [isOpen]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onCloseAction}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Создать новую группу
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-6">
          {}
          <div>
            <Label htmlFor="name">Название группы *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="Например: Начинающие танцоры"
              className="mt-1"
            />
          </div>

          {}
          <div>
            <Label htmlFor="direction">Направление</Label>
            <Select value={formData.direction} onValueChange={(value) => handleInputChange('direction', value)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Выберите направление" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id.toString()}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      {category.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="level">Уровень</Label>
              <Select value={formData.level} onValueChange={(value) => handleInputChange('level', value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Начинающий</SelectItem>
                  <SelectItem value="intermediate">Средний</SelectItem>
                  <SelectItem value="advanced">Продвинутый</SelectItem>
                  <SelectItem value="professional">Профессиональный</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="capacity">Вместимость</Label>
              <Input
                id="capacity"
                type="number"
                value={formData.capacity}
                onChange={(e) => handleInputChange('capacity', e.target.value)}
                className="mt-1"
                min="1"
                max="50"
              />
            </div>
          </div>

          {}
          <div>
            <Label htmlFor="duration">Продолжительность занятия (минуты)</Label>
            <Select value={formData.duration_minutes} onValueChange={(value) => handleInputChange('duration_minutes', value)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="45">45 минут</SelectItem>
                <SelectItem value="60">60 минут</SelectItem>
                <SelectItem value="90">90 минут</SelectItem>
                <SelectItem value="120">120 минут</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start_date">Дата начала *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal mt-1 h-10"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {formData.start_date ? (
                      format(new Date(formData.start_date), "dd/MM/yyyy", { locale: ru })
                    ) : (
                      <span className="text-gray-500">Выберите дату</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={formData.start_date ? new Date(formData.start_date) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        handleInputChange('start_date', date.toISOString().split('T')[0])
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
              <Label htmlFor="end_date">Дата окончания (необязательно)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal mt-1 h-10"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {formData.end_date ? (
                      format(new Date(formData.end_date), "dd/MM/yyyy", { locale: ru })
                    ) : (
                      <span className="text-gray-500">Выберите дату</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={formData.end_date ? new Date(formData.end_date) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        handleInputChange('end_date', date.toISOString().split('T')[0])
                      } else {
                        handleInputChange('end_date', '')
                      }
                    }}
                    locale={ru}
                    disabled={(date) => formData.start_date ? date < new Date(formData.start_date) : date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="is_trial"
              checked={formData.is_trial}
              onChange={(e) => handleInputChange('is_trial', e.target.checked)}
              className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 focus:ring-2"
            />
            <Label htmlFor="is_trial" className="text-sm font-medium text-gray-900">
              Пробный
            </Label>
          </div>

          {}
          <div>
            <Label htmlFor="description">Описание (необязательно)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Краткое описание группы и особенностей занятий"
              className="mt-1"
              rows={3}
            />
          </div>
        </div>

        {}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onCloseAction} disabled={submitting}>
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Создать группу
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
