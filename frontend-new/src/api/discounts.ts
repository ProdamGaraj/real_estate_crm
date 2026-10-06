import apiClient from './axios';

export interface DiscountLog {
  id: number;
  user: string;
  action: string;
  created_at: string;
}

export interface Discount {
  id: number;
  name: string;
  percentage_value: string;
  comment: string;
  start_date: string;
  end_date: string | null;
  property_type: string | null;
  buildings: number[];
  buildings_info: string[];
  /** Пусто — скидка действует при любом плане оплаты; иначе — только при этих планах */
  payment_plans: number[];
  payment_plans_info: string[];
  logs?: DiscountLog[];
}

export type DiscountPayload = Omit<Discount, 'id' | 'buildings_info' | 'payment_plans_info' | 'logs'>;

/** Скидки, которые можно применить к объекту сегодня (для калькулятора в карточке объекта) */
export const getPropertyAvailableDiscounts = async (propertyId: number): Promise<Discount[]> => {
  return (await apiClient.get(`/properties/${propertyId}/available-discounts/`)).data;
};

/** Действует ли скидка при плане оплаты: без ограничения — при любом */
export const discountFitsPlan = (discount: Discount, planId: number | null | undefined) =>
  !discount.payment_plans?.length || (planId != null && discount.payment_plans.includes(planId));

export const getDiscounts = async (): Promise<Discount[]> => {
  return (await apiClient.get('/discounts/')).data;
};

// --- ВОТ НЕДОСТАЮЩАЯ ФУНКЦИЯ ---
export const getDiscountById = async (id: number): Promise<Discount> => {
  return (await apiClient.get(`/discounts/${id}/`)).data;
};
// --------------------------------

export const createDiscount = async (payload: DiscountPayload): Promise<Discount> => {
  return (await apiClient.post('/discounts/', payload)).data;
};

export const updateDiscount = async ({ id, payload }: { id: number, payload: DiscountPayload }): Promise<Discount> => {
  return (await apiClient.put(`/discounts/${id}/`, payload)).data;
};