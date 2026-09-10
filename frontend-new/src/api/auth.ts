import apiClient from './axios';

// Интерфейсы для аутентификации
export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  access: string;
  /** refresh не приходит в теле: он лежит в httpOnly-cookie */
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

// Выход пользователя. Refresh-токен сервер берёт из cookie сам.
export const logout = async (): Promise<void> => {
  await apiClient.post('/permissions/auth/logout/', {});
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

// Получение актуального профиля текущего пользователя
export const fetchCurrentUser = async (): Promise<any> => {
  const response = await apiClient.get('/permissions/me/');
  return response.data;
};

/**
 * Обновление access-токена.
 *
 * Refresh-токен не передаётся: браузер сам отправляет httpOnly-cookie,
 * а сервер возвращает только новый access.
 */
export const refreshAccessToken = async (): Promise<{ access: string }> => {
  const response = await apiClient.post('/token/refresh/', {});
  return response.data;
};