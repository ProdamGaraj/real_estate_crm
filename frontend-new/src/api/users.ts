import apiClient from './axios';

export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
}

/**
 * Получает список всех активных пользователей (менеджеров).
 */
export const getUsers = async (): Promise<User[]> => {
  const response = await apiClient.get('/users/');
  return response.data;
};