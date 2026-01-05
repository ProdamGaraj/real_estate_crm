import apiClient from './axios';

/**
 * Тип для объекта планировки, как он приходит с бэкенда.
 */
export interface Layout {
  id: number;
  name: string;
  main_layout_image: string | null;
  extra_layout_image: string | null;
  floor_plan_image: string | null;
  usp_image: string | null;
}

/**
 * Получает список всех планировок для конкретного дома.
 */
export const getLayouts = async (buildingId: number): Promise<Layout[]> => {
  // Убедитесь, что URL-путь соответствует вашему urls.py на бэкенде
  const response = await apiClient.get(`/projects/0/buildings/${buildingId}/layouts/`);
  return response.data;
};

/**
 * Обновляет (загружает изображение) для конкретной планировки.
 * @param buildingId - ID дома
 * @param layoutId - ID планировки
 * @param formData - FormData с файлом (например, { main_layout_image: File })
 */
export const updateLayoutImage = async ({ buildingId, layoutId, formData }: { buildingId: number, layoutId: number, formData: FormData }): Promise<Layout> => {
  const response = await apiClient.patch(`/projects/0/buildings/${buildingId}/layouts/${layoutId}/`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

/**
 * Удаляет изображение у планировки (устанавливает поле в null).
 */
export const deleteLayoutImage = async ({ buildingId, layoutId, fieldName }: { buildingId: number, layoutId: number, fieldName: string }): Promise<Layout> => {
  // Отправляем JSON с null для указанного поля
  const response = await apiClient.patch(`/projects/0/buildings/${buildingId}/layouts/${layoutId}/`, {
    [fieldName]: null
  });
  return response.data;
};