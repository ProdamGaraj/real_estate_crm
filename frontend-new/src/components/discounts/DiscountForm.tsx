import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getProjects } from '../../api/projects';
import type { Project } from '../../api/projects';
import { Box, Button, TextField, Stack, Autocomplete, Checkbox, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import type { Discount, DiscountPayload } from '../../api/discounts';
import { translatePropertyType } from '../../utils/translations';
import LocalizedDateField from '../common/LocalizedDateField';

interface DiscountFormProps {
  onSubmit: (data: DiscountPayload) => void;
  isPending: boolean;
  initialData?: Discount | null; // Данные для редактирования
}

const propertyTypeKeys = ['APARTMENT', 'COMMERCIAL', 'PARKING', 'STORAGE', 'COTTAGE'];

export default function DiscountForm({ onSubmit, isPending, initialData }: DiscountFormProps) {
  const { t } = useTranslation();
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
        <TextField label={t('pages.discounts.discount_name')} required {...register('name')} />
        <TextField label={t('pages.discounts.percentage')} type="number" required {...register('percentage_value')} />

        <FormControl fullWidth>
          <InputLabel>{t('pages.discounts.property_type_optional')}</InputLabel>
          <Controller
            name="property_type"
            control={control}
            defaultValue={null}
            render={({ field }) => (
              <Select {...field} label={t('pages.discounts.property_type_optional')}>
                <MenuItem value=""><em>{t('common.none')}</em></MenuItem>
                {propertyTypeKeys.map(pt => <MenuItem key={pt} value={pt}>{translatePropertyType(pt)}</MenuItem>)}
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
              renderInput={(params) => <TextField {...params} label={t('pages.discounts.apply_to_buildings')} />}
            />
          )}
        />

        <Controller
          name="start_date"
          control={control}
          rules={{ required: true }}
          render={({ field }) => (
            <LocalizedDateField
              label={t('pages.discounts.start_date')}
              value={field.value || null}
              onChange={(date) => field.onChange(date || '')}
            />
          )}
        />
        <Controller
          name="end_date"
          control={control}
          render={({ field }) => (
            <LocalizedDateField
              label={t('pages.discounts.end_date_optional')}
              value={field.value || null}
              onChange={(date) => field.onChange(date || '')}
            />
          )}
        />
        <TextField label={t('pages.discounts.short_description')} multiline rows={3} {...register('comment')} />

        <Button type="submit" variant="contained" disabled={isPending}>
          {isPending ? t('common.saving') : t('common.save')}
        </Button>
      </Stack>
    </Box>
  );
}

