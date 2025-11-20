import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApplicationById, updateApplication, getRejectionReasons, deleteApplication } from '../api/applications';
import type { ApplicationPayload, RejectionReason } from '../api/applications';
import {
    Typography, CircularProgress, Alert, Paper, Grid, Box, Tabs, Tab, Button,
    Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete, TextField, Chip, Link as MuiLink,
    Stack, FormControl, InputLabel, Select, MenuItem, Card, CardHeader, CardContent, Avatar
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid'; // <-- Импорт DataGrid
import { Timeline, TimelineItem, TimelineSeparator, TimelineConnector, TimelineContent, TimelineDot, timelineOppositeContentClasses } from '@mui/lab';
import { Controller, useForm } from 'react-hook-form';
import DeleteIcon from '@mui/icons-material/Delete';
import AssignmentIcon from '@mui/icons-material/Assignment';
import InterestsIcon from '@mui/icons-material/Interests';
import NotesIcon from '@mui/icons-material/Notes';
import HumanizedLog from '../components/logs/HumanizedLog'; // <-- Импорт HumanizedLog
import MeetingForm from '../components/meetings/MeetingForm'; // <-- Импорт MeetingForm
import type { Meeting } from '../api/meetings'; // <-- Импорт типа Meeting

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

// Колонки для таблицы встреч
const meetingColumns: GridColDef<Meeting>[] = [
    { field: 'id', headerName: 'ID', width: 80 },
    { field: 'status', headerName: 'Статус', width: 150 },
    { field: 'planned_date', headerName: 'План. дата', type: 'dateTime', width: 180, valueGetter: (value) => value ? new Date(value) : null },
    { field: 'executor', headerName: 'Исполнитель', width: 150 },
];


export default function ApplicationDetailPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);
  const [isReasonModalOpen, setIsReasonModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false); // <-- Состояние для модального окна встречи
  const [targetStatus, setTargetStatus] = useState<'JUNK' | 'REJECTED' | null>(null);
  const queryClient = useQueryClient();

  const { data: app, isLoading, isError } = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => getApplicationById(Number(applicationId)),
    enabled: !!applicationId,
  });

  const { data: reasons, isLoading: isLoadingReasons } = useQuery({
    queryKey: ['rejectionReasons', targetStatus],
    queryFn: () => getRejectionReasons(targetStatus!),
    enabled: !!targetStatus,
  });

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<ApplicationPayload>({
    defaultValues: app,
  });

  useEffect(() => {
    if (app) {
      reset(app);
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

  const onReasonSubmit = (data: { rejection_reason_id: number }) => {
    if (targetStatus && applicationId) {
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
  if (isError || !app) return <Alert severity="error">Не удалось загрузить данные заявки.</Alert>;

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
                    Заявка №{app.id} <Chip label={app.status} color="primary" size="small" />
                </Typography>
                <Typography color="text.secondary">
                    Клиент: <MuiLink component={RouterLink} to={`/clients/${app.client.id}`}>{app.client.full_name}</MuiLink>
                </Typography>
            </Box>
            <Box sx={{ flexGrow: 1 }} />
            <Stack direction="row" spacing={2}>
                {app.status === 'IN_PROGRESS' && (
                    <>
                    <Button variant="outlined" color="error" onClick={() => handleOpenReasonModal('JUNK')}>Нецелевая</Button>
                    <Button variant="outlined" color="warning" onClick={() => handleOpenReasonModal('REJECTED')}>Отказ</Button>
                    </>
                )}
                <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => setIsDeleteDialogOpen(true)}>
                    Удалить
                </Button>
            </Stack>
        </Stack>
      </Paper>


      <Box>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Детали заявки" />
          <Tab label={`Встречи (${app.meetings?.length || 0})`} />
          <Tab label={`Логи (${app.logs.length})`} />
        </Tabs>
      </Box>

        <TabPanel value={tabValue} index={0}>
            <form onSubmit={handleSubmit(onFormSubmit)}>
                <Stack spacing={3}>
                    <Card variant="outlined">
                        <CardHeader avatar={<InterestsIcon />} title="Интересы клиента" />
                        <CardContent>
                            <Grid container spacing={2}>
                              <Grid size={{ xs: 12, sm: 6 }}>
                                <Controller
                                  name="interested_property_type"
                                  control={control}
                                  defaultValue=""
                                  render={({ field }) => (
                                    <FormControl fullWidth disabled={!isEditable}>
                                      <InputLabel>Тип недвижимости</InputLabel>
                                      <Select {...field} label="Тип недвижимости">
                                        <MenuItem value="APARTMENT">Квартира</MenuItem>
                                        <MenuItem value="COMMERCIAL">Коммерция</MenuItem>
                                        <MenuItem value="PARKING">Парковка</MenuItem>
                                        <MenuItem value="STORAGE">Кладовка</MenuItem>
                                        <MenuItem value="COTTAGE">Коттедж</MenuItem>
                                      </Select>
                                    </FormControl>
                                  )}
                                />
                              </Grid>
                              <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField label="Причина отказа/нецелевой" fullWidth disabled value={app.rejection_reason?.name || ''} />
                              </Grid>
                              <Grid size={{ xs: 12, sm: 3 }}><TextField label="Площадь от (м²)" type="number" fullWidth disabled={!isEditable} {...register('min_area')} /></Grid>
                              <Grid size={{ xs: 12, sm: 3 }}><TextField label="Площадь до (м²)" type="number" fullWidth disabled={!isEditable} {...register('max_area')} /></Grid>
                              <Grid size={{ xs: 12, sm: 3 }}><TextField label="Этаж от" type="number" fullWidth disabled={!isEditable} {...register('min_floor')} /></Grid>
                              <Grid size={{ xs: 12, sm: 3 }}><TextField label="Этаж до" type="number" fullWidth disabled={!isEditable} {...register('max_floor')} /></Grid>
                            </Grid>
                        </CardContent>
                    </Card>
                    <Card variant="outlined">
                        <CardHeader avatar={<NotesIcon />} title="Заметки" />
                        <CardContent>
                            <TextField fullWidth multiline rows={4} disabled={!isEditable} {...register('notes')} />
                        </CardContent>
                    </Card>

                    {isEditable && (
                      <Box>
                          <Button type="submit" variant="contained" disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? 'Сохранение...' : 'Сохранить и взять в работу'}
                          </Button>
                      </Box>
                    )}
                </Stack>
            </form>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
            <Button variant="contained" sx={{ mb: 2 }} onClick={() => setIsMeetingModalOpen(true)}>
                Назначить встречу
            </Button>
            <Box sx={{ height: 400, width: '100%' }}>
              <DataGrid
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
                <Typography variant="body2" color="text.secondary">{new Date(log.created_at).toLocaleString('ru-RU')}</Typography>
                <Typography component="span" fontWeight="bold">{log.user || 'Система'}</Typography>
                <HumanizedLog log={log} />
              </TimelineContent>
            </TimelineItem>
          ))}
        </Timeline>
      </TabPanel>

      <Dialog open={isReasonModalOpen} onClose={() => setIsReasonModalOpen(false)} fullWidth maxWidth="xs">
        <form onSubmit={handleSubmit(onReasonSubmit)}>
          <DialogTitle>Укажите причину</DialogTitle>
          <DialogContent>
            <Controller
              name="rejection_reason_id"
              control={control}
              rules={{ required: "Необходимо выбрать причину" }}
              render={({ field }) => (
                <Autocomplete
                  options={reasons || []}
                  loading={isLoadingReasons}
                  getOptionLabel={(option) => option.name}
                  onChange={(_, data) => field.onChange(data?.id)}
                  renderInput={(params) => <TextField {...params} sx={{ mt: 1 }} label="Причина" required error={!!errors.rejection_reason_id} helperText={errors.rejection_reason_id?.message} />}
                />
              )}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setIsReasonModalOpen(false)}>Отмена</Button>
            <Button type="submit" variant="contained" disabled={updateMutation.isPending}>
              Подтвердить
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onClose={() => setIsDeleteDialogOpen(false)}>
        <DialogTitle>Подтвердите удаление</DialogTitle>
        <DialogContent>
          <Typography>Вы уверены, что хотите удалить заявку №{app.id}? Это действие необратимо.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDeleteDialogOpen(false)}>Отмена</Button>
          <Button onClick={() => deleteMutation.mutate(Number(applicationId))} color="error" disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? 'Удаление...' : 'Удалить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isMeetingModalOpen} onClose={() => setIsMeetingModalOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Новая встреча по заявке №{app.id}</DialogTitle>
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