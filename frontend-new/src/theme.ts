// frontend-new/src/theme.ts

import { createTheme, PaletteMode } from '@mui/material/styles';
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

// Палитра для светлой темы
const lightPalette = {
  primary: {
    main: '#D4A017', // Элегантный золотой/янтарный
    light: '#E5B840',
    dark: '#B38810',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#2c3e50', // Глубокий серо-синий
    light: '#3d5166',
    dark: '#1a252f',
    contrastText: '#ffffff',
  },
  background: {
    default: '#f5f5f5',
    paper: '#ffffff',
  },
  text: {
    primary: '#212121',
    secondary: '#757575',
  },
  divider: 'rgba(0, 0, 0, 0.12)',
};

// Палитра для тёмной темы
const darkPalette = {
  primary: {
    main: '#E5B840', // Чуть светлее золотой для тёмной темы
    light: '#F0CA60',
    dark: '#D4A017',
    contrastText: '#000000',
  },
  secondary: {
    main: '#5d7d9a', // Светлее серо-синий для тёмной темы
    light: '#7a98b3',
    dark: '#3d5166',
    contrastText: '#ffffff',
  },
  background: {
    default: '#121212',
    paper: '#1e1e1e',
  },
  text: {
    primary: 'rgba(255, 255, 255, 0.95)',
    secondary: 'rgba(255, 255, 255, 0.7)',
  },
  divider: 'rgba(255, 255, 255, 0.12)',
};

// Создаем кастомную тему с поддержкой светлого/темного режима
export const createAppTheme = (mode: PaletteMode = 'light') => {
  const paginationLabels = getPaginationLabels();
  const isDark = mode === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  
  return createTheme({
    palette: {
      mode,
      ...palette,
      // Дополнительные цвета состояний
      success: {
        main: '#4caf50',
        light: isDark ? '#6fbf73' : '#81c784',
        dark: '#388e3c',
      },
      error: {
        main: '#f44336',
        light: isDark ? '#f6685e' : '#e57373',
        dark: '#d32f2f',
      },
      warning: {
        main: '#ff9800',
        light: isDark ? '#ffac33' : '#ffb74d',
        dark: '#f57c00',
      },
      info: {
        main: '#2196f3',
        light: isDark ? '#4dabf5' : '#64b5f6',
        dark: '#1976d2',
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
      },
    },
    components: {
      // Глобальные стили для CssBaseline
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            scrollbarColor: isDark ? '#6b6b6b #2b2b2b' : '#c1c1c1 #f5f5f5',
            '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
              width: 8,
              height: 8,
            },
            '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
              borderRadius: 8,
              backgroundColor: isDark ? '#6b6b6b' : '#c1c1c1',
              border: '2px solid transparent',
            },
            '&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track': {
              borderRadius: 8,
              backgroundColor: isDark ? '#2b2b2b' : '#f5f5f5',
            },
          },
        },
      },
      // Стилизуем все карточки и панели в приложении
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            boxShadow: isDark 
              ? '0 4px 12px rgba(0, 0, 0, 0.3)' 
              : '0 4px 12px rgba(0, 0, 0, 0.05)',
            backgroundImage: 'none', // Убираем градиент в тёмной теме
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            boxShadow: isDark 
              ? '0 4px 12px rgba(0, 0, 0, 0.3)' 
              : '0 4px 12px rgba(0, 0, 0, 0.05)',
            backgroundImage: 'none',
          },
        },
      },
      // Делаем кнопки чуть мягче
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            textTransform: 'none',
            fontWeight: 600,
          },
        },
      },
      // Стили для AppBar
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
      // Стили для Drawer (Sidebar)
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
            backgroundImage: 'none',
            borderRight: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.12)',
          },
        },
      },
      // Стили для ListItem в Drawer
      MuiListItemButton: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
            },
            '&.Mui-selected': {
              backgroundColor: isDark ? 'rgba(229, 184, 64, 0.16)' : 'rgba(212, 160, 23, 0.12)',
              '&:hover': {
                backgroundColor: isDark ? 'rgba(229, 184, 64, 0.24)' : 'rgba(212, 160, 23, 0.18)',
              },
            },
          },
        },
      },
      MuiListItemIcon: {
        styleOverrides: {
          root: {
            color: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.54)',
            minWidth: 40,
          },
        },
      },
      MuiListItemText: {
        styleOverrides: {
          primary: {
            color: isDark ? 'rgba(255, 255, 255, 0.87)' : 'rgba(0, 0, 0, 0.87)',
          },
        },
      },
      // Стили для TextField
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 8,
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
          },
        },
      },
      // Стили для Select
      MuiSelect: {
        styleOverrides: {
          root: {
            borderRadius: 8,
          },
        },
      },
      // Стили для MUI X DataGrid
      MuiDataGrid: {
        styleOverrides: {
          root: {
            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(224, 224, 224, 1)',
            backgroundColor: isDark ? '#1e1e1e' : '#ffffff',
          },
          columnHeaders: {
            backgroundColor: isDark ? '#252525' : '#fafafa',
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(224, 224, 224, 1)',
          },
          columnHeader: {
            '&:focus, &:focus-within': {
              outline: 'none',
            },
          },
          columnHeaderTitle: {
            fontWeight: 600,
          },
          cell: {
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(224, 224, 224, 1)',
            '&:focus, &:focus-within': {
              outline: 'none',
            },
          },
          row: {
            '&:hover': {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
            },
            '&.Mui-selected': {
              backgroundColor: isDark ? 'rgba(229, 184, 64, 0.16)' : 'rgba(212, 160, 23, 0.08)',
              '&:hover': {
                backgroundColor: isDark ? 'rgba(229, 184, 64, 0.24)' : 'rgba(212, 160, 23, 0.12)',
              },
            },
          },
          footerContainer: {
            borderTopColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(224, 224, 224, 1)',
          },
          overlay: {
            backgroundColor: isDark ? 'rgba(18, 18, 18, 0.7)' : 'rgba(255, 255, 255, 0.7)',
          },
        },
      },
      // Стили для таблиц
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(224, 224, 224, 1)',
          },
          head: {
            fontWeight: 600,
            backgroundColor: isDark ? '#252525' : '#fafafa',
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
            },
          },
        },
      },
      // Стили для диалогов
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 12,
            backgroundImage: 'none',
          },
        },
      },
      // Стили для меню
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 8,
            backgroundImage: 'none',
          },
        },
      },
      // Стили для Chip
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 6,
          },
        },
      },
      // Стили для Tab
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
          },
        },
      },
      // Стили для Tooltip
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: isDark ? '#424242' : '#616161',
            borderRadius: 4,
          },
        },
      },
      // Локализация пагинации таблиц
      MuiTablePagination: {
        defaultProps: {
          labelRowsPerPage: paginationLabels.labelRowsPerPage,
          labelDisplayedRows: paginationLabels.labelDisplayedRows,
        },
      },
      // Стили для Accordion
      MuiAccordion: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            '&:before': {
              display: 'none',
            },
            backgroundImage: 'none',
          },
        },
      },
      // Стили для Alert
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 8,
          },
        },
      },
    },
  });
};

// Экспортируем тему для обратной совместимости (светлая по умолчанию)
export const theme = createAppTheme('light');