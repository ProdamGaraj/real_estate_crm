import { useState, useEffect } from 'react';
import {
  Box, Typography, CircularProgress, Alert, Button, Dialog, DialogTitle,
  DialogContent, Link as MuiLink, Paper, Grid, TextField, Stack,
  FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../components/common/LocalizedDataGrid';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { getClients } from '../api/clients';
import type { ClientFilters } from '../api/clients';
import ClientForm from '../components/clients/ClientForm';
import { useForm, Controller } from 'react-hook-form';
import { LocalizedDateField } from '../components/common/LocalizedDateField';
import { useAuthStore } from '../store/authStore';
import { hasPermission } from '../utils/permissions';

// Колонки для таблицы - теперь функция для поддержки i18n
const getColumns = (t: (key: string) => string): GridColDef[] => [
  { field: 'id', headerName: 'ID', width: 90 },
  {
    field: 'full_name',
    headerName: t('pages.clients.full_name'),
    width: 250,
    renderCell: (params) => (
      <MuiLink component={RouterLink} to={`/clients/${params.id}`} underline="hover">
        {params.value}
      </MuiLink>
    ),
  },
  {
    field: 'primary_phone_number', // Используем новое поле из сериализатора
    headerName: t('pages.clients.phone'),
    width: 200
  },
  { field: 'email', headerName: t('forms.email'), width: 250 },
  {
    field: 'created_at',
    headerName: t('table.created_at'),
    width: 200,
    type: 'dateTime',
    valueGetter: (value) => value ? new Date(value) : null,
  },
];

export default function ClientsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filters, setFilters] = useState<ClientFilters>({});
  const queryClient = useQueryClient();
  const { register, watch, control } = useForm<ClientFilters>();

  const canCreate = hasPermission(user, 'ADD', 'CLIENT');

  useEffect(() => {
    const subscription = watch((value) => {
      const timer = setTimeout(() => {
        setFilters(value);
      }, 300);
      return () => clearTimeout(timer);
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['clients', filters],
    queryFn: () => getClients(filters),
  });

  const handleSuccess = () => {
    setIsModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  };

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">{t('pages.clients.title')}</Typography>
        {canCreate && (
          <Button variant="contained" onClick={() => setIsModalOpen(true)}>
            {t('pages.clients.create_client')}
          </Button>
        )}
      </Box>

      {/* РАСШИРЕННАЯ ПАНЕЛЬ ФИЛЬТРОВ */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>{t('common.filters')}</Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label={t('pages.clients.search_by_name')} fullWidth size="small" {...register('full_name')} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label={t('pages.clients.search_by_phone')} fullWidth size="small" {...register('phone_number')} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label={t('pages.clients.search_by_email')} fullWidth size="small" {...register('email')} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Controller
              name="status"
              control={control}
              defaultValue=""
              render={({ field }) => (
                <FormControl fullWidth size="small">
                  <InputLabel>{t('forms.status')}</InputLabel>
                  <Select {...field} label={t('forms.status')}>
                    <MenuItem value=""><em>{t('common.all')}</em></MenuItem>
                    <MenuItem value="ACTIVE">{t('statuses.client.ACTIVE')}</MenuItem>
                    <MenuItem value="INACTIVE">{t('statuses.client.INACTIVE')}</MenuItem>
                    <MenuItem value="ARCHIVED">{t('statuses.client.ARCHIVED')}</MenuItem>
                  </Select>
                </FormControl>
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label={t('pages.clients.inn')} fullWidth size="small" {...register('inn')} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label={t('pages.clients.pinfl')} fullWidth size="small" {...register('pinfl')} /></Grid>
          <Grid size={{ xs: 6, sm: 3, md: 3 }}>
            <Controller
              name="created_at_after"
              control={control}
              render={({ field }) => (
                <LocalizedDateField
                  label={t('pages.clients.date_from')}
                  value={field.value || null}
                  onChange={field.onChange}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 3, md: 3 }}>
            <Controller
              name="created_at_before"
              control={control}
              render={({ field }) => (
                <LocalizedDateField
                  label={t('pages.clients.date_to')}
                  value={field.value || null}
                  onChange={field.onChange}
                />
              )}
            />
          </Grid>
        </Grid>
      </Paper>

      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('pages.clients.new_client')}</DialogTitle>
        <DialogContent>
          <ClientForm onSuccess={handleSuccess} />
        </DialogContent>
      </Dialog>

      {isLoading && <CircularProgress />}
      {isError && <Alert severity="error">{t('errors.load_clients_error')}</Alert>}
      {!isLoading && !isError && (
        <Box sx={{ flex: 1, width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <LocalizedDataGrid
            rows={data || []}
            columns={getColumns(t)}
            initialState={{
              pagination: { paginationModel: { pageSize: 10 } },
              sorting: { sortModel: [{ field: 'id', sort: 'desc' }] },
            }}
            pageSizeOptions={[10, 25, 50]}
            disableRowSelectionOnClick
          />
        </Box>
      )}
    </Box>
  );
}