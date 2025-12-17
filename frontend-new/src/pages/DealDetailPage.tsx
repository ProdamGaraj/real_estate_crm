import { useState, useEffect, useMemo } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { getDealById, updateDeal } from '../api/deals';
import type { DealUpdatePayload, Deal } from '../api/deals';
import DiscountsModal from '../components/deals/DiscountsModal';
import PaymentSchedule from '../components/deals/PaymentSchedule';
import DocumentGeneration from '../components/deals/DocumentGeneration';
import HumanizedLog from '../components/logs/HumanizedLog';
import DealCancellationModal from '../components/deals/DealCancellationModal';
import LocalizedDateField from '../components/common/LocalizedDateField';

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
  const { t, i18n } = useTranslation();

  const [isDiscountModalOpen, setDiscountModalOpen] = useState(false);
  const [mainTabValue, setMainTabValue] = useState(0); // Для главных вкладок
  const [activeStep, setActiveStep] = useState(0); // Для шагов внутри степпера
  const [isInitialized, setIsInitialized] = useState(false);
  const [isCancellationModalOpen, setCancellationModalOpen] = useState(false);

  const getDateLocale = () => {
    const localeMap: Record<string, string> = { ru: 'ru-RU', en: 'en-US', uz: 'uz-UZ' };
    return localeMap[i18n.language] || 'ru-RU';
  };

  const { data: deal, isLoading, isError } = useQuery({
    queryKey: ['deal', dealId],
    queryFn: () => getDealById(Number(dealId)),
    enabled: !!dealId,
  });

  const { register, handleSubmit, reset, watch, setValue, control } = useForm<DealFormInputs>();

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
      alert(t('common.changes_saved'));
    },
    onError: (error: any) => {
        const serverError = error.response?.data?.contract_number?.[0] || error.response?.data?.detail;
        alert(`${t('errors.update_error')}: ${serverError || error.message}`);
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
  if (isError || !deal) return <Alert severity="error">{t('errors.load_deal')}</Alert>;

  const isDealReadOnly = ['CLOSED_WON', 'CANCELLED', 'TERMINATED'].includes(deal.status);
  const isDealTerminated = deal.status === 'TERMINATED';
  // Кнопка расторжения доступна для сделок в работе и успешно закрытых (но не для уже отменённых/расторгнутых)
  const canTerminateDeal = !['CANCELLED', 'TERMINATED'].includes(deal.status);

  return (
    <>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4">{t('pages.deals.deal_title', { id: deal.id, status: t(`statuses.deal.${deal.status}`) })}</Typography>
        {canTerminateDeal && (
            <Button
                variant="outlined"
                color="error"
                startIcon={<ErrorOutlineIcon />}
                onClick={() => setCancellationModalOpen(true)}
            >
                {t('pages.deals.cancel_terminate')}
            </Button>
        )}
      </Stack>
      {/* --- НОВЫЙ БЛОК ИНФОРМАЦИИ --- */}
            {(deal.status === 'CANCELLED' || deal.status === 'TERMINATED') && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    <Typography fontWeight="bold">{t('pages.deals.deal_closed', { status: deal.status === 'CANCELLED' ? t('pages.deals.cancelled') : t('pages.deals.terminated') })}</Typography>
                    {deal.status === 'CANCELLED' && <Typography>{t('pages.deals.reason')}: {deal.cancellation_reason}</Typography>}
                    {deal.status === 'TERMINATED' && (
                        <>
                            <Typography>{t('pages.deals.termination_date')}: {deal.termination_date}</Typography>
                            {deal.termination_document_scan && (
                                <Typography>
                                    {t('pages.deals.termination_document')}: <MuiLink href={deal.termination_document_scan} target="_blank" rel="noopener noreferrer">{t('common.view')}</MuiLink>
                                </Typography>
                            )}
                        </>
                    )}
                </Alert>
            )}

        <Paper>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={mainTabValue} onChange={(_, newValue) => setMainTabValue(newValue)}>
                  <Tab label={t('pages.deals.deal_steps')} />
                  <Tab label={`${t('pages.deals.logs_tab')} (${deal.logs?.length || 0})`} />
              </Tabs>
          </Box>

          {/* ПАНЕЛЬ 1: ШАГИ СДЕЛКИ */}
          <TabPanel value={mainTabValue} index={0}>
              <Stepper activeStep={activeStep} orientation="vertical">
                  {/* === ШАГ 1: ИНФОРМАЦИЯ О СДЕЛКЕ === */}
                  <Step>
                    <StepLabel onClick={() => setActiveStep(0)} sx={{cursor: 'pointer'}}>{t('pages.deals.step_info')}</StepLabel>
                    <StepContent>
                      <Grid container spacing={2}>
                          <Grid size={{ xs: 12, sm: 6 }}>
                              <Typography><b>{t('pages.deals.client')}:</b> <MuiLink component={RouterLink} to={`/clients/${deal.client.id}`}>{deal.client.full_name}</MuiLink></Typography>
                              <Typography><b>{t('pages.deals.property')}:</b> {deal.property.property_type} №{deal.property.unit_number}, {deal.property.area} {t('common.sqm')}</Typography>
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                              <Typography><b>{t('pages.deals.booking_start')}:</b> {new Date(deal.booking_start_date).toLocaleString(getDateLocale())}</Typography>
                              <Typography><b>{t('pages.deals.booking_end')}:</b> {new Date(deal.booking_end_date).toLocaleString(getDateLocale())}</Typography>
                          </Grid>
                      </Grid>
                      <Button onClick={() => setActiveStep(1)} variant="contained" sx={{mt: 2}} disabled={isDealReadOnly}>{t('common.next')}</Button>
                    </StepContent>
                  </Step>

                  {/* === ШАГ 2: УСЛОВИЯ СДЕЛКИ === */}
                  <Step>
                    <StepLabel onClick={() => setActiveStep(1)} sx={{cursor: 'pointer'}}>{t('pages.deals.step_terms')}</StepLabel>
                    <StepContent>
                      <form onSubmit={handleSubmit(handleFormSubmit)}>
                        <Grid container spacing={3}>
                          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label={t('pages.deals.initial_price')} value={Number(deal.initial_price).toLocaleString(getDateLocale())} fullWidth InputProps={{ readOnly: true }}/></Grid>
                          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label={t('pages.deals.initial_price_per_sqm')} value={Number(deal.initial_price_per_sqm).toLocaleString(getDateLocale())} fullWidth InputProps={{ readOnly: true }}/></Grid>
                          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label={t('pages.deals.contract_price')} type="number" fullWidth {...register('contract_price')} disabled={isDealReadOnly} /></Grid>
                          <Grid size={{ xs: 12 }}><Button variant="outlined" sx={{mb: 1}} onClick={() => setDiscountModalOpen(true)} disabled={isDealReadOnly}>{t('pages.deals.apply_discounts')}</Button> <Typography component="span">{t('pages.deals.applied')}: {deal.applied_discounts.map(d => `${d.name} (${d.percentage_value}%)`).join(', ') || t('common.none')}</Typography></Grid>
                          <Grid size={{ xs: 12 }}><TextField label={t('pages.deals.deal_notes')} multiline rows={4} fullWidth {...register('notes')} disabled={isDealReadOnly} /></Grid>
                        </Grid>
                        <Stack direction="row" spacing={2} sx={{mt: 2}}>
                          <Button type="submit" variant="contained" disabled={updateDealMutation.isPending || isDealReadOnly}>{t('pages.deals.save_and_schedule')}</Button>
                          <Button onClick={() => setActiveStep(0)} disabled={isDealReadOnly}>{t('common.back')}</Button>
                        </Stack>
                      </form>
                    </StepContent>
                  </Step>

                  {/* === ШАГ 3: ГРАФИК ПЛАТЕЖЕЙ === */}
                  <Step>
                    <StepLabel onClick={() => deal.contract_price && setActiveStep(2)} error={!deal.contract_price} sx={{cursor: 'pointer'}}>{t('pages.deals.step_payments')}</StepLabel>
                    <StepContent>
                       {deal.contract_price ? (
                        <PaymentSchedule
                            dealId={deal.id}
                            contractPrice={Number(deal.contract_price)}
                            existingPayments={deal.payments || []}
                            isDealTerminated={isDealTerminated}
                            isReadOnly={isDealReadOnly}
                        />
                        ) : <Alert severity="warning">{t('pages.deals.save_price_first')}</Alert>}
                      <Stack direction="row" spacing={2} sx={{mt: 2}}>
                          <Button onClick={() => setActiveStep(1)} disabled={isDealReadOnly}>{t('common.back')}</Button>
                          <Button variant="contained" onClick={() => setActiveStep(3)} disabled={!deal.payments || deal.payments.length === 0 || isDealReadOnly}>{t('common.next')}</Button>
                      </Stack>
                    </StepContent>
                  </Step>

                  {/* === ШАГ 4: ДОКУМЕНТЫ === */}
                  <Step>
                    <StepLabel onClick={() => deal.payments?.length > 0 && setActiveStep(3)} error={!deal.payments || deal.payments.length === 0} sx={{cursor: 'pointer'}}>{t('pages.deals.step_documents')}</StepLabel>
                    <StepContent>
                      <form onSubmit={handleSubmit(handleFormSubmit)}>
                          <Typography variant="h6" gutterBottom>{t('pages.deals.contract_data')}</Typography>
                          <Grid container spacing={2} sx={{mb: 2}}>
                              <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={t('pages.deals.contract_number')} {...register('contract_number')} disabled={isDealReadOnly} /></Grid>
                              <Grid size={{ xs: 12, md: 6 }}>
                                <Controller name="contract_date" control={control} render={({ field }) => (
                                  <LocalizedDateField
                                    label={t('pages.deals.contract_date')}
                                    value={field.value || null}
                                    onChange={(date) => field.onChange(date || '')}
                                    fullWidth
                                    disabled={isDealReadOnly}
                                  />
                                )}/>
                              </Grid>
                          </Grid>
                          <Divider sx={{my: 3}}/>

                          <Typography variant="h6" gutterBottom>{t('pages.deals.generation')}</Typography>
                          {deal.contract_number && deal.contract_date ? (<DocumentGeneration deal={deal} />) : (<Alert severity="info">{t('pages.deals.save_contract_first')}</Alert>)}

                          {deal.contract_number && deal.contract_date && (
                              <>
                                  <Divider sx={{my: 3}}/>
                                  <Typography variant="h6" gutterBottom>{t('pages.deals.signed_documents')}</Typography>
                                  {deal.signed_document_scan && (<Alert severity="success" sx={{mb: 2}}>{t('pages.deals.signed_uploaded')} <MuiLink href={deal.signed_document_scan} target="_blank" rel="noopener noreferrer">{t('common.view')}</MuiLink></Alert>)}
                                  <Grid container spacing={2} sx={{mb: 2}}>
                                      <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={t('pages.deals.upload_scan')} type="file" InputLabelProps={{ shrink: true }} {...register('signed_document_scan')} disabled={isDealReadOnly} /></Grid>
                                      <Grid size={{ xs: 12, md: 4 }}>
                                        <Controller name="client_signature_date" control={control} render={({ field }) => (
                                          <LocalizedDateField
                                            label={t('pages.deals.client_signature_date')}
                                            value={field.value || null}
                                            onChange={(date) => field.onChange(date || '')}
                                            fullWidth
                                            disabled={isDealReadOnly}
                                          />
                                        )}/>
                                      </Grid>
                                      <Grid size={{ xs: 12, md: 4 }}>
                                        <Controller name="company_signature_date" control={control} render={({ field }) => (
                                          <LocalizedDateField
                                            label={t('pages.deals.company_signature_date')}
                                            value={field.value || null}
                                            onChange={(date) => field.onChange(date || '')}
                                            fullWidth
                                            disabled={isDealReadOnly}
                                          />
                                        )}/>
                                      </Grid>
                                  </Grid>
                              </>
                          )}
                          <Stack direction="row" spacing={2} sx={{mt: 2}}>
                             <Button type="submit" variant="contained" disabled={updateDealMutation.isPending || isDealReadOnly}>{updateDealMutation.isPending ? t('common.saving') : t('common.save_data')}</Button>
                             <Button onClick={() => setActiveStep(2)} disabled={isDealReadOnly}>{t('common.back')}</Button>
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
                                  {new Date(log.created_at).toLocaleString(getDateLocale())} - {log.user || t('common.system')}
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
              onSuccess={async () => {
                  setCancellationModalOpen(false);
                  await queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
                  await queryClient.refetchQueries({ queryKey: ['deal', dealId] });
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

