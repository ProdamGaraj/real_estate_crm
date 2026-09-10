// src/components/deals/BookingForm.tsx
import { useForm, Controller } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getClients } from '../../api/clients';
import { getApplications } from '../../api/applications';
import type { Client } from '../../api/clients';
import type { Application } from '../../api/applications';
import type { DealPayload } from '../../api/deals';
import { Box, Button, Stack, Autocomplete, TextField } from '@mui/material';
import LocalizedDateField from '../common/LocalizedDateField';

interface BookingFormProps {
  onSubmit: (data: DealPayload) => void;
  isPending: boolean;
}

export default function BookingForm({ onSubmit, isPending }: BookingFormProps) {
  const { t } = useTranslation();
  const { handleSubmit, control, watch, setValue } = useForm<DealPayload>();
  const { data: clients, isLoading: isLoadingClients } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: () => getClients(),
  });

  // Заявки выбранного клиента: сделка, созданная из заявки, закроет её сама
  const clientId = watch('client');
  const { data: applications, isLoading: isLoadingApplications } = useQuery<Application[]>({
    queryKey: ['applications', 'for-booking', clientId],
    queryFn: () => getApplications({ client_id: clientId }),
    enabled: Boolean(clientId),
  });

  const openApplications = (applications || []).filter(
    application => !['CLOSED_WON', 'CLOSED_LOST', 'JUNK', 'REJECTED'].includes(application.status)
  );

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 1 }}>
      <Stack spacing={2}>
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
          name="booking_end_date"
          control={control}
          rules={{ required: true }}
          render={({ field }) => (
            <LocalizedDateField
              label={t('pages.deals.booking_end_date')}
              value={field.value || null}
              onChange={(date) => field.onChange(date || '')}
            />
          )}
        />
        <Button type="submit" variant="contained" disabled={isPending}>
          {isPending ? t('common.creating') : t('pages.deals.create_deal')}
        </Button>
      </Stack>
    </Box>
  );
}