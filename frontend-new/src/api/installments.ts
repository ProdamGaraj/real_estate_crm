// real_estate_crm/frontend-new/src/api/installments.ts

/**
 * Условия рассрочки компании: срок, скидка за срок и минимальный взнос.
 * Читает вся компания (калькулятор), меняют — по правам на ресурс «Скидки».
 */

import apiClient from './axios';

export interface InstallmentTerm {
  id: number;
  /** Срок в месяцах; 0 — оплата всей суммой сразу */
  months: number;
  discount_percent: string;
  down_payment_percent: string;
  is_active: boolean;
}

export type InstallmentTermPayload = Partial<Omit<InstallmentTerm, 'id'>>;

const companyParams = (company?: number | null) => (company ? { company } : {});

export const getInstallmentTerms = async (
  params: { company?: number | null; all?: boolean } = {}
): Promise<InstallmentTerm[]> => {
  return (await apiClient.get('/finances/installment-plans/', {
    params: { ...companyParams(params.company), ...(params.all ? { all: 1 } : {}) },
  })).data;
};

export const createInstallmentTerm = async (
  { company, ...payload }: InstallmentTermPayload & { company?: number | null }
): Promise<InstallmentTerm> => {
  return (await apiClient.post('/finances/installment-plans/', payload, { params: companyParams(company) })).data;
};

export const updateInstallmentTerm = async (
  { id, payload }: { id: number; payload: InstallmentTermPayload }
): Promise<InstallmentTerm> => {
  return (await apiClient.patch(`/finances/installment-plans/${id}/`, payload)).data;
};

export const deleteInstallmentTerm = async (id: number): Promise<void> => {
  await apiClient.delete(`/finances/installment-plans/${id}/`);
};
