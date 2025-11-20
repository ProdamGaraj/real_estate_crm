// src/components/deals/BookingForm.tsx
import { useForm, Controller } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { getClients } from '../../api/clients';
import type { Client } from '../../api/clients';
import type { DealPayload } from '../../api/deals';
import { Box, Button, TextField, Stack, Autocomplete, CircularProgress } from '@mui/material';

interface BookingFormProps {
  onSubmit: (data: DealPayload) => void;
  isPending: boolean;
}

export default function BookingForm({ onSubmit, isPending }: BookingFormProps) {
  const { handleSubmit, control } = useForm<DealPayload>();
  const { data: clients, isLoading: isLoadingClients } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: getClients,
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
              getOptionLabel={(option) => `${option.full_name} (${option.phone_number})`}
              onChange={(_, data) => field.onChange(data?.id)}
              renderInput={(params) => <TextField {...params} label="Клиент" required />}
            />
          )}
        />
        <Controller
            name="booking_end_date"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
                <TextField
                    {...field}
                    label="Дата окончания брони"
                    type="date"
                    required
                    InputLabelProps={{ shrink: true }}
                />
            )}
        />
        <Button type="submit" variant="contained" disabled={isPending}>
          {isPending ? 'Создание...' : 'Создать сделку'}
        </Button>
      </Stack>
    </Box>
  );
}