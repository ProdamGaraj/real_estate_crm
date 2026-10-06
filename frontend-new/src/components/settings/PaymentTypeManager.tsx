// real_estate_crm/frontend-new/src/components/settings/PaymentTypeManager.tsx

/**
 * Типы платежей и планы оплаты.
 *
 * Тип платежа — название, которое получают платежи графика. Если задать ему
 * план («Рассрочка на 12 месяцев»: взнос 30 % и 12 ежемесячных платежей,
 * скидка 5 %), он появится вариантом в калькуляторе рассрочки, и по нему
 * можно одной кнопкой собрать график сделки.
 *
 * Общие записи (без компании) видны всем компаниям, а менять и удалять их
 * может только системный администратор. Тип, который есть в платежах,
 * удалить нельзя — только переименовать.
 */

import { useState } from 'react';
import {
  Alert, Box, Button, FormControl, Grid, InputLabel, MenuItem, Select, TextField, Typography,
} from '@mui/material';
import { GridActionsCellItem } from '@mui/x-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import DeleteIcon from '@mui/icons-material/Delete';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import LocalizedDataGrid from '../common/LocalizedDataGrid';
import CompanyChoice from './CompanyChoice';
import {
  createPaymentType, deletePaymentType, getPaymentTypes, updatePaymentType,
} from '../../api/finances';
import type { PaymentType, PaymentTypePayload, PlanKind } from '../../api/finances';
import { useAuthStore } from '../../store/authStore';
import { hasPermission, isSystemAdmin } from '../../utils/permissions';
import { extractApiError } from '../../utils/apiError';

const PLAN_KINDS: PlanKind[] = ['', 'FULL', 'INSTALLMENT', 'DEFERRED'];
const EMPTY_FORM = { name: '', plan_kind: '' as PlanKind, plan_months: '', discount_percent: '', down_payment_percent: '' };

export default function PaymentTypeManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const admin = isSystemAdmin(user);
  const canAdd = hasPermission(user, 'ADD', 'PAYMENT_TYPE');
  const canEdit = hasPermission(user, 'EDIT', 'PAYMENT_TYPE');
  const canDelete = hasPermission(user, 'DELETE', 'PAYMENT_TYPE');

  const { data, isLoading } = useQuery({ queryKey: ['paymentTypes'], queryFn: getPaymentTypes });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['paymentTypes'] });

  const [form, setForm] = useState(EMPTY_FORM);
  const [company, setCompany] = useState<number | null>(null);

  const createMutation = useMutation({
    mutationFn: createPaymentType,
    onSuccess: () => { refresh(); setForm(EMPTY_FORM); },
    onError: (error: unknown) => alert(extractApiError(error, t('errors.error_occurred'))),
  });
  const deleteMutation = useMutation({
    mutationFn: deletePaymentType,
    onSuccess: refresh,
    // Тип, который есть в платежах, сервер удалить не даст — показываем почему
    onError: (error: unknown) => alert(extractApiError(error, t('errors.error_occurred'))),
  });

  const kindLabel = (kind: PlanKind) => t(`pages.settings.finance_refs.plan_${kind || 'none'}`);
  const monthsLabel = (kind: PlanKind) => (kind === 'DEFERRED'
    ? t('pages.settings.finance_refs.months_deferred')
    : t('pages.settings.finance_refs.months_installment'));
  // Общую запись меняет только системный администратор
  const editable = (row: PaymentType) => admin || row.company !== null;

  const submit = () => {
    const payload: PaymentTypePayload = {
      name: form.name.trim(),
      plan_kind: form.plan_kind,
      plan_months: Number(form.plan_months) || 0,
      discount_percent: form.discount_percent || '0',
      down_payment_percent: form.down_payment_percent || '0',
    };
    if (admin) payload.company = company;
    createMutation.mutate(payload);
  };

  const columns: GridColDef<PaymentType>[] = [
    { field: 'name', headerName: t('pages.settings.payment_type_name'), flex: 1.4, minWidth: 180, editable: canEdit },
    {
      field: 'plan_kind', headerName: t('pages.settings.finance_refs.plan'), flex: 1.2, minWidth: 170,
      editable: canEdit, type: 'singleSelect',
      valueOptions: PLAN_KINDS.map(kind => ({ value: kind, label: kindLabel(kind) })),
    },
    {
      field: 'plan_months', headerName: t('pages.settings.finance_refs.months'), width: 110,
      editable: canEdit, type: 'number',
    },
    {
      field: 'discount_percent', headerName: t('pages.settings.finance_refs.discount'), width: 110,
      editable: canEdit, type: 'number', valueGetter: (value: string) => Number(value),
    },
    {
      field: 'down_payment_percent', headerName: t('pages.settings.finance_refs.down_payment'), width: 130,
      editable: canEdit, type: 'number', valueGetter: (value: string) => Number(value),
    },
    {
      field: 'company_name', headerName: t('common.company'), width: 150,
      valueGetter: (value: string | null) => value || t('pages.settings.finance_refs.shared'),
    },
    {
      field: 'actions', type: 'actions', width: 60,
      getActions: (params) => (canDelete && editable(params.row) ? [
        <GridActionsCellItem
          key="delete"
          icon={<DeleteIcon />}
          label={t('common.delete')}
          onClick={() => {
            if (window.confirm(t('pages.settings.finance_refs.confirm_delete', { name: params.row.name }))) {
              deleteMutation.mutate(params.row.id);
            }
          }}
        />,
      ] : []),
    },
  ];

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1 }}>{t('pages.settings.payment_types')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('pages.settings.finance_refs.types_hint')}</Typography>

      {canAdd && (
        <Grid container spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label={t('pages.settings.new_payment_type')} size="small" fullWidth
              value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <FormControl size="small" fullWidth>
              <InputLabel shrink>{t('pages.settings.finance_refs.plan')}</InputLabel>
              <Select
                label={t('pages.settings.finance_refs.plan')}
                displayEmpty
                notched
                value={form.plan_kind}
                onChange={(e) => setForm(prev => ({ ...prev, plan_kind: e.target.value as PlanKind }))}
              >
                {PLAN_KINDS.map(kind => <MenuItem key={kind || 'none'} value={kind}>{kindLabel(kind)}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          {(form.plan_kind === 'INSTALLMENT' || form.plan_kind === 'DEFERRED') && (
            <Grid size={{ xs: 6, md: 2 }}>
              <TextField
                label={monthsLabel(form.plan_kind)} type="number" size="small" fullWidth
                value={form.plan_months} onChange={(e) => setForm(prev => ({ ...prev, plan_months: e.target.value }))}
                inputProps={{ min: 0, max: 120 }}
              />
            </Grid>
          )}
          {form.plan_kind && (
            <Grid size={{ xs: 6, md: 1.5 }}>
              <TextField
                label={t('pages.settings.finance_refs.discount')} type="number" size="small" fullWidth
                value={form.discount_percent} onChange={(e) => setForm(prev => ({ ...prev, discount_percent: e.target.value }))}
                inputProps={{ min: 0, max: 99.99, step: 0.5 }}
              />
            </Grid>
          )}
          {(form.plan_kind === 'INSTALLMENT' || form.plan_kind === 'DEFERRED') && (
            <Grid size={{ xs: 6, md: 1.5 }}>
              <TextField
                label={t('pages.settings.finance_refs.down_payment')} type="number" size="small" fullWidth
                value={form.down_payment_percent}
                onChange={(e) => setForm(prev => ({ ...prev, down_payment_percent: e.target.value }))}
                inputProps={{ min: 0, max: 99, step: 1 }}
              />
            </Grid>
          )}
          {admin && (
            <Grid size={{ xs: 12, md: 4 }}>
              <CompanyChoice value={company} onChange={setCompany} />
            </Grid>
          )}
          <Grid size={{ xs: 12, md: 2 }}>
            <Button variant="contained" onClick={submit} disabled={!form.name.trim() || createMutation.isPending}>
              {t('common.add')}
            </Button>
          </Grid>
        </Grid>
      )}

      {canEdit && <Alert severity="info" sx={{ mb: 1 }}>{t('pages.settings.finance_refs.edit_hint')}</Alert>}
      <Box sx={{ height: 420, width: '100%' }}>
        <LocalizedDataGrid
          rows={data ?? []}
          columns={columns}
          loading={isLoading}
          isCellEditable={(params) => editable(params.row as PaymentType)}
          processRowUpdate={async (updated: PaymentType, original: PaymentType) => {
            const payload: PaymentTypePayload = {};
            if (updated.name !== original.name) payload.name = updated.name.trim();
            if (updated.plan_kind !== original.plan_kind) payload.plan_kind = updated.plan_kind;
            if (Number(updated.plan_months) !== Number(original.plan_months)) payload.plan_months = Number(updated.plan_months) || 0;
            if (Number(updated.discount_percent) !== Number(original.discount_percent)) {
              payload.discount_percent = String(updated.discount_percent || 0);
            }
            if (Number(updated.down_payment_percent) !== Number(original.down_payment_percent)) {
              payload.down_payment_percent = String(updated.down_payment_percent || 0);
            }
            if (!Object.keys(payload).length) return original;
            // Сервер приводит условия к виду плана (у «100%» нет срока и взноса) — берём его ответ
            const saved = await updatePaymentType({ id: original.id, payload });
            refresh();
            return saved;
          }}
          onProcessRowUpdateError={(error: unknown) => {
            refresh();
            alert(extractApiError(error, t('errors.update_error')));
          }}
        />
      </Box>
    </Box>
  );
}
