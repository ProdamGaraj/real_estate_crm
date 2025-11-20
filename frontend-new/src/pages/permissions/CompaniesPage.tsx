import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  Alert,
  CircularProgress,
  Link as MuiLink,
  Stack,
  Chip,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { getCompanies } from '../../api/permissions';
import CompanyForm from '../../components/permissions/CompanyForm';
import AddIcon from '@mui/icons-material/Add';
import BusinessIcon from '@mui/icons-material/Business';

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 70 },
  {
    field: 'name',
    headerName: 'Название',
    width: 250,
    renderCell: (params) => (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <BusinessIcon color="primary" fontSize="small" />
        <MuiLink
          component={RouterLink}
          to={`/permissions/companies/${params.row.id}`}
          underline="hover"
        >
          {params.value}
        </MuiLink>
      </Box>
    ),
  },
  { field: 'code', headerName: 'Код', width: 150 },
  { field: 'description', headerName: 'Описание', width: 300 },
  {
    field: 'is_active',
    headerName: 'Статус',
    width: 120,
    renderCell: (params) => (
      <Chip
        label={params.value ? 'Активна' : 'Неактивна'}
        color={params.value ? 'success' : 'default'}
        size="small"
      />
    ),
  },
  {
    field: 'created_at',
    headerName: 'Дата создания',
    width: 180,
    type: 'dateTime',
    valueGetter: (value) => (value ? new Date(value) : null),
  },
];

export default function CompaniesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['companies'],
    queryFn: () => getCompanies(),
  });

  const handleSuccess = () => {
    setIsModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ['companies'] });
  };

  return (
    <Stack spacing={3}>
      {/* Заголовок */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Компании
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Управление организационной структурой системы
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setIsModalOpen(true)}
        >
          Создать компанию
        </Button>
      </Box>

      {/* Таблица */}
      <Paper sx={{ p: 2 }}>
        {isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Ошибка загрузки: {error instanceof Error ? error.message : 'Неизвестная ошибка'}
          </Alert>
        )}

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <DataGrid
            rows={data || []}
            columns={columns}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
            }}
            pageSizeOptions={[10, 25, 50]}
            autoHeight
            disableRowSelectionOnClick
          />
        )}
      </Paper>

      {/* Модальное окно создания */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Создать компанию</DialogTitle>
        <DialogContent>
          <CompanyForm onSuccess={handleSuccess} onCancel={() => setIsModalOpen(false)} />
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
