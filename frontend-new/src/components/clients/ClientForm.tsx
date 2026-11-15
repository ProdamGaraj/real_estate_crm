import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { SubmitHandler } from 'react-hook-form';
import {
  Box, Button, TextField, Stack, Alert, AlertTitle, Link as MuiLink,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { createClient, duplicateClientError } from '../../api/clients';
import type { ClientPayload, DuplicateClientHint } from '../../api/clients';
import { extractApiError } from '../../utils/apiError';

interface ClientFormProps {
  onSuccess: () => void;
}

export default function ClientForm({ onSuccess }: ClientFormProps) {
  const { t } = useTranslation();
  const { register, handleSubmit, getValues, formState: { errors } } = useForm<ClientPayload>();
  // Клиент, на которого похож вводимый: пока предупреждение не подтверждено,
  // вторая карточка на того же человека не создаётся
  const [duplicate, setDuplicate] = useState<{ message: string; clients: DuplicateClientHint[] } | null>(null);
  const [otherError, setOtherError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createClient,
    onSuccess: () => {
      setDuplicate(null);
      setOtherError(null);
      onSuccess();
    },
    onError: (error: unknown) => {
      const warning = duplicateClientError(error);
      setDuplicate(warning);
      setOtherError(warning ? null : extractApiError(error, t('errors.create_client_error')));
    },
  });

  const onSubmit: SubmitHandler<ClientPayload> = (data) => {
    setDuplicate(null);
    setOtherError(null);
    mutation.mutate(data);
  };

  const createAnyway = () => {
    mutation.mutate({ ...getValues(), confirm_duplicate: true });
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

        {duplicate && (
          <Alert severity="warning">
            <AlertTitle>{t('pages.clients.duplicate_title')}</AlertTitle>
            {duplicate.message}
            {duplicate.clients.length > 0 && (
              <Stack sx={{ mt: 1 }} spacing={0.5}>
                {duplicate.clients.map((client) => (
                  <MuiLink key={client.id} component={RouterLink} to={`/clients/${client.id}`} underline="hover">
                    {client.full_name} (ID {client.id})
                  </MuiLink>
                ))}
              </Stack>
            )}
            <Button
              size="small"
              color="warning"
              variant="outlined"
              sx={{ mt: 1 }}
              onClick={createAnyway}
              disabled={mutation.isPending}
            >
              {t('pages.clients.duplicate_create_anyway')}
            </Button>
          </Alert>
        )}

        {otherError && <Alert severity="error">{otherError}</Alert>}

        <Button type="submit" variant="contained" disabled={mutation.isPending}>
          {mutation.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </Stack>
    </Box>
  );
}
