import { useForm, Controller } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getBuildings } from '../../api/projects';
import { getUsers } from '../../api/users';
import { createMeeting, type MeetingPayload } from '../../api/meetings';
import {
  Box, Button, TextField, Stack, Autocomplete, CircularProgress
} from '@mui/material';

interface MeetingFormProps {
  clientId: number;
  applicationId?: number;
  onSuccess: () => void;
}

type FormInputs = Omit<MeetingPayload, 'client_id' | 'application_id'>;

export default function MeetingForm({ clientId, applicationId, onSuccess }: MeetingFormProps) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<FormInputs>();

  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers
  });

  const { data: buildings, isLoading: isLoadingBuildings } = useQuery({
    // Просто получаем все дома из первого проекта для примера. В идеале нужен другой эндпоинт.
    queryKey: ['buildings', 1],
    queryFn: () => getBuildings({ projectId: 1, filters: {} })
  });

  const mutation = useMutation({
    mutationFn: createMeeting,
    onSuccess,
  });

  const onSubmit = (data: FormInputs) => {
    const payload: MeetingPayload = {
      ...data,
      client_id: clientId,
      application_id: applicationId,
    };
    mutation.mutate(payload);
  };

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 1 }}>
      <Stack spacing={3}>
        <Controller
          name="executor_id"
          control={control}
          rules={{ required: 'Выберите исполнителя' }}
          render={({ field }) => (
            <Autocomplete
              options={users || []}
              loading={isLoadingUsers}
              getOptionLabel={(option) => `${option.first_name} ${option.last_name}`.trim() || option.username}
              onChange={(_, data) => field.onChange(data?.id)}
              renderInput={(params) => <TextField {...params} label="Исполнитель" required error={!!errors.executor_id} />}
            />
          )}
        />
        <TextField
          label="Плановая дата и время"
          type="datetime-local"
          required
          InputLabelProps={{ shrink: true }}
          {...register('planned_date', { required: true })}
          error={!!errors.planned_date}
        />
        <Controller
          name="interested_building_id"
          control={control}
          render={({ field }) => (
            <Autocomplete
              options={buildings || []}
              loading={isLoadingBuildings}
              getOptionLabel={(option) => option.name}
              onChange={(_, data) => field.onChange(data?.id)}
              renderInput={(params) => <TextField {...params} label="Интересующий дом (необязательно)" />}
            />
          )}
        />
        <TextField
          label="Комментарий"
          multiline
          rows={3}
          {...register('comment')}
        />
        <Button type="submit" variant="contained" disabled={mutation.isPending}>
          {mutation.isPending ? 'Создание...' : 'Создать встречу'}
        </Button>
      </Stack>
    </Box>
  );
}