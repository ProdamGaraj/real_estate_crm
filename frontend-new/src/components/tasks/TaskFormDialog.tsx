import React, { useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Autocomplete,
  Box,
  Alert,
  Stack,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import type { Task, TaskPayload, TaskUpdatePayload } from '../../api/tasks';
import type { User } from '../../api/users';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { createTask, updateTask } from '../../api/tasks';
import { getUsers } from '../../api/users';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ru } from 'date-fns/locale';

interface TaskFormDialogProps {
  open: boolean;
  onClose: () => void;
  task?: Task | null;
}

interface TaskFormData {
  title: string;
  description: string;
  assignee_id: number | null;
  deadline: Date | null;
  started_at: Date | null;
  priority: Task['priority'];
  tags: string;
  watcher_ids: number[];
}

const priorityOptions: { value: Task['priority']; label: string }[] = [
  { value: 'LOW', label: 'Низкий' },
  { value: 'NORMAL', label: 'Средний' },
  { value: 'HIGH', label: 'Высокий' },
  { value: 'URGENT', label: 'Срочный' },
];

export const TaskFormDialog: React.FC<TaskFormDialogProps> = ({ open, onClose, task }) => {
  const queryClient = useQueryClient();
  const [apiError, setApiError] = React.useState<string | null>(null);

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  // Проверяем статус задачи
  // Если задача в работе, завершена или отменена - блокируем большинство полей
  const isEditable = !task || task.status === 'NEW' || task.status === 'BLOCKED';

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TaskFormData>({
    defaultValues: {
      title: '',
      description: '',
      assignee_id: null,
      deadline: null,
      started_at: null,
      priority: 'NORMAL',
      tags: '',
      watcher_ids: [],
    },
  });

  useEffect(() => {
    if (task) {
      reset({
        title: task.title,
        description: task.description,
        assignee_id: task.assignee?.id || null,
        deadline: task.deadline ? new Date(task.deadline) : null,
        started_at: task.started_at ? new Date(task.started_at) : null,
        priority: task.priority,
        tags: task.tags || '',
        watcher_ids: task.watchers?.map((w) => w.id) || [],
      });
    } else {
      // При создании новой задачи округляем к следующему 5-минутному интервалу + 5 минут
      const now = new Date();
      const minutes = now.getMinutes();
      const roundedMinutes = Math.ceil(minutes / 5) * 5 + 5;
      const defaultStartedAt = new Date(now);
      defaultStartedAt.setMinutes(roundedMinutes);
      defaultStartedAt.setSeconds(0);
      defaultStartedAt.setMilliseconds(0);
      
      reset({
        title: '',
        description: '',
        assignee_id: null,
        deadline: null,
        started_at: defaultStartedAt,
        priority: 'NORMAL',
        tags: '',
        watcher_ids: [],
      });
    }
    setApiError(null);
  }, [task, reset, open]);

  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['kanbanData'] });
      queryClient.invalidateQueries({ queryKey: ['calendarData'] });
      queryClient.invalidateQueries({ queryKey: ['taskStats'] });
      onClose();
    },
    onError: (error: any) => {
      console.error('Ошибка создания задачи:', error);
      const errorMessage = extractErrorMessage(error);
      setApiError(errorMessage);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: TaskUpdatePayload }) => updateTask({ id, payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['kanbanData'] });
      queryClient.invalidateQueries({ queryKey: ['calendarData'] });
      queryClient.invalidateQueries({ queryKey: ['taskStats'] });
      onClose();
    },
    onError: (error: any) => {
      console.error('Ошибка обновления задачи:', error);
      const errorMessage = extractErrorMessage(error);
      setApiError(errorMessage);
    },
  });

  const extractErrorMessage = (error: any): string => {
    if (error.response?.data) {
      const data = error.response.data;
      
      // Если это объект с полями ошибок
      if (typeof data === 'object' && !Array.isArray(data)) {
        const messages: string[] = [];
        for (const [, errors] of Object.entries(data)) {
          if (Array.isArray(errors)) {
            messages.push(...errors);
          } else if (typeof errors === 'string') {
            messages.push(errors);
          }
        }
        if (messages.length > 0) {
          return messages.join('. ');
        }
      }
      
      // Если это строка
      if (typeof data === 'string') {
        return data;
      }
      
      // Если есть поле detail
      if (data.detail) {
        return data.detail;
      }
    }
    
    return 'Произошла ошибка при сохранении задачи';
  };

  const onSubmit = (data: TaskFormData) => {
    setApiError(null);

    // Валидация: дедлайн не может быть раньше времени начала
    if (data.started_at && data.deadline && data.deadline < data.started_at) {
      setApiError('Дедлайн не может быть раньше времени начала задачи');
      return;
    }

    const payload: TaskPayload = {
      title: data.title,
      description: data.description,
      assignee_id: data.assignee_id!,
      deadline: data.deadline!.toISOString(),
      started_at: data.started_at ? data.started_at.toISOString() : undefined,
      priority: data.priority,
      tags: data.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .join(','),
      watcher_ids: data.watcher_ids,
    };

    if (task) {
      updateMutation.mutate({ id: task.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const now = new Date();

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ru}>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>{task ? 'Редактировать задачу' : 'Создать задачу'}</DialogTitle>
        <DialogContent sx={{ pb: 2 }}>
          <Box component="form" sx={{ mt: 2 }}>
            {apiError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {apiError}
              </Alert>
            )}

            <Stack spacing={2}>
              {/* Название - полная ширина */}
              <Controller
                name="title"
                control={control}
                rules={{ required: 'Название обязательно' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Название"
                    fullWidth
                    required
                    disabled={!isEditable}
                    error={!!errors.title}
                    helperText={errors.title?.message}
                  />
                )}
              />

              {/* Описание - полная ширина */}
              <Controller
                name="description"
                control={control}
                rules={{ required: 'Описание обязательно' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Описание"
                    fullWidth
                    required
                    multiline
                    rows={4}
                    disabled={!isEditable}
                    error={!!errors.description}
                    helperText={errors.description?.message}
                  />
                )}
              />

              {/* Исполнитель - полная ширина */}
              <Controller
                name="assignee_id"
                control={control}
                rules={{ required: 'Исполнитель обязателен' }}
                render={({ field: { onChange, value } }) => (
                  <Autocomplete
                    options={users}
                    getOptionLabel={(option) =>
                      `${option.first_name} ${option.last_name}`.trim() || option.username
                    }
                    value={users.find((u) => u.id === value) || null}
                    onChange={(_, newValue) => onChange(newValue?.id || null)}
                    disabled={!isEditable}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Исполнитель"
                        required
                        error={!!errors.assignee_id}
                        helperText={errors.assignee_id?.message}
                      />
                    )}
                  />
                )}
              />

              {/* Время начала и дедлайн */}
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Box sx={{ flex: 2 }}>
                  <Controller
                    name="started_at"
                    control={control}
                    render={({ field }) => (
                      <DatePicker
                        label="Дата начала"
                        value={field.value}
                        onChange={(newValue) => {
                          if (newValue && field.value) {
                            const updated = new Date(field.value);
                            updated.setFullYear(newValue.getFullYear());
                            updated.setMonth(newValue.getMonth());
                            updated.setDate(newValue.getDate());
                            field.onChange(updated);
                          } else if (newValue) {
                            field.onChange(newValue);
                          }
                        }}
                        minDate={now}
                        disabled={!isEditable}
                        format="dd.MM.yyyy"
                        slotProps={{
                          textField: {
                            fullWidth: true,
                          },
                        }}
                      />
                    )}
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Controller
                    name="started_at"
                    control={control}
                    render={({ field }) => (
                      <Autocomplete
                        freeSolo
                        options={Array.from({ length: 24 }, (_, i) => i)}
                        getOptionLabel={(option) => String(option).padStart(2, '0')}
                        value={field.value ? field.value.getHours() : null}
                        onChange={(_, newValue) => {
                          if (newValue === null) return;
                          const hours = typeof newValue === 'string' ? parseInt(newValue) : newValue;
                          if (!isNaN(hours) && field.value) {
                            const clamped = Math.min(23, Math.max(0, hours));
                            const updated = new Date(field.value);
                            updated.setHours(clamped);
                            field.onChange(updated);
                          }
                        }}
                        onBlur={(e) => {
                          const target = e.target as HTMLInputElement;
                          const num = parseInt(target.value);
                          if (!isNaN(num) && field.value) {
                            const clamped = Math.min(23, Math.max(0, num));
                            const updated = new Date(field.value);
                            updated.setHours(clamped);
                            field.onChange(updated);
                          }
                        }}
                        disabled={!isEditable}
                        ListboxProps={{
                          style: { maxHeight: '160px' },
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Час"
                            placeholder="--"
                            inputProps={{
                              ...params.inputProps,
                              maxLength: 2,
                              inputMode: 'numeric',
                              pattern: '[0-9]*',
                            }}
                          />
                        )}
                      />
                    )}
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Controller
                    name="started_at"
                    control={control}
                    render={({ field }) => (
                      <Autocomplete
                        freeSolo
                        options={Array.from({ length: 60 }, (_, i) => i)}
                        getOptionLabel={(option) => String(option).padStart(2, '0')}
                        value={field.value ? field.value.getMinutes() : null}
                        onChange={(_, newValue) => {
                          if (newValue === null) return;
                          const minutes = typeof newValue === 'string' ? parseInt(newValue) : newValue;
                          if (!isNaN(minutes) && field.value) {
                            const clamped = Math.min(59, Math.max(0, minutes));
                            const updated = new Date(field.value);
                            updated.setMinutes(clamped);
                            field.onChange(updated);
                          }
                        }}
                        onBlur={(e) => {
                          const target = e.target as HTMLInputElement;
                          const num = parseInt(target.value);
                          if (!isNaN(num) && field.value) {
                            const clamped = Math.min(59, Math.max(0, num));
                            const updated = new Date(field.value);
                            updated.setMinutes(clamped);
                            field.onChange(updated);
                          }
                        }}
                        disabled={!isEditable}
                        ListboxProps={{
                          style: { maxHeight: '160px' },
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Минуты"
                            placeholder="--"
                            inputProps={{
                              ...params.inputProps,
                              maxLength: 2,
                              inputMode: 'numeric',
                              pattern: '[0-9]*',
                            }}
                          />
                        )}
                      />
                    )}
                  />
                </Box>
              </Box>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <Box sx={{ flex: 2 }}>
                  <Controller
                    name="deadline"
                    control={control}
                    rules={{ required: 'Дедлайн обязателен' }}
                    render={({ field }) => (
                      <DatePicker
                        label="Дата дедлайна"
                        value={field.value}
                        onChange={(newValue) => {
                          if (newValue && field.value) {
                            const updated = new Date(field.value);
                            updated.setFullYear(newValue.getFullYear());
                            updated.setMonth(newValue.getMonth());
                            updated.setDate(newValue.getDate());
                            field.onChange(updated);
                          } else if (newValue) {
                            field.onChange(newValue);
                          }
                        }}
                        minDate={now}
                        format="dd.MM.yyyy"
                        slotProps={{
                          textField: {
                            fullWidth: true,
                            required: true,
                            error: !!errors.deadline,
                            helperText: errors.deadline?.message,
                          },
                        }}
                      />
                    )}
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Controller
                    name="deadline"
                    control={control}
                    rules={{ required: 'Дедлайн обязателен' }}
                    render={({ field }) => (
                      <Autocomplete
                        freeSolo
                        options={Array.from({ length: 24 }, (_, i) => i)}
                        getOptionLabel={(option) => String(option).padStart(2, '0')}
                        value={field.value ? field.value.getHours() : null}
                        onChange={(_, newValue) => {
                          if (newValue === null) return;
                          const hours = typeof newValue === 'string' ? parseInt(newValue) : newValue;
                          if (!isNaN(hours) && field.value) {
                            const clamped = Math.min(23, Math.max(0, hours));
                            const updated = new Date(field.value);
                            updated.setHours(clamped);
                            field.onChange(updated);
                          }
                        }}
                        onBlur={(e) => {
                          const target = e.target as HTMLInputElement;
                          const num = parseInt(target.value);
                          if (!isNaN(num) && field.value) {
                            const clamped = Math.min(23, Math.max(0, num));
                            const updated = new Date(field.value);
                            updated.setHours(clamped);
                            field.onChange(updated);
                          }
                        }}
                        ListboxProps={{
                          style: { maxHeight: '160px' },
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Час"
                            placeholder="--"
                            required
                            inputProps={{
                              ...params.inputProps,
                              maxLength: 2,
                              inputMode: 'numeric',
                              pattern: '[0-9]*',
                            }}
                          />
                        )}
                      />
                    )}
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Controller
                    name="deadline"
                    control={control}
                    rules={{ required: 'Дедлайн обязателен' }}
                    render={({ field }) => (
                      <Autocomplete
                        freeSolo
                        options={Array.from({ length: 60 }, (_, i) => i)}
                        getOptionLabel={(option) => String(option).padStart(2, '0')}
                        value={field.value ? field.value.getMinutes() : null}
                        onChange={(_, newValue) => {
                          if (newValue === null) return;
                          const minutes = typeof newValue === 'string' ? parseInt(newValue) : newValue;
                          if (!isNaN(minutes) && field.value) {
                            const clamped = Math.min(59, Math.max(0, minutes));
                            const updated = new Date(field.value);
                            updated.setMinutes(clamped);
                            field.onChange(updated);
                          }
                        }}
                        onBlur={(e) => {
                          const target = e.target as HTMLInputElement;
                          const num = parseInt(target.value);
                          if (!isNaN(num) && field.value) {
                            const clamped = Math.min(59, Math.max(0, num));
                            const updated = new Date(field.value);
                            updated.setMinutes(clamped);
                            field.onChange(updated);
                          }
                        }}
                        ListboxProps={{
                          style: { maxHeight: '160px' },
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Минуты"
                            placeholder="--"
                            required
                            inputProps={{
                              ...params.inputProps,
                              maxLength: 2,
                              inputMode: 'numeric',
                              pattern: '[0-9]*',
                            }}
                          />
                        )}
                      />
                    )}
                  />
                </Box>
              </Box>

              {/* Приоритет + Теги в одной строке */}
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Controller
                  name="priority"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} select label="Приоритет" fullWidth disabled={!isEditable}>
                      {priorityOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />

                <Controller
                  name="tags"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Теги"
                      fullWidth
                      placeholder="Разделяйте теги запятыми"
                      helperText="Введите теги через запятую"
                    />
                  )}
                />
              </Box>

              {/* Наблюдатели - полная ширина */}
              <Controller
                name="watcher_ids"
                control={control}
                render={({ field: { onChange, value } }) => (
                  <Autocomplete
                    multiple
                    options={users}
                    getOptionLabel={(option) =>
                      `${option.first_name} ${option.last_name}`.trim() || option.username
                    }
                    value={users.filter((u) => value.includes(u.id))}
                    onChange={(_, newValue) => onChange(newValue.map((u) => u.id))}
                    renderInput={(params) => (
                      <TextField {...params} label="Наблюдатели" placeholder="Выберите наблюдателей" />
                    )}
                  />
                )}
              />
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Отмена</Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            variant="contained"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {task ? 'Сохранить' : 'Создать'}
          </Button>
        </DialogActions>
      </Dialog>
    </LocalizationProvider>
  );
};
