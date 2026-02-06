"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Gift, Users, Clock, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { API, handleApiError } from '@/lib/api'

export default function RegisterPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: "",
    password_confirm: "",
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)

  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))

    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const updated = { ...prev }
        delete updated[name]
        return updated
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    setIsLoading(true)

    try {
      await API.auth.register({
        full_name: formData.full_name,
        email: formData.email,
        password: formData.password,
        password_confirm: formData.password_confirm,
        phone: formData.phone
      })

      toast.success("Регистрация успешна!")

      try {
        await API.auth.login(formData.email, formData.password)
        try {
          window.sessionStorage.setItem("nda_start_tour", "1")
        } catch {
          // ignore
        }
        router.push("/profile?welcome=1&tour=1")
      } catch (loginErr) {
        router.push("/login")
      }
    } catch (err) {
      const anyErr = err as any
      if (anyErr?.errors && typeof anyErr.errors === 'object') {
        setFieldErrors(anyErr.errors)
        const first = Object.values(anyErr.errors).find((v) => typeof v === 'string') as
          | string
          | undefined
        if (first) toast.error(first)
      } else {
        const errorMessage = handleApiError(err)
        setFieldErrors({ general: errorMessage })
        toast.error(errorMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-100 to-white flex flex-col lg:flex-row">
      <div className="lg:hidden bg-gradient-to-b from-purple-50 to-white px-6 py-8 space-y-6">
        <div className="text-center">
          <div className="text-purple-600 text-sm font-medium mb-3">⭐ Танцевальная школа</div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3 leading-tight">Начни свой танцевальный путь!</h1>
          <p className="text-gray-600 text-sm">Присоединяйся к нашей дружной команде и открой для себя мир танца</p>
        </div>

        <div className="flex gap-4 justify-center">
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center text-white mb-2">
              <Gift className="w-6 h-6" />
            </div>
            <p className="text-xs font-medium text-gray-900 text-center">Бесплатно</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 bg-gradient-to-br from-pink-400 to-pink-600 rounded-full flex items-center justify-center text-white mb-2">
              <Users className="w-6 h-6" />
            </div>
            <p className="text-xs font-medium text-gray-900 text-center">Профи</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center text-white mb-2">
              <Clock className="w-6 h-6" />
            </div>
            <p className="text-xs font-medium text-gray-900 text-center">Удобно</p>
          </div>
        </div>

        <button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3 rounded-full transition">
          ✨ Запишись на пробное занятие
        </button>
      </div>


      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-purple-50 via-purple-50 to-white px-12 py-16 flex-col justify-center">
        <div className="space-y-8">
          <div>
            <div className="text-purple-600 text-sm font-medium mb-4">⭐ Танцевальная школа</div>
            <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">Начни свой танцевальный путь!</h1>
            <p className="text-gray-600 text-base leading-relaxed">
              Присоединяйся к нашей дружной команде и открой для себя мир танца
            </p>
          </div>


          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center">
                <Gift className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Пробное занятие бесплатно</p>
                <p className="text-sm text-gray-600">Первое занятие абсолютно бесплатно для новичков</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-pink-400 to-pink-600 rounded-full flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Опытные преподаватели</p>
                <p className="text-sm text-gray-600">Профессионалы с многолетним стажем</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Удобное расписание</p>
                <p className="text-sm text-gray-600">Занятия в утренние, дневные и вечерние время</p>
              </div>
            </div>
          </div>

          <button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3 rounded-full transition">
            ✨ Запишись на пробное занятие
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-8 lg:py-16">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl p-8 space-y-6">
            <div className="text-center">
              <div className="text-4xl mb-3">🎓</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Регистрация ученика</h2>
              <p className="text-sm text-gray-600">Создайте аккаунт и запишитесь на пробное занятие прямо сейчас!</p>
            </div>


            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Имя</label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                  placeholder="Введите ваше имя"
                  className={`w-full px-4 py-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition ${
                    fieldErrors.full_name ? "border-red-500" : "border-gray-200"
                  }`}
                />
                {fieldErrors.full_name && <p className="text-red-600 text-xs mt-1">✕ {fieldErrors.full_name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="example@gmail.com"
                  className={`w-full px-4 py-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition ${
                    fieldErrors.email ? "border-red-500" : "border-gray-200"
                  }`}
                />
                {fieldErrors.email && <p className="text-red-600 text-xs mt-1">✕ {fieldErrors.email}</p>}
              </div>


              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Телефон</label>
                <div className="flex gap-2">
                  <select className="bg-teal-500 text-white px-3 py-3 rounded-lg font-medium">
                    <option>🇰🇿</option>
                  </select>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+7 (___)_____"
                    className={`flex-1 px-4 py-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition ${
                      fieldErrors.phone ? "border-red-500" : "border-gray-200"
                    }`}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Формат: +7 (__) _____</p>
                {fieldErrors.phone && <p className="text-red-600 text-xs mt-1">✕ {fieldErrors.phone}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Пароль</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Придумайте пароль"
                    className={`w-full px-4 py-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition ${
                      fieldErrors.password ? "border-red-500" : "border-gray-200"
                    }`}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {fieldErrors.password && <p className="text-red-600 text-xs mt-1">✕ {fieldErrors.password}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Подтвердите пароль</label>
                <div className="relative">
                  <input
                    id="password_confirm"
                    type={showPasswordConfirm ? "text" : "password"}
                    name="password_confirm"
                    value={formData.password_confirm}
                    onChange={handleChange}
                    placeholder="Повторите пароль"
                    className={`w-full px-4 py-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition ${
                      fieldErrors.password_confirm ? "border-red-500" : "border-gray-200"
                    }`}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordConfirm((prev) => !prev)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPasswordConfirm ? "Hide password" : "Show password"}
                  >
                    {showPasswordConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {fieldErrors.password_confirm && (
                  <p className="text-red-600 text-xs mt-1">✕ {fieldErrors.password_confirm}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 text-white font-semibold py-3 rounded-full transition duration-200"
              >
                {isLoading ? "Регистрируемся..." : "Зарегистрироваться"}
              </button>
            </form>

            <p className="text-center text-sm text-gray-600">
              Уже есть аккаунт?{" "}
              <Link href="/login" className="text-purple-600 hover:text-purple-700 font-semibold">
                Войти
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
