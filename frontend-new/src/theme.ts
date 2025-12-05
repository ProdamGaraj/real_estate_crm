// frontend-new/src/theme.ts

import { createTheme } from '@mui/material/styles';
import i18n from './i18n';

// Function to get pagination labels based on current language
const getPaginationLabels = () => {
  const lang = i18n.language;
  
  if (lang === 'ru') {
    return {
      labelRowsPerPage: 'Строк на странице:',
      labelDisplayedRows: ({ from, to, count }: { from: number; to: number; count: number }) =>
        `${from}–${to} из ${count !== -1 ? count : `более ${to}`}`,
    };
  }
  
  if (lang === 'uz') {
    return {
      labelRowsPerPage: 'Sahifadagi qatorlar:',
      labelDisplayedRows: ({ from, to, count }: { from: number; to: number; count: number }) =>
        `${from}–${to} / ${count !== -1 ? count : `${to} dan ko'p`}`,
    };
  }
  
  return {
    labelRowsPerPage: 'Rows per page:',
    labelDisplayedRows: ({ from, to, count }: { from: number; to: number; count: number }) =>
      `${from}–${to} of ${count !== -1 ? count : `more than ${to}`}`,
  };
};

// Создаем нашу кастомную тему
export const createAppTheme = () => {
  const paginationLabels = getPaginationLabels();
  
  return createTheme({
    palette: {
      primary: {
        main: '#D4A017', // Элегантный золотой/янтарный (из --color-primary)
      },
      secondary: {
        main: '#2c3e50', // Глубокий серо-синий (из --color-secondary)
      },
      background: {
        default: '#ffffff', // Белый фон (из --color-background-default)
        paper: '#ffffff', // Белый (из --color-background-paper)
      },
      text: {
        primary: '#212121', // Основной текст (из --color-text-primary)
        secondary: '#757575', // Вторичный текст (из --color-text-secondary)
      },
    },
    typography: {
      fontFamily: '"Inter", sans-serif',
      h4: {
        fontWeight: 700,
      },
      h5: {
        fontWeight: 600,
      },
       h6: {
        fontWeight: 600,
      }
    },
    components: {
      // Стилизуем все карточки и панели в приложении
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)', // --shadow-small
          },
        },
      },
      MuiCard: {
          styleOverrides: {
              root: {
                  borderRadius: 8,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)', // --shadow-small
              }
          }
      },
      // Делаем кнопки чуть мягче
      MuiButton: {
          styleOverrides: {
              root: {
                  borderRadius: 8,
                  textTransform: 'none', // Убираем ЗАГЛАВНЫЕ буквы
                  fontWeight: 600,
              }
          }
      },
      // Локализация пагинации таблиц
      MuiTablePagination: {
        defaultProps: {
          labelRowsPerPage: paginationLabels.labelRowsPerPage,
          labelDisplayedRows: paginationLabels.labelDisplayedRows,
        },
      },
    },
  });
};

// Экспортируем тему для обратной совместимости
export const theme = createAppTheme();