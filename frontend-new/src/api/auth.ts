import apiClient from './axios';

// Интерфейсы для аутентификации
export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: any; // UserProfile
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  uid: string;
  token: string;
  new_password: string;
}

// Тип для формы логина (алиас для совместимости)
export type LoginPayload = LoginCredentials;

// Вход пользователя
export const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
  const response = await apiClient.post('/permissions/auth/login/', credentials);
  return response.data;
};

// Алиас для совместимости
export const loginUser = login;

// Выход пользователя
export const logout = async (refreshToken: string): Promise<void> => {
  await apiClient.post('/permissions/auth/logout/', { refresh: refreshToken });
};

// Запрос на восстановление пароля
export const passwordResetRequest = async (data: PasswordResetRequest): Promise<{ message: string }> => {
  const response = await apiClient.post('/permissions/auth/password-reset/', data);
  return response.data;
};

// Подтверждение сброса пароля
export const passwordResetConfirm = async (data: PasswordResetConfirm): Promise<{ message: string }> => {
  const response = await apiClient.post('/permissions/auth/password-reset/confirm/', data);
  return response.data;
};

// Обновление access токена через refresh токен
export const refreshAccessToken = async (refreshToken: string): Promise<{ access: string; refresh: string }> => {
  const response = await apiClient.post('/token/refresh/', { refresh: refreshToken });
  return response.data;
};