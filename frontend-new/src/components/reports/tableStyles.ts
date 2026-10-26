import type { Theme } from '@mui/material/styles';

/**
 * Оформление таблиц план-факт — цветами темы MUI.
 *
 * Раньше здесь были CSS-переменные из styles/colors.css. Они не переключаются
 * вместе с темой, и в тёмной теме строка «Итого» оставалась светло-серой
 * с белым текстом — её было не прочитать, пока на неё не наведёшь мышь.
 */

/** Вертикальная граница между блоками «Количество», «Контрактация», «Поступления» */
export const separatorSx = {
  borderRight: (theme: Theme) => `1px solid ${theme.palette.divider}`,
};

/**
 * Фон строки «Итого». Непрозрачный: закреплённая на телефоне первая колонка
 * перекрывает прокручиваемые ячейки и не должна просвечивать
 */
export const totalRowBg = (theme: Theme) =>
  theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100];

/** Первая колонка закрепляется при горизонтальной прокрутке на телефоне */
export const stickyColumnSx = (isMobile: boolean) => (isMobile ? {
  position: 'sticky' as const,
  left: 0,
  zIndex: 1,
  minWidth: 120,
  bgcolor: 'background.paper',
} : {});

/** Строка «Итого»: фон темы на всей строке и на закреплённой ячейке */
export const totalRowSx = (isTotal: boolean) => (isTotal ? { bgcolor: totalRowBg } : {});
