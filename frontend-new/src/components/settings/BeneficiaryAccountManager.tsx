// real_estate_crm/frontend-new/src/components/settings/BeneficiaryAccountManager.tsx

/**
 * Счета получателей.
 *
 * Добавление и правка — в окне. Счёт, по которому уже есть платежи, удалить
 * нельзя — его переименовывают (например, «123» → «Payme») или заводят новый.
 * Общие счета (без компании) меняет только системный администратор.
 */

import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
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
  createBeneficiaryAccount, deleteBeneficiaryAccount, getBeneficiaryAccounts, updateBeneficiaryAccount,
} from '../../api/finances';
import type { BeneficiaryAccount, BeneficiaryAccountPayload } from '../../api/finances';
import { useAuthStore } from '../../store/authStore';
import { hasPermission, isSystemAdmin } from '../../utils/permissions';
import { extractApiError } from '../../utils/apiError';

interface DialogProps {
  open: boolean;
  account: BeneficiaryAccount | null;
  admin: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** Окно добавления и правки счёта получателя */
function AccountDialog({ open, account, admin, onClose, onSaved }: DialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [details, setDetails] = useState('');
  const [company, setCompany] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(account?.name ?? '');
      setDetails(account?.details ?? '');
      setCompany(account?.company ?? null);
      setError(null);
    }
  }, [open, account]);

  const save = useMutation({
    mutationFn: (payload: BeneficiaryAccountPayload) => (account
      ? updateBeneficiaryAccount({ id: account.id, payload })
      : createBeneficiaryAccount(payload)),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (err: unknown) => setError(extractApiError(err, t('errors.error_occurred'))),
  });

  const submit = () => {
    const payload: BeneficiaryAccountPayload = { name: name.trim(), details: details.trim() };
    if (admin) payload.company = company;
    save.mutate(payload);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{account ? t('pages.settings.finance_refs.edit_account') : t('pages.settings.finance_refs.add_account')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label={t('pages.settings.account_name')} fullWidth autoFocus value={name}
            onChange={(e) => setName(e.target.value)} />
          <TextField label={t('common.details')} fullWidth multiline rows={3} value={details}
            onChange={(e) => setDetails(e.target.value)} />
          {admin && <CompanyChoice value={company} onChange={setCompany} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="contained" onClick={submit} disabled={!name.trim() || !details.trim() || save.isPending}>
          {save.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function BeneficiaryAccountManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const admin = isSystemAdmin(user);
  const canAdd = hasPermission(user, 'ADD', 'BENEFICIARY_ACCOUNT');
  const canEdit = hasPermission(user, 'EDIT', 'BENEFICIARY_ACCOUNT');
  const canDelete = hasPermission(user, 'DELETE', 'BENEFICIARY_ACCOUNT');

  const { data, isLoading } = useQuery({ queryKey: ['beneficiaryAccounts'], queryFn: getBeneficiaryAccounts });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['beneficiaryAccounts'] });

  const [dialog, setDialog] = useState<{ open: boolean; account: BeneficiaryAccount | null }>({ open: false, account: null });
  const deleteMutation = useMutation({
    mutationFn: deleteBeneficiaryAccount,
    onSuccess: refresh,
    // Счёт с платежами сервер удалить не даст — раньше кнопка просто молчала
    onError: (error: unknown) => alert(extractApiError(error, t('errors.error_occurred'))),
  });

  const editable = (row: BeneficiaryAccount) => admin || row.company !== null;

  const columns: GridColDef<BeneficiaryAccount>[] = [
    { field: 'name', headerName: t('pages.settings.account_name'), flex: 1, minWidth: 150 },
    { field: 'details', headerName: t('common.details'), flex: 2, minWidth: 200 },
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
            onClick={() => setDialog({ open: true, account: params.row })}
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
        <Typography variant="h6">{t('pages.settings.beneficiary_accounts')}</Typography>
        {canAdd && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ open: true, account: null })}>
            {t('pages.settings.finance_refs.add_account')}
          </Button>
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('pages.settings.finance_refs.accounts_hint')}</Typography>
      <Box sx={{ height: 400, width: '100%' }}>
        <LocalizedDataGrid
          rows={data ?? []}
          columns={columns}
          loading={isLoading}
          onRowDoubleClick={(params) => {
            const row = params.row as BeneficiaryAccount;
            if (canEdit && editable(row)) setDialog({ open: true, account: row });
          }}
        />
      </Box>
      <AccountDialog
        open={dialog.open}
        account={dialog.account}
        admin={admin}
        onClose={() => setDialog({ open: false, account: null })}
        onSaved={refresh}
      />
    </Box>
  );
}
