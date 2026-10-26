// frontend-new/src/main.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { installNumberCopyHandler } from './utils/currency';
import './index.css';
import './styles/colors.css'; // <-- Подключаем палитру цветов
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { store, persistor } from './store/store';
import { Provider, useSelector } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { createAppTheme } from './theme';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo } from 'react';
import type { RootState } from './store/store';

// i18n initialization - must be imported before App
import './i18n';

const queryClient = new QueryClient();

// Wrapper component to handle theme with language and mode changes
function ThemedApp() {
  const { i18n } = useTranslation();
  const themeMode = useSelector((state: RootState) => state.theme.mode);
  
  // Recreate theme when language or mode changes
  const theme = useMemo(() => createAppTheme(themeMode), [i18n.language, themeMode]);

  // CSS-переменные из styles/colors.css и нативные элементы браузера (полосы
  // прокрутки, поля дат) следуют теме MUI. Без атрибута они всегда оставались
  // светлыми: в тёмной теме строка «Итого» в отчётах была белой с белым текстом
  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
  }, [themeMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}

// Копирование суммы вида «151 164 678 UZS» отдаёт «151164678»
installNumberCopyHandler();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <QueryClientProvider client={queryClient}>
          {/* Применяем тему ко всему приложению */}
          <ThemedApp />
        </QueryClientProvider>
      </PersistGate>
    </Provider>
  </React.StrictMode>
);