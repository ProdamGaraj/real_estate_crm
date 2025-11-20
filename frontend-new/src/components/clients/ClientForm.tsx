import { useForm } from 'react-hook-form';
import type { SubmitHandler } from 'react-hook-form';
import { Box, Button, TextField, Stack, Alert } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { createClient } from '../../api/clients';
import type { ClientPayload } from '../../api/clients'; // Используем правильный тип

interface ClientFormProps {
  onSuccess: () => void;
}

export default function ClientForm({ onSuccess }: ClientFormProps) {
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
          label="Полное имя"
          fullWidth
          required
          {...register('full_name', { required: 'Это поле обязательно' })}
          error={!!errors.full_name}
          helperText={errors.full_name?.message}
        />
        <TextField
          label="Номер телефона"
          fullWidth
          required
          {...register('phone_number', { required: 'Это поле обязательно' })}
          error={!!errors.phone_number}
          helperText={errors.phone_number?.message}
        />
        <TextField
          label="Комментарий"
          fullWidth
          multiline
          rows={3}
          {...register('comment')}
        />

        {mutation.isError && (
          <Alert severity="error">Произошла ошибка при создании клиента.</Alert>
        )}

        <Button type="submit" variant="contained" disabled={mutation.isPending}>
          {mutation.isPending ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </Stack>
    </Box>
  );
}