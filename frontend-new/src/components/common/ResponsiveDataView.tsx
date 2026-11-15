import { Box } from '@mui/material';
import type { DataGridProps, GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { useState } from 'react';
import LocalizedDataGrid from './LocalizedDataGrid';
import MobileCardList, { type MobileCardField } from './MobileCardList';
import { useIsMobile } from '../../hooks/useMobile';
import { DEFAULT_PAGE_SIZE, useGridPageSize } from '../../hooks/useGridPageSize';

export interface ResponsiveDataViewProps<T extends { id: number | string }> {
  /** Data array */
  data: T[];
  /** Column definitions for DataGrid (desktop) */
  columns: GridColDef[];
  /** Field definitions for mobile cards */
  mobileFields: MobileCardField<T>[];
  /** Loading state */
  isLoading?: boolean;
  /** Error message */
  error?: string;
  /** Click handler for row/card */
  onRowClick?: (item: T) => void;
  /** Additional DataGrid props */
  dataGridProps?: Partial<DataGridProps>;
  /** Empty state message */
  emptyMessage?: string;
  /** Custom key extractor (defaults to item.id) */
  keyExtractor?: (item: T) => string | number;
  /**
   * Ключ таблицы, под которым запоминается число строк на странице.
   * Без него размер страницы не сохраняется между переходами по разделам.
   */
  tableKey?: string;
}

/** Варианты размера страницы: 10 строк для списка клиентов или платежей мало */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Responsive data view that shows DataGrid on desktop and MobileCardList on mobile
 */
export function ResponsiveDataView<T extends { id: number | string }>({
  data,
  columns,
  mobileFields,
  isLoading = false,
  error,
  onRowClick,
  dataGridProps,
  emptyMessage,
  keyExtractor = (item) => item.id,
  tableKey,
}: ResponsiveDataViewProps<T>) {
  const isMobile = useIsMobile();

  // Таблица страницы может задавать свою сортировку, видимость столбцов и
  // размер страницы по умолчанию. Раньше её initialState заменял общий
  // целиком — вместе с ним пропадала и настройка пагинации, из-за чего
  // в подвале «Заявок» было «0–0 из 0» вместо числа заявок.
  const {
    initialState: ownInitialState,
    pageSizeOptions,
    onPaginationModelChange,
    ...restGridProps
  } = dataGridProps || {};

  const { pageSize, setPageSize } = useGridPageSize(
    tableKey || 'default',
    ownInitialState?.pagination?.paginationModel?.pageSize ?? DEFAULT_PAGE_SIZE,
  );
  const [page, setPage] = useState(0);

  if (isMobile) {
    return (
      <MobileCardList
        data={data}
        fields={mobileFields}
        isLoading={isLoading}
        error={error}
        onCardClick={onRowClick}
        keyExtractor={keyExtractor}
        emptyMessage={emptyMessage}
      />
    );
  }

  // Страница за пределами выдачи: после смены фильтра строк может стать
  // меньше, и таблица показывала пустую страницу
  const lastPage = Math.max(0, Math.ceil(data.length / pageSize) - 1);
  const safePage = Math.min(page, lastPage);

  const handlePaginationModelChange: DataGridProps['onPaginationModelChange'] = (model, details) => {
    setPage(model.page);
    if (model.pageSize !== pageSize) {
      setPageSize(model.pageSize);
    }
    onPaginationModelChange?.(model, details);
  };

  // Пагинация управляемая, поэтому из initialState её нужно убрать:
  // MUI не принимает одновременно значение и начальное состояние
  const { pagination: _pagination, ...initialStateWithoutPagination } = ownInitialState || {};
  const paginationModel: GridPaginationModel = { page: safePage, pageSize };

  return (
    <Box sx={{ flex: 1, minHeight: 400 }}>
      <LocalizedDataGrid
        rows={data}
        columns={columns}
        loading={isLoading}
        onRowClick={onRowClick ? (params) => onRowClick(params.row as T) : undefined}
        initialState={initialStateWithoutPagination}
        paginationModel={paginationModel}
        onPaginationModelChange={handlePaginationModelChange}
        pageSizeOptions={pageSizeOptions || PAGE_SIZE_OPTIONS}
        disableRowSelectionOnClick
        {...restGridProps}
      />
    </Box>
  );
}

export default ResponsiveDataView;
