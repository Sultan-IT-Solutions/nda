'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { API, logout } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  const [isAuth, setIsAuth] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const me = await API.users.meOptional();
      if (me?.user?.role) {
        setIsAuth(true);
        setUserRole(me.user.role);
      }
    };

    load();
  }, []);

  const handleLogout = () => {
    logout();
    setIsAuth(false);
    setUserRole(null);
    router.push('/login');
  };

  if (isAuth) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-gradient-to-b from-purple-50 to-white">
        <div className="text-center space-y-8 max-w-md mx-auto px-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Добро пожаловать!</h1>
            <p className="text-lg text-gray-600 mb-6">Система управления танцевальной студией</p>
          </div>

          <div className="space-y-4">
            {userRole === 'teacher' && (
              <Link href="/teacher-groups">
                <Button className="w-full bg-blue-600 hover:bg-blue-700">
                  Мои группы
                </Button>
              </Link>
            )}

            {userRole === 'admin' && (
              <>
                <Link href="/analytics/schedule">
                  <Button className="w-full bg-purple-600 hover:bg-purple-700">
                    Управление расписанием
                  </Button>
                </Link>
                <Link href="/analytics/groups">
                  <Button variant="outline" className="w-full">
                    Управление группами
                  </Button>
                </Link>
              </>
            )}

            {userRole === 'student' && (
              <Link href="/schedule">
                <Button className="w-full bg-green-600 hover:bg-green-700">
                  Мое расписание
                </Button>
              </Link>
            )}
          </div>

          <div className="pt-4 border-t">
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="text-gray-500"
            >
              Выйти
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex items-center justify-center min-h-screen bg-gradient-to-b from-purple-50 to-white">
      <div className="text-center space-y-8 max-w-md mx-auto px-6">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Dance Studio</h1>
          <p className="text-lg text-gray-600">Система управления танцевальной студией</p>
        </div>

        <div className="space-y-4">
          <Link href="/login">
            <Button className="w-full bg-purple-600 hover:bg-purple-700">
              Войти в систему
            </Button>
          </Link>

          <Link href="/register">
            <Button variant="outline" className="w-full">
              Регистрация
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
