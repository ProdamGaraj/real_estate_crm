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
import { getCompanies } from '../../api/permissions';
import CompanyForm from '../../components/permissions/CompanyForm';
import AddIcon from '@mui/icons-material/Add';
import BusinessIcon from '@mui/icons-material/Business';

export default function CompaniesPage() {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    {
      field: 'name',
      headerName: t('table.name'),
      width: 250,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BusinessIcon color="primary" fontSize="small" />
          <MuiLink
            component={RouterLink}
            to={`/permissions/companies/${params.row.id}`}
            underline="hover"
          >
            {params.value}
          </MuiLink>
        </Box>
      ),
    },
    { field: 'code', headerName: t('table.code'), width: 150 },
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
    {
      field: 'created_at',
      headerName: t('table.created_at'),
      width: 180,
      type: 'dateTime',
      valueGetter: (value) => (value ? new Date(value) : null),
    },
  ];

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['companies'],
    queryFn: () => getCompanies(),
  });

  const handleSuccess = () => {
    setIsModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ['companies'] });
  };

  return (
    <Stack spacing={3}>
      {/* Заголовок */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            {t('pages.settings.permissions.companies_title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('pages.settings.permissions.companies_subtitle')}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setIsModalOpen(true)}
        >
          {t('pages.settings.permissions.create_company')}
        </Button>
      </Box>

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
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('pages.settings.permissions.create_company')}</DialogTitle>
        <DialogContent>
          <CompanyForm onSuccess={handleSuccess} onCancel={() => setIsModalOpen(false)} />
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
