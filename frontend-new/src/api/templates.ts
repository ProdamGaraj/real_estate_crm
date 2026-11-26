// real_estate_crm/frontend-new/src/api/templates.ts
import apiClient from './axios';

export interface Template {
  id: number;
  name: string;
  file: string; // URL to the file
  /**
   * Для чего шаблон: договор по сделке или договор брони. У них разные
   * метки (у брони нет графика платежей, зато есть срок и взнос), поэтому
   * списки шаблонов в сделке и в брони не смешиваются
   */
  kind: 'DEAL' | 'BOOKING';
  applies_to_projects: number[];
  applies_to_buildings: number[];
  applies_to_property_types: string[];
  /**
   * Компания-владелец. Пусто — общесистемный шаблон, доступен всем
   * компаниям. Шаблон чужой компании менеджеры не видят, а администратор
   * видит все шаблоны сразу — без этого поля подмену не заметить
   */
  company: number | null;
  company_name: string | null;
}
export const getAvailableTemplates = async (dealId: number): Promise<Template[]> => {
  const response = await apiClient.get(`/deals/${dealId}/available-templates/`);
  return response.data;
};

/** Шаблоны договора брони, подходящие объекту этой брони */
export const getBookingTemplates = async (bookingId: number): Promise<Template[]> => {
  const response = await apiClient.get(`/bookings/${bookingId}/available-templates/`);
  return response.data;
};
export const getTemplates = async (): Promise<Template[]> => {
  const response = await apiClient.get('/templates/');
  return response.data;
};

export const createTemplate = async (formData: FormData): Promise<Template> => {
  const response = await apiClient.post('/templates/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const deleteTemplate = async (id: number): Promise<void> => {
  await apiClient.delete(`/templates/${id}/`);
};