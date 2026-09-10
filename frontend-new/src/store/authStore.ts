import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { login as apiLogin, logout as apiLogout, fetchCurrentUser, refreshAccessToken } from '../api/auth';
import { clearAccessToken, setAccessToken } from '../api/tokenStore';
import type { Role } from '../utils/permissions';

interface User {
  id: number;
  user_username: string;
  user_full_name?: string;
  email?: string;
  is_system_admin: boolean;
  company?: number;
  company_name?: string;
  department?: number;
  department_name?: string;
  roles: Role[];
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Идёт восстановление сессии после перезагрузки страницы */
  isRestoring: boolean;
  error: string | null;
  
  // Actions
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Обменивает httpOnly-cookie на новый access-токен при старте приложения */
  restoreSession: () => Promise<void>;
  setUser: (user: User | null) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isRestoring: true,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiLogin({ username, password });
          // Преобразуем данные из API в формат User интерфейса
          const userData = response.user;
          const user = {
            id: userData.id,
            user_username: userData.user?.username || username,
            user_full_name: userData.user?.full_name || userData.user?.username || username,
            email: userData.user?.email,
            is_system_admin: userData.is_system_admin,
            company: userData.company?.id,
            company_name: userData.company?.name,
            department: userData.department?.id,
            department_name: userData.department?.name,
            roles: userData.roles || [],
          };
          // Access-токен держим в памяти, refresh пришёл в httpOnly-cookie
          setAccessToken(response.access);
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            isRestoring: false,
            error: null,
          });
        } catch (error: any) {
          const errorMessage = error.response?.data?.error || 'Ошибка входа';
          set({
            isLoading: false,
            error: errorMessage,
            isAuthenticated: false,
          });
          throw new Error(errorMessage);
        }
      },

      logout: async () => {
        try {
          // Refresh-токен сервер возьмёт из cookie и сам её удалит
          await apiLogout();
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          clearAccessToken();
          set({
            user: null,
            isAuthenticated: false,
            isRestoring: false,
            error: null,
          });
        }
      },

      restoreSession: async () => {
        // После перезагрузки страницы access-токена в памяти нет.
        // Меняем httpOnly-cookie на новый — если она ещё жива.
        try {
          const { access } = await refreshAccessToken();
          setAccessToken(access);
          const userData = await fetchCurrentUser();
          set({
            user: {
              id: userData.id,
              user_username: userData.user?.username || '',
              user_full_name: userData.user?.full_name || userData.user?.username || '',
              email: userData.user?.email,
              is_system_admin: userData.is_system_admin,
              company: userData.company?.id,
              company_name: userData.company?.name,
              department: userData.department?.id,
              department_name: userData.department?.name,
              roles: userData.roles || [],
            },
            isAuthenticated: true,
            isRestoring: false,
          });
        } catch {
          clearAccessToken();
          set({ user: null, isAuthenticated: false, isRestoring: false });
        }
      },

      refreshUser: async () => {
        const { isAuthenticated } = get();
        if (!isAuthenticated) return;
        try {
          const userData = await fetchCurrentUser();
          const user: User = {
            id: userData.id,
            user_username: userData.user?.username || '',
            user_full_name: userData.user?.full_name || userData.user?.username || '',
            email: userData.user?.email,
            is_system_admin: userData.is_system_admin,
            company: userData.company?.id,
            company_name: userData.company?.name,
            department: userData.department?.id,
            department_name: userData.department?.name,
            roles: userData.roles || [],
          };
          set({ user });
        } catch (error) {
          console.error('Failed to refresh user data:', error);
        }
      },

      setUser: (user) => set({ user }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      version: 2,
      // Токены не сохраняются: access живёт в памяти, refresh — в httpOnly-cookie.
      // В localStorage остаётся только профиль, чтобы интерфейс не мигал при старте.
      partialize: (state) => ({
        user: state.user,
      }),
      migrate: (persistedState: any, version: number) => {
        if (version < 2) {
          // В старых версиях здесь лежали токены — вычищаем их
          return { user: persistedState?.user ?? null };
        }
        return persistedState as AuthState;
      },
    }
  )
);
