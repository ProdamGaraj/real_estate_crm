// real_estate_crm/frontend-new/src/components/PermissionRoute.tsx
import { useAuthStore } from '../store/authStore';
import { hasPermission, hasAnyViewPermission, isSystemAdmin } from '../utils/permissions';
import type { ActionType, ResourceType, ScopeType } from '../utils/permissions';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface PermissionRouteProps {
  children: React.ReactNode;
  action?: ActionType;
  resource?: ResourceType;
  scope?: ScopeType;
  requireAdmin?: boolean;
  /**
   * Доступ, если есть право VIEW хотя бы на один из ресурсов.
   * Нужен для страниц-агрегаторов вроде «Настроек», где каждая вкладка
   * управляет своим ресурсом.
   */
  anyResource?: ResourceType[];
}

/**
 * Компонент для защиты маршрутов на основе разрешений
 * 
 * @example
 * // Требует права VIEW на SETTINGS (любого scope)
 * <PermissionRoute action="VIEW" resource="SETTINGS">
 *   <SettingsPage />
 * </PermissionRoute>
 * 
 * @example
 * // Требует права администратора
 * <PermissionRoute requireAdmin>
 *   <AdminPage />
 * </PermissionRoute>
 */
export default function PermissionRoute({
  children,
  action,
  resource,
  scope,
  requireAdmin = false,
  anyResource,
}: PermissionRouteProps) {
  const { user } = useAuthStore();
  const { t } = useTranslation();

  // Доступ по любому из перечисленных ресурсов
  if (anyResource && anyResource.length > 0) {
    const allowed = isSystemAdmin(user) || anyResource.some(r => hasAnyViewPermission(user, r));
    if (!allowed) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h5" color="error" gutterBottom>
            {t('errors.access_denied')}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t('errors.no_view_permission')}
          </Typography>
        </Box>
      );
    }
    return <>{children}</>;
  }

  // Если требуется админ
  if (requireAdmin) {
    if (!isSystemAdmin(user)) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h5" color="error" gutterBottom>
            {t('errors.access_denied')}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t('errors.admin_only')}
          </Typography>
        </Box>
      );
    }
    return <>{children}</>;
  }

  // Если требуется конкретное разрешение
  if (action && resource) {
    if (!hasPermission(user, action, resource, scope)) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h5" color="error" gutterBottom>
            {t('errors.access_denied')}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t('errors.no_view_permission')}
          </Typography>
        </Box>
      );
    }
    return <>{children}</>;
  }

  // Если не указаны требования, просто рендерим детей
  return <>{children}</>;
}
