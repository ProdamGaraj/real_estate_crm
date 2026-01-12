import apiClient from './axios';
import type { RejectionReason } from './applications';

export interface BuildingType { id: number; name: string; }

// --- Application Statuses ---

export interface ApplicationStatus {
  id: number;
  code: string;
  name: string;
  color: string;
  order: number;
  is_active: boolean;
  is_final: boolean;
  created_at: string;
}

export interface ApplicationStatusPayload {
  code: string;
  name: string;
  color?: string;
  order?: number;
  is_active?: boolean;
  is_final?: boolean;
}

export const getApplicationStatuses = async (isActive?: boolean): Promise<ApplicationStatus[]> => {
  let url = '/application-statuses/';
  if (isActive !== undefined) {
    url += `?is_active=${isActive}`;
  }
  const response = await apiClient.get(url);
  return response.data;
};

export const createApplicationStatus = async (payload: ApplicationStatusPayload): Promise<ApplicationStatus> => {
  const response = await apiClient.post('/application-statuses/', payload);
  return response.data;
};

export const updateApplicationStatus = async (
  { id, payload }: { id: number; payload: Partial<ApplicationStatusPayload> }
): Promise<ApplicationStatus> => {
  const response = await apiClient.patch(`/application-statuses/${id}/`, payload);
  return response.data;
};

export const deleteApplicationStatus = async (id: number): Promise<void> => {
  await apiClient.delete(`/application-statuses/${id}/`);
};

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