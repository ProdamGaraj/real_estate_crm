// real_estate_crm/frontend-new/src/components/settings/BeneficiaryAccountManager.tsx

import { Box, Typography, Button, TextField, Stack } from '@mui/material';
import { GridActionsCellItem } from '@mui/x-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../common/LocalizedDataGrid';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getBeneficiaryAccounts, createBeneficiaryAccount, deleteBeneficiaryAccount } from '../../api/finances';
import DeleteIcon from '@mui/icons-material/Delete';
import { useForm } from 'react-hook-form';

type FormInputs = { name: string; details: string };

export default function BeneficiaryAccountManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset } = useForm<FormInputs>();

  const { data, isLoading } = useQuery({ queryKey: ['beneficiaryAccounts'], queryFn: getBeneficiaryAccounts });

  const createMutation = useMutation({
    mutationFn: createBeneficiaryAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beneficiaryAccounts'] });
      reset();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBeneficiaryAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beneficiaryAccounts'] });
    },
  });

  const columns: GridColDef[] = [
    { field: 'name', headerName: t('pages.settings.account_name'), flex: 1 },
    { field: 'details', headerName: t('common.details'), flex: 2 },
    {
      field: 'actions', type: 'actions',
      getActions: (params) => [
        <GridActionsCellItem
          icon={<DeleteIcon />}
          label={t('common.delete')}
          onClick={() => deleteMutation.mutate(params.row.id)}
        />,
      ],
    },
  ];

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1 }}>{t('pages.settings.beneficiary_accounts')}</Typography>
      <Box component="form" onSubmit={handleSubmit((data) => createMutation.mutate(data))} sx={{ mb: 3 }}>
        <Stack spacing={2}>
            <TextField label={t('pages.settings.account_name')} size="small" fullWidth {...register('name', { required: true })} />
            <TextField label={t('common.details')} size="small" fullWidth multiline rows={2} {...register('details', { required: true })}/>
            <Box>
                <Button type="submit" variant="contained" disabled={createMutation.isPending}>{t('common.add')}</Button>
            </Box>
        </Stack>
      </Box>
      <Box sx={{ height: 400, width: '100%' }}>
        <LocalizedDataGrid rows={data || []} columns={columns} loading={isLoading} />
      </Box>
    </Box>
  );
}