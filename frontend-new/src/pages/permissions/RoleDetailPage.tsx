import { useState, useMemo } from 'react';
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRole, deleteRole } from '../../api/permissions';
import RoleForm from '../../components/permissions/RoleForm';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SecurityIcon from '@mui/icons-material/Security';
import InfoIcon from '@mui/icons-material/Info';

export default function RoleDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Области действия роли
  const ROLE_SCOPE_LABELS = useMemo(() => ({
    SYSTEM: t('pages.settings.permissions.scope_system'),
    COMPANY: t('pages.settings.permissions.scope_company'),
    DEPARTMENT: t('pages.settings.permissions.scope_department'),
    OWN: t('pages.settings.permissions.scope_own'),
  }), [t]);

  // Категории ролей
  const ROLE_CATEGORY_LABELS = useMemo(() => ({
    ADMINISTRATIVE: t('pages.settings.permissions.category_administrative'),
    MANAGEMENT: t('pages.settings.permissions.category_management'),
    OPERATIONAL: t('pages.settings.permissions.category_operational'),
    READONLY: t('pages.settings.permissions.category_readonly'),
    CUSTOM: t('pages.settings.permissions.category_custom'),
  }), [t]);

  // Названия для action (синхронизировано с backend Permission.Action)
  const ACTION_LABELS = useMemo(() => ({
    VIEW: t('pages.settings.permissions.action_view'),
    ADD: t('pages.settings.permissions.action_add'),
    EDIT: t('pages.settings.permissions.action_edit'),
    DELETE: t('pages.settings.permissions.action_delete'),
    EXPORT: t('pages.settings.permissions.action_export'),
    IMPORT: t('pages.settings.permissions.action_import'),
    APPROVE: t('pages.settings.permissions.action_approve'),
    ASSIGN: t('pages.settings.permissions.action_assign'),
    EDIT_IN_PROGRESS: t('pages.settings.permissions.action_edit_in_progress'),
    REOPEN: t('pages.settings.permissions.action_reopen'),
    FORCE_EDIT: t('pages.settings.permissions.action_force_edit'),
    DELETE_LOG: t('pages.settings.permissions.action_delete_log'),
  }), [t]);

  // Названия для scope
  const SCOPE_LABELS = useMemo(() => ({
    OWN: t('pages.settings.permissions.scope_own_short'),
    DEPARTMENT: t('pages.settings.permissions.scope_department_short'),
    COMPANY: t('pages.settings.permissions.scope_company_short'),
    SYSTEM: t('pages.settings.permissions.scope_system_short'),
  }), [t]);

  // Названия для resource
  // Синхронизировано с backend Permission.Resource (27 ресурсов)
  const RESOURCE_LABELS = useMemo(() => ({
    CLIENT: t('pages.settings.permissions.resource_client'),
    APPLICATION: t('pages.settings.permissions.resource_application'),
    APPLICATION_STATUS: t('pages.settings.permissions.resource_application_status'),
    MEETING: t('pages.settings.permissions.resource_meeting'),
    DEAL: t('pages.settings.permissions.resource_deal'),
    PAYMENT: t('pages.settings.permissions.resource_payment'),
    PAYMENT_TYPE: t('pages.settings.permissions.resource_payment_type'),
    PROJECT: t('pages.settings.permissions.resource_project'),
    BUILDING: t('pages.settings.permissions.resource_building'),
    BUILDING_TYPE: t('pages.settings.permissions.resource_building_type'),
    PROPERTY: t('pages.settings.permissions.resource_property'),
    LAYOUT: t('pages.settings.permissions.resource_layout'),
    DISCOUNT: t('pages.settings.permissions.resource_discount'),
    BENEFICIARY_ACCOUNT: t('pages.settings.permissions.resource_beneficiary_account'),
    TEMPLATE: t('pages.settings.permissions.resource_template'),
    REPORT: t('pages.settings.permissions.resource_report'),
    PLAN: t('pages.settings.permissions.resource_plan'),
    TASK: t('pages.settings.permissions.resource_task'),
    TASK_LOG: t('pages.settings.permissions.resource_task_log'),
    COMPANY: t('pages.settings.permissions.resource_company'),
    DEPARTMENT: t('pages.settings.permissions.resource_department'),
    ROLE: t('pages.settings.permissions.resource_role'),
    USER: t('pages.settings.permissions.resource_user'),
    PERMISSION: t('pages.settings.permissions.resource_permission'),
    PARTNER_API_KEY: t('pages.settings.permissions.resource_partner_api_key'),
    DASHBOARD: t('pages.settings.permissions.resource_dashboard'),
    SETTINGS: t('pages.settings.permissions.resource_settings'),
  }), [t]);

  const { data: role, isLoading, isError, error } = useQuery({
    queryKey: ['role', id],
    queryFn: () => getRole(Number(id)),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteRole(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      navigate('/settings?tab=roles');
    },
  });

  const handleDelete = () => {
    deleteMutation.mutate();
  };

  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ['role', id] });
  };

  // Группировка разрешений по ресурсам
  const groupPermissionsByResource = () => {
    if (!role?.permissions) return {};
    
    const grouped: Record<string, any[]> = {};
    role.permissions.forEach((perm) => {
      const resource = perm.resource || 'OTHER';
      if (!grouped[resource]) {
        grouped[resource] = [];
      }
      grouped[resource].push(perm);
    });
    
    return grouped;
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

  if (!role) {
    return <Alert severity="warning">{t('pages.settings.permissions.role_not_found')}</Alert>;
  }

  const groupedPermissions = groupPermissionsByResource();

  return (
    <Stack spacing={3}>
      {/* Навигация */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton onClick={() => navigate('/settings?tab=roles')}>
          <ArrowBackIcon />
        </IconButton>
        <SecurityIcon color="primary" sx={{ fontSize: 32 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4">
            {role.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('pages.settings.permissions.code')}: {role.code} • {t('pages.settings.permissions.scope_label')} {role.scope_display || ROLE_SCOPE_LABELS[role.scope as keyof typeof ROLE_SCOPE_LABELS]} • {t('pages.settings.permissions.category_label')} {role.category_display || ROLE_CATEGORY_LABELS[role.category as keyof typeof ROLE_CATEGORY_LABELS]}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<EditIcon />}
          onClick={() => setIsEditModalOpen(true)}
          disabled={role.is_system}
        >
          {t('common.edit')}
        </Button>
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={() => setIsDeleteDialogOpen(true)}
          disabled={role.is_system}
        >
          {t('common.delete')}
        </Button>
      </Box>

      {/* Системная роль предупреждение */}
      {role.is_system && (
        <Alert severity="info">
          {t('pages.settings.permissions.system_role_warning')}
        </Alert>
      )}

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
                  <Typography variant="body1">
                    {role.name}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('pages.settings.permissions.code')}
                  </Typography>
                  <Typography variant="body1">{role.code}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('pages.settings.permissions.scope')}
                  </Typography>
                  <Typography variant="body1" component="div">
                    <Chip
                      label={role.scope_display || ROLE_SCOPE_LABELS[role.scope as keyof typeof ROLE_SCOPE_LABELS]}
                      color="primary"
                      size="small"
                    />
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('pages.settings.permissions.category')}
                  </Typography>
                  <Typography variant="body1" component="div">
                    <Chip
                      label={role.category_display || ROLE_CATEGORY_LABELS[role.category as keyof typeof ROLE_CATEGORY_LABELS]}
                      color="info"
                      size="small"
                      variant="outlined"
                    />
                  </Typography>
                </Box>
                {role.description && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {t('common.description')}
                    </Typography>
                    <Typography variant="body1">{role.description}</Typography>
                  </Box>
                )}
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('common.status')}
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip
                      label={role.is_active ? t('pages.settings.permissions.active_status') : t('pages.settings.permissions.inactive_status')}
                      color={role.is_active ? 'success' : 'default'}
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
                    {t('pages.settings.permissions.permissions_count')}
                  </Typography>
                  <Typography variant="h4" color="primary">
                    {role.permissions?.length || 0}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('common.created_at')}
                  </Typography>
                  <Typography variant="body2">
                    {new Date(role.created_at).toLocaleString(i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'uz' ? 'uz-UZ' : 'en-US')}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('common.updated_at')}
                  </Typography>
                  <Typography variant="body2">
                    {new Date(role.updated_at).toLocaleString(i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'uz' ? 'uz-UZ' : 'en-US')}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Матрица разрешений */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {t('pages.settings.permissions.permissions_matrix')}
          </Typography>
          <Divider sx={{ mb: 2 }} />
          
          {Object.entries(groupedPermissions).map(([resource, perms]) => (
            <Box key={resource} sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>
                {RESOURCE_LABELS[resource as keyof typeof RESOURCE_LABELS] || resource}
                <Chip label={perms.length} size="small" sx={{ ml: 1 }} />
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('pages.settings.permissions.action')}</TableCell>
                      <TableCell>{t('pages.settings.permissions.scope')}</TableCell>
                      <TableCell>{t('common.description')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {perms.map((perm: any) => (
                      <TableRow key={perm.id}>
                        <TableCell>
                          <Chip 
                            label={ACTION_LABELS[perm.action as keyof typeof ACTION_LABELS] || perm.action}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={SCOPE_LABELS[perm.scope as keyof typeof SCOPE_LABELS] || perm.scope}
                            size="small"
                            color="secondary"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {perm.description || '—'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ))}
        </CardContent>
      </Card>

      {/* Модальное окно редактирования */}
      <Dialog
        open={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{t('pages.settings.permissions.edit_role')}</DialogTitle>
        <DialogContent>
          <RoleForm
            role={role}
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
        <DialogTitle>{t('pages.settings.permissions.delete_role')}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>
            {t('pages.settings.permissions.confirm_delete_role', { name: role.name })}
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
