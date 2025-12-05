// real_estate_crm/frontend-new/src/components/settings/TemplateFormModal.tsx

import { useForm, Controller } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getProjects } from '../../api/projects';
import { createTemplate } from '../../api/templates';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
    Stack, Autocomplete, Checkbox, FormControl, InputLabel, Select, MenuItem, OutlinedInput, ListItemText // <--- ИСПРАВЛЕНИЕ ЗДЕСЬ
} from '@mui/material';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';

interface TemplateFormModalProps {
  open: boolean;
  onClose: () => void;
}

interface FormInputs {
  name: string;
  file: FileList;
  applies_to_projects: number[];
  applies_to_buildings: number[];
  applies_to_property_types: string[];
}

const propertyTypes = [
    'APARTMENT', 'COMMERCIAL', 'PARKING', 'STORAGE', 'COTTAGE'
];

export default function TemplateFormModal({ open, onClose }: TemplateFormModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { register, handleSubmit, control, watch, reset } = useForm<FormInputs>({
    defaultValues: {
      applies_to_projects: [],
      applies_to_buildings: [],
      applies_to_property_types: [],
    }
  });

  const { data: projects, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects
  });

  const mutation = useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      onClose();
      reset();
    },
    onError: (error) => alert(`${t('common.error')}: ${error.message}`),
  });

  const onSubmit = (data: FormInputs) => {
    const formData = new FormData();
    formData.append('name', data.name);
    if (data.file[0]) {
      formData.append('file', data.file[0]);
    }
    data.applies_to_projects.forEach(id => formData.append('applies_to_projects', String(id)));
    data.applies_to_buildings.forEach(id => formData.append('applies_to_buildings', String(id)));
    formData.append('applies_to_property_types', JSON.stringify(data.applies_to_property_types));

    mutation.mutate(formData);
  };

  const selectedProjectIds = watch('applies_to_projects');
  const availableBuildings = projects?.filter(p => selectedProjectIds.includes(p.id)).flatMap(p => p.buildings) || [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{t('pages.templates.create_template')}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField label={t('pages.templates.template_name')} {...register('name', { required: true })} required />
            <TextField type="file" InputLabelProps={{ shrink: true }} label={t('pages.templates.template_file')} {...register('file', { required: true })} required inputProps={{ accept: ".docx" }} />

            <Controller
              name="applies_to_projects"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  multiple
                  options={projects || []}
                  loading={isLoadingProjects}
                  value={projects?.filter(p => field.value.includes(p.id)) || []}
                  onChange={(_, data) => field.onChange(data.map(d => d.id))}
                  getOptionLabel={(option) => option.name}
                  renderInput={(params) => <TextField {...params} label={t('pages.templates.apply_to_projects')} />}
                />
              )}
            />

            <Controller
              name="applies_to_buildings"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  multiple
                  options={availableBuildings}
                  disabled={!selectedProjectIds.length}
                  value={availableBuildings.filter(b => field.value.includes(b.id))}
                  onChange={(_, data) => field.onChange(data.map(d => d.id))}
                  getOptionLabel={(option) => option.name}
                  renderInput={(params) => <TextField {...params} label={t('pages.templates.apply_to_buildings')} />}
                />
              )}
            />

            <Controller
                name="applies_to_property_types"
                control={control}
                render={({ field }) => (
                    <FormControl fullWidth>
                        <InputLabel>{t('pages.templates.property_types')}</InputLabel>
                        <Select
                            multiple
                            {...field}
                            input={<OutlinedInput label={t('pages.templates.property_types')} />}
                            renderValue={(selected) => selected.map(s => t(`property_types.${s}`)).join(', ')}
                        >
                            {propertyTypes.map((type) => (
                                <MenuItem key={type} value={type}>
                                    <Checkbox checked={field.value.indexOf(type) > -1} />
                                    <ListItemText primary={t(`property_types.${type}`)} />
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="contained" disabled={mutation.isPending}>{t('common.save')}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}