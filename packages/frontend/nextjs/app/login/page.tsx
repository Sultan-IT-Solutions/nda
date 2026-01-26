"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Eye, EyeOff } from "lucide-react"
import { toast, Toaster } from 'sonner'
import { API, handleApiError } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {

    const loginMessage = localStorage.getItem("loginMessage")
    if (loginMessage) {
      toast.error(loginMessage)
      localStorage.removeItem("loginMessage")
    }
  }, [])

  const handleChange = (field: string, value: string) => {
    if (field === "email") setEmail(value)
    if (field === "password") setPassword(value)
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const updated = { ...prev }
        delete updated[field]
        return updated
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    setIsLoading(true)

    try {
      const data = await API.auth.login(email, password)
      localStorage.setItem("token", data.token)

      const userData = await API.users.me()

      if (userData.user.role === 'admin') {
        router.push("/analytics/halls")
      } else {
        router.push("/profile")
      }
    } catch (err) {
      setPassword("")
      const errorMessage = handleApiError(err)
      setFieldErrors({ general: errorMessage })
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-100 to-white flex flex-col">
      <Toaster
        position="top-right"
        richColors
        visibleToasts={5}
        expand={true}
        gap={8}
      />
      <div className="px-6 py-6 max-w-7xl mx-auto w-full flex items-center justify-between">
        <div className="text-purple-600 text-sm font-medium">⭐ Танцевальная школа</div>
        <Link href="/register" className="text-purple-600 font-medium text-sm hover:text-purple-700">
          Создать аккаунт
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
            {}
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Вход в кабинет</h2>
              <p className="text-sm text-gray-600">Войдите, чтобы продолжить</p>
            </div>

            {}
            <form onSubmit={handleSubmit} className="space-y-5">
              {}
              {fieldErrors.general && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-600 text-sm text-center">✕ {fieldErrors.general}</p>
                </div>
              )}

              {}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  placeholder="example@gmail.com"
                  className={`w-full px-4 py-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition ${
                    fieldErrors.email ? "border-red-500" : "border-gray-200"
                  }`}
                />
                {fieldErrors.email && <p className="text-red-600 text-xs mt-1">✕ {fieldErrors.email}</p>}
              </div>

              {}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Пароль</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => handleChange("password", e.target.value)}
                    placeholder="Введите пароль"
                    className={`w-full px-4 py-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition ${
                      fieldErrors.password ? "border-red-500" : "border-gray-200"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {fieldErrors.password && <p className="text-red-600 text-xs mt-1">✕ {fieldErrors.password}</p>}
              </div>

              {}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 text-white font-semibold py-3 rounded-full transition duration-200"
              >
                {isLoading ? "Входим..." : "Войти"}
              </button>
            </form>

            {}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">или</span>
              </div>
            </div>

            {}
            <p className="text-center text-sm text-gray-600">
              Нет аккаунта?{" "}
              <Link href="/register" className="text-purple-600 font-semibold hover:text-purple-700">
                Зарегистрируйтесь
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
