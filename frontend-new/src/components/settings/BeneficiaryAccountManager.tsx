// real_estate_crm/frontend-new/src/components/settings/BeneficiaryAccountManager.tsx

/**
 * Счета получателей.
 *
 * Название и реквизиты правятся прямо в таблице. Счёт, по которому уже есть
 * платежи, удалить нельзя — его переименовывают (например, «123» → «Payme»)
 * или заводят новый. Общие счета (без компании) меняет только системный
 * администратор.
 */

import { useState } from 'react';
import { Alert, Box, Button, Grid, Stack, TextField, Typography } from '@mui/material';
import { GridActionsCellItem } from '@mui/x-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import DeleteIcon from '@mui/icons-material/Delete';
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

  const [name, setName] = useState('');
  const [details, setDetails] = useState('');
  const [company, setCompany] = useState<number | null>(null);

  const createMutation = useMutation({
    mutationFn: createBeneficiaryAccount,
    onSuccess: () => { refresh(); setName(''); setDetails(''); },
    onError: (error: unknown) => alert(extractApiError(error, t('errors.error_occurred'))),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteBeneficiaryAccount,
    onSuccess: refresh,
    // Счёт с платежами сервер удалить не даст — раньше кнопка просто молчала
    onError: (error: unknown) => alert(extractApiError(error, t('errors.error_occurred'))),
  });

  const editable = (row: BeneficiaryAccount) => admin || row.company !== null;

  const columns: GridColDef<BeneficiaryAccount>[] = [
    { field: 'name', headerName: t('pages.settings.account_name'), flex: 1, minWidth: 150, editable: canEdit },
    { field: 'details', headerName: t('common.details'), flex: 2, minWidth: 200, editable: canEdit },
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
      <Typography variant="h6" sx={{ mb: 1 }}>{t('pages.settings.beneficiary_accounts')}</Typography>
      {canAdd && (
        <Stack spacing={2} sx={{ mb: 2 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: admin ? 6 : 12 }}>
              <TextField label={t('pages.settings.account_name')} size="small" fullWidth value={name}
                onChange={(e) => setName(e.target.value)} />
            </Grid>
            {admin && (
              <Grid size={{ xs: 12, md: 6 }}>
                <CompanyChoice value={company} onChange={setCompany} />
              </Grid>
            )}
          </Grid>
          <TextField label={t('common.details')} size="small" fullWidth multiline rows={2} value={details}
            onChange={(e) => setDetails(e.target.value)} />
          <Box>
            <Button
              variant="contained"
              disabled={!name.trim() || !details.trim() || createMutation.isPending}
              onClick={() => {
                const payload: BeneficiaryAccountPayload = { name: name.trim(), details: details.trim() };
                if (admin) payload.company = company;
                createMutation.mutate(payload);
              }}
            >
              {t('common.add')}
            </Button>
          </Box>
        </Stack>
      )}
      {canEdit && <Alert severity="info" sx={{ mb: 1 }}>{t('pages.settings.finance_refs.accounts_hint')}</Alert>}
      <Box sx={{ height: 400, width: '100%' }}>
        <LocalizedDataGrid
          rows={data ?? []}
          columns={columns}
          loading={isLoading}
          isCellEditable={(params) => editable(params.row as BeneficiaryAccount)}
          processRowUpdate={async (updated: BeneficiaryAccount, original: BeneficiaryAccount) => {
            const payload: BeneficiaryAccountPayload = {};
            if (updated.name !== original.name) payload.name = updated.name.trim();
            if (updated.details !== original.details) payload.details = updated.details;
            if (!Object.keys(payload).length) return original;
            const saved = await updateBeneficiaryAccount({ id: original.id, payload });
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
