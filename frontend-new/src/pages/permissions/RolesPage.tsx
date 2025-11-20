import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  Alert,
  CircularProgress,
  Link as MuiLink,
  Stack,
  Chip,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { getRoles } from '../../api/permissions';
import RoleForm from '../../components/permissions/RoleForm';
import AddIcon from '@mui/icons-material/Add';
import SecurityIcon from '@mui/icons-material/Security';

// Области действия роли
const ROLE_SCOPE_LABELS: Record<string, string> = {
  SYSTEM: 'Вся система',
  COMPANY: 'Компания',
  DEPARTMENT: 'Отдел',
  OWN: 'Только свои',
};

// Категории ролей
const ROLE_CATEGORY_LABELS: Record<string, string> = {
  ADMINISTRATIVE: 'Административная',
  MANAGEMENT: 'Управленческая',
  OPERATIONAL: 'Операционная',
  READONLY: 'Только просмотр',
  CUSTOM: 'Пользовательская',
};

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 70 },
  {
    field: 'name',
    headerName: 'Название',
    width: 250,
    renderCell: (params) => {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SecurityIcon color="primary" fontSize="small" />
          <MuiLink
            component={RouterLink}
            to={`/permissions/roles/${params.row.id}`}
            underline="hover"
          >
            {params.value}
          </MuiLink>
        </Box>
      );
    },
  },
  { field: 'code', headerName: 'Код', width: 150 },
  {
    field: 'scope',
    headerName: 'Область действия',
    width: 150,
    renderCell: (params) => (
      <Chip
        label={params.row.scope_display || ROLE_SCOPE_LABELS[params.value] || params.value}
        color="primary"
        size="small"
        variant="outlined"
      />
    ),
  },
  {
    field: 'category',
    headerName: 'Категория',
    width: 150,
    renderCell: (params) => (
      <Chip
        label={params.row.category_display || ROLE_CATEGORY_LABELS[params.value] || params.value}
        color="info"
        size="small"
        variant="outlined"
      />
    ),
  },
  {
    field: 'permissions_count',
    headerName: 'Разрешений',
    width: 120,
    type: 'number',
    renderCell: (params) => (
      <Chip
        label={params.value || 0}
        color="success"
        size="small"
      />
    ),
  },
  { field: 'description', headerName: 'Описание', width: 300 },
  {
    field: 'is_active',
    headerName: 'Статус',
    width: 120,
    renderCell: (params) => (
      <Chip
        label={params.value ? 'Активна' : 'Неактивна'}
        color={params.value ? 'success' : 'default'}
        size="small"
      />
    ),
  },
];

export default function RolesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['roles'],
    queryFn: () => getRoles(),
  });

  const handleSuccess = () => {
    setIsModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ['roles'] });
  };

  return (
    <Stack spacing={3}>
      {/* Заголовок */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Роли
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Управление ролями и разрешениями системы
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setIsModalOpen(true)}
        >
          Создать роль
        </Button>
      </Box>

      {/* Таблица */}
      <Paper sx={{ p: 2 }}>
        {isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Ошибка загрузки: {error instanceof Error ? error.message : 'Неизвестная ошибка'}
          </Alert>
        )}

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <DataGrid
            rows={data || []}
            columns={columns}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
            }}
            pageSizeOptions={[10, 25, 50]}
            autoHeight
            disableRowSelectionOnClick
          />
        )}
      </Paper>

      {/* Модальное окно создания */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Создать роль</DialogTitle>
        <DialogContent>
          <RoleForm onSuccess={handleSuccess} onCancel={() => setIsModalOpen(false)} />
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
