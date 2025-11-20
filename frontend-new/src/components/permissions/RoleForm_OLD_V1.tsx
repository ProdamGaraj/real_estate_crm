import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
  Stack,
  Alert,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createRole,
  updateRole,
  getPermissions,
  getAccessibleCompanies,
  getAccessibleDepartments,
  type Role,
} from '../../api/permissions';
import ResourcePermissionSelector from './ResourcePermissionSelector';
import {
  emptyResourcePermissions,
  isResourceEmpty,
  hierarchyToPermissionIds,
  countSelectedPermissions,
} from '../../utils/permissionHierarchyV2';
import type { 
  PermissionsHierarchyV2,
  ResourcePermissions,
} from '../../utils/permissionHierarchyV2';

interface RoleFormProps {
  role?: Role;
  onSuccess: () => void;
  onCancel: () => void;
}

// Действия в нужном порядке
const ACTIONS = [
  { key: 'VIEW', label: 'Просмотр' },
  { key: 'ADD', label: 'Создание' },
  { key: 'EDIT', label: 'Редактирование' },
  { key: 'DELETE', label: 'Удаление' },
];

// Русские названия ресурсов
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

// Группировка разрешений по ресурсам
const groupPermissionsByResource = (permissions: any[]) => {
  const grouped: Record<string, any[]> = {};
  
  permissions.forEach((perm) => {
    const resource = perm.resource || 'OTHER';
    if (!grouped[resource]) {
      grouped[resource] = [];
    }
    grouped[resource].push(perm);
  });
  
  return grouped;
};

// Мемоизированный компонент для действия
const ActionPermissionSelector = React.memo(
  ({
    actionLabel,
    currentScope,
    companies,
    departments,
    onChange,
  }: {
    actionLabel: string;
    currentScope: PermissionScope;
    companies: any[];
    departments: any[];
    onChange: (newScope: PermissionScope) => void;
  }) => {
    return (
      <Box>
        <Typography variant="subtitle2" gutterBottom>
          {actionLabel}
        </Typography>
        <PermissionScopeSelector
          scope={currentScope}
          companies={companies}
          departments={departments}
          onChange={onChange}
        />
      </Box>
    );
  }
);

ActionPermissionSelector.displayName = 'ActionPermissionSelector';

export default function RoleForm({ role, onSuccess, onCancel }: RoleFormProps) {
  const [formData, setFormData] = useState({
    name: role?.name || '',
    code: role?.code || '',
    description: role?.description || '',
    is_active: role?.is_active ?? true,
  });

  // Иерархическая структура разрешений
  const [permissionsHierarchy, setPermissionsHierarchy] = useState<PermissionsHierarchy>({});

  const [error, setError] = useState<string | null>(null);

  // Загрузка всех доступных разрешений
  const { data: allPermissions, isLoading: permissionsLoading } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => getPermissions(),
  });

  // Загрузка доступных компаний
  const { data: accessibleCompanies = [], isLoading: companiesLoading } = useQuery({
    queryKey: ['accessible-companies'],
    queryFn: () => getAccessibleCompanies(),
  });

  // Загрузка доступных отделов
  const { data: accessibleDepartments = [], isLoading: departmentsLoading } = useQuery({
    queryKey: ['accessible-departments'],
    queryFn: () => getAccessibleDepartments(),
  });

  // Инициализация иерархии из существующей роли
  React.useEffect(() => {
    if (role?.permissions && allPermissions) {
      const hierarchy = permissionsToHierarchy(role.permissions);
      setPermissionsHierarchy(hierarchy);
    }
  }, [role, allPermissions]);

  const mutation = useMutation({
    mutationFn: (data: any) => {
      // Преобразуем иерархию в массив permission_ids
      const permissionIds = allPermissions
        ? hierarchyToPermissionIds(permissionsHierarchy, allPermissions)
        : [];

      // Автоматически определяем scope на основе выбранных разрешений
      let computedScope = 'OWN'; // по умолчанию
      let hasSystem = false;
      let hasCompanies = false;
      let hasDepartments = false;

      // Проверяем все scope в иерархии
      Object.values(permissionsHierarchy).forEach((actions) => {
        Object.values(actions).forEach((scope) => {
          if (scope.system) hasSystem = true;
          if (scope.companies && scope.companies.length > 0) hasCompanies = true;
          if (scope.departments && scope.departments.length > 0) hasDepartments = true;
        });
      });

      if (hasSystem) {
        computedScope = 'SYSTEM';
      } else if (hasCompanies) {
        computedScope = 'COMPANY';
      } else if (hasDepartments) {
        computedScope = 'DEPARTMENT';
      }

      const payload = {
        ...data,
        scope: computedScope,
        category: 'CUSTOM', // всегда пользовательская роль
        permission_ids: permissionIds,
      };

      if (role) {
        return updateRole(role.id, payload);
      }
      return createRole(payload);
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || err.message || 'Ошибка при сохранении роли');
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      mutation.mutate(formData);
    },
    [formData, permissionsHierarchy, mutation]
  );

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, name: e.target.value }));
  }, []);

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }));
  }, []);

  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, description: e.target.value }));
  }, []);

  const handleIsActiveChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, is_active: e.target.checked }));
  }, []);

  // Обработчик изменения разрешения для конкретного resource+action
  const handlePermissionScopeChange = useCallback(
    (resource: string, action: string) => (newScope: PermissionScope) => {
      setPermissionsHierarchy((prev) => {
        const newHierarchy = { ...prev };
        
        if (!newHierarchy[resource]) {
          newHierarchy[resource] = {};
        }
        
        // Если область пустая - удаляем действие
        if (isScopeEmpty(newScope)) {
          delete newHierarchy[resource][action];
          // Если для ресурса не осталось действий - удаляем ресурс
          if (Object.keys(newHierarchy[resource]).length === 0) {
            delete newHierarchy[resource];
          }
        } else {
          newHierarchy[resource][action] = newScope;
        }
        
        return newHierarchy;
      });
    },
    []
  );

  // Группируем разрешения по ресурсам
  const groupedPermissions = useMemo(
    () => (allPermissions ? groupPermissionsByResource(allPermissions) : {}),
    [allPermissions]
  );

  // Получаем список всех ресурсов
  const resources = useMemo(() => Object.keys(groupedPermissions).sort(), [groupedPermissions]);

  // Подсчет выбранных разрешений
  const selectedPermissionsCount = useMemo(
    () => countSelectedPermissions(permissionsHierarchy),
    [permissionsHierarchy]
  );

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
      <Stack spacing={3}>
        {error && <Alert severity="error">{error}</Alert>}

        {/* Основная информация */}
        <TextField
          label="Название роли"
          value={formData.name}
          onChange={handleNameChange}
          required
          fullWidth
        />

        <TextField
          label="Код роли"
          value={formData.code}
          onChange={handleCodeChange}
          required
          fullWidth
          helperText="Уникальный код роли (например: MANAGER, ADMIN)"
        />

        <TextField
          label="Описание"
          value={formData.description}
          onChange={handleDescriptionChange}
          multiline
          rows={2}
          fullWidth
        />

        <FormControlLabel
          control={<Checkbox checked={formData.is_active} onChange={handleIsActiveChange} />}
          label="Активная роль"
        />

        <Divider />

        {/* Разрешения */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Разрешения ({selectedPermissionsCount})
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Выберите разрешения для каждого действия над ресурсами
          </Typography>

          {permissionsLoading || companiesLoading || departmentsLoading ? (
            <Typography>Загрузка...</Typography>
          ) : (
            <Stack spacing={1}>
              {resources.map((resource) => {
                // Подсчитываем выбранные действия для ресурса
                const resourcePermissions = permissionsHierarchy[resource] || {};
                const selectedActionsCount = Object.keys(resourcePermissions).length;

                return (
                  <Accordion key={resource}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                        <Typography sx={{ flex: 1, fontWeight: 'medium' }}>
                          {RESOURCE_LABELS[resource] || resource}
                        </Typography>
                        {selectedActionsCount > 0 && (
                          <Chip
                            label={`${selectedActionsCount}/${ACTIONS.length}`}
                            size="small"
                            color="primary"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Stack spacing={2}>
                        {ACTIONS.map((action) => {
                          const currentScope =
                            permissionsHierarchy[resource]?.[action.key] || emptyScope();

                          return (
                            <ActionPermissionSelector
                              key={action.key}
                              actionLabel={action.label}
                              currentScope={currentScope}
                              companies={accessibleCompanies}
                              departments={accessibleDepartments}
                              onChange={handlePermissionScopeChange(resource, action.key)}
                            />
                          );
                        })}
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                );
              })}
            </Stack>
          )}
        </Box>

        {/* Кнопки */}
        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button onClick={onCancel} disabled={mutation.isPending}>
            Отмена
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={mutation.isPending || !formData.name || !formData.code}
          >
            {mutation.isPending ? 'Сохранение...' : role ? 'Обновить' : 'Создать'}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
