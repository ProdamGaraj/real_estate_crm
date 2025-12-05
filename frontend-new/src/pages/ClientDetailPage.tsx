import { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getClientById, updateClient, type ClientDetail } from '../api/clients';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
    Typography, CircularProgress, Alert, Paper, Grid, Box, Button, TextField,
    IconButton, Stack, FormControl, InputLabel, Select, MenuItem, Tabs, Tab, Link as MuiLink,
    Dialog, DialogTitle, DialogContent, Card, CardHeader, CardContent, Avatar
} from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../components/common/LocalizedDataGrid';
import LocalizedDateField from '../components/common/LocalizedDateField';
import { Timeline, TimelineItem, TimelineSeparator, TimelineConnector, TimelineContent, TimelineDot } from '@mui/lab';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import PersonIcon from '@mui/icons-material/Person';
import ContactPhoneIcon from '@mui/icons-material/ContactPhone';
import ArticleIcon from '@mui/icons-material/Article';
import HumanizedLog from '../components/logs/HumanizedLog';
import MeetingForm from '../components/meetings/MeetingForm';
import type { Meeting } from '../api/meetings';
import ClientFilesTab from '../components/clients/ClientFilesTab';

// Вспомогательный компонент для панели вкладок
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

// Колонки для таблицы заявок - функция для поддержки i18n
const getApplicationColumns = (t: (key: string) => string): GridColDef[] => [
  { field: 'id', headerName: 'ID', width: 90,
    renderCell: (params) => (
      <MuiLink component={RouterLink} to={`/applications/${params.id}`} underline="hover">
        {params.id}
      </MuiLink>
    )
  },
  { field: 'status', headerName: t('table.status'), width: 150 },
  { field: 'source', headerName: t('table.source'), width: 150 },
  {
    field: 'created_at',
    headerName: t('table.created_at'),
    type: 'dateTime',
    width: 200,
    valueGetter: (value) => value ? new Date(value) : null,
  },
];

// Колонки для таблицы встреч - функция для поддержки i18n
const getMeetingColumns = (t: (key: string) => string): GridColDef<Meeting>[] => [
    { field: 'id', headerName: 'ID', width: 80 },
    { field: 'status', headerName: t('table.status'), width: 150 },
    { field: 'planned_date', headerName: t('table.planned_date'), type: 'dateTime', width: 180, valueGetter: (value) => value ? new Date(value) : null },
    { field: 'executor', headerName: t('table.executor'), width: 150 },
];


export default function ClientDetailPage() {
  const { t } = useTranslation();
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const [tabValue, setTabValue] = useState(0);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);

  const { data: client, isLoading, isError, error } = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => getClientById(Number(clientId)),
    enabled: !!clientId,
  });

  const { register, control, handleSubmit, reset } = useForm<ClientDetail>();

  const { fields, append, remove } = useFieldArray({
    control,
    name: "phone_numbers",
  });

  useEffect(() => {
    if (client) {
      reset(client);
    }
  }, [client, reset]);

  const updateClientMutation = useMutation({
    mutationFn: updateClient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      alert(t('pages.clients.data_updated'));
    },
    onError: (err) => {
      alert(`${t('common.error')}: ${err.message}`);
    }
  });

  const onSubmit = (data: ClientDetail) => {
    updateClientMutation.mutate({ id: Number(clientId), payload: data });
  };

  if (isLoading) return <CircularProgress />;
  if (isError) return <Alert severity="error">{(error as Error).message}</Alert>;

  return (
    <Stack spacing={3}>
        <Paper sx={{ p: 2 }}>
            <Stack direction="row" spacing={2} alignItems="center">
                <Avatar sx={{ width: 64, height: 64 }}><PersonIcon fontSize="large" /></Avatar>
                <Box>
                    <Typography variant="h4">{client?.full_name}</Typography>
                    <Typography color="text.secondary">
                        {client?.phone_numbers.find(p => p.is_primary)?.phone_number || client?.phone_numbers[0]?.phone_number}
                    </Typography>
                </Box>
            </Stack>
        </Paper>

      <Box>
        <Tabs value={tabValue} onChange={(event, newValue) => setTabValue(newValue)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={t('pages.clients.main_info')} />
          <Tab label={`${t('pages.clients.applications')} (${client?.applications.length || 0})`} />
          <Tab label={`${t('pages.meetings.title')} (${client?.meetings?.length || 0})`} />
          <Tab label={`${t('pages.clients.files')} (${client?.files?.length || 0})`} />
          <Tab label={`${t('common.logs')} (${client?.logs.length || 0})`} />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Stack spacing={3}>
            <Card variant="outlined">
              <CardHeader avatar={<PersonIcon />} title={t('pages.clients.personal_data')} />
              <CardContent>
                <Grid container spacing={2}>
                   <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={t('pages.clients.full_name')} {...register('full_name')} /></Grid>
                  <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={t('forms.email')} type="email" {...register('email')} /></Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Controller name="date_of_birth" control={control} render={({ field }) => (
                      <LocalizedDateField
                        label={t('pages.clients.date_of_birth')}
                        value={field.value || null}
                        onChange={(date) => field.onChange(date || '')}
                        fullWidth
                      />
                    )}/>
                  </Grid>

                  <Grid size={{ xs: 12, md: 4 }}>
                      <Controller
                        name="status"
                        control={control}
                        defaultValue={'ACTIVE'}
                        render={({ field }) => (
                          <FormControl fullWidth>
                            <InputLabel>{t('pages.clients.status')}</InputLabel>
                            <Select {...field} label={t('pages.clients.status')}>
                              <MenuItem value="ACTIVE">{t('statuses.client.ACTIVE')}</MenuItem>
                              <MenuItem value="INACTIVE">{t('statuses.client.INACTIVE')}</MenuItem>
                              <MenuItem value="ARCHIVED">{t('statuses.client.ARCHIVED')}</MenuItem>
                            </Select>
                          </FormControl>
                        )}
                      />
                  </Grid>
                  <Grid size={{ xs: 12, md: 8 }}>
                      <TextField fullWidth label={t('pages.clients.comment')} multiline rows={1} {...register('comment')} />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            <Card variant="outlined">
                <CardHeader avatar={<ContactPhoneIcon />} title={t('pages.clients.phones_section')} />
                <CardContent>
                  {fields.map((field, index) => (
                    <Stack direction="row" spacing={2} key={field.id} sx={{ mb: 2 }}>
                      <TextField
                        label={`${t('pages.clients.phone')} ${index + 1}`}
                        fullWidth
                        {...register(`phone_numbers.${index}.phone_number`)}
                      />
                      <IconButton onClick={() => remove(index)}>
                        <RemoveCircleOutlineIcon />
                      </IconButton>
                    </Stack>
                  ))}
                  <Button
                    startIcon={<AddCircleOutlineIcon />}
                    onClick={() => append({ phone_number: '', is_primary: fields.length === 0 })}
                  >
                    {t('pages.clients.add_phone')}
                  </Button>
                </CardContent>
            </Card>

            <Card variant="outlined">
                <CardHeader avatar={<ArticleIcon />} title={t('pages.clients.passport_and_address')} />
                <CardContent>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 6, md: 3 }}><TextField fullWidth label={t('pages.clients.passport_series')} {...register('passport_series')} /></Grid>
                        <Grid size={{ xs: 6, md: 3 }}><TextField fullWidth label={t('pages.clients.passport_number')} {...register('passport_number')} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={t('pages.clients.passport_issued_by')} {...register('passport_issued_by')} /></Grid>
                        <Grid size={{ xs: 6, md: 3 }}><TextField fullWidth label={t('pages.clients.inn')} {...register('inn')} /></Grid>
                        <Grid size={{ xs: 6, md: 3 }}><TextField fullWidth label={t('pages.clients.pinfl')} {...register('pinfl')} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={t('pages.clients.registration_address')} {...register('registration_address')} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={t('pages.clients.billing_address')} {...register('billing_address')} /></Grid>
                    </Grid>
                </CardContent>
            </Card>

            <Box>
                <Button type="submit" variant="contained" disabled={updateClientMutation.isPending}>
                    {updateClientMutation.isPending ? t('common.saving') : t('pages.clients.save_changes')}
                </Button>
            </Box>
          </Stack>
        </form>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <Box sx={{ height: 400, width: '100%' }}>
          <LocalizedDataGrid
            rows={client?.applications || []}
            columns={getApplicationColumns(t)}
            disableRowSelectionOnClick
          />
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <Button variant="contained" sx={{ mb: 2 }} onClick={() => setIsMeetingModalOpen(true)}>
            {t('pages.clients.schedule_meeting')}
        </Button>
        <Box sx={{ height: 400, width: '100%' }}>
          <LocalizedDataGrid
            rows={client?.meetings || []}
            columns={getMeetingColumns(t)}
            disableRowSelectionOnClick
          />
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={3}>
        <ClientFilesTab clientId={Number(clientId)} />
      </TabPanel>

      <TabPanel value={tabValue} index={4}>
        <Timeline position="right">
            {client?.logs.map((log) => (
                <TimelineItem key={log.id}>
                    <TimelineSeparator>
                        <TimelineDot />
                        <TimelineConnector />
                    </TimelineSeparator>
                    <TimelineContent sx={{ py: '12px', px: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                            {new Date(log.created_at).toLocaleString()} - {log.user || t('common.system')}
                        </Typography>
                        <HumanizedLog log={log} />
                    </TimelineContent>
                </TimelineItem>
            ))}
        </Timeline>
      </TabPanel>

      <Dialog open={isMeetingModalOpen} onClose={() => setIsMeetingModalOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{t('pages.meetings.new_meeting_for_client')}: {client?.full_name}</DialogTitle>
          <DialogContent>
              {client && (
                  <MeetingForm
                      clientId={client.id}
                      onSuccess={() => {
                          setIsMeetingModalOpen(false);
                          queryClient.invalidateQueries({ queryKey: ['client', clientId] });
                      }}
                  />
              )}
          </DialogContent>
      </Dialog>
    </Stack>
  );
}