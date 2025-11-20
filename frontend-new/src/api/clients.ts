import apiClient from './axios';
import type { Application } from './applications';

// Интерфейс для одного номера телефона
export interface ClientPhoneNumber {
  id?: number;
  phone_number: string;
  is_primary: boolean;
}

// Тип для клиента в общем списке
export interface Client {
  id: number;
  full_name: string;
  primary_phone_number: string | null;
  email: string | null;
  created_at: string;
}

// Тип для лога изменений
export interface ClientLog {
  id: number;
  user: string;
  action: string;
  created_at: string;
}

export interface ClientFile {
  id: number;
  file: string;
  comment: string;
  uploaded_at: string;
  uploaded_by: string;
}


// Полный тип для детальной карточки
export interface ClientDetail {
  id: number;
  full_name: string;
  email: string | null;
  date_of_birth: string | null;
  gender: string;
  marital_status: string;
  status: string;
  passport_series: string;
  passport_number: string;
  passport_issued_by: string;
  passport_issued_date: string | null;
  inn: string;
  pinfl: string;
  registration_address: string;
  billing_address: string;
  comment: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  applications: Application[];
  logs: ClientLog[];
  phone_numbers: ClientPhoneNumber[];
  files: ClientFile[];
}

// --- ИСПРАВЛЕНИЕ ЗДЕСЬ ---
// Тип для данных, которые отправляет ПРОСТАЯ ФОРМА СОЗДАНИЯ
export type ClientPayload = {
  full_name: string;
  phone_number: string; // Отправляем один основной номер
  comment?: string;
};

// Тип для данных при ОБНОВЛЕНИИ через детальную карточку
export type ClientUpdatePayload = Partial<Omit<ClientDetail, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'applications' | 'logs'>>;


// Тип для объекта с параметрами фильтрации
export interface ClientFilters {
  full_name?: string;
  phone_number?: string;
  email?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | '';
  inn?: string;
  pinfl?: string;
  created_at_after?: string;
  created_at_before?: string;
  created_by?: number | null;
}

// Функция получения списка (без изменений)
export const getClients = async (filters: ClientFilters = {}): Promise<Client[]> => {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([_, v]) => v != null && v !== '')
  );
  const response = await apiClient.get('/clients/', { params });
  return response.data;
};

// Функция получения одного клиента (без изменений)
export const getClientById = async (id: number): Promise<ClientDetail> => {
  const response = await apiClient.get(`/clients/${id}/`);
  return response.data;
};

// --- ИСПРАВЛЕНИЕ ЗДЕСЬ ---
/**
 * Создает нового клиента, принимая простой объект.
 */
export const createClient = async (newClient: ClientPayload): Promise<ClientDetail> => {
  const response = await apiClient.post('/clients/', newClient);
  return response.data;
};

/**
 * Обновляет данные клиента по его ID.
 */
export const updateClient = async ({ id, payload }: { id: number; payload: ClientUpdatePayload }): Promise<ClientDetail> => {
  const response = await apiClient.patch(`/clients/${id}/`, payload);
  return response.data;
};

export const getClientFiles = async (clientId: number): Promise<ClientFile[]> => {
    const response = await apiClient.get(`/clients/${clientId}/files/`);
    return response.data;
};

export const uploadClientFile = async ({ clientId, formData }: { clientId: number; formData: FormData }): Promise<ClientFile> => {
    const response = await apiClient.post(`/clients/${clientId}/files/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
};