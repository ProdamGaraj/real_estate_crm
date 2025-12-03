// src/api/projects.ts
import apiClient from './axios';

export interface Building { /* ... опишите поля модели Building ... */ }
export interface Project {
  id: number;
  name: string;
  address: string;
  created_at: string;
  buildings: BuildingMini[]; // <-- Добавляем это поле
}
export interface ProjectDetail extends Project {
    description: string;
    logo: string | null;
    usp_1: string;
    usp_2: string;
    usp_3: string;
    developer_details: string;
    gallery_images: ProjectImage[];
    cadastre_date_plan: string | null;
}
export type ProjectUpdatePayload = Partial<Omit<ProjectDetail, 'id' | 'created_at' | 'buildings' | 'gallery_images'>>;
export type ProjectPayload = Omit<Project, 'id' | 'created_at' /* ... */>;
export interface BuildingType { id: number; name: string; }

export const getProjects = async (filters: ProjectFilters = {}): Promise<Project[]> => {
  const params = new URLSearchParams(filters as any).toString();
  return (await apiClient.get(`/projects/?${params}`)).data;
};
export const getProjectById = async (id: number): Promise<ProjectDetail> => {
  return (await apiClient.get(`/projects/${id}/`)).data;
};
export const createProject = async (payload: ProjectPayload): Promise<Project> => {
  return (await apiClient.post('/projects/', payload)).data;
};
// Функция для создания дома
export const createBuilding = async ({ projectId, payload }: { projectId: number; payload: any }): Promise<Building> => {
  return (await apiClient.post(`/projects/${projectId}/buildings/`, payload)).data;
};
export const getBuildingTypes = async (): Promise<BuildingType[]> => {
  return (await apiClient.get('/building-types/')).data;
};
export interface BuildingMini {
  id: number;
  name: string;
  project_name?: string;
}
// Типы для фильтров
export interface ProjectFilters {
  search?: string;
}

export interface BuildingFilters {
  search?: string;
}
export const getBuildings = async ({ projectId, filters }: { projectId: number; filters: BuildingFilters }): Promise<Building[]> => {
    const params = new URLSearchParams(filters as any).toString();
    const response = await apiClient.get(`/projects/${projectId}/buildings/?${params}`);
    return response.data;
};
export interface ProjectImage {
  id: number;
  image: string;
  caption: string;
}
export const updateProject = async ({ id, payload }: { id: number; payload: ProjectUpdatePayload }): Promise<ProjectDetail> => {
  const response = await apiClient.patch(`/projects/${id}/`, payload);
  return response.data;
};
export const uploadProjectImage = async ({ projectId, formData }: { projectId: number; formData: FormData }): Promise<ProjectImage> => {
  const response = await apiClient.post(`/projects/${projectId}/gallery/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};
export const deleteProjectImage = async ({ projectId, imageId }: { projectId: number; imageId: number }): Promise<void> => {
  await apiClient.delete(`/projects/${projectId}/gallery/${imageId}/`);
};

/**
 * Удаляет проект по ID.
 */
export const deleteProject = async (id: number): Promise<void> => {
  await apiClient.delete(`/projects/${id}/`);
};

/**
 * Удаляет дом по ID.
 */
export const deleteBuilding = async ({ projectId, buildingId }: { projectId: number; buildingId: number }): Promise<void> => {
  await apiClient.delete(`/projects/${projectId}/buildings/${buildingId}/`);
};

/**
 * Получает плоский список всех домов из всех проектов.
 */
export const getAllBuildings = async (): Promise<BuildingMini[]> => {
  const response = await apiClient.get('/buildings-all/');
  return response.data;
};