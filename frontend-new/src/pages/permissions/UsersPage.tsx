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
  DialogActions,
  Alert,
  CircularProgress,
  Stack,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
} from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../../components/common/LocalizedDataGrid';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUserProfiles, getCompanies, getDepartments, banUser, unbanUser, softDeleteUser } from '../../api/permissions';
import UserForm from '../../components/permissions/UserForm';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';
import FilterListIcon from '@mui/icons-material/FilterList';
import BlockIcon from '@mui/icons-material/Block';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useAuthStore } from '../../store/authStore';
import { hasPermission } from '../../utils/permissions';

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
  const { user } = useAuthStore();
  const canCreate = hasPermission(user, 'ADD', 'USER');
  const canDelete = hasPermission(user, 'DELETE', 'USER');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
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

  // Мутации для бана/разбана/удаления
  const banMutation = useMutation({
    mutationFn: (id: number) => banUser(id),
    onSuccess: (data) => {
      setActionSuccess(data.message);
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
      setTimeout(() => setActionSuccess(null), 4000);
    },
  });

  const unbanMutation = useMutation({
    mutationFn: (id: number) => unbanUser(id),
    onSuccess: (data) => {
      setActionSuccess(data.message);
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
      setTimeout(() => setActionSuccess(null), 4000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => softDeleteUser(id),
    onSuccess: (data) => {
      setActionSuccess(data.message);
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
      setTimeout(() => setActionSuccess(null), 4000);
    },
  });

  const handleBan = (userRow: any) => {
    banMutation.mutate(userRow.id);
  };

  const handleUnban = (userRow: any) => {
    unbanMutation.mutate(userRow.id);
  };

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
    ...(canDelete ? [{
      field: 'actions',
      headerName: t('common.actions'),
      width: 120,
      sortable: false,
      filterable: false,
      renderCell: (params: any) => {
        const isSelf = params.row.user === user?.id;
        if (isSelf) return null;
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {params.row.is_active ? (
              <Tooltip title={t('pages.settings.permissions.ban_user')}>
                <IconButton
                  size="small"
                  color="warning"
                  onClick={(e) => { e.stopPropagation(); handleBan(params.row); }}
                >
                  <BlockIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip title={t('pages.settings.permissions.unban_user')}>
                <IconButton
                  size="small"
                  color="success"
                  onClick={(e) => { e.stopPropagation(); handleUnban(params.row); }}
                >
                  <LockOpenIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={t('pages.settings.permissions.delete_user')}>
              <IconButton
                size="small"
                color="error"
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(params.row); }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        );
      },
    }] : []),
  ];

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
        {canCreate && (
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
        )}
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
        {actionSuccess && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {actionSuccess}
          </Alert>
        )}

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
          {/* Кнопки бан/удаление в модалке (только при редактировании + если есть права) */}
          {selectedUser && canDelete && selectedUser.user !== user?.id && (
            <>
              <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  {t('pages.settings.permissions.danger_zone')}
                </Typography>
                <Stack direction="row" spacing={2}>
                  {selectedUser.is_active ? (
                    <Button
                      variant="outlined"
                      color="warning"
                      startIcon={<BlockIcon />}
                      onClick={() => {
                        banMutation.mutate(selectedUser.id);
                        setIsModalOpen(false);
                        setSelectedUser(null);
                      }}
                      disabled={banMutation.isPending}
                    >
                      {t('pages.settings.permissions.ban_user')}
                    </Button>
                  ) : (
                    <Button
                      variant="outlined"
                      color="success"
                      startIcon={<LockOpenIcon />}
                      onClick={() => {
                        unbanMutation.mutate(selectedUser.id);
                        setIsModalOpen(false);
                        setSelectedUser(null);
                      }}
                      disabled={unbanMutation.isPending}
                    >
                      {t('pages.settings.permissions.unban_user')}
                    </Button>
                  )}
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteOutlineIcon />}
                    onClick={() => {
                      setIsModalOpen(false);
                      setDeleteTarget(selectedUser);
                      setSelectedUser(null);
                    }}
                  >
                    {t('pages.settings.permissions.delete_user')}
                  </Button>
                </Stack>
              </Box>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Диалог подтверждения удаления */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle color="error">
          {t('pages.settings.permissions.confirm_delete_user_title')}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {t('pages.settings.permissions.confirm_delete_user', { name: deleteTarget?.user_username })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? t('common.deleting') : t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
