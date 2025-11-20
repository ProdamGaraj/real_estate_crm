import { useState } from 'react';
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, CircularProgress, Link as MuiLink } from '@mui/material';
import { DataGrid, GridActionsCellItem } from '@mui/x-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { getDiscounts, createDiscount, updateDiscount } from '../api/discounts';
import type { Discount, DiscountPayload } from '../api/discounts';
import DiscountForm from '../components/discounts/DiscountForm';
import EditIcon from '@mui/icons-material/Edit';
import { Link as RouterLink } from 'react-router-dom'; // <-- Добавляем импорт

export default function DiscountsPage() {
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
      headerName: 'Название',
      flex: 1,
      // --- ИЗМЕНЕНИЕ ЗДЕСЬ ---
      // Превращаем ячейку в ссылку, ведущую на карточку
      renderCell: (params) => (
        <MuiLink component={RouterLink} to={`/discounts/${params.id}`} underline="hover">
          {params.value}
        </MuiLink>
      )
    },
    { field: 'percentage_value', headerName: 'Процент', width: 100 },
    { field: 'property_type', headerName: 'Тип объекта', flex: 1 },
    { field: 'buildings_info', headerName: 'Применено к домам', flex: 2,
      valueGetter: (value: string[]) => value.join(', ') || 'Все'
    },
    { field: 'start_date', headerName: 'Начало', type: 'date', width: 120, valueGetter: (value) => value ? new Date(value) : null },
    { field: 'end_date', headerName: 'Окончание', type: 'date', width: 120, valueGetter: (value) => value ? new Date(value) : null },
    {
      field: 'actions',
      type: 'actions',
      getActions: (params) => [
        <GridActionsCellItem
          icon={<EditIcon />}
          label="Редактировать"
          onClick={() => handleOpenEdit(params.row)}
        />,
      ],
    },
  ];

  if (isLoading) return <CircularProgress />;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">Скидки</Typography>
        <Button variant="contained" onClick={handleOpenCreate}>Создать скидку</Button>
      </Box>

      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingDiscount ? 'Редактировать скидку' : 'Новая скидка'}</DialogTitle>
        <DialogContent>
          <DiscountForm
            onSubmit={handleFormSubmit}
            isPending={mutation.isPending}
            initialData={editingDiscount}
          />
        </DialogContent>
      </Dialog>

      <Box sx={{ height: 600, width: '100%' }}>
        <DataGrid rows={data || []} columns={columns} />
      </Box>
    </Box>
  );
}