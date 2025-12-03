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
import type { TaskFilters } from '../../api/tasks';

interface TaskFilterFormProps {
  filters: TaskFilters;
  onApply: (filters: TaskFilters) => void;
  onReset: () => void;
}

const statusOptions = [
  { value: 'NEW', label: 'Новая' },
  { value: 'IN_PROGRESS', label: 'В работе' },
  { value: 'REVIEW', label: 'На проверке' },
  { value: 'COMPLETED', label: 'Завершена' },
  { value: 'CANCELLED', label: 'Отменена' },
  { value: 'BLOCKED', label: 'Заблокирована' },
];

const priorityOptions = [
  { value: 'LOW', label: 'Низкий' },
  { value: 'NORMAL', label: 'Обычный' },
  { value: 'HIGH', label: 'Высокий' },
  { value: 'URGENT', label: 'Срочный' },
];

const TaskFilterForm: React.FC<TaskFilterFormProps> = ({ filters, onApply, onReset }) => {
  const { control, handleSubmit, reset } = useForm<TaskFilters>({
    defaultValues: filters,
  });

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
                <InputLabel>Статус</InputLabel>
                <Select
                  {...field}
                  multiple
                  input={<OutlinedInput label="Статус" />}
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
                <InputLabel>Приоритет</InputLabel>
                <Select
                  {...field}
                  multiple
                  input={<OutlinedInput label="Приоритет" />}
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
              <TextField
                {...field}
                label="Срок от"
                type="date"
                size="small"
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            )}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Controller
            name="deadline_to"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Срок до"
                type="date"
                size="small"
                fullWidth
                InputLabelProps={{ shrink: true }}
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
                label="Поиск"
                size="small"
                fullWidth
                placeholder="Название или описание"
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
                label="Теги"
                size="small"
                fullWidth
                placeholder="Введите теги через запятую"
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
                <InputLabel>Просрочено</InputLabel>
                <Select
                  {...field}
                  label="Просрочено"
                  value={field.value === undefined ? '' : field.value ? 'true' : 'false'}
                  onChange={(e) => {
                    const val = e.target.value;
                    field.onChange(val === '' ? undefined : val === 'true');
                  }}
                >
                  <MenuItem value="">Все</MenuItem>
                  <MenuItem value="true">Да</MenuItem>
                  <MenuItem value="false">Нет</MenuItem>
                </Select>
              </FormControl>
            )}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button type="submit" variant="contained" fullWidth>
              Применить
            </Button>
            <Button onClick={handleReset} variant="outlined" fullWidth>
              Сбросить
            </Button>
          </Box>
        </Grid>
      </Grid>
    </form>
  );
};

export default TaskFilterForm;
