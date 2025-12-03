import axios from 'axios';
import { refreshAccessToken } from './auth';

const apiClient = axios.create({
  baseURL:'https://tws483gv-8000.euw.devtunnels.ms/api',
  // baseURL: 'http://127.0.0.1:8000/api',
  // baseURL: 'https://c0s9w1gq-8000.euw.devtunnels.ms/api',
  headers: {
    'Content-Type': 'application/json',
  },
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

// Функция для получения токенов из localStorage (где Zustand их хранит)
const getAuthTokens = () => {
  try {
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      const parsed = JSON.parse(authStorage);
      return {
        accessToken: parsed.state?.accessToken,
        refreshToken: parsed.state?.refreshToken,
      };
    }
  } catch (error) {
    console.error('Error reading auth tokens:', error);
  }
  return { accessToken: null, refreshToken: null };
};

// Функция для обновления токенов в localStorage
const setAuthTokens = (accessToken: string, refreshToken: string) => {
  try {
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      const parsed = JSON.parse(authStorage);
      parsed.state.accessToken = accessToken;
      parsed.state.refreshToken = refreshToken;
      localStorage.setItem('auth-storage', JSON.stringify(parsed));
    }
  } catch (error) {
    console.error('Error updating auth tokens:', error);
  }
};

// Функция для очистки токенов
const clearAuthTokens = () => {
  try {
    localStorage.removeItem('auth-storage');
  } catch (error) {
    console.error('Error clearing auth tokens:', error);
  }
};

// Перехватчик ЗАПРОСОВ (добавляет токен в заголовок и проактивно обновляет его)
apiClient.interceptors.request.use(
  async (config) => {
    const { accessToken, refreshToken } = getAuthTokens();
    
    // Проверяем, нужно ли обновить токен заранее
    if (accessToken && refreshToken && isTokenExpiringSoon(accessToken) && !config.url?.includes('/token/refresh/')) {
      try {
        console.log('Проактивное обновление токена...');
        const response = await refreshAccessToken(refreshToken);
        setAuthTokens(response.access, response.refresh || refreshToken);
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

// Эндпоинты которые не требуют авторизации
const PUBLIC_ENDPOINTS = [
  '/permissions/auth/login/',
  '/permissions/auth/password-reset/',
  '/token/refresh/',
];

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

    const { refreshToken } = getAuthTokens();

    // Если ошибка 401, токен истек и это не повторный запрос
    if (error.response?.status === 401 && refreshToken && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Запрашиваем новый access токен с помощью refresh токена
        const response = await refreshAccessToken(refreshToken);

        // Сохраняем новые токены
        setAuthTokens(response.access, response.refresh || refreshToken);

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

    // Если 401 и нет refresh токена - редирект на логин
    if (error.response?.status === 401 && !refreshToken) {
      if (!isRedirecting && !window.location.pathname.includes('/login')) {
        isRedirecting = true;
        clearAuthTokens();
        window.location.href = '/login';
        setTimeout(() => { isRedirecting = false; }, 1000);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;