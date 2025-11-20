import { useState, useEffect } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Button, Dialog, DialogTitle,
    DialogContent, Link as MuiLink, Paper, Grid, TextField, Stack,
    FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { getClients } from '../api/clients';
import type { ClientFilters } from '../api/clients';
import ClientForm from '../components/clients/ClientForm';
import { useForm, Controller } from 'react-hook-form';

// Колонки для таблицы
const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 90 },
  {
    field: 'full_name',
    headerName: 'Полное имя',
    width: 250,
    renderCell: (params) => (
      <MuiLink component={RouterLink} to={`/clients/${params.id}`} underline="hover">
        {params.value}
      </MuiLink>
    ),
  },
  {
    field: 'primary_phone_number', // Используем новое поле из сериализатора
    headerName: 'Телефон',
    width: 200
  },
  { field: 'email', headerName: 'Email', width: 250 },
  {
    field: 'created_at',
    headerName: 'Дата создания',
    width: 200,
    type: 'dateTime',
    valueGetter: (value) => value ? new Date(value) : null,
  },
];

export default function ClientsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filters, setFilters] = useState<ClientFilters>({});
  const queryClient = useQueryClient();
  const { register, watch, control } = useForm<ClientFilters>();

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
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Клиенты</Typography>
        <Button variant="contained" onClick={() => setIsModalOpen(true)}>
          Создать клиента
        </Button>
      </Box>

      {/* РАСШИРЕННАЯ ПАНЕЛЬ ФИЛЬТРОВ */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Фильтры</Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label="Поиск по ФИО" fullWidth size="small" {...register('full_name')} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label="Поиск по телефону" fullWidth size="small" {...register('phone_number')} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label="Поиск по Email" fullWidth size="small" {...register('email')} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Controller
              name="status"
              control={control}
              defaultValue=""
              render={({ field }) => (
                <FormControl fullWidth size="small">
                  <InputLabel>Статус</InputLabel>
                  <Select {...field} label="Статус">
                    <MenuItem value=""><em>Все</em></MenuItem>
                    <MenuItem value="ACTIVE">Активный</MenuItem>
                    <MenuItem value="INACTIVE">Неактивный</MenuItem>
                    <MenuItem value="ARCHIVED">В архиве</MenuItem>
                  </Select>
                </FormControl>
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label="ИНН" fullWidth size="small" {...register('inn')} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label="ПИНФЛ" fullWidth size="small" {...register('pinfl')} /></Grid>
          <Grid size={{ xs: 6, sm: 3, md: 3 }}>
            <TextField label="Дата создания (от)" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} {...register('created_at_after')} />
          </Grid>
          <Grid size={{ xs: 6, sm: 3, md: 3 }}>
            <TextField label="Дата создания (до)" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} {...register('created_at_before')} />
          </Grid>
        </Grid>
      </Paper>

      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Новый клиент</DialogTitle>
        <DialogContent>
          <ClientForm onSuccess={handleSuccess} />
        </DialogContent>
      </Dialog>

      {isLoading && <CircularProgress />}
      {isError && <Alert severity="error">Ошибка загрузки данных: {error instanceof Error ? error.message : 'Произошла ошибка'}</Alert>}
      {!isLoading && !isError && (
        <Box sx={{ height: 600, width: '100%' }}>
          <DataGrid
            rows={data || []}
            columns={columns}
            initialState={{
              pagination: { paginationModel: { pageSize: 10 } },
              sorting: { sortModel: [{ field: 'id', sort: 'desc' }] },
            }}
            pageSizeOptions={[10, 25, 50]}
            disableRowSelectionOnClick
          />
        </Box>
      )}
    </Stack>
  );
}