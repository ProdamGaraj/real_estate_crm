import { useForm } from 'react-hook-form';
import type { SubmitHandler } from 'react-hook-form';
import { Box, Button, TextField, Stack, Alert } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createClient } from '../../api/clients';
import type { ClientPayload } from '../../api/clients'; // Используем правильный тип

interface ClientFormProps {
  onSuccess: () => void;
}

export default function ClientForm({ onSuccess }: ClientFormProps) {
  const { t } = useTranslation();
  const { register, handleSubmit, formState: { errors } } = useForm<ClientPayload>();

  const mutation = useMutation({
    mutationFn: createClient,
    onSuccess: () => {
      onSuccess();
    },
  });

  const onSubmit: SubmitHandler<ClientPayload> = (data) => {
    mutation.mutate(data);
  };

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 1 }}>
      <Stack spacing={2}>
        <TextField
          label={t('forms.full_name')}
          fullWidth
          required
          {...register('full_name', { required: t('common.required_field') })}
          error={!!errors.full_name}
          helperText={errors.full_name?.message}
        />
        <TextField
          label={t('forms.phone_number')}
          fullWidth
          required
          {...register('phone_number', { required: t('common.required_field') })}
          error={!!errors.phone_number}
          helperText={errors.phone_number?.message}
        />
        <TextField
          label={t('forms.comment')}
          fullWidth
          multiline
          rows={3}
          {...register('comment')}
        />

        {mutation.isError && (
          <Alert severity="error">{t('errors.create_client_error')}</Alert>
        )}

        <Button type="submit" variant="contained" disabled={mutation.isPending}>
          {mutation.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </Stack>
    </Box>
  );
}