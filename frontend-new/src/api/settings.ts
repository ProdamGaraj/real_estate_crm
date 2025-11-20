import apiClient from './axios';
import type { RejectionReason } from './applications';

export interface BuildingType { id: number; name: string; }

// --- Rejection Reasons ---

export const getRejectionReasons = async (type?: 'JUNK' | 'REJECTED'): Promise<RejectionReason[]> => {
  let url = '/rejection-reasons/';
  if (type) {
    url += `?type=${type}`;
  }
  const response = await apiClient.get(url);
  return response.data;
};

export const createRejectionReason = async (
  payload: { name: string; reason_type: 'JUNK' | 'REJECTED' }
): Promise<RejectionReason> => {
  const response = await apiClient.post('/rejection-reasons/', payload);
  return response.data;
};

export const updateRejectionReason = async (
  { id, payload }: { id: number; payload: Partial<RejectionReason> }
): Promise<RejectionReason> => {
  const response = await apiClient.patch(`/rejection-reasons/${id}/`, payload);
  return response.data;
};


// --- Building Types ---

export const getBuildingTypes = async (): Promise<BuildingType[]> => {
  const response = await apiClient.get('/building-types/');
  return response.data;
};

export const createBuildingType = async (payload: { name: string }): Promise<BuildingType> => {
  const response = await apiClient.post('/building-types/', payload);
  return response.data;
};

export const deleteBuildingType = async (id: number): Promise<void> => {
  await apiClient.delete(`/building-types/${id}/`);
};