// real_estate_crm/frontend-new/src/api/templates.ts
import apiClient from './axios';

export interface Template {
  id: number;
  name: string;
  file: string; // URL to the file
  applies_to_projects: number[];
  applies_to_buildings: number[];
  applies_to_property_types: string[];
}
export const getAvailableTemplates = async (dealId: number): Promise<Template[]> => {
  const response = await apiClient.get(`/deals/${dealId}/available-templates/`);
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