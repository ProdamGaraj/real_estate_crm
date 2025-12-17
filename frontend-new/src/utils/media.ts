/**
 * Утилиты для работы с медиа-файлами
 */

// Базовый URL бэкенда (без /api)
const getBackendBaseUrl = (): string => {
  // Берём baseURL из axios и убираем /api
  // Можно также использовать переменные окружения
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'https://tws483gv-8000.euw.devtunnels.ms/api';
  return apiBaseUrl.replace(/\/api\/?$/, '');
};

/**
 * Формирует полный URL для медиа-файла.
 * Если передан null/undefined или пустая строка - возвращает null.
 * Если URL уже абсолютный (начинается с http/https) - возвращает как есть.
 * Если относительный (начинается с /media/) - добавляет базовый URL бэкенда.
 */
export const getMediaUrl = (relativePath: string | null | undefined): string | null => {
  if (!relativePath) {
    return null;
  }
  
  // Если уже абсолютный URL
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }
  
  // Добавляем базовый URL
  const baseUrl = getBackendBaseUrl();
  
  // Убеждаемся что путь начинается с /
  const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  
  return `${baseUrl}${path}`;
};
