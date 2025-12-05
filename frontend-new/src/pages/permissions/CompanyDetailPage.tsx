import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation();
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
        {t('errors.load_error')}: {error instanceof Error ? error.message : t('errors.unknown_error')}
      </Alert>
    );
  }

  if (!company) {
    return <Alert severity="warning">{t('pages.settings.permissions.company_not_found')}</Alert>;
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
            {t('pages.settings.permissions.code')}: {company.code}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<EditIcon />}
          onClick={() => setIsEditModalOpen(true)}
        >
          {t('common.edit')}
        </Button>
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={() => setIsDeleteDialogOpen(true)}
        >
          {t('common.delete')}
        </Button>
      </Box>

      {/* Основная информация */}
      <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box sx={{ flex: 2 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <InfoIcon color="primary" />
                <Typography variant="h6">{t('pages.settings.permissions.basic_info')}</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('pages.settings.permissions.name')}
                  </Typography>
                  <Typography variant="body1">{company.name}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('pages.settings.permissions.code')}
                  </Typography>
                  <Typography variant="body1">{company.code}</Typography>
                </Box>
                {company.description && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {t('common.description')}
                    </Typography>
                    <Typography variant="body1">{company.description}</Typography>
                  </Box>
                )}
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('common.status')}
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip
                      label={company.is_active ? t('pages.settings.permissions.active_status') : t('pages.settings.permissions.inactive_status')}
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
                {t('pages.settings.permissions.statistics')}
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('common.created_at')}
                  </Typography>
                  <Typography variant="body2">
                    {new Date(company.created_at).toLocaleString(i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'uz' ? 'uz-UZ' : 'en-US')}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('common.updated_at')}
                  </Typography>
                  <Typography variant="body2">
                    {new Date(company.updated_at).toLocaleString(i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'uz' ? 'uz-UZ' : 'en-US')}
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
        <DialogTitle>{t('pages.settings.permissions.edit_company')}</DialogTitle>
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
        <DialogTitle>{t('pages.settings.permissions.delete_company')}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>
            {t('pages.settings.permissions.confirm_delete_company', { name: company.name })}
          </Typography>
          <Typography variant="body2" color="error">
            {t('common.action_irreversible')}
          </Typography>
          <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
            <Button
              variant="outlined"
              onClick={() => setIsDeleteDialogOpen(false)}
              fullWidth
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              fullWidth
            >
              {deleteMutation.isPending ? t('common.deleting') : t('common.delete')}
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
