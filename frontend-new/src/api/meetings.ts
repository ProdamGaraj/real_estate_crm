import apiClient from './axios';
import type { Client } from './clients';
import type { BuildingMini } from './projects';

// Тип для лога встречи
export interface MeetingLog {
  id: number;
  user: string;
  action: string;
  created_at: string;
}

// Основной тип для встречи
export interface Meeting {
  id: number;
  client: Client;
  status: 'NEW' | 'COMPLETED' | 'CANCELLED';
  planned_date: string;
  actual_date: string | null;
  creator: string | null;
  executor: string;
  comment: string;
  result_comment: string;
  interested_building: BuildingMini | null;
  is_auto_created: boolean;
  is_overdue: boolean;
  logs: MeetingLog[];
}

// Тип для создания/обновления встречи
export interface MeetingPayload {
  client_id: number;
  application_id?: number;
  executor_id: number;
  planned_date: string;
  comment?: string;
  interested_building_id?: number | null;
  status?: 'NEW' | 'COMPLETED' | 'CANCELLED';
  actual_date?: string | null;
  result_comment?: string;
}

/**
 * Получает список всех встреч
 */
export const getMeetings = async (filters: MeetingFilters = {}): Promise<Meeting[]> => {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([_, v]) => v != null && v !== '')
  );
  const response = await apiClient.get('/meetings/', { params });
  return response.data;
};

/**
 * Создает новую встречу
 */
export const createMeeting = async (payload: MeetingPayload): Promise<Meeting> => {
  const response = await apiClient.post('/meetings/', payload);
  return response.data;
};

/**
 * Обновляет встречу по ее ID
 */
export const updateMeeting = async ({ id, payload }: { id: number; payload: Partial<MeetingPayload> }): Promise<Meeting> => {
    const response = await apiClient.patch(`/meetings/${id}/`, payload);
    return response.data;
};
export interface MeetingFilters {
  client_name?: string;
  executor_id?: number | null;
  status?: string;
  planned_date_after?: string;
  planned_date_before?: string;
}

export interface MeetingSummaryFilters {
    group_by: 'executor' | 'project' | 'status';
    planned_date_after?: string;
    planned_date_before?: string;
    actual_date_after?: string;
    actual_date_before?: string;
}

export interface MeetingSummaryResponse {
    summary: any[];
    overdue_count: number;
}

export const getMeetingSummary = async (filters: MeetingSummaryFilters): Promise<MeetingSummaryResponse> => {
  const response = await apiClient.get('/meetings/summary/', { params: filters });
  return response.data;
};

export const downloadMeetingSummary = async (filters: MeetingSummaryFilters) => {
    const response = await apiClient.get('/meetings/summary/', {
        params: { ...filters, format: 'excel' },
        responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `meeting_summary_${filters.group_by}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};