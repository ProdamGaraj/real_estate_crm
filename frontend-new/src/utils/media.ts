/**
 * Утилиты для работы с медиа-файлами
 */

// Базовый URL бэкенда (без /api)
const getBackendBaseUrl = (): string => {
  // В браузере используем текущий origin (работает для локальной разработки и туннеля)
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  // Fallback для SSR или тестов
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
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
