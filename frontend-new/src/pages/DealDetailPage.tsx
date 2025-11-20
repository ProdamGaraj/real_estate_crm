import { useState, useEffect, useMemo } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { getDealById, updateDeal } from '../api/deals';
import type { DealUpdatePayload, Deal } from '../api/deals';
import DiscountsModal from '../components/deals/DiscountsModal';
import PaymentSchedule from '../components/deals/PaymentSchedule';
import DocumentGeneration from '../components/deals/DocumentGeneration';
import HumanizedLog from '../components/logs/HumanizedLog';
import DealCancellationModal from '../components/deals/DealCancellationModal';

import {
  Typography, CircularProgress, Alert, Paper, Grid, Box, TextField, Button,
  Divider, Link as MuiLink, Stack, Stepper, Step, StepLabel, StepContent, Tabs, Tab
} from '@mui/material';
import { Timeline, TimelineItem, TimelineSeparator, TimelineConnector, TimelineContent, TimelineDot } from '@mui/lab';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

type DealFormInputs = Pick<DealUpdatePayload, 'contract_price' | 'notes' | 'contract_number' | 'contract_date' | 'client_signature_date' | 'company_signature_date'> & {
  signed_document_scan?: FileList;
};

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
      {value === index && <Box sx={{ p: 2 }}>{children}</Box>}
    </div>
  );
}


export default function DealDetailPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const queryClient = useQueryClient();

  const [isDiscountModalOpen, setDiscountModalOpen] = useState(false);
  const [mainTabValue, setMainTabValue] = useState(0); // Для главных вкладок
  const [activeStep, setActiveStep] = useState(0); // Для шагов внутри степпера
  const [isInitialized, setIsInitialized] = useState(false);
  const [isCancellationModalOpen, setCancellationModalOpen] = useState(false);

  const { data: deal, isLoading, isError } = useQuery({
    queryKey: ['deal', dealId],
    queryFn: () => getDealById(Number(dealId)),
    enabled: !!dealId,
  });

  const { register, handleSubmit, reset, watch, setValue } = useForm<DealFormInputs>();

  useEffect(() => {
    if (deal && !isInitialized) {
      let initialStep = 0;
      if (deal.contract_price) initialStep = 1;
      if (deal.payments?.length > 0) initialStep = 2;
      if (deal.payments?.length > 0 && deal.contract_number && deal.contract_date) {
        initialStep = 3;
      }
      setActiveStep(initialStep);
      setIsInitialized(true);
    }
    if (deal) {
      reset({
        contract_price: Number(deal.contract_price || deal.initial_price),
        notes: deal.notes || '',
        contract_number: deal.contract_number || '',
        contract_date: deal.contract_date || '',
        client_signature_date: deal.client_signature_date || '',
        company_signature_date: deal.company_signature_date || '',
      });
    }
  }, [deal, isInitialized, reset]);

  const updateDealMutation = useMutation({
    mutationFn: updateDeal,
    onSuccess: (updatedDeal) => {
      queryClient.setQueryData(['deal', dealId], updatedDeal);
      alert('Изменения сохранены!');
    },
    onError: (error: any) => {
        const serverError = error.response?.data?.contract_number?.[0] || error.response?.data?.detail;
        alert(`Ошибка обновления: ${serverError || error.message}`);
    }
  });

  const handleFormSubmit = (data: DealFormInputs) => {
    const payload: DealUpdatePayload = {
      notes: data.notes,
      contract_price: Number(data.contract_price),
      contract_number: data.contract_number,
      contract_date: data.contract_date,
      client_signature_date: data.client_signature_date,
      company_signature_date: data.company_signature_date,
      applied_discounts_ids: deal?.applied_discounts.map(d => d.id)
    };
    if (data.signed_document_scan && data.signed_document_scan.length > 0) {
      payload.signed_document_scan = data.signed_document_scan[0];
    }
    updateDealMutation.mutate({ id: Number(dealId), payload });
  };

  const handleDiscountsSave = (newPrice: number, selectedIds: number[]) => {
    setValue('contract_price', newPrice);
    const payload: DealUpdatePayload = {
      contract_price: newPrice,
      applied_discounts_ids: selectedIds,
      notes: watch('notes')
    };
    updateDealMutation.mutate({ id: Number(dealId), payload });
    setDiscountModalOpen(false);
  };

  if (isLoading) return <CircularProgress />;
  if (isError || !deal) return <Alert severity="error">Не удалось загрузить данные сделки.</Alert>;

  const isDealReadOnly = ['CLOSED_WON', 'CANCELLED', 'TERMINATED'].includes(deal.status);
  const isDealTerminated = deal.status === 'TERMINATED';

  return (
    <>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4">Сделка №{deal.id} (Статус: {deal.status})</Typography>
        {!isDealReadOnly && (
            <Button
                variant="outlined"
                color="error"
                startIcon={<ErrorOutlineIcon />}
                onClick={() => setCancellationModalOpen(true)}
            >
                Отменить / Расторгнуть
            </Button>
        )}
      </Stack>
      {/* --- НОВЫЙ БЛОК ИНФОРМАЦИИ --- */}
            {(deal.status === 'CANCELLED' || deal.status === 'TERMINATED') && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    <Typography fontWeight="bold">Сделка завершена ({deal.status === 'CANCELLED' ? 'Отменена' : 'Расторгнута'})</Typography>
                    {deal.status === 'CANCELLED' && <Typography>Причина: {deal.cancellation_reason}</Typography>}
                    {deal.status === 'TERMINATED' && (
                        <>
                            <Typography>Дата расторжения: {deal.termination_date}</Typography>
                            {deal.termination_document_scan && (
                                <Typography>
                                    Документ-основание: <MuiLink href={deal.termination_document_scan} target="_blank" rel="noopener noreferrer">Посмотреть</MuiLink>
                                </Typography>
                            )}
                        </>
                    )}
                </Alert>
            )}

        <Paper>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={mainTabValue} onChange={(_, newValue) => setMainTabValue(newValue)}>
                  <Tab label="Шаги сделки" />
                  <Tab label={`Логи (${deal.logs?.length || 0})`} />
              </Tabs>
          </Box>

          {/* ПАНЕЛЬ 1: ШАГИ СДЕЛКИ */}
          <TabPanel value={mainTabValue} index={0}>
              <Stepper activeStep={activeStep} orientation="vertical">
                  {/* === ШАГ 1: ИНФОРМАЦИЯ О СДЕЛКЕ === */}
                  <Step>
                    <StepLabel onClick={() => setActiveStep(0)} sx={{cursor: 'pointer'}}>Информация о сделке</StepLabel>
                    <StepContent>
                      <Grid container spacing={2}>
                          <Grid size={{ xs: 12, sm: 6 }}>
                              <Typography><b>Клиент:</b> <MuiLink component={RouterLink} to={`/clients/${deal.client.id}`}>{deal.client.full_name}</MuiLink></Typography>
                              <Typography><b>Объект:</b> {deal.property.property_type} №{deal.property.unit_number}, {deal.property.area} м²</Typography>
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                              <Typography><b>Начало брони:</b> {new Date(deal.booking_start_date).toLocaleString()}</Typography>
                              <Typography><b>Окончание брони:</b> {new Date(deal.booking_end_date).toLocaleString()}</Typography>
                          </Grid>
                      </Grid>
                      <Button onClick={() => setActiveStep(1)} variant="contained" sx={{mt: 2}} disabled={isDealReadOnly}>Далее</Button>
                    </StepContent>
                  </Step>

                  {/* === ШАГ 2: УСЛОВИЯ СДЕЛКИ === */}
                  <Step>
                    <StepLabel onClick={() => setActiveStep(1)} sx={{cursor: 'pointer'}}>Условия сделки</StepLabel>
                    <StepContent>
                      <form onSubmit={handleSubmit(handleFormSubmit)}>
                        <Grid container spacing={3}>
                          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label="Стоимость (начальная)" value={Number(deal.initial_price).toLocaleString()} fullWidth InputProps={{ readOnly: true }}/></Grid>
                          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label="Цена за м² (начальная)" value={Number(deal.initial_price_per_sqm).toLocaleString()} fullWidth InputProps={{ readOnly: true }}/></Grid>
                          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label="Стоимость по договору" type="number" fullWidth {...register('contract_price')} disabled={isDealReadOnly} /></Grid>
                          <Grid size={{ xs: 12 }}><Button variant="outlined" sx={{mb: 1}} onClick={() => setDiscountModalOpen(true)} disabled={isDealReadOnly}>Применить скидки</Button> <Typography component="span">Применено: {deal.applied_discounts.map(d => `${d.name} (${d.percentage_value}%)`).join(', ') || 'нет'}</Typography></Grid>
                          <Grid size={{ xs: 12 }}><TextField label="Примечание к сделке" multiline rows={4} fullWidth {...register('notes')} disabled={isDealReadOnly} /></Grid>
                        </Grid>
                        <Stack direction="row" spacing={2} sx={{mt: 2}}>
                          <Button type="submit" variant="contained" disabled={updateDealMutation.isPending || isDealReadOnly}>Сохранить и перейти к графику</Button>
                          <Button onClick={() => setActiveStep(0)} disabled={isDealReadOnly}>Назад</Button>
                        </Stack>
                      </form>
                    </StepContent>
                  </Step>

                  {/* === ШАГ 3: ГРАФИК ПЛАТЕЖЕЙ === */}
                  <Step>
                    <StepLabel onClick={() => deal.contract_price && setActiveStep(2)} error={!deal.contract_price} sx={{cursor: 'pointer'}}>График платежей</StepLabel>
                    <StepContent>
                       {deal.contract_price ? (
                        <PaymentSchedule
                            dealId={deal.id}
                            contractPrice={Number(deal.contract_price)}
                            existingPayments={deal.payments || []}
                            isDealTerminated={isDealTerminated}
                            isReadOnly={isDealReadOnly}
                        />
                        ) : <Alert severity="warning">Сначала сохраните "Стоимость по договору" на предыдущем шаге.</Alert>}
                      <Stack direction="row" spacing={2} sx={{mt: 2}}>
                          <Button onClick={() => setActiveStep(1)} disabled={isDealReadOnly}>Назад</Button>
                          <Button variant="contained" onClick={() => setActiveStep(3)} disabled={!deal.payments || deal.payments.length === 0 || isDealReadOnly}>Далее</Button>
                      </Stack>
                    </StepContent>
                  </Step>

                  {/* === ШАГ 4: ДОКУМЕНТЫ === */}
                  <Step>
                    <StepLabel onClick={() => deal.payments?.length > 0 && setActiveStep(3)} error={!deal.payments || deal.payments.length === 0} sx={{cursor: 'pointer'}}>Документы</StepLabel>
                    <StepContent>
                      <form onSubmit={handleSubmit(handleFormSubmit)}>
                          <Typography variant="h6" gutterBottom>Данные договора</Typography>
                          <Grid container spacing={2} sx={{mb: 2}}>
                              <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Номер договора" {...register('contract_number')} disabled={isDealReadOnly} /></Grid>
                              <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Дата договора" type="date" InputLabelProps={{ shrink: true }} {...register('contract_date')} disabled={isDealReadOnly}/></Grid>
                          </Grid>
                          <Divider sx={{my: 3}}/>

                          <Typography variant="h6" gutterBottom>Генерация</Typography>
                          {deal.contract_number && deal.contract_date ? (<DocumentGeneration deal={deal} />) : (<Alert severity="info">Сохраните номер и дату договора, чтобы сгенерировать документы.</Alert>)}

                          {deal.contract_number && deal.contract_date && (
                              <>
                                  <Divider sx={{my: 3}}/>
                                  <Typography variant="h6" gutterBottom>Подписанные документы</Typography>
                                  {deal.signed_document_scan && (<Alert severity="success" sx={{mb: 2}}>Подписанный документ загружен. <MuiLink href={deal.signed_document_scan} target="_blank" rel="noopener noreferrer">Посмотреть</MuiLink></Alert>)}
                                  <Grid container spacing={2} sx={{mb: 2}}>
                                      <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label="Загрузить скан" type="file" InputLabelProps={{ shrink: true }} {...register('signed_document_scan')} disabled={isDealReadOnly} /></Grid>
                                      <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label="Дата подписания клиентом" type="date" InputLabelProps={{ shrink: true }} {...register('client_signature_date')} disabled={isDealReadOnly} /></Grid>
                                      <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label="Дата подписания компанией" type="date" InputLabelProps={{ shrink: true }} {...register('company_signature_date')} disabled={isDealReadOnly} /></Grid>
                                  </Grid>
                              </>
                          )}
                          <Stack direction="row" spacing={2} sx={{mt: 2}}>
                             <Button type="submit" variant="contained" disabled={updateDealMutation.isPending || isDealReadOnly}>{updateDealMutation.isPending ? 'Сохранение...' : 'Сохранить данные'}</Button>
                             <Button onClick={() => setActiveStep(2)} disabled={isDealReadOnly}>Назад</Button>
                          </Stack>
                      </form>
                    </StepContent>
                  </Step>
              </Stepper>
          </TabPanel>

          {/* ПАНЕЛЬ 2: ЛОГИ */}
          <TabPanel value={mainTabValue} index={1}>
              <Timeline>
                  {deal.logs?.map((log) => (
                      <TimelineItem key={log.id}>
                          <TimelineSeparator>
                              <TimelineDot color="grey" />
                              <TimelineConnector />
                          </TimelineSeparator>
                          <TimelineContent sx={{ py: '12px', px: 2 }}>
                              <Typography variant="body2" color="text.secondary">
                                  {new Date(log.created_at).toLocaleString()} - {log.user || 'Система'}
                              </Typography>
                              <HumanizedLog log={log} />
                          </TimelineContent>
                      </TimelineItem>
                  ))}
              </Timeline>
          </TabPanel>
        </Paper>

      {isCancellationModalOpen && (
          <DealCancellationModal
              open={isCancellationModalOpen}
              onClose={() => setCancellationModalOpen(false)}
              onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
                  setCancellationModalOpen(false);
              }}
              deal={deal}
          />
      )}

      {isDiscountModalOpen && (
        <DiscountsModal
            open={isDiscountModalOpen}
            dealId={Number(dealId)}
            basePrice={Number(deal.initial_price)}
            appliedDiscountIds={deal.applied_discounts.map(d => d.id)}
            onClose={() => setDiscountModalOpen(false)}
            onSave={handleDiscountsSave}
        />
      )}
    </>
  );
}