import { DataGrid, type DataGridProps } from '@mui/x-data-grid';
import { ruRU } from '@mui/x-data-grid/locales';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';

/**
 * Returns localized text for MUI DataGrid based on current language
 */
const getDataGridLocaleText = (lang: string) => {
  if (lang === 'ru') {
    // Официальная локаль MUI: покрывает все ключи грида, включая те, что
    // появились в 8-й версии, — свой список неизбежно от неё отставал
    return ruRU.components.MuiDataGrid.defaultProps.localeText;
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
      columnsManagementSearchTitle: 'Ustun topish',
      columnsManagementShowHideAllText: 'Barchasini ko\'rsatish/yashirish',
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
 * Localized DataGrid wrapper that automatically applies translations based on current language.
 * Includes responsive header styles for better readability on small screens.
 * Automatically adds minWidth to flex columns to prevent them from collapsing on narrow viewports.
 */
export default function LocalizedDataGrid(props: DataGridProps) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  
  const localeText = useMemo(() => {
    // Use official MUI localization for Russian
    if (lang === 'ru') {
      return {
        ...ruRU.components.MuiDataGrid.defaultProps.localeText,
        // В официальной локали строка закомментирована, и подвал таблицы
        // показывал английское «1–5 of 5» рядом с русским «Строк на странице»
        paginationDisplayedRows: ({ from, to, count }: { from: number; to: number; count: number }) =>
          `${from}–${to} из ${count !== -1 ? count : `более ${to}`}`,
      };
    }
    // Use custom localization for Uzbek and others
    return getDataGridLocaleText(lang);
  }, [lang]);

  // Ensure all flex columns have a reasonable minWidth so they don't collapse on mobile
  const columnsWithMinWidth = useMemo(() => {
    if (!props.columns) return props.columns;
    return props.columns.map((col) => {
      if (col.flex && !col.minWidth) {
        return { ...col, minWidth: 120 };
      }
      return col;
    });
  }, [props.columns]);

  // Responsive header styles: wrap text, smaller font/padding on narrow screens
  const responsiveSx = {
    '& .MuiDataGrid-columnHeaderTitle': {
      whiteSpace: 'normal',
      lineHeight: 1.3,
      overflow: 'visible',
      textOverflow: 'clip',
    },
    '@media (max-width: 960px)': {
      '& .MuiDataGrid-columnHeader': {
        padding: '4px 6px',
      },
      '& .MuiDataGrid-columnHeaderTitle': {
        fontSize: '0.75rem',
      },
      '& .MuiDataGrid-cell': {
        padding: '4px 6px',
        fontSize: '0.8rem',
      },
    },
  };
  
  return (
    <DataGrid
      {...props}
      columns={columnsWithMinWidth}
      localeText={{
        ...localeText,
        ...props.localeText,
      }}
      sx={{
        ...responsiveSx,
        ...((props.sx as object) || {}),
      }}
    />
  );
}
