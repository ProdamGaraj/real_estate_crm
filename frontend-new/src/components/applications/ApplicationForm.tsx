// src/components/applications/ApplicationForm.tsx

import { useForm, Controller } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getClients } from '../../api/clients';
import type { Client } from '../../api/clients';// Нам нужен список клиентов
import { createApplication } from '../../api/applications';
import type { ApplicationPayload } from '../../api/applications';
import {
  Box, Button, TextField, Stack, Autocomplete, CircularProgress,
  FormControl, InputLabel, Select, MenuItem
} from '@mui/material';

interface ApplicationFormProps {
  onSuccess: () => void;
}

export default function ApplicationForm({ onSuccess }: ApplicationFormProps) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<ApplicationPayload>({
    defaultValues: {
      source: 'OFFICE',
    }
  });

  // Запрос на получение списка клиентов для выпадающего списка
  const { data: clients, isLoading: isLoadingClients } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: getClients,
  });

  const mutation = useMutation({
    mutationFn: createApplication,
    onSuccess,
  });

  const onSubmit = (data: ApplicationPayload) => {
    mutation.mutate(data);
  };

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 1 }}>
      <Stack spacing={3}>
        <Controller
          name="client_id" // <-- ИЗМЕНЕНИЕ ЗДЕСЬ
          control={control}
          rules={{ required: 'Необходимо выбрать клиента' }}
          render={({ field }) => (
            <Autocomplete
              {...field}
              options={clients || []}
              loading={isLoadingClients}
              getOptionLabel={(option) => option.full_name}
              onChange={(_, data) => field.onChange(data?.id)} // Передаем только ID
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Клиент"
                  required
                  error={!!errors.client}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {isLoadingClients ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
          )}
        />
        {/* TODO: Добавить остальные поля (статус, интересы и т.д.) */}

        <Button type="submit" variant="contained" disabled={mutation.isPending}>
          Создать заявку
        </Button>
      </Stack>
    </Box>
  );
}