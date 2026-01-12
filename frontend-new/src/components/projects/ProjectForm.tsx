import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { Box, Button, TextField, Stack, Alert, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createProject } from '../../api/projects';
import type { ProjectPayload } from '../../api/projects';
import { getCompanies } from '../../api/permissions';
import { useAuthStore } from '../../store/authStore';

interface ProjectFormProps {
  onSuccess: () => void;
}

interface ProjectFormData extends ProjectPayload {
  company?: number | null;
}

export default function ProjectForm({ onSuccess }: ProjectFormProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const isSystemAdmin = user?.is_system_admin ?? false;
  
  const { register, handleSubmit, control, formState: { errors } } = useForm<ProjectFormData>();

  // Загрузка компаний (только для системного админа)
  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: getCompanies,
    enabled: isSystemAdmin,
  });

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      onSuccess();
    },
  });

  const onSubmit: SubmitHandler<ProjectFormData> = (data) => {
    mutation.mutate(data as ProjectPayload);
  };

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 1 }}>
      <Stack spacing={2}>
        {/* Выбор компании - только для системного админа */}
        {isSystemAdmin && (
          <FormControl fullWidth>
            <InputLabel>{t('common.company')}</InputLabel>
            <Controller
              name="company"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  label={t('common.company')}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value || null)}
                >
                  <MenuItem value="">{t('common.not_assigned')}</MenuItem>
                  {companies?.map((company) => (
                    <MenuItem key={company.id} value={company.id}>
                      {company.name}
                    </MenuItem>
                  ))}
                </Select>
              )}
            />
          </FormControl>
        )}

        <TextField
          label={t('pages.projects.form.name')}
          fullWidth
          required
          {...register('name', { required: t('common.required_field') })}
          error={!!errors.name}
          helperText={errors.name?.message}
        />
        <TextField
          label={t('pages.projects.form.address')}
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