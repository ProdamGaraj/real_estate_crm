// real_estate_crm/frontend-new/src/utils/permissions.ts

/**
 * Типы ресурсов в системе (синхронизировано с backend Permission.Resource)
 */
export type ResourceType =
  | 'CLIENT'
  | 'APPLICATION'
  | 'APPLICATION_STATUS'
  | 'MEETING'
  | 'PROJECT'
  | 'BUILDING'
  | 'BUILDING_TYPE'
  | 'PROPERTY'
  | 'LAYOUT'
  | 'DISCOUNT'
  | 'DEAL'
  | 'PAYMENT'
  | 'PAYMENT_TYPE'
  | 'BENEFICIARY_ACCOUNT'
  | 'TEMPLATE'
  | 'REPORT'
  | 'PLAN'
  | 'TASK'
  | 'TASK_LOG'
  | 'USER'
  | 'ROLE'
  | 'PERMISSION'
  | 'COMPANY'
  | 'DEPARTMENT'
  | 'PARTNER_API_KEY'
  | 'DASHBOARD'
  | 'SETTINGS';

/**
 * Базовые CRUD действия
 */
export type CrudActionType = 'VIEW' | 'ADD' | 'EDIT' | 'DELETE';

/**
 * Расширенные действия (только для TASK)
 */
export type ExtendedActionType = 'EXPORT' | 'IMPORT' | 'APPROVE' | 'ASSIGN' | 'EDIT_IN_PROGRESS' | 'REOPEN' | 'FORCE_EDIT' | 'DELETE_LOG';

/**
 * Все типы действий в системе (синхронизировано с backend Permission.Action)
 */
export type ActionType = CrudActionType | ExtendedActionType;

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
  is_active?: boolean;
  /** Компании, в которых действует роль. Пусто — роль общесистемная. */
  company_ids?: number[];
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
 * Иерархия scope: SYSTEM включает COMPANY, COMPANY включает DEPARTMENT, и т.д.
 * Чем меньше индекс — тем выше scope.
 */
const SCOPE_HIERARCHY: ScopeType[] = ['SYSTEM', 'COMPANY', 'DEPARTMENT', 'OWN'];

/**
 * Проверяет, имеет ли пользователь разрешение на действие с ресурсом.
 * 
 * Если scope указан — учитывает иерархию:
 *   SYSTEM-разрешение покрывает COMPANY, DEPARTMENT, OWN
 *   COMPANY-разрешение покрывает DEPARTMENT, OWN
 *   и т.д.
 */
/**
 * Разрешения пользователя — ровно те, что учитывает сервер.
 *
 * Раньше клиент складывал разрешения всех ролей подряд. Сервер же отбрасывает
 * неактивные роли и разрешения, а также роли, не применимые к компании
 * пользователя. Из-за расхождения интерфейс показывал разделы и кнопки,
 * на которые сервер отвечал 403, а отключение роли на экране не отражалось.
 */
function collectPermissions(user: UserWithRoles): Permission[] {
  return user.roles
    .filter(role => role.is_active !== false)
    .filter(role => {
      const companies = role.company_ids;
      // Роль без списка компаний действует во всей системе
      if (!companies || companies.length === 0) return true;
      if (user.company == null) return false;
      return companies.includes(user.company);
    })
    .flatMap(role => role.permissions || [])
    .filter(permission => (permission as Permission & { is_active?: boolean }).is_active !== false);
}

export function hasPermission(
  user: UserWithRoles | null,
  action: ActionType,
  resource: ResourceType,
  scope?: ScopeType
): boolean {
  if (user?.is_system_admin) {
    return true;
  }

  if (!user || !user.roles || user.roles.length === 0) {
    return false;
  }

  const allPermissions = collectPermissions(user);

  if (!scope) {
    return allPermissions.some(
      perm => perm.action === action && perm.resource === resource
    );
  }

  // Иерархическая проверка: если у пользователя есть scope >= запрошенного — разрешаем
  const requestedIdx = SCOPE_HIERARCHY.indexOf(scope);
  return allPermissions.some(
    perm =>
      perm.action === action &&
      perm.resource === resource &&
      SCOPE_HIERARCHY.indexOf(perm.scope as ScopeType) <= requestedIdx
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

  const allPermissions = collectPermissions(user);
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
