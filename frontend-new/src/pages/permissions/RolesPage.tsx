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
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../../components/common/LocalizedDataGrid';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getRoles } from '../../api/permissions';
import RoleForm from '../../components/permissions/RoleForm';
import AddIcon from '@mui/icons-material/Add';
import SecurityIcon from '@mui/icons-material/Security';
import { translateRoleScope, translateRoleCategory } from '../../utils/translations';

const getColumns = (t: (key: string) => string): GridColDef[] => [
  { field: 'id', headerName: t('table.id'), width: 70 },
  {
    field: 'name',
    headerName: t('table.name'),
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
  { field: 'code', headerName: t('table.code'), width: 150 },
  {
    field: 'scope',
    headerName: t('pages.settings.permissions.scope'),
    width: 150,
    renderCell: (params) => (
      <Chip
        label={translateRoleScope(params.value)}
        color="primary"
        size="small"
        variant="outlined"
      />
    ),
  },
  {
    field: 'category',
    headerName: t('table.category'),
    width: 150,
    renderCell: (params) => (
      <Chip
        label={translateRoleCategory(params.value)}
        color="info"
        size="small"
        variant="outlined"
      />
    ),
  },
  {
    field: 'permissions_count',
    headerName: t('pages.settings.permissions.permissions_count'),
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
  { field: 'description', headerName: t('table.description'), width: 300 },
  {
    field: 'is_active',
    headerName: t('table.status'),
    width: 120,
    renderCell: (params) => (
      <Chip
        label={params.value ? t('common.active') : t('common.inactive')}
        color={params.value ? 'success' : 'default'}
        size="small"
      />
    ),
  },
];

export default function RolesPage() {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const columns = getColumns(t);

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
            {t('pages.settings.permissions.roles_title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('pages.settings.permissions.roles_subtitle')}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setIsModalOpen(true)}
        >
          {t('pages.settings.permissions.create_role')}
        </Button>
      </Box>

      {/* Таблица */}
      <Paper sx={{ p: 2 }}>
        {isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {t('common.loading_error')}: {error instanceof Error ? error.message : t('common.unknown_error')}
          </Alert>
        )}

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <LocalizedDataGrid
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
        <DialogTitle>{t('pages.settings.permissions.create_role')}</DialogTitle>
        <DialogContent>
          <RoleForm onSuccess={handleSuccess} onCancel={() => setIsModalOpen(false)} />
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
