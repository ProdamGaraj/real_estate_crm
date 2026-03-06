import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
  Stack,
  Alert,
  Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { translateResource } from '../../utils/translations';
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
  hierarchyToPermissionIds,
  countSelectedPermissions,
  permissionIdsToHierarchy,
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

export default function RoleForm({ role, onSuccess, onCancel }: RoleFormProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: role?.name || '',
    code: role?.code || '',
    description: role?.description || '',
    is_active: role?.is_active ?? true,
  });

  // Иерархическая структура разрешений V2
  const [permissionsHierarchy, setPermissionsHierarchy] = useState<PermissionsHierarchyV2>({});
  const [error, setError] = useState<string | null>(null);

  // Загрузка всех разрешений
  const { data: allPermissions, isLoading: permissionsLoading } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => getPermissions(),
  });

  // Загрузка доступных компаний
  const { data: accessibleCompanies = [], isLoading: companiesLoading } = useQuery({
    queryKey: ['accessible-companies'],
    queryFn: getAccessibleCompanies,
  });

  // Загрузка доступных отделов
  const { data: accessibleDepartments = [], isLoading: departmentsLoading } = useQuery({
    queryKey: ['accessible-departments'],
    queryFn: getAccessibleDepartments,
  });

  // TODO: Получить текущего пользователя для определения userCompanyId
  // Для системного админа userCompanyId = undefined
  // Для админа компании userCompanyId = его company_id
  const userCompanyId = undefined; // Замените на: currentUser.is_superuser ? undefined : currentUser.company_id

  // Загрузка существующих разрешений роли
  React.useEffect(() => {
    if (role?.permissions && allPermissions) {
      // Преобразуем разрешения роли в иерархическую структуру V2
      const hierarchy = permissionIdsToHierarchy(
        role.permissions,
        accessibleCompanies,
        accessibleDepartments,
      );
      setPermissionsHierarchy(hierarchy);
    }
  }, [role, allPermissions, accessibleCompanies, accessibleDepartments]);

  const mutation = useMutation({
    mutationFn: (data: any) => {
      // Преобразуем иерархию в массив permission_ids
      const permissionIds = allPermissions && allPermissions.length > 0
        ? hierarchyToPermissionIds(permissionsHierarchy, allPermissions)
        : [];

      // Автоматически определяем scope на основе выбранных разрешений
      let computedScope = 'OWN'; // по умолчанию
      let hasSystem = false;
      let hasCompanies = false;
      let hasDepartments = false;

      // Проверяем все разрешения в иерархии
      Object.values(permissionsHierarchy).forEach((resourcePerms) => {
        if (resourcePerms.system.view || resourcePerms.system.add ||
          resourcePerms.system.edit || resourcePerms.system.delete) {
          hasSystem = true;
        }
        if (resourcePerms.companies.length > 0) {
          hasCompanies = true;
          resourcePerms.companies.forEach(company => {
            if (company.departments.length > 0) {
              hasDepartments = true;
            }
          });
        }
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
      const data = err.response?.data;
      if (data) {
        if (typeof data === 'string') {
          setError(data);
        } else if (data.detail) {
          setError(data.detail);
        } else if (data.non_field_errors) {
          setError(Array.isArray(data.non_field_errors) ? data.non_field_errors.join('; ') : data.non_field_errors);
        } else if (typeof data === 'object') {
          // Собираем все ошибки полей
          const msgs = Object.entries(data).map(([key, val]) => 
            `${key}: ${Array.isArray(val) ? val.join(', ') : val}`
          );
          setError(msgs.join('; '));
        } else {
          setError(err.message || t('errors.save_role_error'));
        }
      } else {
        setError(err.message || t('errors.save_role_error'));
      }
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      mutation.mutate(formData);
    },
    [formData, mutation]
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

  // Обработчик изменения разрешений для ресурса (currying для стабильных ссылок)
  const handleResourceChange = useCallback(
    (resource: string) => (newPermissions: ResourcePermissions) => {
      setPermissionsHierarchy((prev) => ({
        ...prev,
        [resource]: newPermissions,
      }));
    },
    []
  );

  // Группируем разрешения по ресурсам
  const groupedPermissions = useMemo(
    () => (allPermissions && allPermissions.length > 0 ? groupPermissionsByResource(allPermissions) : {}),
    [allPermissions]
  );

  // Получаем список всех ресурсов
  const resources = useMemo(() => Object.keys(groupedPermissions).sort(), [groupedPermissions]);

  // Мемоизируем callbacks для каждого ресурса (чтобы onChange не пересоздавался)
  const resourceCallbacks = useMemo(() => {
    const callbacks: Record<string, (newPermissions: ResourcePermissions) => void> = {};
    resources.forEach((resource) => {
      callbacks[resource] = handleResourceChange(resource);
    });
    return callbacks;
  }, [resources, handleResourceChange]);

  // Мемоизируем массивы чтобы избежать лишних ре-рендеров
  const memoizedCompanies = useMemo(() => accessibleCompanies, [accessibleCompanies]);
  const memoizedDepartments = useMemo(() => accessibleDepartments, [accessibleDepartments]);

  // Мемоизируем пустые разрешения для каждого ресурса
  const emptyPermissionsMap = useMemo(() => {
    const map: Record<string, ResourcePermissions> = {};
    resources.forEach((resource) => {
      map[resource] = emptyResourcePermissions();
    });
    return map;
  }, [resources]);

  // Подсчет выбранных разрешений
  const selectedPermissionsCount = useMemo(
    () => countSelectedPermissions(permissionsHierarchy),
    [permissionsHierarchy]
  );

  const isLoading = permissionsLoading || companiesLoading || departmentsLoading;

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
      <Stack spacing={3}>
        {error && <Alert severity="error">{error}</Alert>}

        {/* Основная информация */}
        <TextField
          label={t('pages.settings.permissions.role_name')}
          value={formData.name}
          onChange={handleNameChange}
          required
          fullWidth
        />

        <TextField
          label={t('pages.settings.permissions.role_code')}
          value={formData.code}
          onChange={handleCodeChange}
          required
          fullWidth
          helperText={t('pages.settings.permissions.role_code_help')}
        />

        <TextField
          label={t('common.description')}
          value={formData.description}
          onChange={handleDescriptionChange}
          multiline
          rows={2}
          fullWidth
        />

        <FormControlLabel
          control={<Checkbox checked={formData.is_active} onChange={handleIsActiveChange} />}
          label={t('pages.settings.permissions.active_role')}
        />

        {/* Разрешения */}
        <Box>
          <Typography variant="h6" gutterBottom>
            {t('pages.permissions.permissions_matrix')} {selectedPermissionsCount > 0 && `(${selectedPermissionsCount} ${t('common.selected')})`}
          </Typography>

          {isLoading ? (
            <Alert severity="info">{t('common.loading')}</Alert>
          ) : (
            <Stack spacing={2}>
              {resources.map((resource) => (
                <ResourcePermissionSelector
                  key={resource}
                  resourceName={resource}
                  resourceLabel={translateResource(resource)}
                  permissions={permissionsHierarchy[resource] || emptyPermissionsMap[resource]}
                  companies={memoizedCompanies}
                  departments={memoizedDepartments}
                  onChange={resourceCallbacks[resource]}
                  userCompanyId={userCompanyId}
                />
              ))}
            </Stack>
          )}
        </Box>

        {/* Кнопки */}
        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button onClick={onCancel} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={mutation.isPending || !formData.name || !formData.code}
          >
            {mutation.isPending ? t('common.saving') : role ? t('common.update') : t('common.create')}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
