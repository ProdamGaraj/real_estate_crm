// src/components/deals/BookingForm.tsx
import { useForm, Controller } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getClients } from '../../api/clients';
import { getApplications } from '../../api/applications';
import { getBookingSettings } from '../../api/bookings';
import type { Client } from '../../api/clients';
import type { Application } from '../../api/applications';
import type { BookingPayload } from '../../api/bookings';
import { Alert, Box, Button, Stack, Autocomplete, TextField } from '@mui/material';
import { formatMoney } from '../../utils/currency';

interface BookingFormProps {
  onSubmit: (data: BookingPayload) => void;
  isPending: boolean;
  /** Объект занят: бронь встанет в конец очереди — предупреждаем заранее */
  queueLength?: number;
  occupied?: boolean;
}

/**
 * Оформление брони: клиент, заявка и срок **в днях**.
 *
 * Даты здесь не вводят: бронь оформляется на срок, а фактические даты
 * записываются в момент её активации. Бронь при занятом объекте встаёт
 * в конец очереди, и её даты до активации неизвестны.
 */
export default function BookingForm({ onSubmit, isPending, queueLength = 0, occupied = false }: BookingFormProps) {
  const { t, i18n } = useTranslation();
  const { data: settings } = useQuery({ queryKey: ['bookingSettings'], queryFn: getBookingSettings });
  const minDays = settings?.min_booking_days || 1;
  const { handleSubmit, control, watch, setValue, formState: { errors } } = useForm<BookingPayload>({
    defaultValues: { duration_days: minDays },
  });
  const { data: clients, isLoading: isLoadingClients } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: () => getClients(),
  });

  // Заявки выбранного клиента: сделка, выросшая из заявки, закроет её сама
  const clientId = watch('client');
  const { data: applications, isLoading: isLoadingApplications } = useQuery<Application[]>({
    queryKey: ['applications', 'for-booking', clientId],
    queryFn: () => getApplications({ client_id: clientId }),
    enabled: Boolean(clientId),
  });

  const openApplications = (applications || []).filter(
    application => !['CLOSED_WON', 'CLOSED_LOST', 'JUNK', 'REJECTED'].includes(application.status)
  );

  const fee = Number(settings?.booking_fee_amount || 0);

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 1 }}>
      <Stack spacing={2}>
        {occupied && (
          <Alert severity="info">
            {t('pages.bookings.will_queue', { position: queueLength + 1 })}
          </Alert>
        )}
        <Controller
          name="client"
          control={control}
          rules={{ required: true }}
          render={({ field }) => (
            <Autocomplete
              options={clients || []}
              loading={isLoadingClients}
              getOptionLabel={(option) => `${option.full_name} (${option.primary_phone_number || ''})`}
              onChange={(_, data) => {
                field.onChange(data?.id);
                // Заявка относится к клиенту, поэтому при его смене выбор сбрасываем
                setValue('application', null);
              }}
              renderInput={(params) => <TextField {...params} label={t('pages.deals.client')} required />}
            />
          )}
        />
        {clientId && openApplications.length > 0 && (
          <Controller
            name="application"
            control={control}
            render={({ field }) => (
              <Autocomplete
                options={openApplications}
                loading={isLoadingApplications}
                getOptionLabel={(option) => `№${option.id} · ${option.source}`}
                value={openApplications.find(a => a.id === field.value) || null}
                onChange={(_, data) => field.onChange(data?.id ?? null)}
                renderInput={(params) => (
                  <TextField {...params} label={t('pages.deals.application_optional')} />
                )}
              />
            )}
          />
        )}
        <Controller
          name="duration_days"
          control={control}
          rules={{ required: true, min: minDays }}
          render={({ field }) => (
            <TextField
              {...field}
              type="number"
              required
              label={t('pages.bookings.duration_days')}
              helperText={errors.duration_days
                ? t('pages.bookings.min_days_error', { days: minDays })
                : t('pages.bookings.min_days_hint', { days: minDays })}
              error={Boolean(errors.duration_days)}
              inputProps={{ min: minDays, step: 1 }}
              onChange={(event) => field.onChange(Number(event.target.value))}
            />
          )}
        />
        {fee > 0 && (
          <Alert severity="info">
            {t('pages.bookings.fee_notice', {
              amount: formatMoney(fee, settings?.booking_fee_currency || '', i18n.language),
            })}
          </Alert>
        )}
        <Button type="submit" variant="contained" disabled={isPending}>
          {isPending ? t('common.creating') : t('pages.bookings.create')}
        </Button>
      </Stack>
    </Box>
  );
}
