import { DataGrid, type DataGridProps } from '@mui/x-data-grid';
import { ruRU } from '@mui/x-data-grid/locales';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';

/**
 * Returns localized text for MUI DataGrid based on current language
 */
const getDataGridLocaleText = (lang: string) => {
  if (lang === 'ru') {
    return {
      // Pagination
      MuiTablePagination: {
        labelRowsPerPage: 'Строк на странице:',
        labelDisplayedRows: ({ from, to, count }: { from: number; to: number; count: number }) =>
          `${from}–${to} из ${count !== -1 ? count : `более ${to}`}`,
      },
      // Columns
      columnMenuLabel: 'Меню',
      columnMenuShowColumns: 'Показать столбцы',
      columnMenuManageColumns: 'Управление столбцами',
      columnMenuFilter: 'Фильтр',
      columnMenuHideColumn: 'Скрыть',
      columnMenuUnsort: 'Отменить сортировку',
      columnMenuSortAsc: 'По возрастанию',
      columnMenuSortDesc: 'По убыванию',
      // Filter
      filterPanelAddFilter: 'Добавить фильтр',
      filterPanelRemoveAll: 'Удалить все',
      filterPanelDeleteIconLabel: 'Удалить',
      filterPanelLogicOperator: 'Логический оператор',
      filterPanelOperator: 'Оператор',
      filterPanelOperatorAnd: 'И',
      filterPanelOperatorOr: 'Или',
      filterPanelColumns: 'Столбцы',
      filterPanelInputLabel: 'Значение',
      filterPanelInputPlaceholder: 'Значение фильтра',
      // Operators
      filterOperatorContains: 'содержит',
      filterOperatorEquals: 'равно',
      filterOperatorStartsWith: 'начинается с',
      filterOperatorEndsWith: 'заканчивается на',
      filterOperatorIs: 'равно',
      filterOperatorNot: 'не равно',
      filterOperatorAfter: 'после',
      filterOperatorOnOrAfter: 'после или равно',
      filterOperatorBefore: 'до',
      filterOperatorOnOrBefore: 'до или равно',
      filterOperatorIsEmpty: 'пусто',
      filterOperatorIsNotEmpty: 'не пусто',
      filterOperatorIsAnyOf: 'любое из',
      // Columns panel
      columnsPanelTextFieldLabel: 'Найти столбец',
      columnsPanelTextFieldPlaceholder: 'Название столбца',
      columnsPanelShowAllButton: 'Показать все',
      columnsPanelHideAllButton: 'Скрыть все',
      // Footer
      footerRowSelected: (count: number) =>
        count !== 1 ? `${count.toLocaleString()} строк выбрано` : `${count.toLocaleString()} строка выбрана`,
      footerTotalRows: 'Всего строк:',
      footerTotalVisibleRows: (visibleCount: number, totalCount: number) =>
        `${visibleCount.toLocaleString()} из ${totalCount.toLocaleString()}`,
      // Other
      noRowsLabel: 'Нет данных',
      noResultsOverlayLabel: 'Данные не найдены',
      toolbarDensity: 'Высота строки',
      toolbarDensityLabel: 'Высота строки',
      toolbarDensityCompact: 'Компактная',
      toolbarDensityStandard: 'Стандартная',
      toolbarDensityComfortable: 'Комфортная',
      toolbarColumns: 'Столбцы',
      toolbarColumnsLabel: 'Выберите столбцы',
      toolbarFilters: 'Фильтры',
      toolbarFiltersLabel: 'Показать фильтры',
      toolbarFiltersTooltipHide: 'Скрыть фильтры',
      toolbarFiltersTooltipShow: 'Показать фильтры',
      toolbarFiltersTooltipActive: (count: number) =>
        count !== 1 ? `${count} активных фильтра` : `${count} активный фильтр`,
      toolbarExport: 'Экспорт',
      toolbarExportLabel: 'Экспорт',
      toolbarExportCSV: 'Скачать как CSV',
      toolbarExportPrint: 'Печать',
    };
  }
  
  if (lang === 'uz') {
    return {
      // Pagination - these are the correct keys for MUI X DataGrid
      paginationRowsPerPage: 'Sahifadagi qatorlar:',
      paginationDisplayedRows: ({ from, to, count }: { from: number; to: number; count: number }) =>
        `${from}–${to} / ${count !== -1 ? count : `${to} dan ko'p`}`,
      paginationItemAriaLabel: (type: string) => {
        if (type === 'first') return 'Birinchi sahifaga o\'tish';
        if (type === 'last') return 'Oxirgi sahifaga o\'tish';
        if (type === 'next') return 'Keyingi sahifaga o\'tish';
        return 'Oldingi sahifaga o\'tish';
      },
      // Columns
      columnMenuLabel: 'Menyu',
      columnMenuShowColumns: 'Ustunlarni ko\'rsatish',
      columnMenuManageColumns: 'Ustunlarni boshqarish',
      columnMenuFilter: 'Filtr',
      columnMenuHideColumn: 'Yashirish',
      columnMenuUnsort: 'Tartiblashni bekor qilish',
      columnMenuSortAsc: 'O\'sish tartibida',
      columnMenuSortDesc: 'Kamayish tartibida',
      // Filter
      filterPanelAddFilter: 'Filtr qo\'shish',
      filterPanelRemoveAll: 'Barchasini o\'chirish',
      filterPanelDeleteIconLabel: 'O\'chirish',
      filterPanelLogicOperator: 'Mantiqiy operator',
      filterPanelOperator: 'Operator',
      filterPanelOperatorAnd: 'Va',
      filterPanelOperatorOr: 'Yoki',
      filterPanelColumns: 'Ustunlar',
      filterPanelInputLabel: 'Qiymat',
      filterPanelInputPlaceholder: 'Filtr qiymati',
      // Operators
      filterOperatorContains: 'o\'z ichiga oladi',
      filterOperatorEquals: 'teng',
      filterOperatorStartsWith: 'bilan boshlanadi',
      filterOperatorEndsWith: 'bilan tugaydi',
      filterOperatorIs: 'teng',
      filterOperatorNot: 'teng emas',
      filterOperatorAfter: 'keyin',
      filterOperatorOnOrAfter: 'keyin yoki teng',
      filterOperatorBefore: 'oldin',
      filterOperatorOnOrBefore: 'oldin yoki teng',
      filterOperatorIsEmpty: 'bo\'sh',
      filterOperatorIsNotEmpty: 'bo\'sh emas',
      filterOperatorIsAnyOf: 'quyidagilardan biri',
      // Columns panel
      columnsPanelTextFieldLabel: 'Ustun topish',
      columnsPanelTextFieldPlaceholder: 'Ustun nomi',
      columnsPanelShowAllButton: 'Barchasini ko\'rsatish',
      columnsPanelHideAllButton: 'Barchasini yashirish',
      // Footer
      footerRowSelected: (count: number) => `${count.toLocaleString()} qator tanlandi`,
      footerTotalRows: 'Jami qatorlar:',
      footerTotalVisibleRows: (visibleCount: number, totalCount: number) =>
        `${visibleCount.toLocaleString()} / ${totalCount.toLocaleString()}`,
      // Other
      noRowsLabel: 'Ma\'lumot yo\'q',
      noResultsOverlayLabel: 'Ma\'lumot topilmadi',
      toolbarDensity: 'Qator balandligi',
      toolbarDensityLabel: 'Qator balandligi',
      toolbarDensityCompact: 'Ixcham',
      toolbarDensityStandard: 'Standart',
      toolbarDensityComfortable: 'Qulay',
      toolbarColumns: 'Ustunlar',
      toolbarColumnsLabel: 'Ustunlarni tanlang',
      toolbarFilters: 'Filtrlar',
      toolbarFiltersLabel: 'Filtrlarni ko\'rsatish',
      toolbarFiltersTooltipHide: 'Filtrlarni yashirish',
      toolbarFiltersTooltipShow: 'Filtrlarni ko\'rsatish',
      toolbarFiltersTooltipActive: (count: number) => `${count} ta faol filtr`,
      toolbarExport: 'Eksport',
      toolbarExportLabel: 'Eksport',
      toolbarExportCSV: 'CSV sifatida yuklab olish',
      toolbarExportPrint: 'Chop etish',
    };
  }
  
  // English (default)
  return {};
};

/**
 * Localized DataGrid wrapper that automatically applies translations based on current language
 */
export default function LocalizedDataGrid(props: DataGridProps) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  
  const localeText = useMemo(() => {
    // Use official MUI localization for Russian
    if (lang === 'ru') {
      return ruRU.components.MuiDataGrid.defaultProps.localeText;
    }
    // Use custom localization for Uzbek and others
    return getDataGridLocaleText(lang);
  }, [lang]);
  
  return (
    <DataGrid
      {...props}
      localeText={{
        ...localeText,
        ...props.localeText,
      }}
    />
  );
}
