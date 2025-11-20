/**
 * Типы и утилиты для иерархической системы разрешений
 */

// Структура для хранения выбора области действия
export interface PermissionScope {
  own: boolean;              // Мои данные
  departments: number[];      // ID выбранных отделов
  companies: number[];        // ID выбранных компаний
  system: boolean;           // Вся система
}

// Структура разрешений: resource -> action -> scope
export type PermissionsHierarchy = Record<string, Record<string, PermissionScope>>;

// Пустая область (ничего не выбрано)
export const emptyScope = (): PermissionScope => ({
  own: false,
  departments: [],
  companies: [],
  system: false,
});

// Проверка что область пустая
export const isScopeEmpty = (scope: PermissionScope): boolean => {
  return !scope.own && 
         scope.departments.length === 0 && 
         scope.companies.length === 0 && 
         !scope.system;
};

// Применение правил взаимоисключения
export const applyScopeRules = (
  scope: PermissionScope,
  changed: 'own' | 'departments' | 'companies' | 'system'
): PermissionScope => {
  const newScope = { ...scope };

  switch (changed) {
    case 'own':
      // Мои: можно комбинировать с отделами или компаниями, но не с системой
      if (newScope.own && newScope.system) {
        newScope.system = false;
      }
      break;

    case 'departments':
      // Отделы: снимаем компании и систему
      if (newScope.departments.length > 0) {
        newScope.companies = [];
        newScope.system = false;
      }
      break;

    case 'companies':
      // Компании: снимаем отделы и систему
      if (newScope.companies.length > 0) {
        newScope.departments = [];
        newScope.system = false;
      }
      break;

    case 'system':
      // Система: снимаем всё остальное
      if (newScope.system) {
        newScope.own = false;
        newScope.departments = [];
        newScope.companies = [];
      }
      break;
  }

  return newScope;
};

// Преобразование из существующих разрешений в иерархию
export const permissionsToHierarchy = (
  permissions: Array<{ resource: string; action: string; scope: string; id: number }>
): PermissionsHierarchy => {
  const hierarchy: PermissionsHierarchy = {};

  permissions.forEach((perm) => {
    if (!hierarchy[perm.resource]) {
      hierarchy[perm.resource] = {};
    }
    if (!hierarchy[perm.resource][perm.action]) {
      hierarchy[perm.resource][perm.action] = emptyScope();
    }

    const scope = hierarchy[perm.resource][perm.action];

    // Преобразуем старый формат scope в новый
    switch (perm.scope) {
      case 'OWN':
        scope.own = true;
        break;
      case 'DEPARTMENT':
        // Для старых ролей без конкретных отделов - не добавляем
        // Пользователь должен выбрать конкретные отделы
        break;
      case 'COMPANY':
        // Для старых ролей без конкретных компаний - не добавляем
        // Пользователь должен выбрать конкретные компании
        break;
      case 'SYSTEM':
        scope.system = true;
        break;
    }
  });

  return hierarchy;
};

// Преобразование иерархии обратно в массив permission IDs
export const hierarchyToPermissionIds = (
  hierarchy: PermissionsHierarchy,
  allPermissions: Array<{ id: number; resource: string; action: string; scope: string }>
): number[] => {
  const permissionIds: number[] = [];

  Object.entries(hierarchy).forEach(([resource, actions]) => {
    Object.entries(actions).forEach(([action, scope]) => {
      // Пропускаем пустые области
      if (isScopeEmpty(scope)) {
        return;
      }

      // OWN - добавляем если выбрано
      if (scope.own) {
        const perm = allPermissions.find(
          (p) => p.resource === resource && p.action === action && p.scope === 'OWN'
        );
        if (perm) permissionIds.push(perm.id);
      }

      // DEPARTMENTS - добавляем для каждого выбранного отдела
      // НО в текущей системе разрешений нет привязки к конкретным отделам
      // Поэтому добавляем общее разрешение DEPARTMENT если выбраны отделы
      if (scope.departments.length > 0) {
        const perm = allPermissions.find(
          (p) => p.resource === resource && p.action === action && p.scope === 'DEPARTMENT'
        );
        if (perm) permissionIds.push(perm.id);
      }

      // COMPANIES - аналогично отделам
      if (scope.companies.length > 0) {
        const perm = allPermissions.find(
          (p) => p.resource === resource && p.action === action && p.scope === 'COMPANY'
        );
        if (perm) permissionIds.push(perm.id);
      }

      // SYSTEM - добавляем если выбрано
      if (scope.system) {
        const perm = allPermissions.find(
          (p) => p.resource === resource && p.action === action && p.scope === 'SYSTEM'
        );
        if (perm) permissionIds.push(perm.id);
      }
    });
  });

  return permissionIds;
};

// Получить список используемых отделов из иерархии
export const getUsedDepartmentIds = (hierarchy: PermissionsHierarchy): number[] => {
  const departmentIds = new Set<number>();
  
  Object.values(hierarchy).forEach((actions) => {
    Object.values(actions).forEach((scope) => {
      scope.departments.forEach((id) => departmentIds.add(id));
    });
  });
  
  return Array.from(departmentIds);
};

// Получить список используемых компаний из иерархии
export const getUsedCompanyIds = (hierarchy: PermissionsHierarchy): number[] => {
  const companyIds = new Set<number>();
  
  Object.values(hierarchy).forEach((actions) => {
    Object.values(actions).forEach((scope) => {
      scope.companies.forEach((id) => companyIds.add(id));
    });
  });
  
  return Array.from(companyIds);
};

// Подсчет количества выбранных разрешений
export const countSelectedPermissions = (hierarchy: PermissionsHierarchy): number => {
  let count = 0;
  
  Object.values(hierarchy).forEach((actions) => {
    Object.values(actions).forEach((scope) => {
      if (!isScopeEmpty(scope)) {
        count++;
      }
    });
  });
  
  return count;
};
