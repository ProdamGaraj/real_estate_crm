// src/components/buildings/BuildingForm.tsx
import { useForm, Controller } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getBuildingTypes } from '../../api/projects';
import { Box, Button, TextField, Stack, Autocomplete } from '@mui/material';

// Тип данных, которые мы отправляем для создания дома
export interface BuildingPayload {
  name: string;
  floors_count: number;
  building_type_id: number;
}

interface BuildingFormProps {
  onSubmit: (data: BuildingPayload) => void;
  isPending: boolean;
}

export default function BuildingForm({ onSubmit, isPending }: BuildingFormProps) {
  const { t } = useTranslation();
  const { register, handleSubmit, control, formState: { errors } } = useForm<BuildingPayload>();

  const { data: buildingTypes, isLoading: isLoadingTypes } = useQuery({
    queryKey: ['buildingTypes'],
    queryFn: getBuildingTypes,
  });

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 1 }}>
      <Stack spacing={2}>
        <TextField
          label={t('buildings.form.name')}
          fullWidth
          required
          {...register('name', { required: t('common.required_field') })}
          error={!!errors.name}
          helperText={errors.name?.message}
        />
        <TextField
          label={t('buildings.form.floors_count')}
          fullWidth
          required
          type="number"
          {...register('floors_count', { required: t('common.required_field') })}
          error={!!errors.floors_count}
          helperText={errors.floors_count?.message}
        />
        <Controller
          name="building_type_id"
          control={control}
          rules={{ required: true }}
          render={({ field }) => (
            <Autocomplete
              options={buildingTypes || []}
              loading={isLoadingTypes}
              getOptionLabel={(option) => option.name}
              onChange={(_, data) => field.onChange(data?.id)}
              renderInput={(params) => <TextField {...params} label={t('buildings.form.building_type')} required error={!!errors.building_type_id} />}
            />
          )}
        />
        <Button type="submit" variant="contained" disabled={isPending}>
          {isPending ? t('common.saving') : t('common.save')}
        </Button>
      </Stack>
    </Box>
  );
}