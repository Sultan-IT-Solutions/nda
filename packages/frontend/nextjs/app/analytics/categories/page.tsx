"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AdminSidebar } from "@/components/admin-sidebar"
import { AdminHeader } from "@/components/admin-header"
import { AdminPagination } from "@/components/admin-pagination"
import { useSidebar } from "@/hooks/use-sidebar"
import {
  Plus, PencilSimple, Trash, Tag, Palette,
  Users, Calendar, Clock, MapPin, House, TrendUp, ChalkboardTeacher, Student, CalendarBlank
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { API, AUTH_REQUIRED_MESSAGE, logout } from "@/lib/api"
import { DEFAULT_SESSION_EXPIRED_MESSAGE, buildLoginUrl } from "@/lib/auth"

interface Category {
  id: number
  name: string
  description: string | null
  color: string
  created_at: string
}

const colorPresets = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
]

export default function CategoriesPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { sidebarWidth } = useSidebar()
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<Category[]>([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [user, setUser] = useState<any>(null)
  const [page, setPage] = useState(1)
  const itemsPerPage = 5

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedColor, setSelectedColor] = useState(colorPresets[0])

  const handleLogout = () => {
    logout()
    toast.success("Вы успешно вышли из системы")
    router.push("/login")
  }

  const resetForm = () => {
    setName("")
    setDescription("")
    setSelectedColor(colorPresets[0])
  }

  const fetchCategories = async () => {
    try {
      const response = await API.categories.getAll()
      setCategories(response || [])
    } catch (err) {
      console.error("Error fetching categories:", err)

      const message = err instanceof Error ? err.message : ""
      if (message === AUTH_REQUIRED_MESSAGE) {
        router.push(
          buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname })
        )
        return
      }

      toast.error("Ошибка при загрузке категорий")
    }
  }

  const handleCreateCategory = async () => {
    if (!name.trim()) {
      toast.error("Название категории обязательно")
      return
    }

    try {
      await API.categories.create({
        name: name.trim(),
        description: description.trim() || null,
        color: selectedColor
      })

      toast.success("Категория создана успешно")
      setIsCreateModalOpen(false)
      resetForm()
      fetchCategories()
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || "Ошибка при создании категории"
      toast.error(errorMsg)
    }
  }

  const handleEditCategory = async () => {
    if (!editingCategory || !name.trim()) {
      toast.error("Название категории обязательно")
      return
    }

    try {
      await API.categories.update(editingCategory.id, {
        name: name.trim(),
        description: description.trim() || null,
        color: selectedColor
      })

      toast.success("Категория обновлена успешно")
      setIsEditModalOpen(false)
      setEditingCategory(null)
      resetForm()
      fetchCategories()
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || "Ошибка при обновлении категории"
      toast.error(errorMsg)
    }
  }

  const handleDeleteCategory = async (category: Category) => {
    try {
      await API.categories.delete(category.id)
      toast.success("Категория удалена успешно")
      fetchCategories()
    } catch (err: any) {
      const errorMsg = err.message || "Ошибка при удалении категории"
      toast.error(errorMsg)
    }
  }

  const openEditModal = (category: Category) => {
    setEditingCategory(category)
    setName(category.name)
    setDescription(category.description || "")
    setSelectedColor(category.color)
    setIsEditModalOpen(true)
  }

  const openCreateModal = () => {
    resetForm()
    setIsCreateModalOpen(true)
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userData = await API.users.me()
        if (userData.user.role !== 'admin') {
          router.push("/")
          return
        }
        setUser(userData.user)

        await fetchCategories()
        setLoading(false)
      } catch (err) {
        console.error("Auth error:", err)
        const message = err instanceof Error ? err.message : ""
        if (message === AUTH_REQUIRED_MESSAGE) {
          router.push(
            buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname })
          )
          return
        }
        logout()
        router.push("/login")
      }
    }

    fetchData()
  }, [router])

  useEffect(() => {
    setPage(1)
  }, [categories.length])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    )
  }

  const profile = {
    name: user?.name || "Администратор",
    email: user?.email || "",
    initials: user?.name ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : "АД"
  }

  const totalPages = Math.max(1, Math.ceil(categories.length / itemsPerPage))
  const paginatedCategories = categories.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar />

      <div className={sidebarWidth + " transition-all duration-300"}>
        <AdminHeader userName={user?.name} userEmail={user?.email} />

        <main className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Категории</h2>
              <p className="text-gray-600 mt-1">Создавайте и редактируйте категории для классов</p>
            </div>
            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreateModal} className="bg-purple-600 hover:bg-purple-700 text-white">
                  <Plus size={20} className="mr-2" />
                  Создать категорию
                </Button>
              </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Создать новую категорию</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="name">Название категории *</Label>
                        <Input
                          id="name"
                          placeholder="Введите название категории"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="description">Описание</Label>
                        <Textarea
                          id="description"
                          placeholder="Введите описание категории"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Цвет категории</Label>
                        <div className="flex gap-2 mt-2">
                          {colorPresets.map((color) => (
                            <button
                              key={color}
                              className={`w-8 h-8 rounded-lg border-2 transition-all ${
                                selectedColor === color
                                  ? 'border-gray-900 scale-110'
                                  : 'border-gray-300'
                              }`}
                              style={{ backgroundColor: color }}
                              onClick={() => setSelectedColor(color)}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button onClick={handleCreateCategory} className="flex-1">
                          Создать
                        </Button>
                        <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                          Отмена
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.length === 0 ? (
              <div className="col-span-full">
                <Card className="p-12 text-center border-2 border-dashed border-gray-300">
                  <Tag size={48} className="mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-semibold mb-2 text-gray-900">Нет категорий</h3>
                  <p className="text-gray-500 mb-4">Создайте первую категорию для организации классов</p>
                  <Button onClick={openCreateModal} variant="outline" className="border-purple-200 text-purple-600 hover:bg-purple-50">
                    <Plus size={16} className="mr-2" />
                    Создать категорию
                  </Button>
                </Card>
              </div>
            ) : (
              paginatedCategories.map((category) => (
                <Card key={category.id} className="border border-gray-200 hover:shadow-md transition-shadow bg-white">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        <div>
                          <h3 className="font-semibold text-base text-gray-900">{category.name}</h3>
                          <p className="text-sm text-gray-500">
                            {category.description || "Без описания"}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-gray-500 hover:text-gray-700"
                          onClick={() => openEditModal(category)}
                        >
                          <PencilSimple size={16} />
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700">
                              <Trash size={16} />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Удалить категорию</AlertDialogTitle>
                              <AlertDialogDescription>
                                Вы уверены, что хотите удалить категорию "{category.name}"?
                                Это действие нельзя отменить.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Отмена</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteCategory(category)} className="bg-red-600 hover:bg-red-700">
                                Удалить
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    <div className="text-xs text-gray-400">
                      Создано: {new Date(category.created_at).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
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

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать категорию</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Название категории *</Label>
              <Input
                id="edit-name"
                placeholder="Введите название категории"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Описание</Label>
              <Textarea
                id="edit-description"
                placeholder="Введите описание категории"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <Label>Цвет категории</Label>
              <div className="flex gap-2 mt-2">
                {colorPresets.map((color) => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-lg border-2 transition-all ${
                      selectedColor === color
                        ? 'border-gray-900 scale-110'
                        : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setSelectedColor(color)}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={handleEditCategory} className="flex-1">
                Сохранить
              </Button>
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                Отмена
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
