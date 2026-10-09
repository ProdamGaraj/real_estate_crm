import { useState, useEffect, useMemo } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { getDealById, updateDeal, updateDealTerms } from '../api/deals';
import type { DealUpdatePayload, Deal } from '../api/deals';
import DiscountsModal from '../components/deals/DiscountsModal';
import PaymentSchedule from '../components/deals/PaymentSchedule';
import DocumentGeneration from '../components/deals/DocumentGeneration';
import HumanizedLog from '../components/logs/HumanizedLog';
import DealCancellationModal from '../components/deals/DealCancellationModal';
import LocalizedDateField from '../components/common/LocalizedDateField';
import { useIsMobile } from '../hooks/useMobile';

import {
  Typography, CircularProgress, Alert, Paper, Grid, Box, TextField, Button,
  Divider, Link as MuiLink, Stack, Stepper, Step, StepLabel, StepContent, Tabs, Tab, MenuItem
} from '@mui/material';
import { Timeline, TimelineItem, TimelineSeparator, TimelineConnector, TimelineContent, TimelineDot } from '@mui/lab';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { extractApiError } from '../utils/apiError';
import { formatMoney, formatRate } from '../utils/currency';
import InstallmentCalculator from '../components/installments/InstallmentCalculator';
import type { ScheduleOptions } from '../components/installments/InstallmentCalculator';
import { useAuthStore } from '../store/authStore';
import { hasPermission } from '../utils/permissions';
import type { InstallmentVariant } from '../utils/installments';
import { comparePlans, isPlan } from '../utils/installments';
import { createPaymentSchedule, getPaymentTypes } from '../api/finances';

type DealFormInputs = Pick<DealUpdatePayload, 'contract_price' | 'notes' | 'contract_number' | 'contract_date' | 'client_signature_date' | 'company_signature_date'> & {
  signed_document_scan?: FileList;
};

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
      {value === index && <Box sx={{ p: isMobile ? 1 : 2 }}>{children}</Box>}
    </div>
  );
}


export default function DealDetailPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();

  const [isDiscountModalOpen, setDiscountModalOpen] = useState(false);
  const [mainTabValue, setMainTabValue] = useState(0); // Для главных вкладок
  const [activeStep, setActiveStep] = useState(0); // Для шагов внутри степпера
  const [isInitialized, setIsInitialized] = useState(false);
  const [isCancellationModalOpen, setCancellationModalOpen] = useState(false);
  const [isInstallmentOpen, setInstallmentOpen] = useState(false);
  const { user } = useAuthStore();

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
      // Автоматически переходим к графику платежей если цена сохранена
      if (updatedDeal.contract_price && activeStep === 1) {
        setActiveStep(2);
      }
    },
    onError: (error: unknown) => {
        alert(extractApiError(error, t('errors.update_error')));
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

  // График по условиям рассрочки: стоимость по договору — цена выбранного
  // варианта, строки — его платежи. Дальше график правится вручную, как обычно
  // Планы оплаты — типы платежей с заданным планом; в сделке — планы её компании и общие
  const { data: paymentTypes } = useQuery({ queryKey: ['paymentTypes'], queryFn: getPaymentTypes });

  // План оплаты сделки сохраняется сразу: от него зависят доступные скидки
  const planMutation = useMutation({
    mutationFn: (planId: number | null) => updateDealTerms({ id: Number(dealId), terms: { payment_plan: planId } }),
    onSuccess: (updatedDeal) => queryClient.setQueryData(['deal', dealId], updatedDeal),
    // Например, применена скидка «только для 100% оплаты», а выбран другой план
    onError: (error: unknown) => alert(extractApiError(error, t('errors.update_error'))),
  });

  const installmentMutation = useMutation({
    mutationFn: async ({ variant, options }: { variant: InstallmentVariant; options: ScheduleOptions }) => {
      // Скидки → цена → план: в сделку записываются план, действующие при нём
      // скидки и цена со скидками, затем — график этой цены
      const previous = {
        payment_plan: deal!.payment_plan,
        applied_discounts_ids: deal!.applied_discounts.map(d => d.id),
        contract_price: deal!.contract_price === null ? null : Number(deal!.contract_price),
      };
      await updateDealTerms({
        id: Number(dealId),
        terms: { payment_plan: variant.plan.id, applied_discounts_ids: options.discountIds, contract_price: variant.price },
      });
      try {
        await createPaymentSchedule({
          dealId: Number(dealId),
          payments: variant.rows.map(row => ({
            amount: row.amount,
            due_date: row.date,
            // Все платежи графика — с типом выбранного плана («Рассрочка на 12 месяцев»)
            payment_type_id: variant.plan.id,
            beneficiary_account_id: options.accountId,
            currency: deal!.currency,
            method: 'CASHLESS' as const,
          })),
        });
      } catch (error) {
        // Условия уже сменились, а график не сохранился — возвращаем прежние,
        // чтобы сделка не осталась с ценой варианта без графика
        try {
          await updateDealTerms({ id: Number(dealId), terms: previous });
        } catch {
          // Пользователю важнее исходная причина отказа
        }
        throw error;
      }
      return variant;
    },
    onSuccess: (variant) => {
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
      setInstallmentOpen(false);
      setActiveStep(2);
      alert(t('installments.created', { price: formatMoney(variant.price, deal?.currency, i18n.language) }));
    },
    onError: (error: unknown) => {
      // Стоимость по договору могла уже сохраниться — перечитываем сделку
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
      alert(extractApiError(error, t('finances.error_prefix')));
    },
  });

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

  // Карточку видят шире, чем могут менять: сделку коллеги по отделу можно открыть,
  // а изменить или отменить — нет. Без этого кнопки отвечали отказом сервера
  const canEditDeal = deal.can_edit !== false;
  const isDealReadOnly = ['CLOSED_WON', 'CANCELLED', 'TERMINATED'].includes(deal.status) || !canEditDeal;
  const isDealTerminated = deal.status === 'TERMINATED';
  const plans = (paymentTypes ?? [])
    .filter(isPlan)
    .filter(plan => plan.company === null || !deal.company || plan.company === deal.company)
    .sort(comparePlans);
  const canBuildSchedule = hasPermission(user, 'EDIT', 'DEAL') && hasPermission(user, 'ADD', 'PAYMENT');
  const installmentBlockReason = !canEditDeal
    ? t('installments.no_rights')
    : isDealReadOnly
    ? t('installments.deal_read_only')
    : (deal.payments?.length ?? 0) > 0 ? t('installments.schedule_exists')
      : !canBuildSchedule ? t('installments.no_rights') : null;
  // Кнопка расторжения доступна для сделок в работе и успешно закрытых (но не для уже отменённых/расторгнутых)
  const canTerminateDeal = !['CANCELLED', 'TERMINATED'].includes(deal.status) && canEditDeal;

  return (
    <>
      <Stack 
        direction={isMobile ? 'column' : 'row'} 
        justifyContent="space-between" 
        alignItems={isMobile ? 'stretch' : 'center'} 
        spacing={isMobile ? 1 : 2}
        sx={{ mb: 2 }}
      >
        <Typography variant={isMobile ? 'h5' : 'h4'}>{t('pages.deals.deal_title', { id: deal.id, status: t(`statuses.deal.${deal.status}`) })}</Typography>
        {canTerminateDeal && (
            <Button
                variant="outlined"
                color="error"
                startIcon={<ErrorOutlineIcon />}
                onClick={() => setCancellationModalOpen(true)}
                size={isMobile ? 'small' : 'medium'}
                fullWidth={isMobile}
            >
                {t('pages.deals.cancel_terminate')}
            </Button>
        )}
      </Stack>
      {!canEditDeal && !['CANCELLED', 'TERMINATED'].includes(deal.status) && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('pages.deals.view_only', { author: deal.created_by || '—' })}
        </Alert>
      )}
      {/* --- НОВЫЙ БЛОК ИНФОРМАЦИИ --- */}
            {(deal.status === 'CANCELLED' || deal.status === 'TERMINATED') && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    <Typography fontWeight="bold">{t('pages.deals.deal_closed', { status: deal.status === 'CANCELLED' ? t('pages.deals.cancelled') : t('pages.deals.terminated') })}</Typography>
                    {deal.status === 'CANCELLED' && <Typography variant={isMobile ? 'body2' : 'body1'}>{t('pages.deals.reason')}: {deal.cancellation_reason}</Typography>}
                    {deal.status === 'TERMINATED' && (
                        <>
                            <Typography variant={isMobile ? 'body2' : 'body1'}>{t('pages.deals.termination_date')}: {deal.termination_date}</Typography>
                            {deal.termination_document_scan && (
                                <Typography variant={isMobile ? 'body2' : 'body1'}>
                                    {t('pages.deals.termination_document')}: <MuiLink href={deal.termination_document_scan} target="_blank" rel="noopener noreferrer">{t('common.view')}</MuiLink>
                                </Typography>
                            )}
                        </>
                    )}
                </Alert>
            )}

        <Paper>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs 
                value={mainTabValue} 
                onChange={(_, newValue) => setMainTabValue(newValue)}
                variant={isMobile ? 'fullWidth' : 'standard'}
              >
                  <Tab label={t('pages.deals.deal_steps')} />
                  <Tab label={isMobile ? `${deal.logs_total ?? deal.logs?.length ?? 0}` : `${t('pages.deals.logs_tab')} (${deal.logs_total ?? deal.logs?.length ?? 0})`} />
              </Tabs>
          </Box>

          {/* ПАНЕЛЬ 1: ШАГИ СДЕЛКИ */}
          <TabPanel value={mainTabValue} index={0} isMobile={isMobile}>
              <Stepper activeStep={activeStep} orientation="vertical">
                  {/* === ШАГ 1: ИНФОРМАЦИЯ О СДЕЛКЕ === */}
                  <Step>
                    <StepLabel onClick={() => setActiveStep(0)} sx={{cursor: 'pointer'}}>{t('pages.deals.step_info')}</StepLabel>
                    <StepContent>
                      <Grid container spacing={isMobile ? 1 : 2}>
                          <Grid size={{ xs: 12, sm: 6 }}>
                              <Typography variant={isMobile ? 'body2' : 'body1'}><b>{t('pages.deals.client')}:</b> <MuiLink component={RouterLink} to={`/clients/${deal.client.id}`}>{deal.client.full_name}</MuiLink></Typography>
                              <Typography variant={isMobile ? 'body2' : 'body1'}><b>{t('pages.deals.property')}:</b> {deal.property.property_type} №{deal.property.unit_number}, {deal.property.area} {t('common.sqm')}</Typography>
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                              <Typography variant={isMobile ? 'body2' : 'body1'}><b>{t('pages.deals.booking_start')}:</b> {new Date(deal.booking_start_date).toLocaleString(getDateLocale())}</Typography>
                              <Typography variant={isMobile ? 'body2' : 'body1'}><b>{t('pages.deals.booking_end')}:</b> {new Date(deal.booking_end_date).toLocaleString(getDateLocale())}</Typography>
                          </Grid>
                      </Grid>
                      <Button onClick={() => setActiveStep(1)} variant="contained" sx={{mt: 2}} disabled={isDealReadOnly} size={isMobile ? 'small' : 'medium'}>{t('common.next')}</Button>
                    </StepContent>
                  </Step>

                  {/* === ШАГ 2: УСЛОВИЯ СДЕЛКИ === */}
                  <Step>
                    <StepLabel onClick={() => setActiveStep(1)} sx={{cursor: 'pointer'}}>{t('pages.deals.step_terms')}</StepLabel>
                    <StepContent>
                      <form onSubmit={handleSubmit(handleFormSubmit)}>
                        <Grid container spacing={3}>
                          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label={t('pages.deals.initial_price')} value={formatMoney(deal.initial_price, deal.currency, i18n.language)} fullWidth InputProps={{ readOnly: true }}/></Grid>
                          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label={t('pages.deals.initial_price_per_sqm')} value={formatMoney(deal.initial_price_per_sqm, deal.currency, i18n.language)} fullWidth InputProps={{ readOnly: true }}/></Grid>
                          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label={`${t('pages.deals.contract_price')}, ${deal.currency}`} type="number" fullWidth {...register('contract_price')} disabled={isDealReadOnly} /></Grid>
                          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                            {/* Валюта сделки задаётся настройкой компании при брони и не меняется:
                                в ней цена, договор и весь график платежей */}
                            <TextField
                              label={t('finances.currency_label')}
                              fullWidth
                              value={deal.currency}
                              InputProps={{ readOnly: true }}
                              helperText={t('pages.deals.currency_fixed_hint')}
                            />
                          </Grid>
                          {deal.catalog_currency && deal.catalog_currency !== deal.currency && (
                            <Grid size={{ xs: 12 }}>
                              {/* Прайс проекта в другой валюте: показываем, из чего получена цена сделки */}
                              <Alert severity="info">
                                {t('pages.deals.catalog_conversion', {
                                  catalog: formatMoney(deal.catalog_price, deal.catalog_currency, i18n.language),
                                  rate: formatRate(deal.catalog_rate, i18n.language),
                                  price: formatMoney(deal.initial_price, deal.currency, i18n.language),
                                })}
                              </Alert>
                            </Grid>
                          )}
                          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                            {/* План оплаты: от него зависят скидки «только для планов»; дальше скидки дают цену, а план делит её на платежи */}
                            <TextField
                              select
                              fullWidth
                              label={t('pages.deals.payment_plan')}
                              value={deal.payment_plan ?? ''}
                              onChange={(e) => planMutation.mutate(e.target.value === '' ? null : Number(e.target.value))}
                              disabled={isDealReadOnly || planMutation.isPending}
                              helperText={t('pages.deals.payment_plan_hint')}
                              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                            >
                              <MenuItem value="">{t('pages.deals.no_plan')}</MenuItem>
                              {plans.map(plan => <MenuItem key={plan.id} value={plan.id}>{plan.name}</MenuItem>)}
                              {/* План сделки мог перестать быть планом или уйти из списка — показываем его, чтобы поле не опустело */}
                              {deal.payment_plan && !plans.some(plan => plan.id === deal.payment_plan) && (
                                <MenuItem value={deal.payment_plan}>{deal.payment_plan_name}</MenuItem>
                              )}
                            </TextField>
                          </Grid>
                          <Grid size={{ xs: 12 }}><Button variant="outlined" sx={{mb: 1}} onClick={() => setDiscountModalOpen(true)} disabled={isDealReadOnly}>{t('pages.deals.apply_discounts')}</Button> <Button variant="outlined" sx={{mb: 1}} onClick={() => setInstallmentOpen(true)}>{t('installments.open_button')}</Button> <Typography component="span">{t('pages.deals.applied')} {deal.applied_discounts.map(d => `${d.name} (${d.percentage_value}%)`).join(', ') || t('common.none')}</Typography></Grid>
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
                       {!installmentBlockReason && (
                        <Button variant="outlined" sx={{ mb: 2 }} onClick={() => setInstallmentOpen(true)}>
                          {t('installments.create_from_terms')}
                        </Button>
                       )}
                       {deal.contract_price ? (
                        <PaymentSchedule
                            dealId={deal.id}
                            contractPrice={Number(deal.contract_price)}
                            dealCurrency={deal.currency}
                            dealCompanyId={deal.company}
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
          <TabPanel value={mainTabValue} index={1} isMobile={isMobile}>
              <Timeline>
                  {deal.logs?.map((log) => (
                      <TimelineItem key={log.id}>
                          <TimelineSeparator>
                              <TimelineDot color="grey" />
                              <TimelineConnector />
                          </TimelineSeparator>
                          <TimelineContent sx={{ py: isMobile ? '8px' : '12px', px: isMobile ? 1 : 2 }}>
                              <Typography variant={isMobile ? 'caption' : 'body2'} color="text.secondary">
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

      <InstallmentCalculator
        open={isInstallmentOpen}
        onClose={() => setInstallmentOpen(false)}
        basePrice={Number(deal.initial_price) || null}
        currency={deal.currency}
        discountSource={{ dealId: deal.id }}
        appliedDiscounts={deal.applied_discounts}
        preferredPlanId={deal.payment_plan}
        heading={[
          `${t('pages.deals.client')}: ${deal.client.full_name}`,
          `${t('pages.deals.property')}: ${t(`property_types.${deal.property.property_type}`)} №${deal.property.unit_number}, ${deal.property.area} ${t('common.sqm')}`,
        ]}
        priceNote={deal.catalog_currency && deal.catalog_currency !== deal.currency
          ? t('installments.converted_note', {
              catalog: formatMoney(deal.catalog_price, deal.catalog_currency, i18n.language),
              rate: formatRate(deal.catalog_rate, i18n.language),
            })
          : null}
        companyId={deal.company}
        onCreateSchedule={(variant, options) => installmentMutation.mutate({ variant, options })}
        createDisabledReason={installmentBlockReason}
        currentContractPrice={deal.contract_price ? Number(deal.contract_price) : null}
        isCreating={installmentMutation.isPending}
      />

      {isDiscountModalOpen && (
        <DiscountsModal
            open={isDiscountModalOpen}
            dealId={Number(dealId)}
            basePrice={Number(deal.initial_price)}
            appliedDiscountIds={deal.applied_discounts.map(d => d.id)}
            dealPlanId={deal.payment_plan}
            onClose={() => setDiscountModalOpen(false)}
            onSave={handleDiscountsSave}
        />
      )}
    </>
  );
}

