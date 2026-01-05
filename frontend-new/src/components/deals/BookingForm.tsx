// src/components/deals/BookingForm.tsx
import { useForm, Controller } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getClients } from '../../api/clients';
import type { Client } from '../../api/clients';
import type { DealPayload } from '../../api/deals';
import { Box, Button, Stack, Autocomplete, TextField } from '@mui/material';
import LocalizedDateField from '../common/LocalizedDateField';

interface BookingFormProps {
  onSubmit: (data: DealPayload) => void;
  isPending: boolean;
}

export default function BookingForm({ onSubmit, isPending }: BookingFormProps) {
  const { t } = useTranslation();
  const { handleSubmit, control } = useForm<DealPayload>();
  const { data: clients, isLoading: isLoadingClients } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: () => getClients(),
  });

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
              onChange={(_, data) => field.onChange(data?.id)}
              renderInput={(params) => <TextField {...params} label={t('pages.deals.client')} required />}
            />
          )}
        />
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