import { Box, Typography, Button, TextField } from '@mui/material';
import { DataGrid, GridActionsCellItem } from '@mui/x-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// ИСПРАВЛЕНИЕ 1: Импортируем 'updateRejectionReason' вместо 'deleteRejectionReason'
import { getRejectionReasons, createRejectionReason, updateRejectionReason } from '../../api/settings';
import ArchiveIcon from '@mui/icons-material/Archive';
import { useForm } from 'react-hook-form';

interface ReasonManagerProps {
  title: string;
  reasonType: 'JUNK' | 'REJECTED';
}

export default function ReasonManager({ title, reasonType }: ReasonManagerProps) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset } = useForm<{ name: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['rejectionReasons', reasonType],
    queryFn: () => getRejectionReasons(reasonType),
  });

  const createMutation = useMutation({
    mutationFn: createRejectionReason,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rejectionReasons', reasonType] });
      reset();
    },
  });

  // ИСПРАВЛЕНИЕ 2: Используем 'updateRejectionReason' и переименовываем мутацию для ясности
  const archiveMutation = useMutation({
    mutationFn: updateRejectionReason,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rejectionReasons', reasonType] });
    },
  });

  const onFormSubmit = (data: { name: string }) => {
    createMutation.mutate({ ...data, reason_type: reasonType });
  };

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 90 },
    { field: 'name', headerName: 'Название причины', flex: 1 },
    {
      field: 'actions', type: 'actions',
      getActions: (params) => [
        <GridActionsCellItem
          icon={<ArchiveIcon />}
          label="Архивировать"
          // ИСПРАВЛЕНИЕ 3: Вызываем правильную мутацию
          onClick={() => archiveMutation.mutate({ id: params.row.id, payload: { is_active: false } })}
        />,
      ],
    },
  ];

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
      <Box component="form" onSubmit={handleSubmit(onFormSubmit)} sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <TextField label="Новая причина" size="small" fullWidth {...register('name', { required: true })} />
        <Button type="submit" variant="contained">Добавить</Button>
      </Box>
      <Box sx={{ height: 400, width: '100%' }}>
        <DataGrid rows={data || []} columns={columns} loading={isLoading} />
      </Box>
    </Box>
  );
}