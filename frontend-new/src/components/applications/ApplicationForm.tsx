// src/components/applications/ApplicationForm.tsx

import { useForm, Controller } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getClients } from '../../api/clients';
import type { Client } from '../../api/clients';
import { createApplication } from '../../api/applications';
import type { ApplicationPayload } from '../../api/applications';
import { Box, Button, TextField, Stack, Autocomplete, CircularProgress, MenuItem } from '@mui/material';

interface ApplicationFormProps {
  onSuccess: () => void;
}

export default function ApplicationForm({ onSuccess }: ApplicationFormProps) {
  const { t } = useTranslation();
  const { handleSubmit, control, formState: { errors } } = useForm<ApplicationPayload>({
    defaultValues: {
      source: 'OFFICE',
    }
  });

  // Запрос на получение списка клиентов для выпадающего списка
  const { data: clients, isLoading: isLoadingClients } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: () => getClients(),
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
          rules={{ required: t('applications.client_required') }}
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
                  label={t('applications.client')}
                  required
                  error={!!errors.client_id}
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
        {/* Источник обязателен: по нему считается эффективность каналов
            на дашборде. Пока поля не было, каждая заявка записывалась
            как «Офис», и виджет «Источники заявок» ничего не показывал. */}
        <Controller
          name="source"
          control={control}
          rules={{ required: true }}
          render={({ field }) => (
            <TextField {...field} select fullWidth required label={t('applications.source')}>
              <MenuItem value="INTERNET">{t('statuses.application_source.INTERNET')}</MenuItem>
              <MenuItem value="SOCIAL_MEDIA">{t('statuses.application_source.SOCIAL_MEDIA')}</MenuItem>
              <MenuItem value="OFFICE">{t('statuses.application_source.OFFICE')}</MenuItem>
              <MenuItem value="CALL">{t('statuses.application_source.CALL')}</MenuItem>
            </TextField>
          )}
        />

        <Controller
          name="notes"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value ?? ''}
              fullWidth
              multiline
              rows={3}
              label={t('applications.notes')}
            />
          )}
        />

        <Button type="submit" variant="contained" disabled={mutation.isPending}>
          {t('applications.create_application')}
        </Button>
      </Stack>
    </Box>
  );
}