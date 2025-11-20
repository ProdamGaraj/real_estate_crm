// src/pages/ApplicationsPage.tsx
import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  CircularProgress, Alert, Link as MuiLink, Paper, Grid, TextField, Stack,
  FormControl, InputLabel, Select, MenuItem, Tabs, Tab
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getApplications } from '../api/applications';
import type { ApplicationFilters } from '../api/applications'; // Импортируем тип
import ApplicationForm from '../components/applications/ApplicationForm';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form'; // Импортируем useForm
import ApplicationSummary from '../components/applications/ApplicationSummary';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}


const columns: GridColDef[] = [
  {
    field: 'id',
    headerName: 'ID',
    width: 90,
    renderCell: (params) => (
      <MuiLink component={RouterLink} to={`/applications/${params.id}`} underline="hover">
        {params.id}
      </MuiLink>
    )
  },
  { field: 'status', headerName: 'Статус', width: 150 },
  { field: 'source', headerName: 'Источник', width: 150 },
  { field: 'client', headerName: 'Клиент', width: 250 },
  { field: 'created_by', headerName: 'Кем создана', width: 200 },
  {
    field: 'created_at',
    headerName: 'Дата создания',
    type: 'dateTime',
    width: 200,
    valueGetter: (value) => new Date(value),
  },
];

export default function ApplicationsPage() {
  const location = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tabValue, setTabValue] = useState(location.state?.tab || 0);
  const [filters, setFilters] = useState<ApplicationFilters>(location.state?.filters || {});
  const queryClient = useQueryClient();
  const { register, watch, control, reset } = useForm<ApplicationFilters>({
      defaultValues: filters,
  });

  useEffect(() => {
    if (location.state) {
        setTabValue(location.state.tab || 0);
        setFilters(location.state.filters || {});
        reset(location.state.filters || {});
    }
  }, [location.state, reset]);


  useEffect(() => {
    const subscription = watch((value) => {
      const timer = setTimeout(() => {
        setFilters(value);
      }, 300); // Задержка в 300 мс для предотвращения частых запросов
      return () => clearTimeout(timer);
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['applications', filters], // ключ запроса теперь зависит от фильтров
    queryFn: () => getApplications(filters), // передаем фильтры в API
  });

  const handleSuccess = () => {
    setIsModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ['applications'] });
  };

  if (isLoading) return <CircularProgress />;
  if (isError) return <Alert severity="error">Ошибка загрузки заявок</Alert>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">Заявки</Typography>
        <Button variant="contained" onClick={() => setIsModalOpen(true)}>
          Создать заявку
        </Button>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
              <Tab label="Список заявок" />
              <Tab label="Сводная таблица" />
          </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <Stack spacing={2}>
            {/* ПАНЕЛЬ ФИЛЬТРОВ */}
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Фильтры</Typography>
              <Grid container spacing={2} alignItems="center">
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
                          <MenuItem value="NEW">Новая</MenuItem>
                          <MenuItem value="IN_PROGRESS">В работе</MenuItem>
                          <MenuItem value="JUNK">Нецелевая</MenuItem>
                          <MenuItem value="REJECTED">Отказ</MenuItem>
                          <MenuItem value="CLOSED_WON">Успешно закрыта</MenuItem>
                        </Select>
                      </FormControl>
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                   <Controller
                    name="source"
                    control={control}
                    defaultValue=""
                    render={({ field }) => (
                      <FormControl fullWidth size="small">
                        <InputLabel>Источник</InputLabel>
                        <Select {...field} label="Источник">
                          <MenuItem value=""><em>Все</em></MenuItem>
                          <MenuItem value="INTERNET">Интернет</MenuItem>
                          <MenuItem value="SOCIAL_MEDIA">Соц.сети</MenuItem>
                          <MenuItem value="OFFICE">Офис</MenuItem>
                          <MenuItem value="CALL">Звонок</MenuItem>
                        </Select>
                      </FormControl>
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField type="number" label="ID Клиента" fullWidth size="small" {...register('client_id')} /></Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField type="number" label="ID Проекта" fullWidth size="small" {...register('interested_projects')} /></Grid>
                 <Grid size={{ xs: 6, sm: 3, md: 3 }}>
                  <TextField label="Дата создания (от)" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} {...register('created_at_after')} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3, md: 3 }}>
                  <TextField label="Дата создания (до)" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} {...register('created_at_before')} />
                </Grid>
              </Grid>
            </Paper>

            <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} maxWidth="sm" fullWidth>
              <DialogTitle>Новая заявка</DialogTitle>
              <DialogContent>
                <ApplicationForm onSuccess={handleSuccess} />
              </DialogContent>
            </Dialog>

            <Box sx={{ height: 600, width: '100%' }}>
              <DataGrid
                rows={data || []}
                columns={columns}
                initialState={{ sorting: { sortModel: [{ field: 'id', sort: 'desc' }] } }}
                disableRowSelectionOnClick
              />
            </Box>
        </Stack>
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <ApplicationSummary />
      </TabPanel>
    </Box>
  );
}