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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createDepartment,
  updateDepartment,
  getDepartments,
  getCompanies,
  type Department,
} from '../../api/permissions';
import { useState } from 'react';

interface DepartmentFormProps {
  department?: Department;
  companyId?: number;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormData {
  company: number;
  name: string;
  code?: string;
  parent_department?: number | null;
  description?: string;
  is_active: boolean;
}

export default function DepartmentForm({
  department,
  companyId,
  onSuccess,
  onCancel,
}: DepartmentFormProps) {
  const { t } = useTranslation();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isEdit = !!department;

  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: getCompanies,
  });

  const { data: departments } = useQuery({
    queryKey: ['departments', department?.company || companyId],
    queryFn: () =>
      getDepartments({
        company: department?.company || companyId,
      }),
    enabled: !!(department?.company || companyId),
  });

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      company: department?.company || companyId || 0,
      name: department?.name || '',
      code: department?.code || '',
      parent_department: department?.parent_department || null,
      description: department?.description || '',
      is_active: department?.is_active ?? true,
    },
  });

  const selectedCompany = watch('company');

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      if (isEdit) {
        return updateDepartment(department.id, data);
      }
      return createDepartment(data);
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

  // Фильтруем отделы - нельзя выбрать себя как родителя
  const availableParentDepartments =
    departments?.filter((dept) => dept.id !== department?.id) || [];

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ pt: 2 }}>
      <Stack spacing={3}>
        {errorMsg && <Alert severity="error">{errorMsg}</Alert>}

        <Controller
          name="company"
          control={control}
          rules={{ required: t('validation.required') }}
          render={({ field }) => (
            <FormControl fullWidth error={!!errors.company}>
              <InputLabel>{t('common.company')}</InputLabel>
              <Select {...field} label={t('common.company')} disabled={isEdit || !!companyId}>
                {companies?.map((company) => (
                  <MenuItem key={company.id} value={company.id}>
                    {company.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        />

        <Controller
          name="name"
          control={control}
          rules={{ required: t('validation.required') }}
          render={({ field }) => (
            <TextField
              {...field}
              label={t('pages.settings.permissions.department_name')}
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
          render={({ field }) => (
            <TextField
              {...field}
              label={t('pages.settings.permissions.code')}
              fullWidth
              helperText={t('pages.settings.permissions.code_help')}
            />
          )}
        />

        <Controller
          name="parent_department"
          control={control}
          render={({ field }) => (
            <FormControl fullWidth>
              <InputLabel>{t('pages.settings.permissions.parent_department')}</InputLabel>
              <Select
                {...field}
                value={field.value || ''}
                onChange={(e) => field.onChange(e.target.value || null)}
                label={t('pages.settings.permissions.parent_department')}
                disabled={!selectedCompany}
              >
                <MenuItem value="">
                  <em>{t('pages.settings.permissions.no_parent')}</em>
                </MenuItem>
                {availableParentDepartments.map((dept) => (
                  <MenuItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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
