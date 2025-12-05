import i18n from '../i18n';
import { ru, enUS, uz } from 'date-fns/locale';
import type { Locale } from 'date-fns';

/**
 * Returns date-fns locale based on current i18n language
 */
export const getDateFnsLocale = (): Locale => {
  const lang = i18n.language;
  switch (lang) {
    case 'uz':
      return uz;
    case 'en':
      return enUS;
    case 'ru':
    default:
      return ru;
  }
};

/**
 * Translates status values from database to localized strings
 * Use this for translating system data like statuses, types, etc.
 */

// Client statuses
export const translateClientStatus = (status: string): string => {
  return i18n.t(`statuses.client.${status}`, { defaultValue: status });
};

// Application statuses
export const translateApplicationStatus = (status: string): string => {
  return i18n.t(`statuses.application.${status}`, { defaultValue: status });
};

// Application source
export const translateApplicationSource = (source: string): string => {
  return i18n.t(`statuses.application_source.${source}`, { defaultValue: source });
};

// Meeting statuses
export const translateMeetingStatus = (status: string): string => {
  return i18n.t(`statuses.meeting.${status}`, { defaultValue: status });
};

// Deal statuses
export const translateDealStatus = (status: string): string => {
  return i18n.t(`statuses.deal.${status}`, { defaultValue: status });
};

// Task statuses
export const translateTaskStatus = (status: string): string => {
  return i18n.t(`statuses.task.${status}`, { defaultValue: status });
};

// Task priorities
export const translateTaskPriority = (priority: string): string => {
  return i18n.t(`statuses.task_priority.${priority}`, { defaultValue: priority });
};

// Payment statuses
export const translatePaymentStatus = (status: string): string => {
  return i18n.t(`statuses.payment.${status}`, { defaultValue: status });
};

// Building statuses
export const translateBuildingStatus = (status: string): string => {
  return i18n.t(`statuses.building.${status}`, { defaultValue: status });
};

// Property statuses
export const translatePropertyStatus = (status: string): string => {
  return i18n.t(`statuses.property.${status}`, { defaultValue: status });
};

// Property types
export const translatePropertyType = (type: string): string => {
  return i18n.t(`statuses.property_type.${type}`, { defaultValue: type });
};

// Role scopes
export const translateRoleScope = (scope: string): string => {
  return i18n.t(`statuses.role_scope.${scope}`, { defaultValue: scope });
};

// Role categories
export const translateRoleCategory = (category: string): string => {
  return i18n.t(`statuses.role_category.${category}`, { defaultValue: category });
};

// Permission actions
export const translatePermissionAction = (action: string): string => {
  return i18n.t(`statuses.permission_action.${action}`, { defaultValue: action });
};

// Permission scopes
export const translatePermissionScope = (scope: string): string => {
  return i18n.t(`statuses.permission_scope.${scope}`, { defaultValue: scope });
};

// Resources
export const translateResource = (resource: string): string => {
  return i18n.t(`resources.${resource}`, { defaultValue: resource });
};

/**
 * Generic status translator - tries to find translation in all status categories
 */
export const translateStatus = (status: string, category?: string): string => {
  if (category) {
    const key = `statuses.${category}.${status}`;
    const translated = i18n.t(key, { defaultValue: '' });
    if (translated && translated !== key) {
      return translated;
    }
  }
  
  // Try to find in any category
  const categories = [
    'client', 'application', 'application_source', 'meeting', 
    'deal', 'task', 'task_priority', 'payment', 'building', 
    'property', 'property_type', 'role_scope', 'role_category',
    'permission_action', 'permission_scope'
  ];
  
  for (const cat of categories) {
    const key = `statuses.${cat}.${status}`;
    const translated = i18n.t(key, { defaultValue: '' });
    if (translated && translated !== key && translated !== '') {
      return translated;
    }
  }
  
  return status;
};

/**
 * Returns localized text for MUI DataGrid based on current language
 */
export const getDataGridLocaleText = () => {
  const lang = i18n.language;
  
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
      // Pagination
      MuiTablePagination: {
        labelRowsPerPage: 'Sahifadagi qatorlar:',
        labelDisplayedRows: ({ from, to, count }: { from: number; to: number; count: number }) =>
          `${from}–${to} / ${count !== -1 ? count : `${to} dan ko'p`}`,
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
