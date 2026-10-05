// real_estate_crm/frontend-new/src/api/currency.ts

/**
 * Валюты компании и курсы.
 *
 * Курс хранится как «сколько сумов за 1 единицу валюты» — так его публикует
 * ЦБ Узбекистана. Пересчёт между любыми двумя валютами идёт через сум.
 *
 * Системный администратор работает с любой компанией и передаёт её в `company`;
 * остальным бэкенд подставляет их собственную компанию.
 */

import apiClient from './axios';

export interface CurrencyOption {
  code: string;
  name: string;
}

export interface CurrencySettings {
  company: number | null;
  company_name: string | null;
  /** Валюта сделок: в ней ведутся сделки и графики, к ней приводятся отчёты */
  deal_currency: string;
  /** В каких валютах можно вводить суммы графика. Валюта сделок входит всегда */
  supported_currencies: string[];
  available_currencies: CurrencyOption[];
  /** Валюта, к которой привязаны курсы (сум) */
  base_currency: string;
}

export interface ExchangeRate {
  id?: number;
  currency: string;
  date?: string;
  /** Сумов за 1 единицу валюты; null — курса нет */
  rate: string | null;
  source?: 'CBU' | 'MANUAL' | 'BASE';
  /** Компания ручного курса; null — курс ЦБ */
  company?: number | null;
  created_by?: string | null;
}

export interface CurrentRates {
  date: string;
  deal_currency: string;
  rates: Record<string, ExchangeRate>;
}

const companyParams = (company?: number | null) => (company ? { company } : {});

export const getCurrencySettings = async (company?: number | null): Promise<CurrencySettings> => {
  return (await apiClient.get('/finances/currency-settings/', { params: companyParams(company) })).data;
};

export const updateCurrencySettings = async (
  payload: { deal_currency: string; supported_currencies: string[]; company?: number | null }
): Promise<CurrencySettings> => {
  const { company, ...data } = payload;
  return (await apiClient.patch('/finances/currency-settings/', data, { params: companyParams(company) })).data;
};

/** Курсы на дату (по умолчанию — сегодня) для поддерживаемых валют компании или указанных */
export const getCurrentRates = async (
  params: { date?: string; currencies?: string[]; company?: number | null } = {}
): Promise<CurrentRates> => {
  const { currencies, company, ...rest } = params;
  return (await apiClient.get('/finances/exchange-rates/', {
    params: {
      ...rest,
      ...companyParams(company),
      ...(currencies?.length ? { currencies: currencies.join(',') } : {}),
    },
  })).data;
};

/** История курсов: курсы ЦБ и ручные курсы компании, новые сверху */
export const getRateHistory = async (
  params: { currency?: string; company?: number | null; limit?: number } = {}
): Promise<ExchangeRate[]> => {
  const { company, ...rest } = params;
  return (await apiClient.get('/finances/exchange-rates/', {
    params: { history: 1, ...rest, ...companyParams(company) },
  })).data;
};

/** Ручной курс компании на дату. Перекрывает курс ЦБ на эту дату только для своей компании */
export const createManualRate = async (
  payload: { currency: string; date: string; rate: string; company?: number | null }
): Promise<ExchangeRate> => {
  const { company, ...data } = payload;
  return (await apiClient.post('/finances/exchange-rates/', data, { params: companyParams(company) })).data;
};

export const deleteManualRate = async (id: number): Promise<void> => {
  await apiClient.delete(`/finances/exchange-rates/${id}/`);
};

/** Загрузить свежие курсы ЦБ */
export const refreshCbuRates = async (): Promise<{ saved: number; date: string | null }> => {
  return (await apiClient.post('/finances/exchange-rates/refresh/')).data;
};
