/**
 * ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ ЦВЕТОВОЙ ПАЛИТРЫ
 * 
 * Этот файл демонстрирует различные способы использования
 * централизованной системы цветов в проекте
 */

import { Box, Paper, Typography } from '@mui/material';
import { colors, shadows, gradients } from '../styles/colors';

// ============================================
// СПОСОБ 1: Прямое использование var() в sx
// ============================================
export const Example1 = () => (
  <Box sx={{ 
    backgroundColor: 'var(--color-background-paper)',
    padding: 2,
    border: '1px solid var(--color-border-light)',
    boxShadow: 'var(--shadow-small)'
  }}>
    <Typography sx={{ color: 'var(--color-text-primary)' }}>
      Прямое использование CSS переменных
    </Typography>
  </Box>
);

// ============================================
// СПОСОБ 2: Использование типизированных констант
// ============================================
export const Example2 = () => (
  <Box sx={{ 
    backgroundColor: colors.background.paper,
    padding: 2,
    border: `1px solid ${colors.border.light}`,
    boxShadow: shadows.small
  }}>
    <Typography sx={{ color: colors.text.primary }}>
      Использование типизированных констант (лучше для TypeScript)
    </Typography>
  </Box>
);

// ============================================
// СПОСОБ 3: В стилях для таблиц
// ============================================
export const Example3 = () => (
  <Paper sx={{ padding: 2 }}>
    <style>
      {`
        .total-row {
          background-color: var(--color-background-total);
        }
        
        .error-row {
          background-color: var(--color-error-lighter);
        }
        
        .error-row:hover {
          background-color: var(--color-error-light);
        }
      `}
    </style>
    <div className="total-row">Итоговая строка</div>
    <div className="error-row">Строка с ошибкой</div>
  </Paper>
);

// ============================================
// СПОСОБ 4: Для градиентов
// ============================================
export const Example4 = () => (
  <Box sx={{
    background: gradients.auth,
    padding: 4,
    borderRadius: 2
  }}>
    <Typography sx={{ color: colors.text.light }}>
      Градиент для страниц авторизации
    </Typography>
  </Box>
);

// ============================================
// СПОСОБ 5: Статусные цвета
// ============================================
export const Example5 = () => (
  <Box sx={{ display: 'flex', gap: 2 }}>
    <Paper sx={{ 
      padding: 2, 
      backgroundColor: colors.success.light,
      border: `2px solid ${colors.success.main}`
    }}>
      Успех
    </Paper>
    
    <Paper sx={{ 
      padding: 2, 
      backgroundColor: colors.error.lighter,
      border: `2px solid ${colors.error.main}`
    }}>
      Ошибка
    </Paper>
    
    <Paper sx={{ 
      padding: 2, 
      backgroundColor: colors.warning.light,
      border: `2px solid ${colors.warning.main}`
    }}>
      Предупреждение
    </Paper>
    
    <Paper sx={{ 
      padding: 2, 
      backgroundColor: colors.info.light,
      border: `2px solid ${colors.info.main}`
    }}>
      Информация
    </Paper>
  </Box>
);

// ============================================
// СПОСОБ 6: Динамические стили
// ============================================
interface CardProps {
  status: 'success' | 'error' | 'warning' | 'info';
  children: React.ReactNode;
}

export const StatusCard = ({ status, children }: CardProps) => {
  const statusColors = {
    success: { bg: colors.success.light, border: colors.success.main },
    error: { bg: colors.error.lighter, border: colors.error.main },
    warning: { bg: colors.warning.light, border: colors.warning.main },
    info: { bg: colors.info.light, border: colors.info.main },
  };
  
  const { bg, border } = statusColors[status];
  
  return (
    <Paper sx={{
      padding: 2,
      backgroundColor: bg,
      border: `2px solid ${border}`,
      boxShadow: shadows.medium
    }}>
      {children}
    </Paper>
  );
};

// ============================================
// СПОСОБ 7: Разделители в таблицах
// ============================================
export const Example7 = () => {
  const separatorStyle = { 
    borderRight: `1px solid ${colors.border.default}` 
  };
  
  return (
    <Box sx={{ display: 'flex' }}>
      <Box sx={{ ...separatorStyle, padding: 2 }}>Колонка 1</Box>
      <Box sx={{ ...separatorStyle, padding: 2 }}>Колонка 2</Box>
      <Box sx={{ padding: 2 }}>Колонка 3</Box>
    </Box>
  );
};

// ============================================
// СПОСОБ 8: Тени для разных уровней
// ============================================
export const Example8 = () => (
  <Box sx={{ display: 'flex', gap: 2 }}>
    <Paper sx={{ padding: 2, boxShadow: shadows.small }}>
      Маленькая тень
    </Paper>
    <Paper sx={{ padding: 2, boxShadow: shadows.medium }}>
      Средняя тень
    </Paper>
    <Paper sx={{ padding: 2, boxShadow: shadows.large }}>
      Большая тень
    </Paper>
  </Box>
);
