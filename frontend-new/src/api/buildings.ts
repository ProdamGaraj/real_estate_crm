import apiClient from './axios';

/**
 * Минимальный интерфейс для планировки,
 * используемый внутри объекта недвижимости.
 */
export interface LayoutMini {
  id: number;
  name: string;
  main_layout_image: string | null;
  extra_layout_image: string | null;
  floor_plan_image: string | null;
  usp_image: string | null;
}

/**
 * Интерфейс для объекта недвижимости (квартира, паркинг и т.д.).
 */
export interface Property {
  id: number;
  unit_number: string;
  property_type: string;
  status: string;
  area: number;
  price: number;
  floor: number;
  entrance: number;
  riser: string;
  has_finishing: boolean;
  layout: LayoutMini | null;
  description: string | null;
  active_deal_id: number | null;
}

/**
 * Минимальный интерфейс для проекта,
 * используемый внутри карточки дома.
 */
export interface ProjectMini {
  id: number;
  name: string;
}

// Полный интерфейс для детальной карточки дома, включая все поля
export interface BuildingDetail {
  id: number;
  name: string;
  project: ProjectMini;
  properties: Property[];
  building_type: { id: number; name: string; } | null;
  status: string;
  floors_count: number;
  ceiling_height: number | null;
  material: string;
  usp_1: string;
  usp_2: string;
  sales_start_date: string | null;
  gallery_images: BuildingImage[];
  cadastre_date_plan: string | null;
  logs: any[]; // Можно создать более строгий тип для логов
}

/**
* Получает детальную информацию об одном доме по его ID.
* @param projectId - ID проекта
* @param buildingId - ID дома
* @returns - Объект с детальной информацией о доме.
*/
export const getBuildingById = async ({ projectId, buildingId }: { projectId: number; buildingId: number }): Promise<BuildingDetail> => {
  const response = await apiClient.get(`/projects/${projectId}/buildings/${buildingId}/`);
  return response.data;
};

/**
* Загружает Excel-файл с объектами недвижимости на сервер.
* @param projectId - ID проекта
* @param buildingId - ID дома
* @param file - Загружаемый файл
* @returns - Ответ сервера со статусом загрузки.
*/
export const uploadProperties = async ({ projectId, buildingId, file }: { projectId: number; buildingId: number; file: File }): Promise<{ status: string }> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post(
    `/projects/${projectId}/buildings/${buildingId}/upload-properties/`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data;
};

/**
 * Формирует URL для скачивания шаблона Excel для объектов.
 * @param projectId - ID проекта
 * @param buildingId - ID дома
 * @returns - Относительный URL (без /api, т.к. используется с apiClient).
 */
export const getPropertyTemplateUrl = (projectId: number, buildingId: number): string => {
  return `/projects/${projectId}/buildings/${buildingId}/download-template/`;
};
// Интерфейс для изображения в галерее дома
export interface BuildingImage {
  id: number;
  image: string;
  caption: string;
}
// Тип для данных при обновлении дома
export type BuildingUpdatePayload = Partial<Omit<BuildingDetail, 'id' | 'project' | 'properties' | 'gallery_images' | 'logs'>>;
// Функция для обновления данных дома
export const updateBuilding = async ({ projectId, buildingId, payload }: { projectId: number; buildingId: number; payload: BuildingUpdatePayload }): Promise<BuildingDetail> => {
  const response = await apiClient.patch(`/projects/${projectId}/buildings/${buildingId}/`, payload);
  return response.data;
};

// Функция для загрузки изображения в галерею дома
export const uploadBuildingImage = async ({ projectId, buildingId, formData }: { projectId: number; buildingId: number; formData: FormData }): Promise<BuildingImage> => {
  const response = await apiClient.post(`/projects/${projectId}/buildings/${buildingId}/gallery/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

// Функция для удаления дома
export const deleteBuilding = async ({ projectId, buildingId }: { projectId: number; buildingId: number }): Promise<void> => {
  await apiClient.delete(`/projects/${projectId}/buildings/${buildingId}/`);
};

// Функция для удаления изображения из галереи дома
export const deleteBuildingImage = async ({ projectId, buildingId, imageId }: { projectId: number; buildingId: number; imageId: number }): Promise<void> => {
  await apiClient.delete(`/projects/${projectId}/buildings/${buildingId}/gallery/${imageId}/`);
};