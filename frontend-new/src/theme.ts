// frontend-new/src/theme.ts

import { createTheme } from '@mui/material/styles';

// Создаем нашу кастомную тему
export const theme = createTheme({
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
    }
  },
});