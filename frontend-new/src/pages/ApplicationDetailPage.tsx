import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getApplicationById, updateApplication, getRejectionReasons, deleteApplication } from '../api/applications';
import { getApplicationStatuses } from '../api/settings';
import type { ApplicationPayload } from '../api/applications';
import {
    Typography, CircularProgress, Alert, Paper, Grid, Box, Tabs, Tab, Button,
    Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete, TextField, Chip, Link as MuiLink,
    Stack, FormControl, InputLabel, Select, MenuItem, Card, CardHeader, CardContent, Avatar,
    Menu, ListItemIcon, ListItemText
} from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid'; // <-- Импорт GridColDef
import LocalizedDataGrid from '../components/common/LocalizedDataGrid';
import { Timeline, TimelineItem, TimelineSeparator, TimelineConnector, TimelineContent, TimelineDot, timelineOppositeContentClasses } from '@mui/lab';
import { Controller, useForm } from 'react-hook-form';
import DeleteIcon from '@mui/icons-material/Delete';
import AssignmentIcon from '@mui/icons-material/Assignment';
import InterestsIcon from '@mui/icons-material/Interests';
import NotesIcon from '@mui/icons-material/Notes';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CircleIcon from '@mui/icons-material/Circle';
import HumanizedLog from '../components/logs/HumanizedLog'; // <-- Импорт HumanizedLog
import MeetingForm from '../components/meetings/MeetingForm'; // <-- Импорт MeetingForm
import type { Meeting } from '../api/meetings'; // <-- Импорт типа Meeting
import { useAuthStore } from '../store/authStore';
import { hasPermission } from '../utils/permissions';

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


export default function ApplicationDetailPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [tabValue, setTabValue] = useState(0);
  const [isReasonModalOpen, setIsReasonModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false); // <-- Состояние для модального окна встречи
  const [targetStatus, setTargetStatus] = useState<'JUNK' | 'REJECTED' | null>(null);
  const [statusMenuAnchor, setStatusMenuAnchor] = useState<null | HTMLElement>(null);
  const { user } = useAuthStore();
  const canDelete = hasPermission(user, 'DELETE', 'APPLICATION');

  const getDateLocale = () => {
    const localeMap: Record<string, string> = { ru: 'ru-RU', en: 'en-US', uz: 'uz-UZ' };
    return localeMap[i18n.language] || 'ru-RU';
  };

  // Колонки для таблицы встреч
  const meetingColumns: GridColDef<Meeting>[] = [
      { field: 'id', headerName: 'ID', width: 80 },
      { field: 'status', headerName: t('common.status'), width: 150 },
      { field: 'planned_date', headerName: t('pages.meetings.planned_date'), type: 'dateTime', width: 180, valueGetter: (value) => value ? new Date(value) : null },
      { field: 'executor', headerName: t('pages.meetings.executor'), width: 150 },
  ];
  const queryClient = useQueryClient();

  const { data: app, isLoading, isError } = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => getApplicationById(Number(applicationId)),
    enabled: !!applicationId,
  });

  const { data: reasons, isLoading: isLoadingReasons } = useQuery({
    queryKey: ['rejectionReasons'],
    queryFn: () => getRejectionReasons(),
    enabled: !!targetStatus,
  });

  // Загружаем статусы заявок
  const { data: applicationStatuses } = useQuery({
    queryKey: ['applicationStatuses', true],
    queryFn: () => getApplicationStatuses(true),
  });

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<ApplicationPayload>();

  useEffect(() => {
    if (app) {
      reset({
        interested_property_type: app.interested_property_type,
        min_area: app.min_area ? Number(app.min_area) : null,
        max_area: app.max_area ? Number(app.max_area) : null,
        min_floor: app.min_floor,
        max_floor: app.max_floor,
        notes: app.notes,
      });
    }
  }, [app, reset]);

  const updateMutation = useMutation({
    mutationFn: updateApplication,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application', applicationId] });
      setIsReasonModalOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteApplication,
    onSuccess: () => {
      setIsDeleteDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      navigate('/applications');
    },
  });

  const handleOpenReasonModal = (status: 'JUNK' | 'REJECTED') => {
    setTargetStatus(status);
    setIsReasonModalOpen(true);
  };

  const handleStatusChange = (newStatus: string) => {
    if (applicationId) {
      updateMutation.mutate({ id: Number(applicationId), payload: { status: newStatus } });
    }
    setStatusMenuAnchor(null);
  };

  // Текущий статус и доступные для перехода
  const currentStatus = applicationStatuses?.find(s => s.code === app?.status);
  const availableStatuses = applicationStatuses?.filter(s => s.code !== app?.status && s.is_active) || [];

  const onReasonSubmit = (data: ApplicationPayload) => {
    if (targetStatus && applicationId && data.rejection_reason_id) {
      const payload: ApplicationPayload = { status: targetStatus, rejection_reason_id: data.rejection_reason_id };
      updateMutation.mutate({ id: Number(applicationId), payload });
    }
  };

  const onFormSubmit = (data: ApplicationPayload) => {
    if (!applicationId) return;
    const payload: ApplicationPayload = { ...data, status: 'IN_PROGRESS' };
    updateMutation.mutate({ id: Number(applicationId), payload });
  };

  if (isLoading) return <CircularProgress />;
  if (isError || !app) return <Alert severity="error">{t('errors.load_application')}</Alert>;

  const isEditable = app.status === 'NEW' || app.status === 'IN_PROGRESS';

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
            <Avatar sx={{ width: 64, height: 64 }} variant="rounded">
                <AssignmentIcon fontSize="large" />
            </Avatar>
            <Box>
                <Typography variant="h4" gutterBottom>
                    {t('pages.applications.application_number', { number: app.id })}
                    {' '}
                    <Chip 
                      label={currentStatus?.name || t(`statuses.application.${app.status}`)} 
                      sx={{ 
                        backgroundColor: currentStatus?.color || 'primary.main',
                        color: 'white',
                        cursor: 'pointer'
                      }}
                      size="small"
                      onClick={(e) => setStatusMenuAnchor(e.currentTarget)}
                      onDelete={(e) => setStatusMenuAnchor(e.currentTarget)}
                      deleteIcon={<ArrowDropDownIcon sx={{ color: 'white !important' }} />}
                    />
                    <Menu
                      anchorEl={statusMenuAnchor}
                      open={Boolean(statusMenuAnchor)}
                      onClose={() => setStatusMenuAnchor(null)}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5, display: 'block' }}>
                        {t('pages.applications.kanban.change_status')}
                      </Typography>
                      {availableStatuses.map((status) => (
                        <MenuItem key={status.id} onClick={() => handleStatusChange(status.code)}>
                          <ListItemIcon>
                            <CircleIcon sx={{ color: status.color, fontSize: 16 }} />
                          </ListItemIcon>
                          <ListItemText>{status.name}</ListItemText>
                        </MenuItem>
                      ))}
                    </Menu>
                </Typography>
                <Typography color="text.secondary">
                    {t('pages.applications.client')}: <MuiLink component={RouterLink} to={`/clients/${app.client.id}`}>{app.client.full_name}</MuiLink>
                </Typography>
            </Box>
            <Box sx={{ flexGrow: 1 }} />
            <Stack direction="row" spacing={2}>
                {canDelete && (
                  <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => setIsDeleteDialogOpen(true)}>
                      {t('common.delete')}
                  </Button>
                )}
            </Stack>
        </Stack>
      </Paper>


      <Box>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={t('pages.applications.details_tab')} />
          <Tab label={`${t('pages.applications.meetings_tab')} (${app.meetings?.length || 0})`} />
          <Tab label={`${t('pages.applications.logs_tab')} (${app.logs.length})`} />
        </Tabs>
      </Box>

        <TabPanel value={tabValue} index={0}>
            <form onSubmit={handleSubmit(onFormSubmit)}>
                <Stack spacing={3}>
                    <Card variant="outlined">
                        <CardHeader avatar={<InterestsIcon />} title={t('pages.applications.client_interests')} />
                        <CardContent>
                            <Grid container spacing={2}>
                              <Grid size={{ xs: 12, sm: 6 }}>
                                <Controller
                                  name="interested_property_type"
                                  control={control}
                                  defaultValue=""
                                  render={({ field }) => (
                                    <FormControl fullWidth disabled={!isEditable}>
                                      <InputLabel>{t('pages.applications.property_type')}</InputLabel>
                                      <Select {...field} label={t('pages.applications.property_type')}>
                                        <MenuItem value="APARTMENT">{t('pages.applications.property_types.apartment')}</MenuItem>
                                        <MenuItem value="COMMERCIAL">{t('pages.applications.property_types.commercial')}</MenuItem>
                                        <MenuItem value="PARKING">{t('pages.applications.property_types.parking')}</MenuItem>
                                        <MenuItem value="STORAGE">{t('pages.applications.property_types.storage')}</MenuItem>
                                        <MenuItem value="COTTAGE">{t('pages.applications.property_types.cottage')}</MenuItem>
                                      </Select>
                                    </FormControl>
                                  )}
                                />
                              </Grid>
                              <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField label={t('pages.applications.rejection_reason')} fullWidth disabled value={app.rejection_reason?.name || ''} />
                              </Grid>
                              <Grid size={{ xs: 12, sm: 3 }}><TextField label={t('pages.applications.min_area')} type="number" fullWidth disabled={!isEditable} {...register('min_area')} /></Grid>
                              <Grid size={{ xs: 12, sm: 3 }}><TextField label={t('pages.applications.max_area')} type="number" fullWidth disabled={!isEditable} {...register('max_area')} /></Grid>
                              <Grid size={{ xs: 12, sm: 3 }}><TextField label={t('pages.applications.min_floor')} type="number" fullWidth disabled={!isEditable} {...register('min_floor')} /></Grid>
                              <Grid size={{ xs: 12, sm: 3 }}><TextField label={t('pages.applications.max_floor')} type="number" fullWidth disabled={!isEditable} {...register('max_floor')} /></Grid>
                            </Grid>
                        </CardContent>
                    </Card>
                    <Card variant="outlined">
                        <CardHeader avatar={<NotesIcon />} title={t('pages.applications.notes')} />
                        <CardContent>
                            <TextField fullWidth multiline rows={4} disabled={!isEditable} {...register('notes')} />
                        </CardContent>
                    </Card>

                    {isEditable && (
                      <Box>
                          <Button type="submit" variant="contained" disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? t('common.saving') : t('pages.applications.save_and_process')}
                          </Button>
                      </Box>
                    )}
                </Stack>
            </form>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
            <Button variant="contained" sx={{ mb: 2 }} onClick={() => setIsMeetingModalOpen(true)}>
                {t('pages.applications.schedule_meeting')}
            </Button>
            <Box sx={{ height: 400, width: '100%' }}>
              <LocalizedDataGrid
                rows={app.meetings || []}
                columns={meetingColumns}
                disableRowSelectionOnClick
              />
            </Box>
        </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <Timeline sx={{ [`& .${timelineOppositeContentClasses.root}`]: { flex: 0.2 } }}>
          {app.logs.map((log) => (
            <TimelineItem key={log.id}>
              <TimelineSeparator><TimelineDot color="grey" /><TimelineConnector /></TimelineSeparator>
              <TimelineContent sx={{ py: '12px', px: 2 }}>
                <Typography variant="body2" color="text.secondary">{new Date(log.created_at).toLocaleString(getDateLocale())}</Typography>
                <Typography component="span" fontWeight="bold">{log.user || t('common.system')}</Typography>
                <HumanizedLog log={log} />
              </TimelineContent>
            </TimelineItem>
          ))}
        </Timeline>
      </TabPanel>

      <Dialog open={isReasonModalOpen} onClose={() => setIsReasonModalOpen(false)} fullWidth maxWidth="xs">
        <form onSubmit={handleSubmit(onReasonSubmit)}>
          <DialogTitle>{t('pages.applications.specify_reason')}</DialogTitle>
          <DialogContent>
            <Controller
              name="rejection_reason_id"
              control={control}
              rules={{ required: t('pages.applications.reason_required') }}
              render={({ field }) => (
                <Autocomplete
                  options={reasons || []}
                  loading={isLoadingReasons}
                  getOptionLabel={(option) => option.name}
                  onChange={(_, data) => field.onChange(data?.id)}
                  renderInput={(params) => <TextField {...params} sx={{ mt: 1 }} label={t('pages.applications.reason')} required error={!!errors.rejection_reason_id} helperText={errors.rejection_reason_id?.message} />}
                />
              )}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setIsReasonModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="contained" disabled={updateMutation.isPending}>
              {t('common.confirm')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onClose={() => setIsDeleteDialogOpen(false)}>
        <DialogTitle>{t('common.confirm_delete')}</DialogTitle>
        <DialogContent>
          <Typography>{t('pages.applications.delete_confirmation', { number: app.id })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDeleteDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={() => deleteMutation.mutate(Number(applicationId))} color="error" disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? t('common.deleting') : t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isMeetingModalOpen} onClose={() => setIsMeetingModalOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{t('pages.applications.new_meeting_for', { number: app.id })}</DialogTitle>
          <DialogContent>
              {app && (
                  <MeetingForm
                      clientId={app.client.id}
                      applicationId={app.id}
                      onSuccess={() => {
                          setIsMeetingModalOpen(false);
                          queryClient.invalidateQueries({ queryKey: ['application', applicationId] });
                      }}
                  />
              )}
          </DialogContent>
      </Dialog>

    </Stack>
  );
}