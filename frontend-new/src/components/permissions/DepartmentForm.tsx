import { useForm, Controller } from 'react-hook-form';
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
        'Произошла ошибка';
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
          rules={{ required: 'Компания обязательна' }}
          render={({ field }) => (
            <FormControl fullWidth error={!!errors.company}>
              <InputLabel>Компания</InputLabel>
              <Select {...field} label="Компания" disabled={isEdit || !!companyId}>
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
          rules={{ required: 'Название обязательно' }}
          render={({ field }) => (
            <TextField
              {...field}
              label="Название отдела"
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
              label="Код отдела"
              fullWidth
              helperText="Необязательное поле. Уникальный идентификатор"
            />
          )}
        />

        <Controller
          name="parent_department"
          control={control}
          render={({ field }) => (
            <FormControl fullWidth>
              <InputLabel>Родительский отдел</InputLabel>
              <Select
                {...field}
                value={field.value || ''}
                onChange={(e) => field.onChange(e.target.value || null)}
                label="Родительский отдел"
                disabled={!selectedCompany}
              >
                <MenuItem value="">
                  <em>Нет (корневой отдел)</em>
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
              label="Активен"
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
