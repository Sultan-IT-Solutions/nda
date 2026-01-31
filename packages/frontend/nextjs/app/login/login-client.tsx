"use client"

import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { API, handleApiError } from "@/lib/api"
import { buildLoginUrl } from "@/lib/auth"

export default function LoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    const message = searchParams.get("message")
    if (!message) return

    toast.error(message)

    const next = searchParams.get("next")
    router.replace(buildLoginUrl({ next: next ?? undefined }))
  }, [router, searchParams])

  const getSafeNext = () => {
    const next = searchParams.get("next")
    if (!next) return null
    if (!next.startsWith("/")) return null
    if (next.startsWith("//")) return null
    return next
  }

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    setIsLoading(true)

    try {
      await API.auth.login(email, password)

      const userData = await API.users.me()

      const next = getSafeNext()
      if (next) {
        router.push(next)
        return
      }

      router.push(userData.user.role === "admin" ? "/analytics" : "/profile")
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
      <div className="px-6 py-6 max-w-7xl mx-auto w-full flex items-center justify-between">
        <div className="text-purple-600 text-sm font-medium">⭐ Танцевальная школа</div>
        <Link
          href="/register"
          className="text-purple-600 font-medium text-sm hover:text-purple-700"
        >
          Создать аккаунт
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Вход в кабинет</h2>
              <p className="text-sm text-gray-600">Войдите, чтобы продолжить</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {fieldErrors.general && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-600 text-sm text-center">✕ {fieldErrors.general}</p>
                </div>
              )}

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
                {fieldErrors.email && (
                  <p className="text-red-600 text-xs mt-1">✕ {fieldErrors.email}</p>
                )}
              </div>

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
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="text-red-600 text-xs mt-1">✕ {fieldErrors.password}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-medium transition"
              >
                {isLoading ? "Входим..." : "Войти"}
              </button>

              <div className="text-center">
                <Link href="/register" className="text-purple-600 text-sm hover:text-purple-700">
                  Нет аккаунта? Зарегистрироваться
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
