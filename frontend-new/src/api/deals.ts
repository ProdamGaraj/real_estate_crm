import apiClient from './axios';
import type { Discount } from './discounts';
import type { Client } from './clients';
import type { Property } from './buildings';
import type { Payment } from './finances';

/**
 * Расширенный тип для сделки, включающий вложенные объекты.
 */
export interface Deal {
  id: number;
  status: 'BOOKING' | 'IN_PROGRESS' | 'CLOSED_WON' | 'CANCELLED'| 'TERMINATED';
  booking_start_date: string;
  booking_end_date: string;
  client: Client; // Вложенный объект клиента
  property: Property; // Вложенный объект недвижимости
  created_by: string | null;
  created_at: string;
  initial_price: string;
  initial_price_per_sqm: string;
  contract_price: string | null;
  /** Валюта договора. Весь график платежей ведётся в ней же */
  currency: 'UZS' | 'USD' | 'EUR';
  notes: string;
  applied_discounts: Discount[];
  payments: Payment[];
  signed_document_scan: string | null; // URL на скан
  client_signature_date: string | null;
  company_signature_date: string | null;
  logs: DealLog[];
  cancellation_reason: string | null;
  termination_document_scan: string | null;
  termination_date: string | null;
  logs: DealLog[];
}

export interface DealListItem {
    id: number;
    status: string;
    client: string;
    property: string;
    contract_price: string | null;
    created_by: string | null;
    created_at: string;
}

export interface DealFilters {
    client_name?: string;
    property_id?: number | null;
    created_by_id?: number | null;
    status?: string;
    contract_date_after?: string;
    contract_date_before?: string;
}


export interface DealCancellationPayload {
  cancellation_reason?: string;
  termination_document_scan?: File;
  termination_date?: string;
}

// --- НОВАЯ ФУНКЦИЯ ДЛЯ API ---
export const cancelOrTerminateDeal = async ({ dealId, payload }: { dealId: number; payload: DealCancellationPayload }): Promise<Deal> => {
  const formData = new FormData();
  if (payload.cancellation_reason) {
    formData.append('cancellation_reason', payload.cancellation_reason);
  }
  if (payload.termination_document_scan) {
    formData.append('termination_document_scan', payload.termination_document_scan);
  }
  if (payload.termination_date) {
    formData.append('termination_date', payload.termination_date);
  }

  const response = await apiClient.post(`/deals/${dealId}/cancel/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};
/**
 * Тип для данных при создании сделки (бронировании).
 */
export interface DealPayload {
  client: number;
  property: number;
  booking_end_date: string;
  /**
   * Заявка, из которой выросла сделка. Необязательна, но с ней замыкается
   * воронка: при успешном закрытии сделки заявка закрывается сама.
   */
  application?: number | null;
}

/**
 * Тип для данных при обновлении сделки.
 */
export interface DealUpdatePayload {
    currency?: 'UZS' | 'USD' | 'EUR';
    notes?: string;
    contract_price?: number;
    applied_discounts_ids?: number[];
    contract_number?: string;
    contract_date?: string | null;
    signed_document_scan?: File | null; // Поле для файла
    client_signature_date?: string | null;
    company_signature_date?: string | null;
}

/**
 * Создает новую сделку.
 */
export const createDeal = async (payload: DealPayload): Promise<Deal> => {
  const response = await apiClient.post('/deals/', payload);
  return response.data;
};

/**
 * Получает одну сделку по ее ID.
 */
export const getDealById = async (id: number): Promise<Deal> => {
    const response = await apiClient.get(`/deals/${id}/`);
    return response.data;
};

/**
 * Обновляет сделку по ее ID.
 */
export const updateDeal = async ({ id, payload }: { id: number; payload: DealUpdatePayload }): Promise<Deal> => {
    const formData = new FormData();

    // Преобразуем объект payload в FormData
    for (const key in payload) {
        const value = payload[key as keyof DealUpdatePayload];

        if (value !== undefined && value !== null) {
            if (key === 'applied_discounts_ids' && Array.isArray(value)) {
                // Обрабатываем массив ID скидок
                value.forEach((discountId: number) => formData.append('applied_discounts_ids', String(discountId)));
            } else if (value instanceof File) {
                 // Добавляем файл
                formData.append(key, value);
            }
            else {
                // Добавляем остальные поля
                formData.append(key, String(value));
            }
        }
    }

    const response = await apiClient.patch(`/deals/${id}/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
};

/**
 * Получает список доступных скидок для конкретной сделки.
 */
export const getAvailableDiscounts = async (dealId: number): Promise<Discount[]> => {
    const response = await apiClient.get(`/deals/${dealId}/available-discounts/`);
    return response.data;
};
export interface DealLog {
  id: number;
  user: string;
  action: string;
  created_at: string;
}

export const getDeals = async (filters: DealFilters): Promise<DealListItem[]> => {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([_, v]) => v != null && v !== '')
    );
    const response = await apiClient.get('/deals/', { params });
    return response.data;
};

export interface DealSummaryFilters {
    group_by: 'created_by' | 'project' | 'status';
    created_at_after?: string;
    created_at_before?: string;
}

export interface DealSummaryResponse {
    summary: any[];
    widgets: {
        booking_count: number;
        in_progress_count: number;
        closed_won_count: number;
        terminated_count: number;
        cancelled_count: number;
    };
}

export const getDealSummary = async (filters: DealSummaryFilters): Promise<DealSummaryResponse> => {
    const response = await apiClient.get('/deals/summary/', { params: filters });
    return response.data;
};

export const downloadDealSummary = async (filters: DealSummaryFilters) => {
    const response = await apiClient.get('/deals/summary/', {
        params: { ...filters, format: 'excel' },
        responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `deal_summary_${filters.group_by}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};