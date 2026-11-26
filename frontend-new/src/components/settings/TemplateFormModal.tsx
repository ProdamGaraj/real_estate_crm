// real_estate_crm/frontend-new/src/components/settings/TemplateFormModal.tsx

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getProjects } from '../../api/projects';
import type { Project } from '../../api/projects';
import { createTemplate, updateTemplate, updateTemplateFile } from '../../api/templates';
import type { Template } from '../../api/templates';
import { getCompanies } from '../../api/permissions';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
    Stack, Autocomplete, Checkbox, FormControl, InputLabel, Select, MenuItem,
    OutlinedInput, ListItemText, Alert
} from '@mui/material';
import { extractApiError } from '../../utils/apiError';
import { useAuthStore } from '../../store/authStore';
import { isSystemAdmin } from '../../utils/permissions';

interface TemplateFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Шаблон для правки. Пусто — создаётся новый */
  template?: Template | null;
}

interface FormInputs {
  name: string;
  /** Договор по сделке или договор брони: у них разные метки */
  kind: 'DEAL' | 'BOOKING';
  file: FileList;
  applies_to_projects: number[];
  applies_to_buildings: number[];
  applies_to_property_types: string[];
  /** Компания-владелец: пусто — шаблон общий для всех компаний */
  company: number | '';
}

const propertyTypes = [
    'APARTMENT', 'COMMERCIAL', 'PARKING', 'STORAGE', 'COTTAGE'
];

const emptyForm: FormInputs = {
  name: '',
  kind: 'DEAL',
  file: undefined as unknown as FileList,
  applies_to_projects: [],
  applies_to_buildings: [],
  applies_to_property_types: [],
  company: '',
};

export default function TemplateFormModal({ open, onClose, template }: TemplateFormModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const admin = isSystemAdmin(user);
  const editing = Boolean(template);

  const { register, handleSubmit, control, watch, reset } = useForm<FormInputs>({
    defaultValues: emptyForm,
  });

  // Форма переиспользуется для правки: при открытии подставляем значения
  // шаблона, при создании — чистые
  useEffect(() => {
    if (!open) return;
    reset(template ? {
      ...emptyForm,
      name: template.name,
      kind: template.kind,
      applies_to_projects: template.applies_to_projects || [],
      applies_to_buildings: template.applies_to_buildings || [],
      applies_to_property_types: template.applies_to_property_types || [],
      company: template.company ?? '',
    } : emptyForm);
  }, [open, template, reset]);

  const { data: projects, isLoading: isLoadingProjects } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => getProjects(),
  });

  // Перенос шаблона в другую компанию доступен только системному
  // администратору: обычный пользователь работает в своей компании
  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: () => getCompanies(),
    enabled: admin,
  });

  const mutation = useMutation({
    mutationFn: async (data: FormInputs) => {
      const file = data.file && data.file[0] ? data.file[0] : null;
      if (!template) {
        const formData = new FormData();
        formData.append('name', data.name);
        formData.append('kind', data.kind);
        if (file) formData.append('file', file);
        data.applies_to_projects.forEach(id => formData.append('applies_to_projects', String(id)));
        data.applies_to_buildings.forEach(id => formData.append('applies_to_buildings', String(id)));
        formData.append('applies_to_property_types', JSON.stringify(data.applies_to_property_types));
        if (admin) formData.append('company', data.company === '' ? '' : String(data.company));
        return createTemplate(formData);
      }

      // Правка идёт JSON-ом: только так можно снять область применения,
      // отправив пустые списки. Файл, если его заменяют, уходит отдельно
      await updateTemplate({
        id: template.id,
        payload: {
          name: data.name,
          kind: data.kind,
          applies_to_projects: data.applies_to_projects,
          applies_to_buildings: data.applies_to_buildings,
          applies_to_property_types: data.applies_to_property_types,
          ...(admin ? { company: data.company === '' ? null : Number(data.company) } : {}),
        },
      });
      if (file) {
        await updateTemplateFile({ id: template.id, file });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      // Списки в сделках и бронях собираются по области применения —
      // после правки их тоже надо перечитать
      queryClient.invalidateQueries({ queryKey: ['availableTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['bookingTemplates'] });
      onClose();
      reset(emptyForm);
    },
    onError: (error: unknown) => alert(extractApiError(error, t('common.error'))),
  });

  const onSubmit = (data: FormInputs) => mutation.mutate(data);

  const selectedProjectIds = watch('applies_to_projects');
  const availableBuildings = (projects || [])
    .filter(p => selectedProjectIds.includes(p.id))
    .flatMap(p => p.buildings || []);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        {editing ? t('pages.templates.edit_template') : t('pages.templates.create_template')}
      </DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField label={t('pages.templates.template_name')} {...register('name', { required: true })} required />
            {/* Вид шаблона: в брони печатается договор брони, в сделке —
                договор по сделке. Списки шаблонов не смешиваются */}
            <Controller
              name="kind"
              control={control}
              render={({ field }) => (
                <FormControl>
                  <InputLabel>{t('pages.templates.kind')}</InputLabel>
                  <Select {...field} label={t('pages.templates.kind')}>
                    <MenuItem value="DEAL">{t('pages.templates.kind_deal')}</MenuItem>
                    <MenuItem value="BOOKING">{t('pages.templates.kind_booking')}</MenuItem>
                  </Select>
                </FormControl>
              )}
            />
            <TextField
              type="file"
              InputLabelProps={{ shrink: true }}
              label={t('pages.templates.template_file')}
              {...register('file', { required: !editing })}
              required={!editing}
              inputProps={{ accept: '.docx' }}
              helperText={editing ? t('pages.templates.file_optional') : undefined}
            />

            {admin && (
              <Controller
                name="company"
                control={control}
                render={({ field }) => (
                  <FormControl>
                    <InputLabel>{t('common.company')}</InputLabel>
                    <Select {...field} label={t('common.company')}>
                      <MenuItem value="">{t('pages.settings.finance_refs.shared')}</MenuItem>
                      {(companies || []).map(company => (
                        <MenuItem key={company.id} value={company.id}>{company.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            )}

            <Alert severity="info">{t('pages.templates.scope_hint')}</Alert>

            <Controller
              name="applies_to_projects"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  multiple
                  options={projects || []}
                  loading={isLoadingProjects}
                  value={(projects || []).filter(p => field.value.includes(p.id))}
                  onChange={(_, data) => field.onChange(data.map(d => d.id))}
                  getOptionLabel={(option) => option.name}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
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
                  isOptionEqualToValue={(option, value) => option.id === value.id}
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
                            renderValue={(selected) => (selected as string[]).map(s => t(`property_types.${s}`)).join(', ')}
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
