import React from 'react';
import {
  Box,
  Grid,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  OutlinedInput,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TaskFilters } from '../../api/tasks';
import LocalizedDateField from '../common/LocalizedDateField';

interface TaskFilterFormProps {
  filters: TaskFilters;
  onApply: (filters: TaskFilters) => void;
  onReset: () => void;
}

const TaskFilterForm: React.FC<TaskFilterFormProps> = ({ filters, onApply, onReset }) => {
  const { t } = useTranslation();
  const { control, handleSubmit, reset } = useForm<TaskFilters>({
    defaultValues: filters,
  });

  const statusOptions = [
    { value: 'NEW', label: t('statuses.task.NEW') },
    { value: 'IN_PROGRESS', label: t('statuses.task.IN_PROGRESS') },
    { value: 'REVIEW', label: t('statuses.task.REVIEW') },
    { value: 'COMPLETED', label: t('statuses.task.COMPLETED') },
    { value: 'CANCELLED', label: t('statuses.task.CANCELLED') },
    { value: 'BLOCKED', label: t('statuses.task.BLOCKED') },
  ];

  const priorityOptions = [
    { value: 'LOW', label: t('statuses.task_priority.LOW') },
    { value: 'NORMAL', label: t('statuses.task_priority.NORMAL') },
    { value: 'HIGH', label: t('statuses.task_priority.HIGH') },
    { value: 'URGENT', label: t('statuses.task_priority.URGENT') },
  ];

  const onSubmit = (data: TaskFilters) => {
    // Удаляем пустые значения
    const cleanedData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => {
        if (Array.isArray(v)) return v.length > 0;
        return v !== null && v !== undefined && v !== '';
      })
    ) as TaskFilters;
    onApply(cleanedData);
  };

  const handleReset = () => {
    reset({});
    onReset();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <Controller
            name="status"
            control={control}
            defaultValue={[]}
            render={({ field }) => (
              <FormControl fullWidth size="small">
                <InputLabel>{t('common.status')}</InputLabel>
                <Select
                  {...field}
                  multiple
                  input={<OutlinedInput label={t('common.status')} />}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as string[]).map((value) => {
                        const option = statusOptions.find(o => o.value === value);
                        return <Chip key={value} label={option?.label || value} size="small" />;
                      })}
                    </Box>
                  )}
                  onChange={(e: SelectChangeEvent<string[]>) => {
                    field.onChange(e.target.value);
                  }}
                >
                  {statusOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Controller
            name="priority"
            control={control}
            defaultValue={[]}
            render={({ field }) => (
              <FormControl fullWidth size="small">
                <InputLabel>{t('pages.tasks.priority')}</InputLabel>
                <Select
                  {...field}
                  multiple
                  input={<OutlinedInput label={t('pages.tasks.priority')} />}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as string[]).map((value) => {
                        const option = priorityOptions.find(o => o.value === value);
                        return <Chip key={value} label={option?.label || value} size="small" />;
                      })}
                    </Box>
                  )}
                  onChange={(e: SelectChangeEvent<string[]>) => {
                    field.onChange(e.target.value);
                  }}
                >
                  {priorityOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Controller
            name="deadline_from"
            control={control}
            render={({ field }) => (
              <LocalizedDateField
                label={t('pages.tasks.deadline_from')}
                value={field.value || null}
                onChange={(date) => field.onChange(date || '')}
                size="small"
                fullWidth
              />
            )}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Controller
            name="deadline_to"
            control={control}
            render={({ field }) => (
              <LocalizedDateField
                label={t('pages.tasks.deadline_to')}
                value={field.value || null}
                onChange={(date) => field.onChange(date || '')}
                size="small"
                fullWidth
              />
            )}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Controller
            name="search"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label={t('common.search')}
                size="small"
                fullWidth
                placeholder={t('pages.tasks.search_placeholder')}
              />
            )}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Controller
            name="tags"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label={t('pages.tasks.tags')}
                size="small"
                fullWidth
                placeholder={t('pages.tasks.tags_placeholder')}
              />
            )}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Controller
            name="is_overdue"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth size="small">
                <InputLabel>{t('pages.tasks.overdue')}</InputLabel>
                <Select
                  {...field}
                  label={t('pages.tasks.overdue')}
                  value={field.value === undefined ? '' : field.value ? 'true' : 'false'}
                  onChange={(e) => {
                    const val = e.target.value;
                    field.onChange(val === '' ? undefined : val === 'true');
                  }}
                >
                  <MenuItem value="">{t('common.all')}</MenuItem>
                  <MenuItem value="true">{t('common.yes')}</MenuItem>
                  <MenuItem value="false">{t('common.no')}</MenuItem>
                </Select>
              </FormControl>
            )}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button type="submit" variant="contained" fullWidth>
              {t('common.apply')}
            </Button>
            <Button onClick={handleReset} variant="outlined" fullWidth>
              {t('common.reset')}
            </Button>
          </Box>
        </Grid>
      </Grid>
    </form>
  );
};

export default TaskFilterForm;
