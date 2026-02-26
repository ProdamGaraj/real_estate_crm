import { ReactNode } from 'react';
import { Box } from '@mui/material';
import type { DataGridProps, GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from './LocalizedDataGrid';
import MobileCardList, { MobileCardField } from './MobileCardList';
import { useIsMobile } from '../../hooks/useMobile';

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
}

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
}: ResponsiveDataViewProps<T>) {
  const isMobile = useIsMobile();

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

  return (
    <Box sx={{ flex: 1, minHeight: 400 }}>
      <LocalizedDataGrid
        rows={data}
        columns={columns}
        loading={isLoading}
        onRowClick={onRowClick ? (params) => onRowClick(params.row as T) : undefined}
        initialState={{
          pagination: { paginationModel: { pageSize: 10 } },
        }}
        pageSizeOptions={[10, 25, 50]}
        disableRowSelectionOnClick
        {...dataGridProps}
      />
    </Box>
  );
}

export default ResponsiveDataView;
