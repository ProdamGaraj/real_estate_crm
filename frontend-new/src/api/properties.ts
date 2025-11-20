import apiClient from './axios';

export interface PropertyPayload {
  status?: 'SELECTION' | 'RESERVE';
  description?: string;
}

export const updateProperty = async ({ buildingId, propertyId, payload }: { buildingId: number, propertyId: number, payload: PropertyPayload }): Promise<void> => {
  // Путь к проекту в URL не обязателен, т.к. бэкенд его не использует
  await apiClient.patch(`/projects/0/buildings/${buildingId}/properties/${propertyId}/`, payload);
};