import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogTitle, DialogContent, Typography, Box, TextField, Button,
  Stack, CircularProgress, MobileStepper, Paper, Grid, Divider, Alert,
  Link as MuiLink
} from '@mui/material';
import { useForm } from 'react-hook-form';
import type { Property } from '../../api/buildings';
import { updateProperty } from '../../api/properties';
import { createDeal } from '../../api/deals';
import { createBooking, getPropertyBookingQueue } from '../../api/bookings';
import type { BookingPayload } from '../../api/bookings';
import BookingForm from '../deals/BookingForm';
import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';
import ImageNotSupportedOutlinedIcon from '@mui/icons-material/ImageNotSupportedOutlined';
import { getMediaUrl } from '../../utils/media';
import { convertAmount, formatMoney, formatRate, crossRate } from '../../utils/currency';
import { getCurrencySettings, getCurrentRates } from '../../api/currency';
import InstallmentCalculator from '../installments/InstallmentCalculator';
import { useAuthStore } from '../../store/authStore';
import { hasPermission } from '../../utils/permissions';
import { extractApiError } from '../../utils/apiError';
import { getDateLocale } from '../../utils/dateLocale';

interface ModalProps {
  property: Property | null;
  buildingId: number;
  /** Для шапки расчёта рассрочки */
  buildingName?: string;
  projectName?: string;
  open: boolean;
  onClose: () => void;
}

export default function PropertyDetailModal({ property, buildingId, buildingName, projectName, open, onClose }: ModalProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isBookingModalOpen, setBookingModalOpen] = useState(false);
  const [isInstallmentOpen, setInstallmentOpen] = useState(false);
  const { user } = useAuthStore();
  const canViewBookings = hasPermission(user, 'VIEW', 'BOOKING');
  const canAddBooking = hasPermission(user, 'ADD', 'BOOKING');
  const canAddDeal = hasPermission(user, 'ADD', 'DEAL');

  // Рассрочку считаем в валюте сделок компании: цена из прайса пересчитывается
  // по сегодняшнему курсу так же, как при брони
  const { data: currencySettings } = useQuery({
    queryKey: ['currencySettings', null],
    queryFn: () => getCurrencySettings(),
    enabled: isInstallmentOpen,
  });
  const priceCurrency = property?.price_currency || currencySettings?.deal_currency || '';
  const dealCurrency = currencySettings?.deal_currency || priceCurrency;
  const { data: rates } = useQuery({
    queryKey: ['exchangeRates', 'current', null, [priceCurrency, dealCurrency]],
    queryFn: () => getCurrentRates({ currencies: [priceCurrency, dealCurrency] }),
    enabled: isInstallmentOpen && Boolean(priceCurrency) && priceCurrency !== dealCurrency,
  });
  const convertedPrice = property && priceCurrency !== dealCurrency
    ? convertAmount(Number(property.price), priceCurrency, dealCurrency, rates?.rates)
    : null;
  const calcCurrency = convertedPrice !== null ? dealCurrency : priceCurrency;
  const calcPrice = property ? (convertedPrice ?? Number(property.price)) : null;
  const calcNote = property && priceCurrency !== dealCurrency
    ? (convertedPrice !== null
      ? t('installments.converted_note', {
          catalog: formatMoney(property.price, priceCurrency, i18n.language),
          rate: formatRate(crossRate(rates?.rates, priceCurrency, dealCurrency), i18n.language),
        })
      : t('installments.no_rate', { currency: priceCurrency }))
    : null;
  // Очередь броней объекта: менеджер должен видеть, до какого числа объект
  // занят и сколько человек стоит за ним. Расчётные даты считает сервер
  const { data: queue } = useQuery({
    queryKey: ['propertyBookingQueue', property?.id],
    queryFn: () => getPropertyBookingQueue(property!.id),
    enabled: open && Boolean(property?.id) && canViewBookings,
  });

  const { register, handleSubmit, setValue } = useForm<{ description: string }>();

  const [activeStep, setActiveStep] = useState(0);

  const layoutImages = useMemo(() => {
    if (!property?.layout) return [];
    const images = [
      getMediaUrl(property.layout.main_layout_image),
      getMediaUrl(property.layout.extra_layout_image),
      getMediaUrl(property.layout.floor_plan_image),
      getMediaUrl(property.layout.usp_image),
    ];
    return images.filter(Boolean) as string[];
  }, [property]);

  const maxSteps = layoutImages.length;

  useEffect(() => {
    if (open) {
      setActiveStep(0);
      setValue('description', property?.description || '');
    }
  }, [property, open, setValue]);

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const updatePropMutation = useMutation({
    mutationFn: updateProperty,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['building', String(buildingId)] });
      onClose();
    },
    // Например, нет права ставить и снимать резерв — раньше кнопка молчала
    onError: (error: unknown) => alert(extractApiError(error, t('errors.update_error'))),
  });

  const refreshBuilding = () => {
      queryClient.invalidateQueries({ queryKey: ['building', String(buildingId)] });
      queryClient.invalidateQueries({ queryKey: ['propertyBookingQueue'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
  };

  // Бронь — отдельная запись: по свободному объекту она становится
  // действующей сразу, по занятому встаёт в конец очереди
  const createBookingMutation = useMutation({
      mutationFn: createBooking,
      onSuccess: (data) => {
          refreshBuilding();
          setBookingModalOpen(false);
          onClose();
          navigate(`/bookings/${data.id}`);
      },
      // Объект успели поставить в резерв, срок короче минимального,
      // не задан счёт для взноса и т.п.
      onError: (error: unknown) => {
          refreshBuilding();
          alert(extractApiError(error, t('errors.error_occurred')));
      },
  });

  // Сделка оформляется по действующей брони: цена берётся из брони
  const createDealMutation = useMutation({
      mutationFn: createDeal,
      onSuccess: (data) => {
          refreshBuilding();
          onClose();
          navigate(`/deals/${data.id}`);
      },
      onError: (error: unknown) => {
          refreshBuilding();
          alert(extractApiError(error, t('errors.error_occurred')));
      },
  });

  // Резерв ставит и снимает только тот, кто может изменять объекты
  const canManageReserve = hasPermission(user, 'EDIT', 'PROPERTY');

  const handleStatusChange = (status: 'SELECTION' | 'RESERVE') => {
    if (!property) return;
    updatePropMutation.mutate({ buildingId, propertyId: property.id, payload: { status } });
  };

  const onCommentSave = (data: { description: string }) => {
    if (!property) return;
    updatePropMutation.mutate({ buildingId, propertyId: property.id, payload: { description: data.description } });
  };

  const onBookingSubmit = (data: BookingPayload) => {
      if (!property) return;
      createBookingMutation.mutate({ ...data, property: property.id });
  };

  if (!property) return null;

  return (
    <>
      <Dialog open={open && !isBookingModalOpen} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogTitle>{t('pages.properties.property_number', { number: property.unit_number })} ({t(`property_types.${property.property_type}`)})</DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ mt: 1 }}>

            <Grid item xs={12} md={6}>
                {maxSteps > 0 ? (
                    <Box sx={{ flexGrow: 1 }}>
                        <Paper
                            square
                            elevation={0}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                height: 50,
                                pl: 2,
                                bgcolor: 'background.default',
                            }}
                        >
                            <Typography>{property.layout?.name} {activeStep + 1}/{maxSteps}</Typography>
                        </Paper>
                        <Box
                            component="img"
                            sx={{
                                height: 400,
                                display: 'block',
                                width: '100%',
                                objectFit: 'contain',
                                overflow: 'hidden',
                            }}
                            src={layoutImages[activeStep]}
                            alt={`${t('pages.properties.layout')} ${activeStep + 1}`}
                        />
                        <MobileStepper
                            steps={maxSteps}
                            position="static"
                            activeStep={activeStep}
                            nextButton={
                                <Button size="small" onClick={handleNext} disabled={activeStep === maxSteps - 1}>
                                {t('common.next')} <KeyboardArrowRight />
                                </Button>
                            }
                            backButton={
                                <Button size="small" onClick={handleBack} disabled={activeStep === 0}>
                                <KeyboardArrowLeft /> {t('common.back')}
                                </Button>
                            }
                        />
                    </Box>
                ) : (
                     // Заглушка цветами темы. Раньше здесь была светлая картинка с placehold.co
                     // на светло-сером фоне: в тёмной теме — яркое пятно, без интернета — пусто
                     <Box
                        sx={{
                            height: 400,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 1,
                            width: '100%',
                            borderRadius: 2,
                            bgcolor: 'action.hover',
                            color: 'text.secondary',
                        }}
                    >
                        <ImageNotSupportedOutlinedIcon sx={{ fontSize: 48 }} />
                        <Typography variant="body2">{t('pages.properties.no_image')}</Typography>
                    </Box>
                )}
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="h6">{t('common.details')}</Typography>
              <Stack spacing={1} sx={{mb:2}}>
                <Typography><b>{t('forms.status')}:</b> {t(`statuses.property.${property.status}`)}</Typography>
                <Typography><b>{t('pages.properties.area')}:</b> {property.area} {t('pages.properties.sqm')}</Typography>
                <Typography><b>{t('table.price')}:</b> {formatMoney(property.price, property.price_currency || t('common.currency'), i18n.language)}</Typography>
                <Divider/>
                <Typography><b>{t('pages.properties.floor')}:</b> {property.floor}</Typography>
                <Typography><b>{t('pages.properties.entrance')}:</b> {property.entrance || 'N/A'}</Typography>
                <Typography><b>{t('pages.properties.riser')}:</b> {property.riser || 'N/A'}</Typography>
                <Typography><b>{t('pages.properties.finishing')}:</b> {property.has_finishing ? t('common.yes') : t('common.no')}</Typography>
              </Stack>

              {/* Очередь броней: действующая бронь и те, кто ждёт за ней.
                  Даты броней в очереди расчётные — в базе их нет */}
              {queue && queue.queue.length > 0 && (
                <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    {t('pages.bookings.queue_title')}
                  </Typography>
                  <Stack spacing={0.5}>
                    {queue.queue.map((row) => (
                      <Stack key={row.id} direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography variant="body2" sx={{ minWidth: 28 }}>
                          {row.position === 0 ? '▸' : `${row.position}.`}
                        </Typography>
                        <Typography variant="body2">
                          {row.accessible
                            ? (
                              <MuiLink component={RouterLink} to={`/bookings/${row.id}`} underline="hover">
                                {row.client || `№${row.id}`}
                              </MuiLink>
                            )
                            : t('pages.bookings.other_manager')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {row.start_date && row.end_date
                            ? `${new Date(row.start_date).toLocaleDateString(getDateLocale())} — ${new Date(row.end_date).toLocaleDateString(getDateLocale())}`
                            : t('pages.bookings.waiting_for_deal')}
                          {row.projected ? ` (${t('pages.bookings.projected')})` : ''}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                  {queue.pending_price && (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                      {t('pages.properties.pending_price_note', {
                        price: formatMoney(queue.pending_price, property.price_currency || '', i18n.language),
                      })}
                    </Typography>
                  )}
                </Paper>
              )}

              {/* Занят, а живой сделки и брони нет: ждёт возврата платежей
                  или статус разошёлся с бронями и сделками */}
              {['BOOKING', 'IN_DEAL', 'SOLD'].includes(property.status) && !property.active_deal_id
                && !property.active_booking_id && (
                <Alert
                  severity="warning"
                  sx={{ mt: 2 }}
                  action={property.pending_refund_deal_id ? (
                    <Button color="inherit" size="small" component={RouterLink} to={`/deals/${property.pending_refund_deal_id}`}>
                      {t('pages.properties.open_deal')}
                    </Button>
                  ) : undefined}
                >
                  {property.pending_refund_deal_id
                    ? t('pages.properties.held_by_refund', { id: property.pending_refund_deal_id })
                    : t('pages.properties.status_mismatch')}
                </Alert>
              )}
              {property.status === 'RESERVE' && !property.active_deal_id && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  {canManageReserve ? t('pages.properties.reserved_notice_manager') : t('pages.properties.reserved_notice')}
                </Alert>
              )}
              <Stack direction="row" spacing={2} useFlexGap sx={{ mt: 2, mb: 2, flexWrap: 'wrap' }}>
                {property.active_deal_id ? (
                  <Button
                    variant="contained"
                    component={RouterLink}
                    to={`/deals/${property.active_deal_id}`}
                  >
                    {t('pages.properties.go_to_deal')}
                  </Button>
                ) : (
                  <>
                    {property.status === 'SELECTION' && canManageReserve &&
                      <Button variant="contained" onClick={() => handleStatusChange('RESERVE')} disabled={updatePropMutation.isPending}>{t('pages.properties.reserve')}</Button>}
                    {property.status === 'RESERVE' && canManageReserve &&
                      <Button variant="outlined" onClick={() => handleStatusChange('SELECTION')} disabled={updatePropMutation.isPending}>{t('pages.properties.remove_reserve')}</Button>}
                    {/* Объект в резерве не бронирует никто, пока резерв не снят.
                        По занятому объекту бронь встаёт в очередь — кнопка та же */}
                    {property.status !== 'RESERVE' && property.status !== 'SOLD' && canAddBooking &&
                      <Button variant="contained" color="secondary" onClick={() => setBookingModalOpen(true)}>
                        {property.status === 'SELECTION'
                          ? t('pages.properties.book')
                          : t('pages.properties.book_in_queue')}
                      </Button>}
                    {/* Сделка оформляется по действующей брони: её цена
                        зафиксирована в момент брони */}
                    {property.active_booking_id && canAddDeal &&
                      <Button variant="outlined" component={RouterLink} to={`/bookings/${property.active_booking_id}`}>
                        {t('pages.bookings.open_booking')}
                      </Button>}
                  </>
                )}
                {/* Варианты оплаты для клиента — в любом статусе объекта */}
                <Button variant="outlined" onClick={() => setInstallmentOpen(true)}>{t('installments.open_button')}</Button>
              </Stack>

              <Box component="form" onSubmit={handleSubmit(onCommentSave)}>
                <TextField
                  label={t('forms.comment')}
                  fullWidth
                  multiline
                  rows={4}
                  defaultValue={property.description}
                  {...register('description')}
                />
                <Button type="submit" sx={{ mt: 1 }} disabled={updatePropMutation.isPending}>
                  {updatePropMutation.isPending ? <CircularProgress size={24} /> : t('pages.properties.save_comment')}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
      </Dialog>

      <InstallmentCalculator
        open={isInstallmentOpen}
        onClose={() => setInstallmentOpen(false)}
        basePrice={calcPrice}
        currency={calcCurrency}
        discountSource={{ propertyId: property.id }}
        heading={[
          [projectName, buildingName].filter(Boolean).join(', '),
          `${t('installments.unit')} №${property.unit_number}, ${t('pages.properties.floor')} ${property.floor}, ${property.area} ${t('pages.properties.sqm')}`,
        ].filter(Boolean)}
        priceNote={calcNote}
      />

      <Dialog open={isBookingModalOpen} onClose={() => setBookingModalOpen(false)}>
          <DialogTitle>{t('pages.properties.book_property', { number: property.unit_number })}</DialogTitle>
          <DialogContent>
              <BookingForm
                onSubmit={onBookingSubmit}
                isPending={createBookingMutation.isPending}
                occupied={Boolean(queue && (queue.live_deal_id || queue.queue.length > 0))}
                queueLength={queue?.queue.length || 0}
              />
          </DialogContent>
      </Dialog>
    </>
  );
}