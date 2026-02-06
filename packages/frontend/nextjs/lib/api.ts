const API_URL = '/api'

export const API_BASE_URL = '/api'

export const AUTH_REQUIRED_MESSAGE = 'Требуется авторизация. Войдите снова.'
const AUTH_REQUIRED_EVENT = 'nda:auth-required'

let accessToken: string | null = null
let refreshPromise: Promise<string | null> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

function emitAuthRequired(message: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT, { detail: { message } }))
}

function parseFastApiValidation(detail: unknown): { message: string; errors?: Record<string, string> } | null {
  if (!Array.isArray(detail)) return null

  const errors: Record<string, string> = {}

  for (const item of detail) {
    const loc = Array.isArray((item as any)?.loc) ? ((item as any).loc as any[]) : []
    const field = typeof loc.at(-1) === 'string' ? (loc.at(-1) as string) : 'general'
    const msg = typeof (item as any)?.msg === 'string' ? ((item as any).msg as string) : 'Ошибка валидации'
    const type = typeof (item as any)?.type === 'string' ? ((item as any).type as string) : ''

    let friendly = msg

    if (field === 'email') {
      if (type.includes('missing') || msg.toLowerCase().includes('field required')) {
        friendly = 'Email обязателен'
      } else if (msg.toLowerCase().includes('valid email')) {
        friendly = 'Введите корректный email'
      }
    }

    if (field === 'password') {
      if (type.includes('missing') || msg.toLowerCase().includes('field required')) {
        friendly = 'Пароль обязателен'
      }
    }

    if (field === 'full_name') {
      if (type.includes('missing') || msg.toLowerCase().includes('field required')) {
        friendly = 'Имя обязательно'
      }
    }

    if (field === 'password_confirm') {
      if (type.includes('missing') || msg.toLowerCase().includes('field required')) {
        friendly = 'Подтверждение пароля обязательно'
      }
    }

    if (!errors[field]) errors[field] = friendly
  }

  const first = Object.values(errors).find((v) => typeof v === 'string')
  return {
    message: first ?? 'Ошибка валидации. Проверьте правильность заполнения полей',
    errors,
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      if (!res.ok) return null
      const data = (await res.json()) as { access_token?: string }
      const token = data?.access_token ?? null
      setAccessToken(token)
      return token
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export async function api(path: string, options?: RequestInit) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return fetch(`${API_URL}${normalizedPath}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options?.headers,
    },
    credentials: 'include',
  })
}

export function getAuthHeaders(): HeadersInit {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `/api${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const doFetch = async () => {
    return fetch(url, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...options.headers,
      },
      credentials: 'include',
    })
  }

  let response = await doFetch();

  const isLoginEndpoint = endpoint.startsWith('/auth/login') || endpoint === 'auth/login'
  if (response.status === 401 && !isLoginEndpoint) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      response = await doFetch()
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));

    const detail = (error as any)?.detail
    const validation = response.status === 422 ? parseFastApiValidation(detail) : null
    const detailErrors =
      detail && typeof detail === 'object' && !Array.isArray(detail)
        ? (detail as any).errors
        : undefined

    let errorMessage: string = 'Request failed'
    if (validation?.message) {
      errorMessage = validation.message
    } else if (typeof detail === 'string') {
      errorMessage = detail
    } else if (typeof (error as any)?.error === 'string') {
      errorMessage = (error as any).error
    } else if (detailErrors && typeof detailErrors === 'object') {
      const first = Object.values(detailErrors).find((v) => typeof v === 'string') as
        | string
        | undefined
      errorMessage = first ?? 'Ошибка в данных. Проверьте введенную информацию'
    }

    if (response.status === 401) {
      errorMessage = isLoginEndpoint ? 'Неверный email или пароль' : AUTH_REQUIRED_MESSAGE;
      if (!isLoginEndpoint) emitAuthRequired(errorMessage)
    } else if (response.status === 400) {
      if (errorMessage.includes('пересекается')) {
      } else if (errorMessage.includes('email') && errorMessage.includes('пароль')) {
        errorMessage = 'Пожалуйста, заполните все поля';
      } else if (errorMessage.includes('overlap') || errorMessage.includes('занятия')) {
        errorMessage = 'Время занятия пересекается с уже существующим занятием. Выберите другое время.';
      } else {
        errorMessage = 'Ошибка в данных. Проверьте введенную информацию';
      }
    } else if (response.status === 422) {
      // ignoring
      errorMessage = validation?.message ?? 'Ошибка валидации. Проверьте правильность заполнения полей';
    } else if (response.status === 500) {
      errorMessage = 'Ошибка сервера. Попробуйте позже';
    }

    const err: any = new Error(errorMessage)
    if (validation?.errors) {
      err.errors = validation.errors
    }
    if (detailErrors && typeof detailErrors === 'object') {
      err.errors = detailErrors
    }
    err.status = response.status
    throw err;
  }

  return response.json();
}

async function apiRequestOptionalAuth<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T | null> {
  const url = `/api${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const doFetch = async () => {
    return fetch(url, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...options.headers,
      },
      credentials: 'include',
    })
  }

  let response = await doFetch()

  if (response.status === 401) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      response = await doFetch()
    }
  }

  if (response.status === 401) return null

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }))
    let errorMessage = error.detail || error.error || 'Request failed'

    if (response.status === 400) {
      if (errorMessage.includes('пересекается')) {
      } else if (errorMessage.includes('email') && errorMessage.includes('пароль')) {
        errorMessage = 'Пожалуйста, заполните все поля'
      } else if (errorMessage.includes('overlap') || errorMessage.includes('занятия')) {
        errorMessage = 'Время занятия пересекается с уже существующим занятием. Выберите другое время.'
      } else {
        errorMessage = 'Ошибка в данных. Проверьте введенную информацию'
      }
    } else if (response.status === 422) {
      errorMessage = 'Ошибка валидации. Проверьте правильность заполнения полей'
    } else if (response.status === 500) {
      errorMessage = 'Ошибка сервера. Попробуйте позже'
    }

    throw new Error(errorMessage)
  }

  return response.json()
}

export const API = {
  auth: {
    login: (email: string, password: string) =>
      apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }).then((data: any) => {
        const token = data?.access_token ?? data?.token ?? null
        if (token) setAccessToken(token)
        return data
      }),
    register: (data: {
      full_name: string;
      email: string;
      password: string;
      password_confirm: string;
      phone?: string;
    }) =>
      apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  users: {
    me: async () => {
      const data = await apiRequest('/users/me')
      const user = (data as any)?.user
      if (!user || typeof user?.role !== 'string') {
        emitAuthRequired(AUTH_REQUIRED_MESSAGE)
        const err: any = new Error(AUTH_REQUIRED_MESSAGE)
        err.status = 401
        throw err
      }
      return data
    },
    meOptional: async () => {
      const data = await apiRequestOptionalAuth('/users/me')
      if (data == null) return null
      const user = (data as any)?.user
      if (!user || typeof user?.role !== 'string') return null
      return data
    },
    getById: (id: number) => apiRequest(`/users/${id}`),
    getAll: () => apiRequest('/admin/users'),
    update: (userId: number, data: { name?: string; email?: string; phone?: string; role?: string }) =>
      apiRequest(`/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (userId: number) =>
      apiRequest(`/admin/users/${userId}`, { method: 'DELETE' }),
  },

  students: {
    me: () => apiRequest('/students/me', {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }),
    getAll: () => apiRequest('/admin/students'),
    getById: (id: number) => apiRequest(`/students/${id}`),
    getGroups: (studentId: number) => apiRequest(`/students/${studentId}/groups`),
    getMyGroups: () => apiRequest('/students/my-groups'),
    getAttendance: (studentId: number) => apiRequest(`/students/${studentId}/attendance`),
    getMyAttendance: () => apiRequest('/students/my-attendance'),
  },

  groups: {
    getAvailable: () => apiRequest('/groups/available'),
    getAll: () => apiRequest('/admin/groups'),
    getById: (id: number) => apiRequest(`/admin/groups/${id}`),
    getSchedule: (groupId: number) => apiRequest(`/groups/${groupId}/schedule`),
    join: (groupId: number) => apiRequest(`/groups/${groupId}/join`, { method: 'POST' }),
    trial: (groupId: number) => apiRequest(`/groups/${groupId}/trial`, { method: 'POST' }),
    requestAdditional: (groupId: number, date: string) =>
      apiRequest(`/groups/${groupId}/additional-request`, {
        method: 'POST',
        body: JSON.stringify({ date }),
      }),
    updateLimit: (groupId: number, limit: number) =>
      apiRequest(`/admin/groups/${groupId}/limit`, {
        method: 'PUT',
        body: JSON.stringify({ limit }),
      }),
    create: (data: any) =>
      apiRequest('/admin/groups', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (groupId: number, data: any) =>
      apiRequest(`/admin/groups/${groupId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (groupId: number, force: boolean = false) =>
      apiRequest(`/admin/groups/${groupId}?force=${force}`, { method: 'DELETE' }),
  },

  teachers: {
    getAll: () => apiRequest('/admin/teachers'),
    getById: (id: number) => apiRequest(`/teachers/${id}`),
    getGroups: (teacherId: number) => apiRequest(`/admin/teachers/${teacherId}/groups`),
    getMyGroups: () => apiRequest('/teachers/groups'),
    getScheduledLessons: () => apiRequest('/teachers/scheduled-lessons'),
    getWeeklySchedule: (weekStart: string) => apiRequest(`/teachers/schedule/weekly?week_start=${weekStart}`),
    getHallsOccupancyWeekly: (weekStart: string) => apiRequest(`/teachers/halls/occupancy/weekly?week_start=${weekStart}`),
    saveAttendance: (groupId: number, data: {
      lesson_date: string;
      attendance_records: Array<{ student_id: number; status: string }>;
    }) => apiRequest(`/teachers/groups/${groupId}/attendance`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    getGroupStudents: (groupId: number) => apiRequest(`/teachers/groups/${groupId}/students`),
    getGroupStats: (groupId: number) => apiRequest(`/teachers/groups/${groupId}/stats`),
    getGroupDetails: (groupId: number) => apiRequest(`/teachers/groups/${groupId}`),
    getGroupLessons: (groupId: number) => apiRequest(`/teachers/groups/${groupId}/lessons`),
    saveGroupNotes: (groupId: number, notes: string) =>
      apiRequest(`/teachers/groups/${groupId}/notes`, {
        method: 'PUT',
        body: JSON.stringify({ notes }),
      }),
    saveLessonAttendance: (lessonId: number, data: {
      attendance_records: Array<{ student_id: number; status: string }>;
    }) => apiRequest(`/teachers/lessons/${lessonId}/attendance`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    createGroup: (groupData: {
      name: string;
      hall_id: number;
      start_time: string;
      capacity?: number;
    }) => apiRequest('/teachers/groups', {
      method: 'POST',
      body: JSON.stringify(groupData),
    }),
    rescheduleRequest: (rescheduleData: {
      lesson_id?: number;
      group_id?: number;
      new_start_time: string;
      new_hall_id?: number;
      reason?: string;
    }) => apiRequest('/teachers/reschedule-request', {
      method: 'POST',
      body: JSON.stringify(rescheduleData),
    }),
    assignGroup: (teacherId: number, groupId: number) =>
      apiRequest(`/admin/teachers/${teacherId}/groups/${groupId}`, { method: 'POST' }),
    removeGroup: (teacherId: number, groupId: number) =>
      apiRequest(`/admin/teachers/${teacherId}/groups/${groupId}`, { method: 'DELETE' }),
  },

  halls: {
    getAll: () => apiRequest('/admin/halls'),
    getAnalytics: () => apiRequest('/admin/analytics/halls'),
    getDetails: (hallId: number) => apiRequest(`/admin/halls/${hallId}/details`),
    getSchedule: (hallId: number, date?: string) => {
      const params = date ? `?date=${date}` : '';
      return apiRequest(`/admin/halls/${hallId}/schedule${params}`);
    },
    create: (data: { name: string; capacity: number }) =>
      apiRequest('/admin/halls', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (hallId: number, data: { name: string; capacity: number }) =>
      apiRequest(`/admin/halls/${hallId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (hallId: number) =>
      apiRequest(`/admin/halls/${hallId}`, { method: 'DELETE' }),
  },

  lessons: {
    create: (data: any) =>
      apiRequest('/lessons', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (lessonId: number, data: any) =>
      apiRequest(`/admin/lessons/${lessonId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (lessonId: number) =>
      apiRequest(`/admin/lessons/${lessonId}`, { method: 'DELETE' }),
    reschedule: (lessonId: number, newDate: string, newTime: string) =>
      apiRequest(`/admin/lessons/${lessonId}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({
          lesson_date: `${newDate} ${newTime}:00`,
          new_start_time: `${newDate} ${newTime}:00`
        }),
      }),
    cancel: (lessonId: number) =>
      apiRequest(`/admin/lessons/${lessonId}/cancel`, { method: 'POST' }),
    substitute: (lessonId: number, substituteTeacherId: number) =>
      apiRequest(`/admin/lessons/${lessonId}/substitute`, {
        method: 'POST',
        body: JSON.stringify({ substitute_teacher_id: substituteTeacherId }),
      }),
  },

  schedule: {
    getWeekly: (weekStart: string) => apiRequest(`/admin/schedule/weekly?week_start=${weekStart}`),
  },

  admin: {
    getAnalytics: () => apiRequest('/admin/analytics'),
    getTeachersAnalytics: () => apiRequest('/admin/analytics/teachers'),
    getGroupsAnalytics: () => apiRequest('/admin/analytics/groups'),
    getStudentsAnalytics: () => apiRequest('/admin/analytics/students'),
    getGroupDetails: (groupId: number) => apiRequest(`/admin/groups/${groupId}`),
    getGroups: () => apiRequest('/admin/groups'),
    getHalls: () => apiRequest('/admin/halls'),
    getTeachers: () => apiRequest('/admin/teachers'),
    getStudents: () => apiRequest('/admin/students'),
    updateGroup: (groupId: number, data: any) =>
      apiRequest(`/admin/groups/${groupId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    closeGroup: (groupId: number) =>
      apiRequest(`/admin/groups/${groupId}/close`, { method: 'POST' }),
    openGroup: (groupId: number) =>
      apiRequest(`/admin/groups/${groupId}/open`, { method: 'POST' }),
    addStudentToGroup: (groupId: number, studentId: number) =>
      apiRequest(`/admin/groups/${groupId}/students`, {
        method: 'POST',
        body: JSON.stringify({ student_id: studentId, is_trial: false }),
      }),
    removeStudentFromGroup: (groupId: number, studentId: number) =>
      apiRequest(`/admin/groups/${groupId}/students/${studentId}`, { method: 'DELETE' }),
    addTeacherToGroup: (groupId: number, teacherId: number) =>
      apiRequest(`/admin/groups/${groupId}/teachers/${teacherId}`, { method: 'POST' }),
    removeTeacherFromGroup: (groupId: number, teacherId: number) =>
      apiRequest(`/admin/groups/${groupId}/teachers/${teacherId}`, { method: 'DELETE' }),
    addGroupSchedule: (groupId: number, scheduleData: any) =>
      apiRequest(`/admin/groups/${groupId}/schedule`, {
        method: 'POST',
        body: JSON.stringify(scheduleData),
      }),
    createGroupLessons: (groupId: number, lessonData: any) =>
      apiRequest(`/admin/groups/${groupId}/lessons`, {
        method: 'POST',
        body: JSON.stringify(lessonData),
      }),
    handleAdditionalLesson: (exceptionId: number, decision: 'approve' | 'reject') =>
      apiRequest(`/admin/additional-lessons/${exceptionId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      }),
    getRescheduleRequests: () => apiRequest('/admin/reschedule-requests'),
    approveRescheduleRequest: (requestId: number) =>
      apiRequest(`/admin/reschedule-requests/${requestId}/approve`, { method: 'POST' }),
    rejectRescheduleRequest: (requestId: number) =>
      apiRequest(`/admin/reschedule-requests/${requestId}/reject`, { method: 'POST' }),
  },

  categories: {
    getAll: () => apiRequest('/categories/'),
    create: (data: { name: string; description: string | null; color?: string }) =>
      apiRequest('/categories/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: { name?: string; description?: string | null; color?: string }) =>
      apiRequest(`/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      apiRequest(`/categories/${id}`, { method: 'DELETE' }),
  },

  notifications: {
    getAll: (limit?: number, unreadOnly?: boolean) => {
      const params = new URLSearchParams();
      if (limit) params.append('limit', limit.toString());
      if (unreadOnly) params.append('unread_only', 'true');
      const queryString = params.toString();
      return apiRequest(`/notifications${queryString ? `?${queryString}` : ''}`);
    },
    getUnreadCount: () => apiRequest('/notifications/unread-count'),
    markAsRead: (notificationId: number) =>
      apiRequest(`/notifications/${notificationId}/read`, { method: 'POST' }),
    markAllAsRead: () =>
      apiRequest('/notifications/read-all', { method: 'POST' }),
    delete: (notificationId: number) =>
      apiRequest(`/notifications/${notificationId}`, { method: 'DELETE' }),
  },

  get: (endpoint: string) => apiRequest(endpoint),
  post: (endpoint: string, data?: any) => apiRequest(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  }),
  put: (endpoint: string, data?: any) => apiRequest(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  }),
  delete: (endpoint: string) => apiRequest(endpoint, { method: 'DELETE' }),

  health: () => apiRequest('/health'),
};

export function handleApiError(error: any): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return !!getAccessToken();
}

export function getUserRole(): string | null {
  if (typeof window === 'undefined') return null;
  const token = getAccessToken();
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.role || null;
    } catch {
      // ignoring
    }
  }
  return null;
}

export function logout(): void {
  if (typeof window !== 'undefined') {
    setAccessToken(null)
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
  }
}
