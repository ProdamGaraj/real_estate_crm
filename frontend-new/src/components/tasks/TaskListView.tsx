import React, { useMemo } from 'react';
import {
  Box,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Edit as EditIcon,
} from '@mui/icons-material';
import type { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import ResponsiveDataView from '../common/ResponsiveDataView';
import type { MobileCardField } from '../common/MobileCardList';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TaskListItem } from '../../api/tasks';
import { translateStatus } from '../../utils/translations';

interface TaskListViewProps {
  tasks: TaskListItem[];
  loading: boolean;
  onRefresh: () => void;
  onEdit: (task: TaskListItem) => void;
}

const statusColors: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info'> = {
  NEW: 'default',
  IN_PROGRESS: 'primary',
  REVIEW: 'info',
  COMPLETED: 'success',
  CANCELLED: 'error',
  BLOCKED: 'warning',
};

const priorityColors: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info'> = {
  LOW: 'default',
  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'error',
};

const TaskListView: React.FC<TaskListViewProps> = ({ tasks, loading, onEdit }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Mobile card fields
  const mobileFields: MobileCardField<TaskListItem>[] = useMemo(() => [
    {
      key: 'title',
      label: 'common.name',
      primary: true,
    },
    {
      key: 'status',
      label: 'common.status',
      chip: true,
      chipColor: (value: string) => statusColors[value] || 'default',
      render: (value: string) => translateStatus(value, 'task'),
    },
    {
      key: 'priority',
      label: 'pages.tasks.priority',
      chip: true,
      chipColor: (value: string) => priorityColors[value] || 'default',
      render: (value: string) => translateStatus(value, 'task_priority'),
    },
    {
      key: 'assignee.full_name',
      label: 'pages.tasks.assignee',
      secondary: true,
    },
    {
      key: 'deadline',
      label: 'pages.tasks.deadline',
      render: (value: string) => value ? new Date(value).toLocaleDateString('ru-RU') : '-',
    },
  ], []);

  const handleTaskClick = (task: TaskListItem) => {
    navigate(`/tasks/${task.id}`);
  };

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'id',
      headerName: 'ID',
      width: 70,
    },
    {
      field: 'title',
      headerName: t('common.name'),
      flex: 1,
      minWidth: 200,
      renderCell: (params: GridRenderCellParams<TaskListItem>) => (
        <Box
          sx={{
            cursor: 'pointer',
            '&:hover': { textDecoration: 'underline' },
            fontWeight: params.row.is_overdue ? 'bold' : 'normal',
            color: params.row.is_overdue ? 'error.main' : 'inherit',
          }}
          onClick={() => navigate(`/tasks/${params.row.id}`)}
        >
          {params.row.title}
        </Box>
      ),
    },
    {
      field: 'status',
      headerName: t('common.status'),
      width: 140,
      renderCell: (params: GridRenderCellParams<TaskListItem>) => {
        // Если задача завершена с просрочкой - показываем особый статус
        if (params.row.status === 'COMPLETED' && params.row.completed_with_delay) {
          return (
            <Chip
              label={t('pages.tasks.overdue_completed')}
              color="warning"
              size="small"
            />
          );
        }
        
        return (
          <Chip
            label={translateStatus(params.row.status, 'task')}
            color={statusColors[params.row.status] || 'default'}
            size="small"
          />
        );
      },
    },
    {
      field: 'priority',
      headerName: t('pages.tasks.priority'),
      width: 120,
      renderCell: (params: GridRenderCellParams<TaskListItem>) => (
        <Chip
          label={translateStatus(params.row.priority, 'task_priority')}
          color={priorityColors[params.row.priority] || 'default'}
          size="small"
        />
      ),
    },
    {
      field: 'assignee',
      headerName: t('pages.tasks.assignee'),
      width: 180,
      valueGetter: (_value, row) => row.assignee?.full_name || row.assignee?.username || '-',
    },
    {
      field: 'creator',
      headerName: t('pages.tasks.author'),
      width: 180,
      valueGetter: (_value, row) => row.creator?.full_name || row.creator?.username || '-',
    },
    {
      field: 'deadline',
      headerName: t('pages.tasks.deadline'),
      width: 120,
      renderCell: (params: GridRenderCellParams<TaskListItem>) => {
        if (!params.row.deadline) return '-';
        const deadline = new Date(params.row.deadline);
        return (
          <Box sx={{ color: params.row.is_overdue ? 'error.main' : 'inherit' }}>
            {deadline.toLocaleDateString('ru-RU')}
          </Box>
        );
      },
    },
    {
      field: 'created_at',
      headerName: t('common.created_at'),
      width: 120,
      renderCell: (params: GridRenderCellParams<TaskListItem>) => {
        const createdAt = new Date(params.row.created_at);
        return createdAt.toLocaleDateString('ru-RU');
      },
    },
    {
      field: 'company_name',
      headerName: t('common.company'),
      width: 150,
    },
    {
      field: 'tags',
      headerName: t('pages.tasks.tags'),
      width: 150,
      renderCell: (params: GridRenderCellParams<TaskListItem>) => {
        if (!params.row.tags) return '-';
        const tags = params.row.tags.split(',').map(t => t.trim());
        return (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {tags.slice(0, 2).map((tag, idx) => (
              <Chip key={idx} label={tag} size="small" variant="outlined" />
            ))}
            {tags.length > 2 && <Chip label={`+${tags.length - 2}`} size="small" variant="outlined" />}
          </Box>
        );
      },
    },
    {
      field: 'actions',
      headerName: t('common.actions'),
      width: 120,
      sortable: false,
      renderCell: (params: GridRenderCellParams<TaskListItem>) => (
        <Box>
          <Tooltip title={t('common.edit')}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(params.row);
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ], [t, navigate, onEdit]);

  return (
    <Box sx={{ width: '100%' }}>
      <ResponsiveDataView
        data={tasks}
        columns={columns}
        mobileFields={mobileFields}
        isLoading={loading}
        onRowClick={handleTaskClick}
        dataGridProps={{
          pageSizeOptions: [10, 25, 50, 100],
          initialState: {
            pagination: { paginationModel: { pageSize: 25 } },
          },
          disableRowSelectionOnClick: true,
          autoHeight: true,
          sx: {
            '& .MuiDataGrid-row:hover': {
              cursor: 'pointer',
            },
          },
        }}
      />
    </Box>
  );
};

export default TaskListView;
