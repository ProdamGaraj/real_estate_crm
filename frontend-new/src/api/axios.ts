import axios from 'axios';
import { refreshAccessToken } from './auth';
import { clearAccessToken, getAccessToken, setAccessToken } from './tokenStore';

// Используем переменную окружения или относительный путь для работы через nginx
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Нужно, чтобы браузер отправлял httpOnly-cookie с refresh-токеном
  withCredentials: true,
});

// Функция для декодирования JWT токена
const decodeJWT = (token: string) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return null;
  }
};

// Функция для проверки истечения токена (обновляем за 5 минут до истечения)
const isTokenExpiringSoon = (token: string): boolean => {
  const decoded = decodeJWT(token);
  if (!decoded || !decoded.exp) return true;

  const expirationTime = decoded.exp * 1000; // Конвертируем в миллисекунды
  const currentTime = Date.now();
  const timeUntilExpiration = expirationTime - currentTime;

  // Обновляем токен за 5 минут до истечения (300000 мс)
  return timeUntilExpiration < 300000;
};

// Токены: access — в памяти вкладки, refresh — в httpOnly-cookie.
// Раньше оба лежали в localStorage и были доступны любому скрипту на странице.
const getAuthTokens = () => ({ accessToken: getAccessToken() });

const clearAuthTokens = () => {
  clearAccessToken();
};

// Эндпоинты которые не требуют авторизации
const PUBLIC_ENDPOINTS = [
  '/permissions/auth/login/',
  '/permissions/auth/password-reset/',
  '/token/refresh/',
];

// Проверка, является ли эндпоинт публичным
const isPublicEndpoint = (url: string | undefined): boolean => {
  if (!url) return false;
  return PUBLIC_ENDPOINTS.some(endpoint => url.includes(endpoint));
};

/**
 * Обновление токена выполняется в одном экземпляре на всё приложение.
 *
 * Страница отправляет несколько запросов одновременно, и без этой блокировки
 * каждый начинал собственное обновление. При включённой ротации refresh-токена
 * первый ответ обесценивал токен для остальных, и пользователя выбрасывало
 * на страницу входа.
 */
let refreshPromise: Promise<{ access: string }> | null = null;

const refreshTokensOnce = () => {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken()
      .then((response) => {
        setAccessToken(response.access);
        return response;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

// Перехватчик ЗАПРОСОВ (добавляет токен в заголовок и проактивно обновляет его)
apiClient.interceptors.request.use(
  async (config) => {
    // Если отправляем FormData, удаляем Content-Type чтобы браузер сам установил с правильным boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    // Для публичных эндпоинтов (логин и т.д.) не добавляем токен и не обновляем его
    if (isPublicEndpoint(config.url)) {
      return config;
    }

    const { accessToken } = getAuthTokens();

    // Проверяем, нужно ли обновить токен заранее
    if (accessToken && isTokenExpiringSoon(accessToken)) {
      try {
        const response = await refreshTokensOnce();
        config.headers.Authorization = `Bearer ${response.access}`;
        return config;
      } catch (error) {
        console.error('Ошибка проактивного обновления токена:', error);
        // Продолжаем с текущим токеном, если обновление не удалось
      }
    }

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Флаг для предотвращения множественных редиректов
let isRedirecting = false;

// Перехватчик ОТВЕТОВ (обновляет токен при 401 ошибке)
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const requestUrl = originalRequest?.url || '';

    // Пропускаем публичные эндпоинты
    if (PUBLIC_ENDPOINTS.some(endpoint => requestUrl.includes(endpoint))) {
      return Promise.reject(error);
    }

    // Если ошибка 401 и это не повторный запрос — пробуем обновить токен
    // по cookie. Есть ли refresh, знает только сервер: клиент его не видит.
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Параллельные 401 переиспользуют один и тот же запрос обновления
        const response = await refreshTokensOnce();

        // Обновляем заголовок в оригинальном запросе
        originalRequest.headers.Authorization = `Bearer ${response.access}`;

        // Повторяем оригинальный запрос с новым токеном
        return apiClient(originalRequest);

      } catch (refreshError) {
        // Если refresh токен тоже истек или невалиден, выходим из системы
        clearAuthTokens();

        // Редиректим только если ещё не редиректим и не на странице логина
        if (!isRedirecting && !window.location.pathname.includes('/login')) {
          isRedirecting = true;
          window.location.href = '/login';
          // Сбрасываем флаг через небольшую задержку
          setTimeout(() => { isRedirecting = false; }, 1000);
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;