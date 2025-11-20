import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Stack,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  Divider,
  Card,
  CardContent,
  IconButton,
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCompany, deleteCompany } from '../../api/permissions';
import CompanyForm from '../../components/permissions/CompanyForm';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BusinessIcon from '@mui/icons-material/Business';
import InfoIcon from '@mui/icons-material/Info';

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const { data: company, isLoading, isError, error } = useQuery({
    queryKey: ['company', id],
    queryFn: () => getCompany(Number(id)),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCompany(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      navigate('/settings?tab=companies');
    },
  });

  const handleDelete = () => {
    deleteMutation.mutate();
  };

  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ['company', id] });
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    return (
      <Alert severity="error">
        Ошибка загрузки: {error instanceof Error ? error.message : 'Неизвестная ошибка'}
      </Alert>
    );
  }

  if (!company) {
    return <Alert severity="warning">Компания не найдена</Alert>;
  }

  return (
    <Stack spacing={3}>
      {/* Навигация */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton onClick={() => navigate('/settings?tab=companies')}>
          <ArrowBackIcon />
        </IconButton>
        <BusinessIcon color="primary" sx={{ fontSize: 32 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4">{company.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            Код: {company.code}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<EditIcon />}
          onClick={() => setIsEditModalOpen(true)}
        >
          Редактировать
        </Button>
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={() => setIsDeleteDialogOpen(true)}
        >
          Удалить
        </Button>
      </Box>

      {/* Основная информация */}
      <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box sx={{ flex: 2 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <InfoIcon color="primary" />
                <Typography variant="h6">Основная информация</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Название
                  </Typography>
                  <Typography variant="body1">{company.name}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Код
                  </Typography>
                  <Typography variant="body1">{company.code}</Typography>
                </Box>
                {company.description && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Описание
                    </Typography>
                    <Typography variant="body1">{company.description}</Typography>
                  </Box>
                )}
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Статус
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip
                      label={company.is_active ? 'Активна' : 'Неактивна'}
                      color={company.is_active ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ flex: 1 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Статистика
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Дата создания
                  </Typography>
                  <Typography variant="body2">
                    {new Date(company.created_at).toLocaleString('ru-RU')}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Последнее обновление
                  </Typography>
                  <Typography variant="body2">
                    {new Date(company.updated_at).toLocaleString('ru-RU')}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Модальное окно редактирования */}
      <Dialog
        open={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Редактировать компанию</DialogTitle>
        <DialogContent>
          <CompanyForm
            company={company}
            onSuccess={handleEditSuccess}
            onCancel={() => setIsEditModalOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Диалог подтверждения удаления */}
      <Dialog
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        maxWidth="xs"
      >
        <DialogTitle>Удалить компанию?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>
            Вы уверены, что хотите удалить компанию "{company.name}"?
          </Typography>
          <Typography variant="body2" color="error">
            Это действие нельзя отменить.
          </Typography>
          <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
            <Button
              variant="outlined"
              onClick={() => setIsDeleteDialogOpen(false)}
              fullWidth
            >
              Отмена
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              fullWidth
            >
              {deleteMutation.isPending ? 'Удаление...' : 'Удалить'}
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
