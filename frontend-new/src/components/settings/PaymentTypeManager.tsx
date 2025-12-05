// real_estate_crm/frontend-new/src/components/settings/PaymentTypeManager.tsx

import { Box, Typography, Button, TextField } from '@mui/material';
import { GridActionsCellItem } from '@mui/x-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../common/LocalizedDataGrid';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getPaymentTypes, createPaymentType, deletePaymentType } from '../../api/finances';
import DeleteIcon from '@mui/icons-material/Delete';
import { useForm } from 'react-hook-form';

export default function PaymentTypeManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset } = useForm<{ name: string }>();

  const { data, isLoading } = useQuery({ queryKey: ['paymentTypes'], queryFn: getPaymentTypes });

  const createMutation = useMutation({
    mutationFn: createPaymentType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentTypes'] });
      reset();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePaymentType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentTypes'] });
    },
  });

  const columns: GridColDef[] = [
    { field: 'name', headerName: t('pages.settings.payment_type_name'), flex: 1 },
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
      <Typography variant="h6" sx={{ mb: 1 }}>{t('pages.settings.payment_types')}</Typography>
      <Box component="form" onSubmit={handleSubmit((data) => createMutation.mutate(data))} sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <TextField label={t('pages.settings.new_payment_type')} size="small" fullWidth {...register('name', { required: true })} />
        <Button type="submit" variant="contained" disabled={createMutation.isPending}>{t('common.add')}</Button>
      </Box>
      <Box sx={{ height: 400, width: '100%' }}>
        <LocalizedDataGrid rows={data || []} columns={columns} loading={isLoading} />
      </Box>
    </Box>
  );
}