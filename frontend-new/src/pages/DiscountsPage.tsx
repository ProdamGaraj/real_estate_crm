import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, CircularProgress, Link as MuiLink } from '@mui/material';
import { GridActionsCellItem } from '@mui/x-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../components/common/LocalizedDataGrid';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { getDiscounts, createDiscount, updateDiscount } from '../api/discounts';
import type { Discount, DiscountPayload } from '../api/discounts';
import DiscountForm from '../components/discounts/DiscountForm';
import EditIcon from '@mui/icons-material/Edit';
import { Link as RouterLink } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { hasPermission } from '../utils/permissions';

export default function DiscountsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const canCreate = hasPermission(user, 'ADD', 'DISCOUNT');
  const canEdit = hasPermission(user, 'EDIT', 'DISCOUNT');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['discounts'], queryFn: getDiscounts });

  const mutation = useMutation({
    mutationFn: (payload: { data: DiscountPayload, id?: number }) => {
      if (payload.id) {
        return updateDiscount({ id: payload.id, payload: payload.data });
      }
      return createDiscount(payload.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      setIsModalOpen(false);
      setEditingDiscount(null);
    },
  });

  const handleOpenCreate = () => {
    setEditingDiscount(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (discount: Discount) => {
    setEditingDiscount(discount);
    setIsModalOpen(true);
  };

  const handleFormSubmit = (data: DiscountPayload) => {
    mutation.mutate({ data, id: editingDiscount?.id });
  };

  const columns: GridColDef<Discount>[] = [
    { field: 'id', headerName: 'ID', width: 90 },
    {
      field: 'name',
      headerName: t('table.name'),
      flex: 1,
      // --- ИЗМЕНЕНИЕ ЗДЕСЬ ---
      // Превращаем ячейку в ссылку, ведущую на карточку
      renderCell: (params) => (
        <MuiLink component={RouterLink} to={`/discounts/${params.id}`} underline="hover">
          {params.value}
        </MuiLink>
      )
    },
    { field: 'percentage_value', headerName: t('pages.discounts.percentage'), width: 100 },
    {
      field: 'property_type', headerName: t('pages.discounts.property_type'), flex: 1,
      valueGetter: (value: string) => value ? t(`statuses.property_type.${value}`, value) : ''
    },
    {
      field: 'buildings_info', headerName: t('pages.discounts.applied_to_buildings'), flex: 2,
      valueGetter: (value: string[]) => value.join(', ') || t('common.all')
    },
    { field: 'start_date', headerName: t('table.start_date'), type: 'date', width: 120, valueGetter: (value) => value ? new Date(value) : null },
    { field: 'end_date', headerName: t('table.end_date'), type: 'date', width: 120, valueGetter: (value) => value ? new Date(value) : null },
    {
      field: 'actions',
      type: 'actions',
      getActions: (params) => canEdit ? [
        <GridActionsCellItem
          icon={<EditIcon />}
          label={t('common.edit')}
          onClick={() => handleOpenEdit(params.row)}
        />,
      ] : [],
    },
  ];

  if (isLoading) return <CircularProgress />;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">{t('pages.discounts.title')}</Typography>
        {canCreate && (
          <Button variant="contained" onClick={handleOpenCreate}>{t('pages.discounts.create_discount')}</Button>
        )}
      </Box>

      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingDiscount ? t('pages.discounts.edit_discount') : t('pages.discounts.new_discount')}</DialogTitle>
        <DialogContent>
          <DiscountForm
            onSubmit={handleFormSubmit}
            isPending={mutation.isPending}
            initialData={editingDiscount}
          />
        </DialogContent>
      </Dialog>

      <Box sx={{ height: 600, width: '100%' }}>
        <LocalizedDataGrid rows={data || []} columns={columns} />
      </Box>
    </Box>
  );
}