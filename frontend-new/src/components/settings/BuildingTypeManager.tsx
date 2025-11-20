import { Box, Typography, Button, TextField } from '@mui/material';
import { DataGrid, GridActionsCellItem } from '@mui/x-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBuildingTypes, createBuildingType, deleteBuildingType } from '../../api/settings';
import DeleteIcon from '@mui/icons-material/Delete';
import { useForm } from 'react-hook-form';

export default function BuildingTypeManager() {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset } = useForm<{ name: string }>();

  const { data, isLoading } = useQuery({ queryKey: ['buildingTypes'], queryFn: getBuildingTypes });

  const createMutation = useMutation({
    mutationFn: createBuildingType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buildingTypes'] });
      reset();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBuildingType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buildingTypes'] });
    },
  });

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 90 },
    { field: 'name', headerName: 'Название типа', flex: 1 },
    {
      field: 'actions', type: 'actions',
      getActions: (params) => [
        <GridActionsCellItem
          icon={<DeleteIcon />}
          label="Удалить"
          onClick={() => deleteMutation.mutate(params.row.id)}
        />,
      ],
    },
  ];

  return (
    <Box>
      <Box component="form" onSubmit={handleSubmit((data) => createMutation.mutate(data))} sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <TextField label="Новый тип дома" size="small" fullWidth {...register('name', { required: true })} />
        <Button type="submit" variant="contained">Добавить</Button>
      </Box>
      <Box sx={{ height: 400, width: '100%' }}>
        <DataGrid rows={data || []} columns={columns} loading={isLoading} />
      </Box>
    </Box>
  );
}