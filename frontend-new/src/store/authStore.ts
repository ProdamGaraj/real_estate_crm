import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { login as apiLogin, logout as apiLogout, fetchCurrentUser } from '../api/auth';
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
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
  setTokens: (access: string, refresh: string) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
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
          set({
            user,
            accessToken: response.access,
            refreshToken: response.refresh,
            isAuthenticated: true,
            isLoading: false,
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
        const { refreshToken } = get();
        try {
          if (refreshToken) {
            await apiLogout(refreshToken);
          }
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            error: null,
          });
        }
      },

      refreshUser: async () => {
        const { isAuthenticated, accessToken } = get();
        if (!isAuthenticated || !accessToken) return;
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

      setTokens: (access, refresh) =>
        set({ accessToken: access, refreshToken: refresh }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      version: 1,
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          // Сброс старого формата — при следующем входе загрузятся актуальные данные
          return {
            ...persistedState,
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
          };
        }
        return persistedState as AuthState;
      },
    }
  )
);
