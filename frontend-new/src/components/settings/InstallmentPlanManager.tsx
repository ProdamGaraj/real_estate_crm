// real_estate_crm/frontend-new/src/components/settings/InstallmentPlanManager.tsx

/**
 * Вкладка «Рассрочка»: условия оплаты компании.
 *
 * Для каждого срока — скидка и минимальный первоначальный взнос. По этим
 * условиям менеджер показывает клиенту варианты оплаты и собирает график
 * сделки одной кнопкой. Менять условия может тот, у кого есть права на
 * ресурс «Скидки»: скидка за срок оплаты — та же скидка.
 */

import { useState } from 'react';
import { Alert, Box, Button, FormControl, Grid, InputLabel, MenuItem, Select, TextField, Typography } from '@mui/material';
import { GridActionsCellItem } from '@mui/x-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import DeleteIcon from '@mui/icons-material/Delete';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import LocalizedDataGrid from '../common/LocalizedDataGrid';
import {
  createInstallmentTerm, deleteInstallmentTerm, getInstallmentTerms, updateInstallmentTerm,
} from '../../api/installments';
import type { InstallmentTerm } from '../../api/installments';
import { getCompanies } from '../../api/permissions';
import { useAuthStore } from '../../store/authStore';
import { hasPermission, isSystemAdmin } from '../../utils/permissions';
import { extractApiError } from '../../utils/apiError';

const EMPTY = { months: '', discount_percent: '0', down_payment_percent: '30' };

export default function InstallmentPlanManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const systemAdmin = isSystemAdmin(user);
  const canAdd = hasPermission(user, 'ADD', 'DISCOUNT');
  const canEdit = hasPermission(user, 'EDIT', 'DISCOUNT');
  const canDelete = hasPermission(user, 'DELETE', 'DISCOUNT');

  const [companyId, setCompanyId] = useState<number | null>(null);
  const { data: companies } = useQuery({ queryKey: ['companies'], queryFn: () => getCompanies(), enabled: systemAdmin });

  const termsQuery = useQuery({
    queryKey: ['installmentTerms', 'all', companyId],
    queryFn: () => getInstallmentTerms({ company: companyId, all: true }),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['installmentTerms'] });

  const [form, setForm] = useState(EMPTY);
  const createMutation = useMutation({
    mutationFn: createInstallmentTerm,
    onSuccess: () => { refresh(); setForm(EMPTY); },
    onError: (error: unknown) => alert(extractApiError(error, t('errors.error_occurred'))),
  });
  const updateMutation = useMutation({
    mutationFn: updateInstallmentTerm,
    onSuccess: refresh,
    onError: (error: unknown) => { refresh(); alert(extractApiError(error, t('errors.update_error'))); },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteInstallmentTerm,
    onSuccess: refresh,
    onError: (error: unknown) => alert(extractApiError(error, t('errors.error_occurred'))),
  });

  const termLabel = (months: number) =>
    (months === 0 ? t('installments.full_payment') : t('installments.months', { months }));

  const columns: GridColDef<InstallmentTerm>[] = [
    {
      field: 'months', headerName: t('installments.settings.term'), flex: 1, minWidth: 120,
      valueFormatter: (value: number) => termLabel(value),
    },
    {
      field: 'discount_percent', headerName: t('installments.settings.discount'), flex: 1, minWidth: 120,
      editable: canEdit, type: 'number', valueGetter: (value: string) => Number(value),
    },
    {
      field: 'down_payment_percent', headerName: t('installments.settings.down_payment'), flex: 1, minWidth: 160,
      editable: canEdit, type: 'number', valueGetter: (value: string) => Number(value),
    },
    { field: 'is_active', headerName: t('installments.settings.active'), type: 'boolean', editable: canEdit, width: 110 },
    {
      field: 'actions', type: 'actions', width: 60,
      getActions: (params) => (canDelete ? [
        <GridActionsCellItem
          key="delete"
          icon={<DeleteIcon />}
          label={t('common.delete')}
          onClick={() => {
            if (window.confirm(t('installments.settings.confirm_delete', { term: termLabel(params.row.months) }))) {
              deleteMutation.mutate(params.row.id);
            }
          }}
        />,
      ] : []),
    },
  ];

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1 }}>{t('installments.settings.title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('installments.settings.hint')}</Typography>

      {systemAdmin && (
        <FormControl size="small" sx={{ mb: 2, minWidth: 280 }}>
          <InputLabel shrink>{t('common.company')}</InputLabel>
          <Select
            label={t('common.company')}
            displayEmpty
            notched
            value={companyId ?? ''}
            onChange={(e) => {
              const value = e.target.value as number | '';
              setCompanyId(value === '' ? null : Number(value));
            }}
          >
            <MenuItem value="">{t('pages.settings.currencies.own_company')}</MenuItem>
            {companies?.map(company => <MenuItem key={company.id} value={company.id}>{company.name}</MenuItem>)}
          </Select>
        </FormControl>
      )}

      {canAdd && (
        <Grid container spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              label={t('installments.settings.months')} type="number" size="small" fullWidth
              value={form.months} onChange={(e) => setForm(prev => ({ ...prev, months: e.target.value }))}
              helperText={t('installments.settings.months_hint')} inputProps={{ min: 0, max: 120 }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              label={t('installments.settings.discount')} type="number" size="small" fullWidth
              value={form.discount_percent} onChange={(e) => setForm(prev => ({ ...prev, discount_percent: e.target.value }))}
              inputProps={{ min: 0, max: 99.99, step: 0.5 }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              label={t('installments.settings.down_payment')} type="number" size="small" fullWidth
              value={form.down_payment_percent} onChange={(e) => setForm(prev => ({ ...prev, down_payment_percent: e.target.value }))}
              inputProps={{ min: 0, max: 100, step: 1 }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <Button
              variant="contained"
              disabled={form.months === '' || createMutation.isPending}
              onClick={() => createMutation.mutate({
                months: Number(form.months),
                discount_percent: form.discount_percent || '0',
                down_payment_percent: Number(form.months) === 0 ? '100' : (form.down_payment_percent || '0'),
                company: companyId,
              })}
            >
              {t('common.add')}
            </Button>
          </Grid>
        </Grid>
      )}

      {termsQuery.isError && <Alert severity="error">{extractApiError(termsQuery.error, t('errors.load_error'))}</Alert>}
      <Box sx={{ height: 380, width: '100%' }}>
        <LocalizedDataGrid
          rows={termsQuery.data ?? []}
          columns={columns}
          loading={termsQuery.isLoading}
          processRowUpdate={(updated: InstallmentTerm, original: InstallmentTerm) => {
            const payload: Partial<InstallmentTerm> = {};
            if (Number(updated.discount_percent) !== Number(original.discount_percent)) {
              payload.discount_percent = String(updated.discount_percent);
            }
            if (Number(updated.down_payment_percent) !== Number(original.down_payment_percent)) {
              payload.down_payment_percent = String(updated.down_payment_percent);
            }
            if (updated.is_active !== original.is_active) {
              payload.is_active = updated.is_active;
            }
            if (Object.keys(payload).length) {
              updateMutation.mutate({ id: original.id, payload });
            }
            return updated;
          }}
          onProcessRowUpdateError={() => refresh()}
        />
      </Box>
    </Box>
  );
}
