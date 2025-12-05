import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../../components/common/LocalizedDataGrid';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { getUserProfiles, getCompanies, getDepartments } from '../../api/permissions';
import UserForm from '../../components/permissions/UserForm';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';
import FilterListIcon from '@mui/icons-material/FilterList';

// Вспомогательная функция для форматирования ФИО в формат "Фамилия И. О."
function formatUserFullName(fullName: string | null): string {
  if (!fullName) return '';

  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return '';

  // Если только одно слово, возвращаем его
  if (parts.length === 1) return parts[0];

  // Фамилия
  const lastName = parts[0];
  const formatted = [lastName];

  // Инициалы
  for (let i = 1; i < parts.length; i++) {
    if (parts[i]) {
      formatted.push(parts[i][0].toUpperCase() + '.');
    }
  }

  return formatted.join(' ');
}

export default function UsersPage() {
  const { t } = useTranslation();

  const ROLE_NAME_MAPPING: Record<string, string> = {
    'SYSTEM_ADMIN': t('pages.settings.permissions.role_system_admin'),
    'COMPANY_ADMIN': t('pages.settings.permissions.role_company_admin'),
    'DEPARTMENT_MANAGER': t('pages.settings.permissions.role_department_manager'),
    'MANAGER': t('pages.settings.permissions.role_manager'),
    'VIEWER': t('pages.settings.permissions.role_viewer'),
  };

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    {
      field: 'user_full_name',
      headerName: t('pages.settings.permissions.user'),
      width: 250,
      renderCell: (params) => {
        const formattedName = formatUserFullName(params.row.user_full_name);
        const username = params.row.user_username;
        const displayText = formattedName
          ? `${formattedName} (${username})`
          : username || '—';

        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonIcon color="primary" fontSize="small" />
            <Typography variant="body2" fontWeight="medium">
              {displayText}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: 'company_name',
      headerName: t('pages.settings.permissions.company'),
      width: 180,
      renderCell: (params) => params.value || '—',
    },
    {
      field: 'department_name',
      headerName: t('pages.settings.permissions.department'),
      width: 180,
      renderCell: (params) => params.value || '—',
    },
    {
      field: 'roles',
      headerName: t('pages.settings.permissions.roles'),
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
              {t('pages.settings.permissions.no_roles')}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      field: 'position',
      headerName: t('pages.settings.permissions.position'),
      width: 150,
      renderCell: (params) => params.value || '—',
    },
    {
      field: 'is_system_admin',
      headerName: t('pages.settings.permissions.system_admin'),
      width: 140,
      renderCell: (params) => (
        params.value ? (
          <Chip label={t('common.yes')} color="error" size="small" />
        ) : (
          <Chip label={t('common.no')} size="small" variant="outlined" />
        )
      ),
    },
    {
      field: 'is_active',
      headerName: t('pages.settings.permissions.status'),
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.value ? t('pages.settings.permissions.active_status') : t('pages.settings.permissions.inactive_status')}
          color={params.value ? 'success' : 'default'}
          size="small"
        />
      ),
    },
  ];
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
            {t('pages.settings.permissions.users_title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('pages.settings.permissions.users_description')}
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
          {t('pages.settings.permissions.add_user')}
        </Button>
      </Box>

      {/* Фильтры */}
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <FilterListIcon color="action" />
          <Typography variant="h6">{t('pages.settings.permissions.filters')}</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>{t('pages.settings.permissions.company')}</InputLabel>
            <Select
              value={filters.company}
              onChange={(e) => setFilters({ ...filters, company: e.target.value, department: '' })}
              label={t('pages.settings.permissions.company')}
            >
              <MenuItem value="">{t('pages.settings.permissions.all_companies')}</MenuItem>
              {companies?.map((company) => (
                <MenuItem key={company.id} value={company.id}>
                  {company.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 200 }} disabled={!filters.company}>
            <InputLabel>{t('pages.settings.permissions.department')}</InputLabel>
            <Select
              value={filters.department}
              onChange={(e) => setFilters({ ...filters, department: e.target.value })}
              label={t('pages.settings.permissions.department')}
            >
              <MenuItem value="">{t('pages.settings.permissions.all_departments')}</MenuItem>
              {departments?.map((dept) => (
                <MenuItem key={dept.id} value={dept.id}>
                  {dept.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>{t('pages.settings.permissions.status')}</InputLabel>
            <Select
              value={filters.is_active}
              onChange={(e) => setFilters({ ...filters, is_active: e.target.value })}
              label={t('pages.settings.permissions.status')}
            >
              <MenuItem value="all">{t('pages.settings.permissions.all')}</MenuItem>
              <MenuItem value="true">{t('pages.settings.permissions.active_plural')}</MenuItem>
              <MenuItem value="false">{t('pages.settings.permissions.inactive_plural')}</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Paper>

      {/* Таблица */}
      <Paper sx={{ p: 2 }}>
        {isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {t('common.load_error')}: {error instanceof Error ? error.message : t('common.unknown_error')}
          </Alert>
        )}

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <LocalizedDataGrid
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
          {selectedUser ? `${t('pages.settings.permissions.edit_user')}: ${selectedUser.user_username}` : t('pages.settings.permissions.create_user')}
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
