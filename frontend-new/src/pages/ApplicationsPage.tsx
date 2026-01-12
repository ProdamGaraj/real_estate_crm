// src/pages/ApplicationsPage.tsx
import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  CircularProgress, Alert, Link as MuiLink, Paper, Grid, TextField, Stack,
  FormControl, InputLabel, Select, MenuItem, Tabs, Tab, ToggleButton, ToggleButtonGroup
} from '@mui/material';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import { useTranslation } from 'react-i18next';
import { translateApplicationStatus, translateApplicationSource } from '../utils/translations';
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../components/common/LocalizedDataGrid';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getApplications } from '../api/applications';
import type { ApplicationFilters } from '../api/applications'; // Импортируем тип
import ApplicationForm from '../components/applications/ApplicationForm';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form'; // Импортируем useForm
import ApplicationSummary from '../components/applications/ApplicationSummary';
import ApplicationsKanban from '../components/applications/ApplicationsKanban';
import { LocalizedDateField } from '../components/common/LocalizedDateField';
import { useAuthStore } from '../store/authStore';
import { hasPermission } from '../utils/permissions';

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


const getColumns = (t: (key: string) => string): GridColDef[] => [
  {
    field: 'id',
    headerName: t('table.id'),
    width: 90,
    renderCell: (params) => (
      <MuiLink component={RouterLink} to={`/applications/${params.id}`} underline="hover">
        {params.id}
      </MuiLink>
    )
  },
  { field: 'status', headerName: t('table.status'), width: 150, valueFormatter: (value) => translateApplicationStatus(value) },
  { field: 'source', headerName: t('table.source'), width: 150, valueFormatter: (value) => translateApplicationSource(value) },
  { field: 'client', headerName: t('table.client'), width: 250 },
  { field: 'created_by', headerName: t('table.created_by'), width: 200 },
  {
    field: 'created_at',
    headerName: t('table.created_at'),
    type: 'dateTime',
    width: 200,
    valueGetter: (value) => new Date(value),
  },
];

export default function ApplicationsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const columns = getColumns(t);
  const location = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tabValue, setTabValue] = useState(location.state?.tab || 0);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [filters, setFilters] = useState<ApplicationFilters>(location.state?.filters || {});
  const queryClient = useQueryClient();
  const { register, watch, control, reset } = useForm<ApplicationFilters>({
    defaultValues: filters,
  });

  const canCreate = hasPermission(user, 'ADD', 'APPLICATION');

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
  if (isError) return <Alert severity="error">{t('errors.load_applications_error')}</Alert>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">{t('pages.applications.title')}</Typography>
        {canCreate && (
          <Button variant="contained" onClick={() => setIsModalOpen(true)}>
            {t('pages.applications.create_application')}
          </Button>
        )}
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
          <Tab label={t('pages.applications.application_list')} />
          <Tab label={t('pages.applications.summary_table')} />
        </Tabs>
        {tabValue === 0 && (
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, newMode) => newMode && setViewMode(newMode)}
            size="small"
            sx={{ mr: 2 }}
          >
            <ToggleButton value="table" title={t('pages.applications.view_table')}>
              <ViewListIcon />
            </ToggleButton>
            <ToggleButton value="kanban" title={t('pages.applications.view_kanban')}>
              <ViewKanbanIcon />
            </ToggleButton>
          </ToggleButtonGroup>
        )}
      </Box>

      <TabPanel value={tabValue} index={0}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* ПАНЕЛЬ ФИЛЬТРОВ */}
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>{t('common.filters')}</Typography>
            <Grid container spacing={2} alignItems="center">
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
                        <MenuItem value="NEW">{t('statuses.application.new')}</MenuItem>
                        <MenuItem value="IN_PROGRESS">{t('statuses.application.in_progress')}</MenuItem>
                        <MenuItem value="JUNK">{t('statuses.application.junk')}</MenuItem>
                        <MenuItem value="REJECTED">{t('statuses.application.rejected')}</MenuItem>
                        <MenuItem value="CLOSED_WON">{t('statuses.application.closed_won')}</MenuItem>
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
                      <InputLabel>{t('pages.applications.source')}</InputLabel>
                      <Select {...field} label={t('pages.applications.source')}>
                        <MenuItem value=""><em>{t('common.all')}</em></MenuItem>
                        <MenuItem value="INTERNET">{t('statuses.application_source.internet')}</MenuItem>
                        <MenuItem value="SOCIAL_MEDIA">{t('statuses.application_source.social_media')}</MenuItem>
                        <MenuItem value="OFFICE">{t('statuses.application_source.office')}</MenuItem>
                        <MenuItem value="CALL">{t('statuses.application_source.call')}</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField type="number" label={t('pages.applications.client_id')} fullWidth size="small" {...register('client_id')} /></Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField type="number" label={t('pages.applications.project_id')} fullWidth size="small" {...register('interested_projects')} /></Grid>
              <Grid size={{ xs: 6, sm: 3, md: 3 }}>
                <Controller
                  name="created_at_after"
                  control={control}
                  render={({ field }) => (
                    <LocalizedDateField
                      label={t('pages.applications.date_from')}
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
                      label={t('pages.applications.date_to')}
                      value={field.value || null}
                      onChange={field.onChange}
                    />
                  )}
                />
              </Grid>
            </Grid>
          </Paper>

          <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>{t('pages.applications.new_application')}</DialogTitle>
            <DialogContent>
              <ApplicationForm onSuccess={handleSuccess} />
            </DialogContent>
          </Dialog>

          {viewMode === 'table' ? (
            <Box sx={{ flex: 1, width: '100%', minHeight: 0 }}>
              <LocalizedDataGrid
                rows={data || []}
                columns={columns}
                initialState={{ sorting: { sortModel: [{ field: 'id', sort: 'desc' }] } }}
                disableRowSelectionOnClick
              />
            </Box>
          ) : (
            <ApplicationsKanban applications={data || []} isLoading={isLoading} />
          )}
        </Box>
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <ApplicationSummary />
      </TabPanel>
    </Box>
  );
}