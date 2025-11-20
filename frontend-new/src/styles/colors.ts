/**
 * TypeScript типы для CSS переменных цветов
 * Используйте для автодополнения в IDE
 */

export type ColorVariable =
  // Основные цвета бренда
  | '--color-primary'
  | '--color-secondary'
  
  // Фоновые цвета
  | '--color-background-default'
  | '--color-background-paper'
  | '--color-background-total'
  
  // Текстовые цвета
  | '--color-text-primary'
  | '--color-text-secondary'
  | '--color-text-light'
  | '--color-text-dark'
  
  // Цвета состояний - Успех
  | '--color-success-main'
  | '--color-success-light'
  | '--color-success-dark'
  
  // Цвета состояний - Ошибка
  | '--color-error-main'
  | '--color-error-light'
  | '--color-error-lighter'
  | '--color-error-dark'
  
  // Цвета состояний - Предупреждение
  | '--color-warning-main'
  | '--color-warning-light'
  | '--color-warning-dark'
  
  // Цвета состояний - Информация
  | '--color-info-main'
  | '--color-info-light'
  | '--color-info-dark'
  
  // Бордеры и разделители
  | '--color-border-light'
  | '--color-border-default'
  | '--color-border-dark'
  
  // Интерактивные элементы
  | '--color-link'
  | '--color-link-hover'
  | '--color-link-light'
  
  // Нейтральные оттенки
  | '--color-gray-50'
  | '--color-gray-100'
  | '--color-gray-200'
  | '--color-gray-300'
  | '--color-gray-400'
  | '--color-gray-500'
  | '--color-gray-600'
  | '--color-gray-700'
  | '--color-gray-800'
  | '--color-gray-900';

export type ShadowVariable =
  | '--shadow-small'
  | '--shadow-medium'
  | '--shadow-large';

export type GradientVariable =
  | '--gradient-auth';

/**
 * Вспомогательная функция для использования CSS переменных с автодополнением
 * @example
 * const bgColor = cssVar('--color-background-paper');
 * // returns: 'var(--color-background-paper)'
 */
export const cssVar = (variable: ColorVariable | ShadowVariable | GradientVariable): string => {
  return `var(${variable})`;
};

/**
 * Объект с готовыми CSS переменными для удобного использования
 * @example
 * <Box sx={{ backgroundColor: colors.background.paper }}>
 */
export const colors = {
  primary: cssVar('--color-primary'),
  secondary: cssVar('--color-secondary'),
  
  background: {
    default: cssVar('--color-background-default'),
    paper: cssVar('--color-background-paper'),
    total: cssVar('--color-background-total'),
  },
  
  text: {
    primary: cssVar('--color-text-primary'),
    secondary: cssVar('--color-text-secondary'),
    light: cssVar('--color-text-light'),
    dark: cssVar('--color-text-dark'),
  },
  
  success: {
    main: cssVar('--color-success-main'),
    light: cssVar('--color-success-light'),
    dark: cssVar('--color-success-dark'),
  },
  
  error: {
    main: cssVar('--color-error-main'),
    light: cssVar('--color-error-light'),
    lighter: cssVar('--color-error-lighter'),
    dark: cssVar('--color-error-dark'),
  },
  
  warning: {
    main: cssVar('--color-warning-main'),
    light: cssVar('--color-warning-light'),
    dark: cssVar('--color-warning-dark'),
  },
  
  info: {
    main: cssVar('--color-info-main'),
    light: cssVar('--color-info-light'),
    dark: cssVar('--color-info-dark'),
  },
  
  border: {
    light: cssVar('--color-border-light'),
    default: cssVar('--color-border-default'),
    dark: cssVar('--color-border-dark'),
  },
  
  link: {
    default: cssVar('--color-link'),
    hover: cssVar('--color-link-hover'),
    light: cssVar('--color-link-light'),
  },
} as const;

export const shadows = {
  small: cssVar('--shadow-small'),
  medium: cssVar('--shadow-medium'),
  large: cssVar('--shadow-large'),
} as const;

export const gradients = {
  auth: cssVar('--gradient-auth'),
} as const;
