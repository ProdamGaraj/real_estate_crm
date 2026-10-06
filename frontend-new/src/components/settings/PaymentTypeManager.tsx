// real_estate_crm/frontend-new/src/components/settings/PaymentTypeManager.tsx

/**
 * Типы платежей и планы оплаты.
 *
 * Тип платежа — название, которое получают платежи графика. Если задать ему
 * план («Рассрочка на 12 месяцев»: взнос 30 % и 12 ежемесячных платежей), он
 * появится вариантом в калькуляторе рассрочки, и по нему можно одной кнопкой
 * собрать график сделки. Своей скидки у плана нет: скидки заводятся в разделе
 * «Скидки» и могут действовать только для отдельных планов.
 *
 * Добавление и правка — в окне. Общие записи (без компании) видны всем
 * компаниям, а менять и удалять их может только системный администратор.
 * Тип, который есть в платежах, удалить нельзя — только переименовать.
 */

import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel,
  MenuItem, Select, Stack, TextField, Typography,
} from '@mui/material';
import { GridActionsCellItem } from '@mui/x-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
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

interface FormState {
  name: string;
  plan_kind: PlanKind;
  plan_months: string;
  down_payment_percent: string;
  company: number | null;
}

const toForm = (type: PaymentType | null): FormState => ({
  name: type?.name ?? '',
  plan_kind: type?.plan_kind ?? '',
  plan_months: type && type.plan_months ? String(type.plan_months) : '',
  down_payment_percent: type && Number(type.down_payment_percent) ? String(Number(type.down_payment_percent)) : '',
  company: type?.company ?? null,
});

interface DialogProps {
  open: boolean;
  type: PaymentType | null;
  admin: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** Окно добавления и правки типа платежа */
function PaymentTypeDialog({ open, type, admin, onClose, onSaved }: DialogProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(toForm(type));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(toForm(type));
      setError(null);
    }
  }, [open, type]);

  const save = useMutation({
    mutationFn: (payload: PaymentTypePayload) => (type
      ? updatePaymentType({ id: type.id, payload })
      : createPaymentType(payload)),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (err: unknown) => setError(extractApiError(err, t('errors.error_occurred'))),
  });

  const withTerm = form.plan_kind === 'INSTALLMENT' || form.plan_kind === 'DEFERRED';
  const kindLabel = (kind: PlanKind) => t(`pages.settings.finance_refs.plan_${kind || 'none'}`);

  const submit = () => {
    const payload: PaymentTypePayload = {
      name: form.name.trim(),
      plan_kind: form.plan_kind,
      plan_months: withTerm ? Number(form.plan_months) || 0 : 0,
      down_payment_percent: withTerm ? (form.down_payment_percent || '0') : '0',
    };
    // Компанию записи выбирает только системный администратор
    if (admin) payload.company = form.company;
    save.mutate(payload);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{type ? t('pages.settings.finance_refs.edit_type') : t('pages.settings.finance_refs.add_type')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={t('pages.settings.payment_type_name')} fullWidth autoFocus
            value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
          />
          <FormControl fullWidth>
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
          <Typography variant="body2" color="text.secondary">
            {t(`pages.settings.finance_refs.plan_${form.plan_kind || 'none'}_hint`)}
          </Typography>
          {withTerm && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label={form.plan_kind === 'DEFERRED'
                  ? t('pages.settings.finance_refs.months_deferred')
                  : t('pages.settings.finance_refs.months_installment')}
                type="number" fullWidth
                value={form.plan_months} onChange={(e) => setForm(prev => ({ ...prev, plan_months: e.target.value }))}
                inputProps={{ min: 0, max: 120 }}
              />
              <TextField
                label={t('pages.settings.finance_refs.down_payment')} type="number" fullWidth
                value={form.down_payment_percent}
                onChange={(e) => setForm(prev => ({ ...prev, down_payment_percent: e.target.value }))}
                inputProps={{ min: 0, max: 99, step: 1 }}
              />
            </Stack>
          )}
          {admin && <CompanyChoice value={form.company} onChange={(company) => setForm(prev => ({ ...prev, company }))} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="contained" onClick={submit} disabled={!form.name.trim() || save.isPending}>
          {save.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

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

  const [dialog, setDialog] = useState<{ open: boolean; type: PaymentType | null }>({ open: false, type: null });
  const deleteMutation = useMutation({
    mutationFn: deletePaymentType,
    onSuccess: refresh,
    // Тип, который есть в платежах, сервер удалить не даст — показываем почему
    onError: (error: unknown) => alert(extractApiError(error, t('errors.error_occurred'))),
  });

  // Общую запись меняет только системный администратор
  const editable = (row: PaymentType) => admin || row.company !== null;
  const kindLabel = (kind: PlanKind) => t(`pages.settings.finance_refs.plan_${kind || 'none'}`);
  /** «12 мес., взнос от 30 %» — условия плана одной строкой */
  const termsText = (row: PaymentType) => {
    if (row.plan_kind === 'INSTALLMENT') {
      return t('pages.settings.finance_refs.terms_installment', { months: row.plan_months, down: Number(row.down_payment_percent) });
    }
    if (row.plan_kind === 'DEFERRED') {
      return t('pages.settings.finance_refs.terms_deferred', { months: row.plan_months, down: Number(row.down_payment_percent) });
    }
    return '';
  };

  const columns: GridColDef<PaymentType>[] = [
    { field: 'name', headerName: t('pages.settings.payment_type_name'), flex: 1.2, minWidth: 180 },
    {
      field: 'plan_kind', headerName: t('pages.settings.finance_refs.plan'), flex: 1.1, minWidth: 170,
      valueGetter: (value: PlanKind) => kindLabel(value),
    },
    {
      field: 'terms', headerName: t('pages.settings.finance_refs.terms'), flex: 1.5, minWidth: 260,
      valueGetter: (_value, row) => termsText(row),
    },
    {
      field: 'company_name', headerName: t('common.company'), width: 170,
      valueGetter: (value: string | null) => value || t('pages.settings.finance_refs.shared'),
    },
    {
      field: 'actions', type: 'actions', width: 90,
      getActions: (params) => [
        ...(canEdit && editable(params.row) ? [
          <GridActionsCellItem
            key="edit"
            icon={<EditIcon />}
            label={t('common.edit')}
            onClick={() => setDialog({ open: true, type: params.row })}
          />,
        ] : []),
        ...(canDelete && editable(params.row) ? [
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
      ],
    },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6">{t('pages.settings.payment_types')}</Typography>
        {canAdd && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ open: true, type: null })}>
            {t('pages.settings.finance_refs.add_type')}
          </Button>
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('pages.settings.finance_refs.types_hint')}</Typography>
      <Box sx={{ height: 420, width: '100%' }}>
        <LocalizedDataGrid
          rows={data ?? []}
          columns={columns}
          loading={isLoading}
          onRowDoubleClick={(params) => {
            const row = params.row as PaymentType;
            if (canEdit && editable(row)) setDialog({ open: true, type: row });
          }}
        />
      </Box>
      <PaymentTypeDialog
        open={dialog.open}
        type={dialog.type}
        admin={admin}
        onClose={() => setDialog({ open: false, type: null })}
        onSaved={refresh}
      />
    </Box>
  );
}
