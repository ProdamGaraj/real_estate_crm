// real_estate_crm/frontend-new/src/utils/permissions.ts

/**
 * Типы ресурсов в системе
 */
export type ResourceType =
  | 'CLIENT'
  | 'APPLICATION'
  | 'MEETING'
  | 'TASK'
  | 'DEAL'
  | 'PROJECT'
  | 'PROPERTY'
  | 'BUILDING'
  | 'LAYOUT'
  | 'PAYMENT'
  | 'DISCOUNT'
  | 'TEMPLATE'
  | 'COMPANY'
  | 'DEPARTMENT'
  | 'USER'
  | 'ROLE'
  | 'PERMISSION'
  | 'SETTINGS'
  | 'DASHBOARD'
  | 'REPORT';

/**
 * Типы действий в системе
 */
export type ActionType = 'VIEW' | 'ADD' | 'EDIT' | 'DELETE';

/**
 * Типы области действия разрешений
 */
export type ScopeType = 'SYSTEM' | 'COMPANY' | 'DEPARTMENT' | 'OWN';

/**
 * Интерфейс разрешения
 */
export interface Permission {
  id: number;
  code: string;
  name: string;
  action: ActionType;
  resource: ResourceType;
  scope: ScopeType;
}

/**
 * Интерфейс роли
 */
export interface Role {
  id: number;
  code: string;
  name: string;
  permissions: Permission[];
  scope?: ScopeType;
  category?: string;
}

/**
 * Интерфейс пользователя с ролями
 */
export interface UserWithRoles {
  id: number;
  user_username: string;
  user_full_name?: string;
  email?: string;
  is_system_admin: boolean;
  company?: number;
  company_name?: string;
  department?: number;
  department_name?: string;
  roles: Role[];
}

/**
 * Проверяет, имеет ли пользователь разрешение на действие с ресурсом
 * @param user - пользователь
 * @param action - действие (VIEW, ADD, EDIT, DELETE)
 * @param resource - ресурс (CLIENT, DEAL, и т.д.)
 * @param scope - опциональная область действия (SYSTEM, COMPANY, DEPARTMENT, OWN)
 * @returns true если есть разрешение, false если нет
 */
export function hasPermission(
  user: UserWithRoles | null,
  action: ActionType,
  resource: ResourceType,
  scope?: ScopeType
): boolean {
  // Системный администратор имеет все права
  if (user?.is_system_admin) {
    return true;
  }

  // Если пользователь не авторизован
  if (!user || !user.roles || user.roles.length === 0) {
    return false;
  }

  // Собираем все разрешения из всех ролей пользователя
  const allPermissions = user.roles.flatMap(role => role.permissions || []);

  // Если не указана конкретная область действия, проверяем наличие разрешения с любой областью
  if (!scope) {
    return allPermissions.some(
      perm => perm.action === action && perm.resource === resource
    );
  }

  // Проверяем наличие разрешения с указанной областью действия
  return allPermissions.some(
    perm =>
      perm.action === action &&
      perm.resource === resource &&
      perm.scope === scope
  );
}

/**
 * Проверяет, имеет ли пользователь хотя бы одно VIEW разрешение на ресурс
 * (независимо от scope)
 * @param user - пользователь
 * @param resource - ресурс
 * @returns true если есть хотя бы одно VIEW разрешение
 */
export function hasAnyViewPermission(
  user: UserWithRoles | null,
  resource: ResourceType
): boolean {
  return hasPermission(user, 'VIEW', resource);
}

/**
 * Проверяет, является ли пользователь системным администратором
 * @param user - пользователь
 * @returns true если системный администратор
 */
export function isSystemAdmin(user: UserWithRoles | null): boolean {
  return user?.is_system_admin || false;
}

/**
 * Получает максимальный scope для конкретного действия и ресурса
 * @param user - пользователь
 * @param action - действие
 * @param resource - ресурс
 * @returns максимальный scope или null если нет разрешения
 */
export function getMaxScope(
  user: UserWithRoles | null,
  action: ActionType,
  resource: ResourceType
): ScopeType | null {
  if (user?.is_system_admin) {
    return 'SYSTEM';
  }

  if (!user || !user.roles || user.roles.length === 0) {
    return null;
  }

  const allPermissions = user.roles.flatMap(role => role.permissions || []);
  const relevantPermissions = allPermissions.filter(
    perm => perm.action === action && perm.resource === resource
  );

  if (relevantPermissions.length === 0) {
    return null;
  }

  // Приоритет: SYSTEM > COMPANY > DEPARTMENT > OWN
  if (relevantPermissions.some(p => p.scope === 'SYSTEM')) return 'SYSTEM';
  if (relevantPermissions.some(p => p.scope === 'COMPANY')) return 'COMPANY';
  if (relevantPermissions.some(p => p.scope === 'DEPARTMENT')) return 'DEPARTMENT';
  if (relevantPermissions.some(p => p.scope === 'OWN')) return 'OWN';

  return null;
}
