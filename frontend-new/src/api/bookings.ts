import apiClient from './axios';
import type { Client } from './clients';
import type { Property } from './buildings';

/**
 * Бронь объекта — отдельная сущность, а не статус сделки.
 *
 * У брони свой срок (в днях, а не датой окончания), своя цена, свой договор
 * и один платёж — взнос. На один объект можно поставить очередь броней:
 * строго FIFO по дате создания, переупорядочивать её нельзя.
 *
 * Даты броней в очереди в базе не хранятся: конец предыдущей брони — начало
 * следующей, поэтому сервер присылает их расчётными (`dates_projected`).
 * За живой сделкой расчётных дат нет вовсе — неизвестно, когда сделка
 * разрешится.
 */
export type BookingStatus = 'PENDING_QUEUE' | 'ACTIVE' | 'CONVERTED' | 'EXPIRED' | 'CANCELLED';

export const BOOKING_LIVE_STATUSES: BookingStatus[] = ['ACTIVE', 'PENDING_QUEUE'];

/** Взнос за бронь: реальный долг, пока бронь жива */
export interface BookingFee {
  id: number;
  amount: string;
  currency: string;
  due_date: string;
  status: string;
  status_display: string;
  paid: boolean;
}

export interface BookingListItem {
  id: number;
  status: BookingStatus;
  client: string;
  property: string;
  duration_days: number;
  /** Фактические даты — только у действующей брони */
  start_date: string | null;
  end_date: string | null;
  /** Цена объекта, зафиксированная в момент активации брони */
  price: string | null;
  /** Валюта цены — валюта прайса проекта (взнос может быть в другой) */
  currency: string;
  contract_number: string | null;
  contract_date: string | null;
  created_by: string | null;
  created_at: string;
  /** 0 — действующая бронь, 1 и далее — место в очереди */
  queue_position: number | null;
  projected_start_date: string | null;
  projected_end_date: string | null;
  dates_projected: boolean;
  /** null — бронь бесплатная (взнос не задан в настройках) */
  fee_status: BookingFee | null;
  deal_id: number | null;
}

/** Строка очереди в карточке брони и в карточке объекта */
export interface BookingQueueRow {
  id: number;
  position?: number;
  status: BookingStatus;
  status_display?: string;
  /** null — бронь другого менеджера: занятость видна, клиент — нет */
  client: string | null;
  duration_days: number;
  start_date: string | null;
  end_date: string | null;
  projected: boolean;
  is_current?: boolean;
  accessible?: boolean;
}

export interface BookingLog {
  id: number;
  user: string;
  action: string;
  created_at: string;
}

export interface Booking extends Omit<BookingListItem, 'client' | 'property'> {
  client: Client;
  property: Property;
  application: number | null;
  cancellation_reason: string | null;
  signed_scan: string | null;
  company: number | null;
  logs: BookingLog[];
  logs_total: number;
  can_edit: boolean | null;
  queue: BookingQueueRow[];
  /**
   * Незаполненные паспортные данные клиента. Для брони они не нужны —
   * понадобятся при оформлении сделки, и карточка предупреждает заранее
   */
  client_missing_passport_fields: string[];
}

export interface BookingFilters {
  client_name?: string;
  contract_number?: string;
  property_id?: number | null;
  project_id?: number | null;
  building_id?: number | null;
  created_by_id?: number | null;
  status?: string;
  live?: boolean;
  created_at_after?: string;
  created_at_before?: string;
  ends_before?: string;
}

export interface BookingPayload {
  client: number;
  property: number;
  /** Срок в днях — не короче минимума из настроек компании */
  duration_days: number;
  application?: number | null;
  contract_number?: string | null;
  contract_date?: string | null;
}

export const getBookings = async (filters: BookingFilters = {}): Promise<BookingListItem[]> => {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value != null && value !== '')
  );
  return (await apiClient.get('/bookings/', { params })).data;
};

export const getBookingById = async (id: number): Promise<Booking> =>
  (await apiClient.get(`/bookings/${id}/`)).data;

export const createBooking = async (payload: BookingPayload): Promise<Booking> =>
  (await apiClient.post('/bookings/', payload)).data;

/** Номер и дата договора брони и заявка: срок меняется продлением */
export const updateBooking = async (
  { id, payload }: { id: number; payload: Partial<Pick<BookingPayload, 'contract_number' | 'contract_date' | 'application'>> }
): Promise<Booking> => (await apiClient.patch(`/bookings/${id}/`, payload)).data;

/** Продление: правка срока. Бесплатное — первый взнос покрывает продлённый срок */
export const extendBooking = async (
  { id, duration_days }: { id: number; duration_days: number }
): Promise<Booking> => (await apiClient.post(`/bookings/${id}/extend/`, { duration_days })).data;

/** Снятие брони вручную: долг по взносу снимается, очередь продвигается */
export const cancelBooking = async (
  { id, cancellation_reason }: { id: number; cancellation_reason: string }
): Promise<Booking> =>
  (await apiClient.post(`/bookings/${id}/cancel/`, { cancellation_reason })).data;

export const uploadBookingScan = async ({ id, file }: { id: number; file: File }): Promise<Booking> => {
  const formData = new FormData();
  formData.append('file', file);
  return (await apiClient.post(`/bookings/${id}/scan/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })).data;
};

export interface BookingSummary {
  widgets: {
    active_count: number;
    queued_count: number;
    converted_count: number;
    expired_count: number;
    cancelled_count: number;
    /** Срок истёк, а ночной прогон ещё не прошёл */
    overdue_count: number;
  };
}

export const getBookingSummary = async (
  filters: { created_at_after?: string; created_at_before?: string } = {}
): Promise<BookingSummary> => (await apiClient.get('/bookings/summary/', { params: filters })).data;

/** Очередь броней объекта с расчётными датами — для карточки объекта */
export interface PropertyBookingQueue {
  property: number;
  property_status: string;
  queue: BookingQueueRow[];
  live_deal_id: number | null;
  awaiting_refund: boolean;
  /** Цена из прайса, которая применится, когда объект освободится */
  pending_price: string | null;
}

export const getPropertyBookingQueue = async (propertyId: number): Promise<PropertyBookingQueue> =>
  (await apiClient.get(`/properties/${propertyId}/booking-queue/`)).data;

/** Настройки брони компании: взнос, счёт получателя, минимальный срок */
export interface BookingSettings {
  company: number | null;
  company_name?: string;
  booking_fee_amount: string;
  booking_fee_account: number | null;
  booking_fee_currency?: string;
  min_booking_days: number;
  accounts: { id: number; name: string }[];
}

export const getBookingSettings = async (): Promise<BookingSettings> =>
  (await apiClient.get('/bookings/settings/')).data;

export const updateBookingSettings = async (
  payload: Partial<Pick<BookingSettings, 'booking_fee_amount' | 'booking_fee_account' | 'min_booking_days'>>
): Promise<BookingSettings> => (await apiClient.patch('/bookings/settings/', payload)).data;
