import { useForm, type SubmitHandler } from 'react-hook-form';
import { Box, Button, TextField, Stack, Alert } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createProject } from '../../api/projects';
import type { ProjectPayload } from '../../api/projects';

interface ProjectFormProps {
  onSuccess: () => void;
}

export default function ProjectForm({ onSuccess }: ProjectFormProps) {
  const { t } = useTranslation();
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
          label={t('projects.form.name')}
          fullWidth
          required
          {...register('name', { required: t('common.required_field') })}
          error={!!errors.name}
          helperText={errors.name?.message}
        />
        <TextField
          label={t('projects.form.address')}
          fullWidth
          required
          {...register('address', { required: t('common.required_field') })}
          error={!!errors.address}
          helperText={errors.address?.message}
        />
        <TextField
          label={t('common.description')}
          fullWidth
          multiline
          rows={4}
          {...register('description')}
        />

        {mutation.isError && (
          <Alert severity="error">{t('projects.create_error')}</Alert>
        )}

        <Button type="submit" variant="contained" disabled={mutation.isPending}>
          {mutation.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </Stack>
    </Box>
  );
}