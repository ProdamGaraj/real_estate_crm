import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import type { SubmitHandler } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { getProjects } from '../../api/projects';
import type { Project } from '../../api/projects';
import { Box, Button, TextField, Stack, Autocomplete, Checkbox, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import type { Discount, DiscountPayload } from '../../api/discounts';

interface DiscountFormProps {
  onSubmit: (data: DiscountPayload) => void;
  isPending: boolean;
  initialData?: Discount | null; // Данные для редактирования
}

const propertyTypes = [
    { value: 'APARTMENT', label: 'Квартира' },
    { value: 'COMMERCIAL', label: 'Коммерция' },
    { value: 'PARKING', label: 'Парковка' },
    { value: 'STORAGE', label: 'Кладовка' },
    { value: 'COTTAGE', label: 'Коттедж' },
];

export default function DiscountForm({ onSubmit, isPending, initialData }: DiscountFormProps) {
  const { register, handleSubmit, control, reset } = useForm<DiscountPayload>({
    defaultValues: initialData || {},
  });

  useEffect(() => {
    reset(initialData || {});
  }, [initialData, reset]);

  const { data: projects, isLoading } = useQuery<Project[]>({ queryKey: ['projects'], queryFn: getProjects });

  const buildings = projects?.flatMap(p => p.buildings ? p.buildings.map(b => ({ ...b, projectName: p.name })) : []) || [];

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 1 }}>
      <Stack spacing={3}>
        <TextField label="Название скидки" required {...register('name')} />
        <TextField label="Процент (%)" type="number" required {...register('percentage_value')} />

        <FormControl fullWidth>
          <InputLabel>Тип недвижимости (необязательно)</InputLabel>
          <Controller
            name="property_type"
            control={control}
            defaultValue={null}
            render={({ field }) => (
              <Select {...field} label="Тип недвижимости (необязательно)">
                <MenuItem value=""><em>Не выбрано</em></MenuItem>
                {propertyTypes.map(pt => <MenuItem key={pt.value} value={pt.value}>{pt.label}</MenuItem>)}
              </Select>
            )}
          />
        </FormControl>

        <Controller
          name="buildings"
          control={control}
          defaultValue={initialData?.buildings || []}
          render={({ field }) => (
            <Autocomplete
              multiple
              options={buildings}
              loading={isLoading}
              disableCloseOnSelect
              value={buildings.filter(b => field.value?.includes(b.id))}
              getOptionLabel={(option) => `${option.projectName} - ${option.name}`}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              onChange={(_, data) => field.onChange(data.map(d => d.id))}
              renderOption={(props, option, { selected }) => (
                <li {...props}>
                  <Checkbox icon={<CheckBoxOutlineBlankIcon/>} checkedIcon={<CheckBoxIcon/>} checked={selected} />
                  {option.projectName} - {option.name}
                </li>
              )}
              renderInput={(params) => <TextField {...params} label="Применить к домам (необязательно)" />}
            />
          )}
        />

        <TextField label="Дата начала" type="date" InputLabelProps={{ shrink: true }} required {...register('start_date')} />
        <TextField label="Дата окончания (пусто=бессрочно)" type="date" InputLabelProps={{ shrink: true }} {...register('end_date')} />
        <TextField label="Краткое описание" multiline rows={3} {...register('comment')} />

        <Button type="submit" variant="contained" disabled={isPending}>
          {isPending ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </Stack>
    </Box>
  );
}