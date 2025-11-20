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
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { getUserProfiles, getCompanies, getDepartments } from '../../api/permissions';
import UserForm from '../../components/permissions/UserForm';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';
import FilterListIcon from '@mui/icons-material/FilterList';

const ROLE_NAME_MAPPING: Record<string, string> = {
  'SYSTEM_ADMIN': 'Системный администратор',
  'COMPANY_ADMIN': 'Администратор компании',
  'DEPARTMENT_MANAGER': 'Руководитель отдела',
  'MANAGER': 'Менеджер',
  'VIEWER': 'Наблюдатель',
};

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 70 },
  {
    field: 'user_username',
    headerName: 'Пользователь',
    width: 200,
    renderCell: (params) => (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PersonIcon color="primary" fontSize="small" />
        <Box>
          <Typography variant="body2">{params.row.user_username}</Typography>
          {params.row.user_full_name && (
            <Typography variant="caption" color="text.secondary">
              {params.row.user_full_name}
            </Typography>
          )}
        </Box>
      </Box>
    ),
  },
  { 
    field: 'company_name', 
    headerName: 'Компания', 
    width: 180,
    renderCell: (params) => params.value || '—',
  },
  { 
    field: 'department_name', 
    headerName: 'Отдел', 
    width: 180,
    renderCell: (params) => params.value || '—',
  },
  {
    field: 'roles',
    headerName: 'Роли',
    width: 250,
    renderCell: (params) => (
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {params.value?.length > 0 ? (
          params.value.map((role: any) => {
            const displayName = role.name || ROLE_NAME_MAPPING[role.code] || role.code;
            return (
              <Chip
                key={role.id}
                label={displayName}
                size="small"
                color="primary"
                variant="outlined"
              />
            );
          })
        ) : (
          <Typography variant="caption" color="text.secondary">
            Нет ролей
          </Typography>
        )}
      </Box>
    ),
  },
  { 
    field: 'position', 
    headerName: 'Должность', 
    width: 150,
    renderCell: (params) => params.value || '—',
  },
  {
    field: 'is_system_admin',
    headerName: 'Системный админ',
    width: 140,
    renderCell: (params) => (
      params.value ? (
        <Chip label="Да" color="error" size="small" />
      ) : (
        <Chip label="Нет" size="small" variant="outlined" />
      )
    ),
  },
  {
    field: 'is_active',
    headerName: 'Статус',
    width: 120,
    renderCell: (params) => (
      <Chip
        label={params.value ? 'Активен' : 'Неактивен'}
        color={params.value ? 'success' : 'default'}
        size="small"
      />
    ),
  },
];

export default function UsersPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [filters, setFilters] = useState({
    company: '',
    department: '',
    is_active: 'true',
  });

  const queryClient = useQueryClient();

  // Загрузка пользователей
  const { data: users, isLoading, isError, error } = useQuery({
    queryKey: ['user-profiles', filters],
    queryFn: () => getUserProfiles({
      company: filters.company ? Number(filters.company) : undefined,
      department: filters.department ? Number(filters.department) : undefined,
      is_active: filters.is_active === 'all' ? undefined : filters.is_active === 'true',
    }),
  });

  // Загрузка компаний для фильтра
  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: () => getCompanies(),
  });

  // Загрузка отделов для фильтра
  const { data: departments } = useQuery({
    queryKey: ['departments', filters.company],
    queryFn: () => getDepartments({
      company: filters.company ? Number(filters.company) : undefined,
    }),
    enabled: !!filters.company,
  });

  const handleSuccess = () => {
    setIsModalOpen(false);
    setSelectedUser(null);
    queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
  };

  const handleRowClick = (params: any) => {
    setSelectedUser(params.row);
    setIsModalOpen(true);
  };

  return (
    <Stack spacing={3}>
      {/* Заголовок */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Пользователи
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Управление профилями пользователей и назначение ролей
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setSelectedUser(null);
            setIsModalOpen(true);
          }}
        >
          Добавить пользователя
        </Button>
      </Box>

      {/* Фильтры */}
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <FilterListIcon color="action" />
          <Typography variant="h6">Фильтры</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Компания</InputLabel>
            <Select
              value={filters.company}
              onChange={(e) => setFilters({ ...filters, company: e.target.value, department: '' })}
              label="Компания"
            >
              <MenuItem value="">Все компании</MenuItem>
              {companies?.map((company) => (
                <MenuItem key={company.id} value={company.id}>
                  {company.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 200 }} disabled={!filters.company}>
            <InputLabel>Отдел</InputLabel>
            <Select
              value={filters.department}
              onChange={(e) => setFilters({ ...filters, department: e.target.value })}
              label="Отдел"
            >
              <MenuItem value="">Все отделы</MenuItem>
              {departments?.map((dept) => (
                <MenuItem key={dept.id} value={dept.id}>
                  {dept.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>Статус</InputLabel>
            <Select
              value={filters.is_active}
              onChange={(e) => setFilters({ ...filters, is_active: e.target.value })}
              label="Статус"
            >
              <MenuItem value="all">Все</MenuItem>
              <MenuItem value="true">Активные</MenuItem>
              <MenuItem value="false">Неактивные</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Paper>

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
            rows={users || []}
            columns={columns}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
            }}
            pageSizeOptions={[10, 25, 50]}
            autoHeight
            disableRowSelectionOnClick
            onRowClick={handleRowClick}
            sx={{
              '& .MuiDataGrid-row': {
                cursor: 'pointer',
              },
            }}
          />
        )}
      </Paper>

      {/* Модальное окно редактирования */}
      <Dialog 
        open={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setSelectedUser(null);
        }} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>
          {selectedUser ? `Редактировать пользователя: ${selectedUser.user_username}` : 'Создать пользователя'}
        </DialogTitle>
        <DialogContent>
          <UserForm 
            userProfile={selectedUser}
            onSuccess={handleSuccess} 
            onCancel={() => {
              setIsModalOpen(false);
              setSelectedUser(null);
            }} 
          />
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
