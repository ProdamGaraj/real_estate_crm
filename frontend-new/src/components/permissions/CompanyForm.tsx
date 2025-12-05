import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  TextField,
  FormControlLabel,
  Switch,
  Stack,
  Alert,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { createCompany, updateCompany, type Company } from '../../api/permissions';
import { useState } from 'react';

interface CompanyFormProps {
  company?: Company;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormData {
  name: string;
  code: string;
  description?: string;
  is_active: boolean;
}

export default function CompanyForm({ company, onSuccess, onCancel }: CompanyFormProps) {
  const { t } = useTranslation();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isEdit = !!company;

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      name: company?.name || '',
      code: company?.code || '',
      description: company?.description || '',
      is_active: company?.is_active ?? true,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      if (isEdit) {
        return updateCompany(company.id, data);
      }
      return createCompany(data);
    },
    onSuccess: () => {
      setErrorMsg(null);
      onSuccess();
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        error.message ||
        t('errors.unknown_error');
      setErrorMsg(message);
    },
  });

  const onSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ pt: 2 }}>
      <Stack spacing={3}>
        {errorMsg && <Alert severity="error">{errorMsg}</Alert>}

        <Controller
          name="name"
          control={control}
          rules={{ required: t('validation.required') }}
          render={({ field }) => (
            <TextField
              {...field}
              label={t('pages.settings.permissions.company_name')}
              fullWidth
              error={!!errors.name}
              helperText={errors.name?.message}
              autoFocus
            />
          )}
        />

        <Controller
          name="code"
          control={control}
          rules={{ required: t('validation.required') }}
          render={({ field }) => (
            <TextField
              {...field}
              label={t('pages.settings.permissions.company_code')}
              fullWidth
              error={!!errors.code}
              helperText={errors.code?.message || t('pages.settings.permissions.code_help')}
              disabled={isEdit}
            />
          )}
        />

        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label={t('common.description')}
              fullWidth
              multiline
              rows={3}
              helperText={t('pages.settings.permissions.optional_field')}
            />
          )}
        />

        <Controller
          name="is_active"
          control={control}
          render={({ field }) => (
            <FormControlLabel
              control={<Switch {...field} checked={field.value} />}
              label={t('pages.settings.permissions.active')}
            />
          )}
        />

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
          <Button onClick={onCancel} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={mutation.isPending}>
            {mutation.isPending ? t('common.saving') : isEdit ? t('common.update') : t('common.create')}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
