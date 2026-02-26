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
import ResponsiveDataView from '../components/common/ResponsiveDataView';
import type { MobileCardField } from '../components/common/MobileCardList';
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
import { useIsMobile } from '../hooks/useMobile';

// Вспомогательный компонент для панели вкладок
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
  isMobile?: boolean;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, isMobile = false, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: isMobile ? 1 : 3 }}>{children}</Box>}
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

// Mobile fields for applications
const getApplicationMobileFields = (): MobileCardField<{ id: number; status: string; source: string; created_at: string }>[] => [
    { key: 'id', label: 'ID', primary: true },
    { key: 'status', label: 'table.status', chip: true },
    { key: 'source', label: 'table.source', secondary: true },
    { key: 'created_at', label: 'table.created_at', render: (v: string) => new Date(v).toLocaleDateString() },
];

// Mobile fields for meetings
const getMeetingMobileFields = (): MobileCardField<Meeting>[] => [
    { key: 'planned_date', label: 'table.planned_date', primary: true, render: (v: string) => new Date(v).toLocaleString() },
    { key: 'status', label: 'table.status', chip: true },
    { key: 'executor', label: 'table.executor', secondary: true },
];


export default function ClientDetailPage() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
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
    <Stack spacing={isMobile ? 2 : 3}>
        <Paper sx={{ p: isMobile ? 1.5 : 2 }}>
            <Stack direction="row" spacing={isMobile ? 1 : 2} alignItems="center">
                <Avatar sx={{ width: isMobile ? 48 : 64, height: isMobile ? 48 : 64 }}><PersonIcon fontSize={isMobile ? 'medium' : 'large'} /></Avatar>
                <Box>
                    <Typography variant={isMobile ? 'h5' : 'h4'}>{client?.full_name}</Typography>
                    <Typography color="text.secondary" variant={isMobile ? 'body2' : 'body1'}>
                        {client?.phone_numbers.find(p => p.is_primary)?.phone_number || client?.phone_numbers[0]?.phone_number}
                    </Typography>
                </Box>
            </Stack>
        </Paper>

      <Box>
        <Tabs 
            value={tabValue} 
            onChange={(event, newValue) => setTabValue(newValue)} 
            sx={{ borderBottom: 1, borderColor: 'divider' }}
            variant={isMobile ? 'scrollable' : 'standard'}
            scrollButtons={isMobile ? 'auto' : false}
        >
          <Tab label={t('pages.clients.main_info')} />
          <Tab label={isMobile ? `${client?.applications.length || 0}` : `${t('pages.clients.applications')} (${client?.applications.length || 0})`} />
          <Tab label={isMobile ? `${client?.meetings?.length || 0}` : `${t('pages.meetings.title')} (${client?.meetings?.length || 0})`} />
          <Tab label={isMobile ? `${client?.files?.length || 0}` : `${t('pages.clients.files')} (${client?.files?.length || 0})`} />
          <Tab label={isMobile ? `${client?.logs.length || 0}` : `${t('common.logs')} (${client?.logs.length || 0})`} />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0} isMobile={isMobile}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Stack spacing={isMobile ? 2 : 3}>
            <Card variant="outlined">
              <CardHeader avatar={<PersonIcon />} title={t('pages.clients.personal_data')} titleTypographyProps={{ variant: isMobile ? 'subtitle1' : 'h6' }} />
              <CardContent sx={{ p: isMobile ? 1.5 : 2 }}>
                <Grid container spacing={isMobile ? 1 : 2}>
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
                <CardHeader avatar={<ContactPhoneIcon />} title={t('pages.clients.phones_section')} titleTypographyProps={{ variant: isMobile ? 'subtitle1' : 'h6' }} />
                <CardContent sx={{ p: isMobile ? 1.5 : 2 }}>
                  {fields.map((field, index) => (
                    <Stack direction="row" spacing={isMobile ? 1 : 2} key={field.id} sx={{ mb: isMobile ? 1 : 2 }}>
                      <TextField
                        label={`${t('pages.clients.phone')} ${index + 1}`}
                        fullWidth
                        size={isMobile ? 'small' : 'medium'}
                        {...register(`phone_numbers.${index}.phone_number`)}
                      />
                      <IconButton onClick={() => remove(index)} size={isMobile ? 'small' : 'medium'}>
                        <RemoveCircleOutlineIcon />
                      </IconButton>
                    </Stack>
                  ))}
                  <Button
                    startIcon={<AddCircleOutlineIcon />}
                    onClick={() => append({ phone_number: '', is_primary: fields.length === 0 })}
                    size={isMobile ? 'small' : 'medium'}
                  >
                    {t('pages.clients.add_phone')}
                  </Button>
                </CardContent>
            </Card>

            <Card variant="outlined">
                <CardHeader avatar={<ArticleIcon />} title={t('pages.clients.passport_and_address')} titleTypographyProps={{ variant: isMobile ? 'subtitle1' : 'h6' }} />
                <CardContent sx={{ p: isMobile ? 1.5 : 2 }}>
                    <Grid container spacing={isMobile ? 1 : 2}>
                        <Grid size={{ xs: 6, md: 3 }}><TextField fullWidth size={isMobile ? 'small' : 'medium'} label={t('pages.clients.passport_series')} {...register('passport_series')} /></Grid>
                        <Grid size={{ xs: 6, md: 3 }}><TextField fullWidth size={isMobile ? 'small' : 'medium'} label={t('pages.clients.passport_number')} {...register('passport_number')} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth size={isMobile ? 'small' : 'medium'} label={t('pages.clients.passport_issued_by')} {...register('passport_issued_by')} /></Grid>
                        <Grid size={{ xs: 6, md: 3 }}><TextField fullWidth size={isMobile ? 'small' : 'medium'} label={t('pages.clients.inn')} {...register('inn')} /></Grid>
                        <Grid size={{ xs: 6, md: 3 }}><TextField fullWidth size={isMobile ? 'small' : 'medium'} label={t('pages.clients.pinfl')} {...register('pinfl')} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth size={isMobile ? 'small' : 'medium'} label={t('pages.clients.registration_address')} {...register('registration_address')} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth size={isMobile ? 'small' : 'medium'} label={t('pages.clients.billing_address')} {...register('billing_address')} /></Grid>
                    </Grid>
                </CardContent>
            </Card>

            <Box>
                <Button type="submit" variant="contained" disabled={updateClientMutation.isPending} size={isMobile ? 'small' : 'medium'} fullWidth={isMobile}>
                    {updateClientMutation.isPending ? t('common.saving') : t('pages.clients.save_changes')}
                </Button>
            </Box>
          </Stack>
        </form>
      </TabPanel>

      <TabPanel value={tabValue} index={1} isMobile={isMobile}>
        <Box sx={{ width: '100%' }}>
          <ResponsiveDataView
            data={client?.applications || []}
            columns={getApplicationColumns(t)}
            mobileFields={getApplicationMobileFields()}
          />
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={2} isMobile={isMobile}>
        <Button variant="contained" sx={{ mb: 2 }} onClick={() => setIsMeetingModalOpen(true)} size={isMobile ? 'small' : 'medium'} fullWidth={isMobile}>
            {t('pages.clients.schedule_meeting')}
        </Button>
        <Box sx={{ width: '100%' }}>
          <ResponsiveDataView
            data={client?.meetings || []}
            columns={getMeetingColumns(t)}
            mobileFields={getMeetingMobileFields()}
          />
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={3} isMobile={isMobile}>
        <ClientFilesTab clientId={Number(clientId)} />
      </TabPanel>

      <TabPanel value={tabValue} index={4} isMobile={isMobile}>
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

      <Dialog open={isMeetingModalOpen} onClose={() => setIsMeetingModalOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
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