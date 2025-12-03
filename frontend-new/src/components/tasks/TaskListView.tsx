import React from 'react';
import {
  Box,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Edit as EditIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';
import type { TaskListItem } from '../../api/tasks';

interface TaskListViewProps {
  tasks: TaskListItem[];
  loading: boolean;
  onRefresh: () => void;
  onEdit: (task: TaskListItem) => void;
}

const statusLabels: Record<string, string> = {
  NEW: 'Новая',
  IN_PROGRESS: 'В работе',
  REVIEW: 'На проверке',
  COMPLETED: 'Завершена',
  CANCELLED: 'Отменена',
  BLOCKED: 'Заблокирована',
};

const statusColors: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info'> = {
  NEW: 'default',
  IN_PROGRESS: 'primary',
  REVIEW: 'info',
  COMPLETED: 'success',
  CANCELLED: 'error',
  BLOCKED: 'warning',
};

const priorityLabels: Record<string, string> = {
  LOW: 'Низкий',
  NORMAL: 'Обычный',
  HIGH: 'Высокий',
  URGENT: 'Срочный',
};

const priorityColors: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info'> = {
  LOW: 'default',
  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'error',
};

const TaskListView: React.FC<TaskListViewProps> = ({ tasks, loading, onEdit }) => {
  const navigate = useNavigate();

  const columns: GridColDef[] = [
    {
      field: 'id',
      headerName: 'ID',
      width: 70,
    },
    {
      field: 'title',
      headerName: 'Название',
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
      headerName: 'Статус',
      width: 140,
      renderCell: (params: GridRenderCellParams<TaskListItem>) => {
        // Если задача завершена с просрочкой - показываем особый статус
        if (params.row.status === 'COMPLETED' && params.row.completed_with_delay) {
          return (
            <Chip
              label="Просрочено ✓"
              color="warning"
              size="small"
            />
          );
        }
        
        return (
          <Chip
            label={statusLabels[params.row.status] || params.row.status}
            color={statusColors[params.row.status] || 'default'}
            size="small"
          />
        );
      },
    },
    {
      field: 'priority',
      headerName: 'Приоритет',
      width: 120,
      renderCell: (params: GridRenderCellParams<TaskListItem>) => (
        <Chip
          label={priorityLabels[params.row.priority] || params.row.priority}
          color={priorityColors[params.row.priority] || 'default'}
          size="small"
        />
      ),
    },
    {
      field: 'assignee',
      headerName: 'Исполнитель',
      width: 180,
      valueGetter: (_value, row) => row.assignee?.full_name || row.assignee?.username || '-',
    },
    {
      field: 'creator',
      headerName: 'Автор',
      width: 180,
      valueGetter: (_value, row) => row.creator?.full_name || row.creator?.username || '-',
    },
    {
      field: 'deadline',
      headerName: 'Срок',
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
      headerName: 'Создана',
      width: 120,
      renderCell: (params: GridRenderCellParams<TaskListItem>) => {
        const createdAt = new Date(params.row.created_at);
        return createdAt.toLocaleDateString('ru-RU');
      },
    },
    {
      field: 'company_name',
      headerName: 'Компания',
      width: 150,
    },
    {
      field: 'tags',
      headerName: 'Теги',
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
      headerName: 'Действия',
      width: 120,
      sortable: false,
      renderCell: (params: GridRenderCellParams<TaskListItem>) => (
        <Box>
          <Tooltip title="Редактировать">
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
  ];

  return (
    <Box sx={{ width: '100%' }}>
      <DataGrid
        rows={tasks}
        columns={columns}
        loading={loading}
        pageSizeOptions={[10, 25, 50, 100]}
        initialState={{
          pagination: { paginationModel: { pageSize: 25 } },
        }}
        disableRowSelectionOnClick
        autoHeight
        sx={{
          '& .MuiDataGrid-row:hover': {
            cursor: 'pointer',
          },
        }}
      />
    </Box>
  );
};

export default TaskListView;
