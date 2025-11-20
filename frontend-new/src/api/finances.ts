// real_estate_crm/frontend-new/src/api/finances.ts

import apiClient from './axios';
import type { DealListItem } from './deals';

// --- ИНТЕРФЕЙСЫ ---

// Справочники
export interface PaymentType {
  id: number;
  name: string;
}

export interface BeneficiaryAccount {
  id: number;
  name: string;
}

// Платеж
export interface Payment {
  id: number;
  amount: string;
  currency: string;
  method: string;
  due_date: string;
  payment_date: string | null;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'TO_BE_RETURNED' | 'RETURNED';
  status_display: string;
  created_at: string;
  payment_type: string;
  beneficiary_account: string;
  created_by: string;
  responsible_employee: string;
  client: { id: number; full_name: string; };
  deal: DealListItem | null;
}

// Данные для создания одного платежа в графике
export interface PaymentSchedulePayloadItem {
  amount: number;
  due_date: string;
  payment_type_id: number;
  beneficiary_account_id: number;
  currency: 'UZS' | 'USD' | 'EUR';
  method: 'CASH' | 'CASHLESS';
}

export interface PaymentFilters {
    client_name?: string;
    deal_id?: number | null;
    status?: string;
    due_date_after?: string;
    due_date_before?: string;
}

export interface FinanceSummaryFilters {
    group_by: 'status' | 'project' | 'manager';
    due_date_after?: string;
    due_date_before?: string;
    payment_date_after?: string;
    payment_date_before?: string;
}

export interface FinanceSummaryResponse {
    summary: any[];
    widgets: {
        overdue_sum: number;
        paid_sum: number;
    };
}

// --- ФУНКЦИИ API ---

export const getFinanceSummary = async (filters: FinanceSummaryFilters): Promise<FinanceSummaryResponse> => {
    const response = await apiClient.get('/finances/summary/', { params: filters });
    return response.data;
};

export const downloadFinanceSummary = async (filters: FinanceSummaryFilters) => {
    const response = await apiClient.get('/finances/summary/', {
        params: { ...filters, format: 'excel' },
        responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `finance_summary_${filters.group_by}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};


export const getPayments = async (filters: PaymentFilters): Promise<Payment[]> => {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([_, v]) => v != null && v !== '')
    );
    const response = await apiClient.get('/finances/payments/', { params });
    return response.data;
};

export const getPaymentById = async (id: number): Promise<Payment> => {
    const response = await apiClient.get(`/finances/payments/${id}/`);
    return response.data;
};

export const getPaymentTypes = async (): Promise<PaymentType[]> => {
  const response = await apiClient.get('/finances/payment-types/');
  return response.data;
};
export const createPaymentType = async (payload: { name: string }): Promise<PaymentType> => {
  return (await apiClient.post('/finances/payment-types/', payload)).data;
};
export const deletePaymentType = async (id: number): Promise<void> => {
  await apiClient.delete(`/finances/payment-types/${id}/`);
};
export const getBeneficiaryAccounts = async (): Promise<BeneficiaryAccount[]> => {
  const response = await apiClient.get('/finances/beneficiary-accounts/');
  return response.data;
};

export const createPaymentSchedule = async ({ dealId, payments }: { dealId: number; payments: PaymentSchedulePayloadItem[] }): Promise<Payment[]> => {
  const response = await apiClient.post(`/deals/${dealId}/payment-schedule/`, payments);
  return response.data;
};
export const createBeneficiaryAccount = async (payload: { name: string; details: string }): Promise<BeneficiaryAccount> => {
  return (await apiClient.post('/finances/beneficiary-accounts/', payload)).data;
};
export const deleteBeneficiaryAccount = async (id: number): Promise<void> => {
  await apiClient.delete(`/finances/beneficiary-accounts/${id}/`);
};
export interface PaymentUpdatePayload {
  payment_date?: string | null;
}
export const updatePayment = async ({ id, payload }: { id: number; payload: PaymentUpdatePayload }): Promise<Payment> => {
  const response = await apiClient.patch(`/finances/payments/${id}/`, payload);
  return response.data;
};

export const markPaymentAsReturned = async (id: number): Promise<Payment> => {
    const response = await apiClient.post(`/finances/payments/${id}/mark-as-returned/`);
    return response.data;
};