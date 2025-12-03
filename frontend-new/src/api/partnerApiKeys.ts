// API для управления API-ключами партнёров
import apiClient from './axios';
import type { Company } from './permissions';

// Типы доступных scopes
export type AllowedScope = 'VIEW_PROJECTS' | 'VIEW_BUILDINGS' | 'VIEW_LAYOUTS' | 'CREATE_APPLICATION';

export interface ScopeOption {
  value: AllowedScope;
  label: string;
}

export interface PartnerAPIKey {
  id: number;
  name: string;
  key: string;
  description: string;
  companies: number[];
  companies_data: Company[];
  allowed_scopes: AllowedScope[];
  available_scopes: ScopeOption[];
  is_active: boolean;
  expires_at: string | null;
  allowed_ips: string;
  requests_per_minute: number;
  requests_per_day: number;
  created_at: string;
  last_used_at: string | null;
  is_expired: boolean;
}

export interface PartnerAPIKeyPayload {
  name: string;
  description?: string;
  companies?: number[];
  allowed_scopes?: AllowedScope[];
  is_active?: boolean;
  expires_at?: string | null;
  allowed_ips?: string;
  requests_per_minute?: number;
  requests_per_day?: number;
}

export interface PartnerAPIKeyUpdatePayload {
  name?: string;
  description?: string;
  companies?: number[];
  allowed_scopes?: AllowedScope[];
  is_active?: boolean;
  expires_at?: string | null;
  allowed_ips?: string;
  requests_per_minute?: number;
  requests_per_day?: number;
}

// Получить список API-ключей
export const getPartnerAPIKeys = async (): Promise<PartnerAPIKey[]> => {
  const response = await apiClient.get('/permissions/partner-api-keys/');
  return response.data;
};

// Получить один API-ключ
export const getPartnerAPIKey = async (id: number): Promise<PartnerAPIKey> => {
  const response = await apiClient.get(`/permissions/partner-api-keys/${id}/`);
  return response.data;
};

// Создать API-ключ
export const createPartnerAPIKey = async (data: PartnerAPIKeyPayload): Promise<PartnerAPIKey> => {
  const response = await apiClient.post('/permissions/partner-api-keys/', data);
  return response.data;
};

// Обновить API-ключ (без регенерации ключа)
export const updatePartnerAPIKey = async (id: number, data: PartnerAPIKeyUpdatePayload): Promise<PartnerAPIKey> => {
  const response = await apiClient.patch(`/permissions/partner-api-keys/${id}/`, data);
  return response.data;
};

// Удалить API-ключ
export const deletePartnerAPIKey = async (id: number): Promise<void> => {
  await apiClient.delete(`/permissions/partner-api-keys/${id}/`);
};

// Перегенерировать ключ
export const regeneratePartnerAPIKey = async (id: number): Promise<PartnerAPIKey> => {
  const response = await apiClient.post(`/permissions/partner-api-keys/${id}/regenerate/`);
  return response.data;
};

// Включить/выключить ключ
export const togglePartnerAPIKey = async (id: number): Promise<PartnerAPIKey> => {
  const response = await apiClient.post(`/permissions/partner-api-keys/${id}/toggle_active/`);
  return response.data;
};
