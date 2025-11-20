import { useForm, Controller } from 'react-hook-form';
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
        'Произошла ошибка';
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
          rules={{ required: 'Название обязательно' }}
          render={({ field }) => (
            <TextField
              {...field}
              label="Название компании"
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
          rules={{ required: 'Код обязателен' }}
          render={({ field }) => (
            <TextField
              {...field}
              label="Код компании"
              fullWidth
              error={!!errors.code}
              helperText={errors.code?.message || 'Уникальный идентификатор компании'}
              disabled={isEdit} // Код нельзя изменить после создания
            />
          )}
        />

        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Описание"
              fullWidth
              multiline
              rows={3}
              helperText="Необязательное поле"
            />
          )}
        />

        <Controller
          name="is_active"
          control={control}
          render={({ field }) => (
            <FormControlLabel
              control={<Switch {...field} checked={field.value} />}
              label="Активна"
            />
          )}
        />

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
          <Button onClick={onCancel} disabled={mutation.isPending}>
            Отмена
          </Button>
          <Button type="submit" variant="contained" disabled={mutation.isPending}>
            {mutation.isPending ? 'Сохранение...' : isEdit ? 'Обновить' : 'Создать'}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
