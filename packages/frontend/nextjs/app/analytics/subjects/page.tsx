"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AdminSidebar } from "@/components/admin-sidebar"
import { AdminHeader } from "@/components/admin-header"
import { AdminPagination } from "@/components/admin-pagination"
import { useSidebar } from "@/hooks/use-sidebar"
import {
	Plus, PencilSimple, Trash, BookOpenText,
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { API, AUTH_REQUIRED_MESSAGE, logout } from "@/lib/api"
import { DEFAULT_SESSION_EXPIRED_MESSAGE, buildLoginUrl } from "@/lib/auth"

interface Subject {
	id: number
	name: string
	description: string | null
	color: string
	created_at: string
}

interface GroupOption {
	id: number
	name: string
}

const colorPresets = [
	'#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
	'#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
]

export default function SubjectsPage() {
	const router = useRouter()
	const pathname = usePathname()
	const { sidebarWidth } = useSidebar()
	const [loading, setLoading] = useState(true)
	const [subjects, setSubjects] = useState<Subject[]>([])
	const [groups, setGroups] = useState<GroupOption[]>([])
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
	const [isEditModalOpen, setIsEditModalOpen] = useState(false)
	const [editingSubject, setEditingSubject] = useState<Subject | null>(null)
	const [user, setUser] = useState<any>(null)
	const [page, setPage] = useState(1)
	const itemsPerPage = 5

	const [name, setName] = useState("")
	const [description, setDescription] = useState("")
	const [selectedColor, setSelectedColor] = useState(colorPresets[0])
	const [attachGroupId, setAttachGroupId] = useState<string>("none")
	const [isElective, setIsElective] = useState(false)

	const resetForm = () => {
		setName("")
		setDescription("")
		setSelectedColor(colorPresets[0])
		setAttachGroupId("none")
		setIsElective(false)
	}

	const fetchSubjects = async () => {
		try {
			const response = await API.subjects.getAll()
			setSubjects(response || [])
		} catch (err) {
			console.error("Error fetching subjects:", err)

			const message = err instanceof Error ? err.message : ""
			if (message === AUTH_REQUIRED_MESSAGE) {
				router.push(
					buildLoginUrl({ message: DEFAULT_SESSION_EXPIRED_MESSAGE, next: pathname })
				)
				return
			}

			toast.error("Ошибка при загрузке предметов")
		}
	}

	const fetchGroups = async () => {
		try {
			const response = await API.groups.getAll()
				const groupsPayload = Array.isArray(response)
					? response
					: Array.isArray((response as any)?.groups)
						? (response as any).groups
						: []
				setGroups(
					groupsPayload.map((group: any) => ({
						id: group.id,
						name: group.name,
					}))
				)
		} catch (err) {
			console.error("Error fetching groups:", err)
		}
	}

	const handleCreateSubject = async () => {
		if (!name.trim()) {
			toast.error("Название предмета обязательно")
			return
		}

		try {
			const created = await API.subjects.create({
				name: name.trim(),
				description: description.trim() || null,
				color: selectedColor,
			})

			const groupId = attachGroupId !== "none" ? parseInt(attachGroupId, 10) : null
			if (groupId) {
				await API.admin.addClassSubject(groupId, {
					subject_id: created.id,
					is_elective: isElective,
					hall_id: null,
					teacher_ids: [],
					student_ids: [],
				})
			}

			toast.success("Предмет создан успешно")
			setIsCreateModalOpen(false)
			resetForm()
			fetchSubjects()
		} catch (err: any) {
			const errorMsg = err.response?.data?.detail || "Ошибка при создании предмета"
			toast.error(errorMsg)
		}
	}

	const handleEditSubject = async () => {
		if (!editingSubject || !name.trim()) {
			toast.error("Название предмета обязательно")
			return
		}

		try {
			await API.subjects.update(editingSubject.id, {
				name: name.trim(),
				description: description.trim() || null,
				color: selectedColor,
			})

			toast.success("Предмет обновлен успешно")
			setIsEditModalOpen(false)
			setEditingSubject(null)
			resetForm()
			fetchSubjects()
		} catch (err: any) {
			const errorMsg = err.response?.data?.detail || "Ошибка при обновлении предмета"
			toast.error(errorMsg)
		}
	}

	const handleDeleteSubject = async (subject: Subject) => {
		try {
			await API.subjects.delete(subject.id)
			toast.success("Предмет удален успешно")
			fetchSubjects()
		} catch (err: any) {
			const errorMsg = err.message || "Ошибка при удалении предмета"
			toast.error(errorMsg)
		}
	}

	const openEditModal = (subject: Subject) => {
		setEditingSubject(subject)
		setName(subject.name)
		setDescription(subject.description || "")
		setSelectedColor(subject.color)
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

				await Promise.all([fetchSubjects(), fetchGroups()])
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
	}, [subjects.length])

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

	const totalPages = Math.max(1, Math.ceil(subjects.length / itemsPerPage))
	const paginatedSubjects = subjects.slice((page - 1) * itemsPerPage, page * itemsPerPage)

	return (
		<div className="min-h-screen bg-gray-50">
			<AdminSidebar />

			<div className={sidebarWidth + " transition-all duration-300"}>
				<AdminHeader userName={user?.name} userEmail={user?.email} />

				<main className="p-8">
					<div className="flex items-center justify-between mb-8">
						<div>
							<h2 className="text-3xl font-bold text-gray-900">Предметы</h2>
							<p className="text-gray-600 mt-1">Создавайте предметы и привязывайте их к классам</p>
						</div>
						<Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
							<DialogTrigger asChild>
								<Button onClick={openCreateModal} className="bg-purple-600 hover:bg-purple-700 text-white">
									<Plus size={20} className="mr-2" />
									Создать предмет
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Создать новый предмет</DialogTitle>
								</DialogHeader>
								<div className="space-y-4">
									<div>
										<Label htmlFor="name">Название предмета *</Label>
										<Input
											id="name"
											value={name}
											onChange={(e) => setName(e.target.value)}
											placeholder="Введите название предмета"
											className="mt-1"
										/>
									</div>

									<div>
										<Label htmlFor="description">Описание</Label>
										<Textarea
											id="description"
											value={description}
											onChange={(e) => setDescription(e.target.value)}
											placeholder="Введите описание предмета"
											className="mt-1"
										/>
									</div>

									<div>
										<Label>Цвет предмета</Label>
										<div className="flex flex-wrap gap-2 mt-2">
											{colorPresets.map((color) => (
												<button
													key={color}
													type="button"
													onClick={() => setSelectedColor(color)}
													className={`w-8 h-8 rounded-full border-2 ${selectedColor === color ? 'border-gray-900' : 'border-transparent'}`}
													style={{ backgroundColor: color }}
												/>
											))}
										</div>
									</div>

									<div>
										<Label>Привязать к классу</Label>
										<Select value={attachGroupId} onValueChange={setAttachGroupId}>
											<SelectTrigger className="mt-1">
												<SelectValue placeholder="Выберите класс (необязательно)" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="none">Не привязывать</SelectItem>
												{groups.map((group) => (
													<SelectItem key={group.id} value={String(group.id)}>
														{group.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<p className="text-xs text-gray-500 mt-2">Все ученики выбранного класса увидят предмет в профиле.</p>
									</div>

									<div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
										<div>
											<Label className="text-sm font-medium">Элективный предмет</Label>
											<p className="text-xs text-gray-500">Для электива учеников можно выбрать позже в классе.</p>
										</div>
										<Switch
											checked={isElective}
											onCheckedChange={setIsElective}
											disabled={attachGroupId === "none"}
										/>
									</div>
								</div>
								<div className="mt-6 flex justify-end gap-2">
									<Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
										Отмена
									</Button>
									<Button onClick={handleCreateSubject} className="bg-purple-600 hover:bg-purple-700 text-white">
										Создать
									</Button>
								</div>
							</DialogContent>
						</Dialog>
					</div>

					<Card className="p-6">
						{subjects.length === 0 ? (
							<div className="text-center py-12">
								<BookOpenText size={48} className="mx-auto text-gray-400 mb-4" />
								<h3 className="text-lg font-semibold mb-2 text-gray-900">Нет предметов</h3>
								<p className="text-gray-500 mb-4">Создайте первый предмет для классов</p>
								<Button onClick={openCreateModal} className="bg-purple-600 hover:bg-purple-700 text-white">
									<Plus size={20} className="mr-2" />
									Создать предмет
								</Button>
							</div>
						) : (
							<div className="space-y-4">
								{paginatedSubjects.map((subject) => (
									<div key={subject.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
										<div className="flex items-center gap-4">
											<div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: subject.color }}>
												<BookOpenText size={20} className="text-white" />
											</div>
											<div>
												<h3 className="font-semibold text-gray-900">{subject.name}</h3>
												{subject.description && (
													<p className="text-sm text-gray-600 mt-1">{subject.description}</p>
												)}
											</div>
										</div>
										<div className="flex items-center gap-2">
											<Button variant="outline" size="sm" onClick={() => openEditModal(subject)}>
												<PencilSimple size={16} />
											</Button>
											<AlertDialog>
												<AlertDialogTrigger asChild>
													<Button variant="outline" size="sm">
														<Trash size={16} />
													</Button>
												</AlertDialogTrigger>
												<AlertDialogContent>
													<AlertDialogHeader>
														<AlertDialogTitle>Удалить предмет</AlertDialogTitle>
														<AlertDialogDescription>
															Вы уверены, что хотите удалить предмет "{subject.name}"?
														</AlertDialogDescription>
													</AlertDialogHeader>
													<AlertDialogFooter>
														<AlertDialogCancel>Отмена</AlertDialogCancel>
														<AlertDialogAction onClick={() => handleDeleteSubject(subject)}>
															Удалить
														</AlertDialogAction>
													</AlertDialogFooter>
												</AlertDialogContent>
											</AlertDialog>
										</div>
									</div>
								))}
							</div>
						)}
					</Card>

					{subjects.length > itemsPerPage && (
						<div className="mt-8">
											<AdminPagination
												page={page}
												totalPages={totalPages}
												onPrev={() => setPage((prev) => Math.max(prev - 1, 1))}
												onNext={() => setPage((prev) => Math.min(prev + 1, totalPages))}
											/>
						</div>
					)}
				</main>
			</div>

			<Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Редактировать предмет</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<div>
							<Label htmlFor="edit-name">Название предмета *</Label>
							<Input
								id="edit-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Введите название предмета"
								className="mt-1"
							/>
						</div>

						<div>
							<Label htmlFor="edit-description">Описание</Label>
							<Textarea
								id="edit-description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Введите описание предмета"
								className="mt-1"
							/>
						</div>

						<div>
							<Label>Цвет предмета</Label>
							<div className="flex flex-wrap gap-2 mt-2">
								{colorPresets.map((color) => (
									<button
										key={color}
										type="button"
										onClick={() => setSelectedColor(color)}
										className={`w-8 h-8 rounded-full border-2 ${selectedColor === color ? 'border-gray-900' : 'border-transparent'}`}
										style={{ backgroundColor: color }}
									/>
								))}
							</div>
						</div>
					</div>
					<div className="mt-6 flex justify-end gap-2">
						<Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
							Отмена
						</Button>
						<Button onClick={handleEditSubject} className="bg-purple-600 hover:bg-purple-700 text-white">
							Сохранить
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
