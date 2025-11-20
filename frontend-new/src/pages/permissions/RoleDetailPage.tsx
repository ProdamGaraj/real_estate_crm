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

// Области действия роли
const ROLE_SCOPE_LABELS: Record<string, string> = {
  SYSTEM: 'Вся система',
  COMPANY: 'Компания',
  DEPARTMENT: 'Отдел',
  OWN: 'Только свои данные',
};

// Категории ролей
const ROLE_CATEGORY_LABELS: Record<string, string> = {
  ADMINISTRATIVE: 'Административная',
  MANAGEMENT: 'Управленческая',
  OPERATIONAL: 'Операционная',
  READONLY: 'Только просмотр',
  CUSTOM: 'Пользовательская',
};

// Русские названия для action
const ACTION_LABELS: Record<string, string> = {
  VIEW: 'Просмотр',
  ADD: 'Создание',
  EDIT: 'Редактирование',
  DELETE: 'Удаление',
};

// Русские названия для scope
const SCOPE_LABELS: Record<string, string> = {
  OWN: 'Свои',
  DEPARTMENT: 'Отдел',
  COMPANY: 'Компания',
  SYSTEM: 'Система',
};

// Русские названия для resource
const RESOURCE_LABELS: Record<string, string> = {
  CLIENT: 'Клиенты',
  APPLICATION: 'Заявки',
  MEETING: 'Встречи',
  DEAL: 'Сделки',
  PAYMENT: 'Платежи',
  REFUND: 'Возвраты',
  PROJECT: 'Проекты',
  BUILDING: 'Здания',
  PROPERTY: 'Объекты недвижимости',
  LAYOUT: 'Планировки',
  DISCOUNT: 'Скидки',
  DOCUMENT: 'Документы',
  REPORT: 'Отчеты',
  COMPANY: 'Компании',
  DEPARTMENT: 'Отделы',
  ROLE: 'Роли',
  USER: 'Пользователи',
  BENEFICIARY_ACCOUNT: 'Счета получателей',
  DASHBOARD: 'Дашборд',
  PAYMENT_TYPE: 'Типы платежей',
  PERMISSION: 'Разрешения',
  PLAN: 'Планы',
  SETTINGS: 'Настройки',
  TEMPLATE: 'Шаблоны',
  OTHER: 'Прочее',
};

export default function RoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

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
        Ошибка загрузки: {error instanceof Error ? error.message : 'Неизвестная ошибка'}
      </Alert>
    );
  }

  if (!role) {
    return <Alert severity="warning">Роль не найдена</Alert>;
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
            Код: {role.code} • Область: {role.scope_display || ROLE_SCOPE_LABELS[role.scope]} • Категория: {role.category_display || ROLE_CATEGORY_LABELS[role.category]}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<EditIcon />}
          onClick={() => setIsEditModalOpen(true)}
          disabled={role.is_system}
        >
          Редактировать
        </Button>
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={() => setIsDeleteDialogOpen(true)}
          disabled={role.is_system}
        >
          Удалить
        </Button>
      </Box>

      {/* Системная роль предупреждение */}
      {role.is_system && (
        <Alert severity="info">
          Это системная роль. Она не может быть изменена или удалена.
        </Alert>
      )}

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
                  <Typography variant="body1">
                    {role.name}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Код
                  </Typography>
                  <Typography variant="body1">{role.code}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Область действия
                  </Typography>
                  <Typography variant="body1" component="div">
                    <Chip
                      label={role.scope_display || ROLE_SCOPE_LABELS[role.scope]}
                      color="primary"
                      size="small"
                    />
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Категория
                  </Typography>
                  <Typography variant="body1" component="div">
                    <Chip
                      label={role.category_display || ROLE_CATEGORY_LABELS[role.category]}
                      color="info"
                      size="small"
                      variant="outlined"
                    />
                  </Typography>
                </Box>
                {role.description && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Описание
                    </Typography>
                    <Typography variant="body1">{role.description}</Typography>
                  </Box>
                )}
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Статус
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip
                      label={role.is_active ? 'Активна' : 'Неактивна'}
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
                Статистика
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Разрешений
                  </Typography>
                  <Typography variant="h4" color="primary">
                    {role.permissions?.length || 0}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Дата создания
                  </Typography>
                  <Typography variant="body2">
                    {new Date(role.created_at).toLocaleString('ru-RU')}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Последнее обновление
                  </Typography>
                  <Typography variant="body2">
                    {new Date(role.updated_at).toLocaleString('ru-RU')}
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
            Матрица разрешений
          </Typography>
          <Divider sx={{ mb: 2 }} />
          
          {Object.entries(groupedPermissions).map(([resource, perms]) => (
            <Box key={resource} sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>
                {RESOURCE_LABELS[resource] || resource}
                <Chip label={perms.length} size="small" sx={{ ml: 1 }} />
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Действие</TableCell>
                      <TableCell>Область</TableCell>
                      <TableCell>Описание</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {perms.map((perm: any) => (
                      <TableRow key={perm.id}>
                        <TableCell>
                          <Chip 
                            label={ACTION_LABELS[perm.action] || perm.action}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={SCOPE_LABELS[perm.scope] || perm.scope}
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
        <DialogTitle>Редактировать роль</DialogTitle>
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
        <DialogTitle>Удалить роль?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>
            Вы уверены, что хотите удалить роль "{role.name}"?
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
