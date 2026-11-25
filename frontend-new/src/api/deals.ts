import apiClient from './axios';
import type { Discount } from './discounts';
import type { Client } from './clients';
import type { Property } from './buildings';
import type { Payment } from './finances';

/**
 * Расширенный тип для сделки, включающий вложенные объекты.
 */
/**
 * Что действительно записано в графике платежей сделки.
 *
 * В карточке стояло «Рассрочка на 18 месяцев», а платежей в графике было
 * два: название плана ни с чем не сверялось. Здесь — число платежей,
 * сроки и признак расхождения с выбранным планом.
 */
export interface PaymentTerms {
  plan_kind: '' | 'FULL' | 'INSTALLMENT' | 'DEFERRED';
  plan_months: number;
  /** Сколько платежей должно быть по плану; null — по плану не определить */
  expected_payments: number | null;
  scheduled_payments: number;
  paid_payments: number;
  first_due_date: string | null;
  last_due_date: string | null;
  /** null — проверять нечего (плана нет или график пуст) */
  matches_plan: boolean | null;
}

/**
 * Бронь, из которой выросла сделка. Срок, даты, цена на момент брони и
 * договор брони живут на самой брони, а не на сделке
 */
export interface DealBookingInfo {
  id: number;
  status: string;
  status_display: string;
  start_date: string | null;
  end_date: string | null;
  duration_days: number;
  price: string | null;
  currency: string;
  contract_number: string | null;
  contract_date: string | null;
}

export interface Deal {
  id: number;
  /** Статуса «Бронь» у сделки больше нет: бронь — отдельная сущность */
  status: 'IN_PROGRESS' | 'CLOSED_WON' | 'CANCELLED'| 'TERMINATED';
  /** null — сделка оформлена без брони (продажа по свободному объекту) */
  booking_info: DealBookingInfo | null;
  client: Client; // Вложенный объект клиента
  property: Property; // Вложенный объект недвижимости
  created_by: string | null;
  created_at: string;
  initial_price: string;
  initial_price_per_sqm: string;
  contract_price: string | null;
  /**
   * Валюта сделки. Задаётся при брони по настройке компании и дальше не
   * меняется: в ней цена, договор и весь график платежей
   */
  currency: string;
  /** Цена по прайсу проекта на момент брони — в валюте прайса */
  catalog_price: string | null;
  catalog_currency: string;
  /** Курс пересчёта прайса в валюту сделки на дату брони */
  catalog_rate: string | null;
  /** Компания сделки: её настройки валют действуют для графика */
  company: number | null;
  /** План оплаты сделки (тип платежа с планом); от него зависят доступные скидки */
  payment_plan: number | null;
  payment_plan_name: string | null;
  /** Фактические условия оплаты — из графика платежей, а не из названия плана */
  payment_terms?: PaymentTerms;
  /** Может ли текущий пользователь менять и отменять сделку (null — сервер не сообщил) */
  can_edit?: boolean | null;
  /**
   * Незаполненные паспортные данные клиента (коды полей). Без них сделку
   * не оформить и не закрыть
   */
  client_missing_passport_fields?: string[];
  contract_number?: string;
  contract_date?: string | null;
  notes: string;
  applied_discounts: Discount[];
  payments: Payment[];
  signed_document_scan: string | null; // URL на скан
  client_signature_date: string | null;
  company_signature_date: string | null;
  logs: DealLog[];
  /** Всего записей в журнале; в logs приходят последние 50 */
  logs_total?: number;
  cancellation_reason: string | null;
  termination_document_scan: string | null;
  termination_date: string | null;
  logs: DealLog[];
}

export interface DealListItem {
    id: number;
    status: string;
    contract_number: string | null;
    client: string;
    property: string;
    contract_price: string | null;
    currency: string;
    created_by: string | null;
    created_at: string;
}

export interface DealFilters {
    client_name?: string;
    contract_number?: string;
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
 * Замена скана подписанного договора (signed) или документа о расторжении
 * (termination). Меняется только файл — работает и у закрытой сделки
 */
export const replaceDealScan = async ({ dealId, kind, file }: {
  dealId: number;
  kind: 'signed' | 'termination';
  file: File;
}): Promise<Deal> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post(`/deals/${dealId}/scans/${kind}/`, formData, {
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
  /**
   * Действующая бронь, по которой оформляется сделка: цена берётся из брони,
   * а сама бронь становится её частью. Без брони сделку можно оформить
   * только по свободному объекту
   */
  booking?: number | null;
  /**
   * Заявка, из которой выросла сделка. Необязательна, но с ней замыкается
   * воронка: при успешном закрытии сделки заявка закрывается сама.
   * При оформлении по брони переносится с брони.
   */
  application?: number | null;
}

/**
 * Тип для данных при обновлении сделки.
 */
export interface DealUpdatePayload {
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
/**
 * Условия сделки одним JSON-запросом: план оплаты, скидки и стоимость по договору.
 * FormData из updateDeal не умеет передать пустой список скидок или пустой план,
 * поэтому снять их через него нельзя.
 */
export const updateDealTerms = async (
  { id, terms }: { id: number; terms: { payment_plan?: number | null; applied_discounts_ids?: number[]; contract_price?: number | null } }
): Promise<Deal> => {
  return (await apiClient.patch(`/deals/${id}/`, terms)).data;
};

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

/**
 * Строка сводной таблицы сделок: группа (менеджер, проект или код статуса)
 * и число сделок по каждому статусу. total — все, кроме отменённых
 */
export interface DealSummaryRow {
    group: string;
    in_progress: number;
    closed_won: number;
    terminated: number;
    cancelled: number;
    total: number;
}

export interface DealSummaryResponse {
    summary: DealSummaryRow[];
    widgets: {
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

export const downloadDealSummary = async (filters: DealSummaryFilters, lang?: string) => {
    const response = await apiClient.get('/deals/summary/', {
        // «export», а не «format»: format DRF принимает за выбор рендерера и отвечает 404.
        // lang — язык заголовков в файле
        params: { ...filters, export: 'excel', lang },
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