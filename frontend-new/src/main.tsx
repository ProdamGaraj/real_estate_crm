// frontend-new/src/main.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './styles/colors.css'; // <-- Подключаем палитру цветов
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { store, persistor } from './store/store';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { ThemeProvider } from '@mui/material/styles'; // <-- Импорт ThemeProvider
import { createAppTheme } from './theme'; // <-- Импорт функции создания темы
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';

// i18n initialization - must be imported before App
import './i18n';

const queryClient = new QueryClient();

// Wrapper component to handle theme with language changes
function ThemedApp() {
  const { i18n } = useTranslation();
  
  // Recreate theme when language changes
  const theme = useMemo(() => createAppTheme(), [i18n.language]);
  
  return (
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  );
}

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