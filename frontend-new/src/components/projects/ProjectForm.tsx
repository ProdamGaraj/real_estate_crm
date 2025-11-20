import { useForm, type SubmitHandler } from 'react-hook-form';
import { Box, Button, TextField, Stack, Alert } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { createProject } from '../../api/projects';
import type { ProjectPayload } from '../../api/projects';

interface ProjectFormProps {
  onSuccess: () => void;
}

export default function ProjectForm({ onSuccess }: ProjectFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<ProjectPayload>();

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      onSuccess();
    },
  });

  const onSubmit: SubmitHandler<ProjectPayload> = (data) => {
    mutation.mutate(data);
  };

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 1 }}>
      <Stack spacing={2}>
        <TextField
          label="Название проекта"
          fullWidth
          required
          {...register('name', { required: 'Это поле обязательно' })}
          error={!!errors.name}
          helperText={errors.name?.message}
        />
        <TextField
          label="Адрес"
          fullWidth
          required
          {...register('address', { required: 'Это поле обязательно' })}
          error={!!errors.address}
          helperText={errors.address?.message}
        />
        <TextField
          label="Описание"
          fullWidth
          multiline
          rows={4}
          {...register('description')}
        />

        {mutation.isError && (
          <Alert severity="error">Произошла ошибка при создании проекта.</Alert>
        )}

        <Button type="submit" variant="contained" disabled={mutation.isPending}>
          {mutation.isPending ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </Stack>
    </Box>
  );
}