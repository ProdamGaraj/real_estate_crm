import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Alert,
  TextField,
  MenuItem,
  Autocomplete,
  Stack,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { getDateFnsLocale } from '../../utils/translations';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { reopenTask, getTaskById, updateTask } from '../../api/tasks';
import { getUsers } from '../../api/users';
import type { User } from '../../api/users';

interface ReopenTaskDialogProps {
  open: boolean;
  onClose: () => void;
  taskId: number;
}

// Функция для округления времени к следующему 5-минутному интервалу + 5 минут
const getDefaultStartTime = (): Date => {
  const now = new Date();
  const minutes = now.getMinutes();
  const roundedMinutes = Math.ceil(minutes / 5) * 5 + 5;
  const defaultDate = new Date(now);
  defaultDate.setMinutes(roundedMinutes);
  defaultDate.setSeconds(0);
  defaultDate.setMilliseconds(0);
  return defaultDate;
};

export const ReopenTaskDialog: React.FC<ReopenTaskDialogProps> = ({ open, onClose, taskId }) => {
  const { t } = useTranslation();
  const [startedAt, setStartedAt] = useState<Date | null>(getDefaultStartTime());
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [title, setTitle] = useState('');

  const priorityOptions = useMemo(() => [
    { value: 'LOW', label: t('pages.tasks.priority_low') },
    { value: 'NORMAL', label: t('pages.tasks.priority_normal') },
    { value: 'HIGH', label: t('pages.tasks.priority_high') },
    { value: 'URGENT', label: t('pages.tasks.priority_urgent') },
  ], [t]);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [tags, setTags] = useState('');
  const [watcherIds, setWatcherIds] = useState<number[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [startTimeError, setStartTimeError] = useState(false);
  const [deadlineTimeError, setDeadlineTimeError] = useState(false);

  const queryClient = useQueryClient();

  // Загружаем пользователей
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  // Загружаем данные задачи
  const { data: task } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => getTaskById(taskId),
    enabled: open && !!taskId,
  });

  // Инициализируем форму данными задачи
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setPriority(task.priority);
      setAssigneeId(task.assignee?.id || null);
      setTags(task.tags || '');
      setWatcherIds(task.watchers?.map(w => w.id) || []);

      // Устанавливаем время начала - если есть в задаче, иначе умолчание
      if (task.started_at) {
        setStartedAt(new Date(task.started_at));
      } else {
        setStartedAt(getDefaultStartTime());
      }

      // Устанавливаем дедлайн - если есть в задаче, иначе null
      if (task.deadline) {
        setDeadline(new Date(task.deadline));
      } else {
        setDeadline(null);
      }
    }
  }, [task]);

  const reopenMutation = useMutation({
    mutationFn: reopenTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['kanbanData'] });
      queryClient.invalidateQueries({ queryKey: ['calendarData'] });
      queryClient.invalidateQueries({ queryKey: ['taskStats'] });
      onClose();
      // Сбросить форму
      setStartedAt(getDefaultStartTime());
      setDeadline(null);
      setApiError(null);
    },
    onError: (error: any) => {
      console.error('Reopen task error:', error);
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

      // Если есть поле error
      if (data.error) {
        return data.error;
      }
    }

    return t('pages.tasks.reopen_error');
  };

  const handleReopen = async () => {
    setApiError(null);
    setStartTimeError(false);
    setDeadlineTimeError(false);

    if (!startedAt) {
      setApiError(t('pages.tasks.start_time_required'));
      setStartTimeError(true);
      return;
    }

    if (!deadline) {
      setApiError(t('pages.tasks.deadline_required'));
      setDeadlineTimeError(true);
      return;
    }

    if (!title.trim()) {
      setApiError(t('pages.tasks.title_required'));
      return;
    }

    if (!assigneeId) {
      setApiError(t('pages.tasks.assignee_required'));
      return;
    }

    // Валидация: дедлайн не может быть раньше времени начала
    if (deadline < startedAt) {
      setApiError(t('pages.tasks.deadline_before_start'));
      return;
    }

    try {
      // Сначала обновляем данные задачи
      if (task) {
        await updateTask({
          id: taskId,
          payload: {
            title,
            description,
            priority,
            assignee_id: assigneeId,
            deadline: deadline.toISOString(),
            started_at: startedAt?.toISOString(),
            tags: tags.split(',').map(t => t.trim()).filter(t => t.length > 0).join(','),
            watcher_ids: watcherIds,
          },
        });
      }

      // Затем возвращаем задачу в работу
      reopenMutation.mutate({
        id: taskId,
        started_at: startedAt?.toISOString(),
        deadline: deadline.toISOString(),
      });
    } catch (error: any) {
      const errorMessage = extractErrorMessage(error);
      setApiError(errorMessage);
    }
  };

  const handleClose = () => {
    if (!reopenMutation.isPending) {
      onClose();
      setApiError(null);
      setStartedAt(getDefaultStartTime());
      setDeadline(null);
      setTitle('');
      setDescription('');
      setPriority('NORMAL');
      setAssigneeId(null);
      setTags('');
      setWatcherIds([]);
    }
  };

  const minDateTime = new Date();

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={getDateFnsLocale()}>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{t('pages.tasks.return_task_and_edit')}</DialogTitle>
        <DialogContent>
          {apiError && (
            <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>
          )}

          <Stack spacing={2} sx={{ mt: 2 }}>
            {/* Название - полная ширина */}
            <TextField
              label={t('pages.tasks.task_title')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              required
            />

            {/* Описание - полная ширина */}
            <TextField
              label={t('common.description')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              rows={4}
              required
            />

            {/* Исполнитель - полная ширина */}
            <Autocomplete
              options={users}
              getOptionLabel={(option) =>
                `${option.first_name} ${option.last_name}`.trim() || option.username
              }
              value={users.find((u) => u.id === assigneeId) || null}
              onChange={(_, newValue) => setAssigneeId(newValue?.id || null)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('pages.tasks.assignee')}
                  required
                />
              )}
            />

            {/* Время начала и дедлайн */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Box sx={{ flex: 2 }}>
                <DatePicker
                  label={t('pages.tasks.start_date')}
                  value={startedAt}
                  onChange={(newValue) => {
                    if (newValue && startedAt) {
                      const updated = new Date(startedAt);
                      updated.setFullYear(newValue.getFullYear());
                      updated.setMonth(newValue.getMonth());
                      updated.setDate(newValue.getDate());
                      setStartedAt(updated);
                    } else if (newValue) {
                      setStartedAt(newValue);
                    }
                  }}
                  minDate={minDateTime}
                  format="dd.MM.yyyy"
                  slotProps={{
                    textField: {
                      fullWidth: true,
                    },
                  }}
                />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Autocomplete
                  freeSolo
                  options={Array.from({ length: 24 }, (_, i) => i)}
                  getOptionLabel={(option) => String(option).padStart(2, '0')}
                  value={startedAt ? startedAt.getHours() : null}
                  onChange={(_, newValue) => {
                    if (newValue === null) return;
                    const hours = typeof newValue === 'string' ? parseInt(newValue) : newValue;
                    if (!isNaN(hours)) {
                      const clamped = Math.min(23, Math.max(0, hours));
                      const updated = startedAt ? new Date(startedAt) : getDefaultStartTime();
                      updated.setHours(clamped);
                      setStartedAt(updated);
                      setStartTimeError(false);
                    }
                  }}
                  onBlur={(e) => {
                    const target = e.target as HTMLInputElement;
                    const num = parseInt(target.value);
                    if (!isNaN(num)) {
                      const clamped = Math.min(23, Math.max(0, num));
                      const updated = startedAt ? new Date(startedAt) : getDefaultStartTime();
                      updated.setHours(clamped);
                      setStartedAt(updated);
                      setStartTimeError(false);
                    }
                  }}
                  ListboxProps={{
                    style: { maxHeight: '160px' },
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t('pages.tasks.hour')}
                      placeholder="--"
                      error={startTimeError}
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
              </Box>
              <Box sx={{ flex: 1 }}>
                <Autocomplete
                  freeSolo
                  options={Array.from({ length: 60 }, (_, i) => i)}
                  getOptionLabel={(option) => String(option).padStart(2, '0')}
                  value={startedAt ? startedAt.getMinutes() : null}
                  onChange={(_, newValue) => {
                    if (newValue === null) return;
                    const minutes = typeof newValue === 'string' ? parseInt(newValue) : newValue;
                    if (!isNaN(minutes)) {
                      const clamped = Math.min(59, Math.max(0, minutes));
                      const updated = startedAt ? new Date(startedAt) : getDefaultStartTime();
                      updated.setMinutes(clamped);
                      setStartedAt(updated);
                      setStartTimeError(false);
                    }
                  }}
                  onBlur={(e) => {
                    const target = e.target as HTMLInputElement;
                    const num = parseInt(target.value);
                    if (!isNaN(num)) {
                      const clamped = Math.min(59, Math.max(0, num));
                      const updated = startedAt ? new Date(startedAt) : getDefaultStartTime();
                      updated.setMinutes(clamped);
                      setStartedAt(updated);
                      setStartTimeError(false);
                    }
                  }}
                  ListboxProps={{
                    style: { maxHeight: '160px' },
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t('pages.tasks.minutes')}
                      placeholder="--"
                      error={startTimeError}
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
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Box sx={{ flex: 2 }}>
                <DatePicker
                  label={t('pages.tasks.deadline_date')}
                  value={deadline}
                  onChange={(newValue) => {
                    if (newValue && deadline) {
                      const updated = new Date(deadline);
                      updated.setFullYear(newValue.getFullYear());
                      updated.setMonth(newValue.getMonth());
                      updated.setDate(newValue.getDate());
                      setDeadline(updated);
                    } else if (newValue) {
                      setDeadline(newValue);
                    }
                  }}
                  minDate={minDateTime}
                  format="dd.MM.yyyy"
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      required: true,
                    },
                  }}
                />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Autocomplete
                  freeSolo
                  options={Array.from({ length: 24 }, (_, i) => i)}
                  getOptionLabel={(option) => String(option).padStart(2, '0')}
                  value={deadline ? deadline.getHours() : null}
                  onChange={(_, newValue) => {
                    if (newValue === null) return;
                    const hours = typeof newValue === 'string' ? parseInt(newValue) : newValue;
                    if (!isNaN(hours)) {
                      const clamped = Math.min(23, Math.max(0, hours));
                      const updated = deadline ? new Date(deadline) : new Date();
                      updated.setHours(clamped);
                      setDeadline(updated);
                      setDeadlineTimeError(false);
                    }
                  }}
                  onBlur={(e) => {
                    const target = e.target as HTMLInputElement;
                    const num = parseInt(target.value);
                    if (!isNaN(num)) {
                      const clamped = Math.min(23, Math.max(0, num));
                      const updated = deadline ? new Date(deadline) : new Date();
                      updated.setHours(clamped);
                      setDeadline(updated);
                      setDeadlineTimeError(false);
                    }
                  }}
                  ListboxProps={{
                    style: { maxHeight: '160px' },
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t('pages.tasks.hour')}
                      placeholder="--"
                      error={deadlineTimeError}
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
              </Box>
              <Box sx={{ flex: 1 }}>
                <Autocomplete
                  freeSolo
                  options={Array.from({ length: 60 }, (_, i) => i)}
                  getOptionLabel={(option) => String(option).padStart(2, '0')}
                  value={deadline ? deadline.getMinutes() : null}
                  onChange={(_, newValue) => {
                    if (newValue === null) return;
                    const minutes = typeof newValue === 'string' ? parseInt(newValue) : newValue;
                    if (!isNaN(minutes)) {
                      const clamped = Math.min(59, Math.max(0, minutes));
                      const updated = deadline ? new Date(deadline) : new Date();
                      updated.setMinutes(clamped);
                      setDeadline(updated);
                      setDeadlineTimeError(false);
                    }
                  }}
                  onBlur={(e) => {
                    const target = e.target as HTMLInputElement;
                    const num = parseInt(target.value);
                    if (!isNaN(num)) {
                      const clamped = Math.min(59, Math.max(0, num));
                      const updated = deadline ? new Date(deadline) : new Date();
                      updated.setMinutes(clamped);
                      setDeadline(updated);
                      setDeadlineTimeError(false);
                    }
                  }}
                  ListboxProps={{
                    style: { maxHeight: '160px' },
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t('pages.tasks.minutes')}
                      placeholder="--"
                      error={deadlineTimeError}
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
              </Box>
            </Box>

            {/* Приоритет + Теги в одной строке */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                select
                label={t('pages.tasks.priority')}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                fullWidth
              >
                {priorityOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label={t('pages.tasks.tags')}
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                fullWidth
                placeholder={t('pages.tasks.tags_placeholder')}
                helperText={t('pages.tasks.tags_hint')}
              />
            </Box>

            {/* Наблюдатели - полная ширина */}
            <Autocomplete
              multiple
              options={users}
              getOptionLabel={(option) =>
                `${option.first_name} ${option.last_name}`.trim() || option.username
              }
              value={users.filter((u) => watcherIds.includes(u.id))}
              onChange={(_, newValue) => setWatcherIds(newValue.map((u) => u.id))}
              renderInput={(params) => (
                <TextField {...params} label={t('pages.tasks.watchers')} placeholder={t('pages.tasks.select_watchers')} />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={reopenMutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleReopen}
            variant="contained"
            disabled={
              reopenMutation.isPending ||
              !deadline ||
              !startedAt ||
              !title.trim() ||
              !assigneeId ||
              (deadline && (deadline.getHours() === null || deadline.getMinutes() === null)) ||
              (startedAt && (startedAt.getHours() === null || startedAt.getMinutes() === null))
            }
          >
            {reopenMutation.isPending ? t('pages.tasks.returning') : t('pages.tasks.return_to_work')}
          </Button>
        </DialogActions>
      </Dialog>
    </LocalizationProvider>
  );
};
