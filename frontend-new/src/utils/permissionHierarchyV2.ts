/**
 * Новая иерархическая система разрешений V2
 * 
 * Структура:
 * Ресурс → Scope Level (own/companies/system) → Actions (CRUD + extended)
 */

// Базовые CRUD операции
export type CrudAction = 'VIEW' | 'ADD' | 'EDIT' | 'DELETE';

// Расширенные действия (используются только для TASK)
export type ExtendedAction = 'ASSIGN' | 'EDIT_IN_PROGRESS' | 'REOPEN' | 'FORCE_EDIT';

// Все действия
export type AllAction = CrudAction | ExtendedAction;

// Список всех CRUD действий
export const CRUD_ACTIONS: Array<keyof ScopeLevelPermissions> = ['view', 'add', 'edit', 'delete'];

// Список расширенных действий
export const EXTENDED_ACTIONS: Array<keyof ExtendedPermissions> = ['assign', 'edit_in_progress', 'reopen', 'force_edit'];

// Список всех действий
export const ALL_ACTIONS = [...CRUD_ACTIONS, ...EXTENDED_ACTIONS] as const;

// Разрешения для конкретного уровня (own/company/department/system) — базовые CRUD
export interface ScopeLevelPermissions {
  view: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
}

// Расширенные разрешения (для ресурса TASK)
export interface ExtendedPermissions {
  assign: boolean;
  edit_in_progress: boolean;
  reopen: boolean;
  force_edit: boolean;
}

// Полные разрешения для scope level (CRUD + extended)
export interface FullScopeLevelPermissions extends ScopeLevelPermissions, ExtendedPermissions {}

// Разрешения для отдела
export interface DepartmentPermissions {
  departmentId: number;
  permissions: ScopeLevelPermissions;
  extendedPermissions: ExtendedPermissions;
}

// Разрешения для компании (включая отделы)
export interface CompanyPermissions {
  companyId: number;
  // Разрешения на уровне всей компании
  companyLevel: ScopeLevelPermissions;
  companyExtended: ExtendedPermissions;
  // Разрешения для конкретных отделов
  departments: DepartmentPermissions[];
  // Флаг "выбрать всё" для компании
  selectAll: boolean;
}

// Структура разрешений для одного ресурса
export interface ResourcePermissions {
  // Мои данные
  own: ScopeLevelPermissions;
  ownExtended: ExtendedPermissions;
  // Компании и их отделы
  companies: CompanyPermissions[];
  // Вся система
  system: ScopeLevelPermissions;
  systemExtended: ExtendedPermissions;
  // Pass-through IDs — разрешения которые UI не может отобразить
  // (actions типа EXPORT, IMPORT, APPROVE, DELETE_LOG)
  // Сохраняются без изменений при save
  passthroughIds: number[];
}

// Полная иерархия: resource -> ResourcePermissions
export type PermissionsHierarchyV2 = Record<string, ResourcePermissions>;

// Создание пустых разрешений CRUD
export const emptyCrudPermissions = (): ScopeLevelPermissions => ({
  view: false,
  add: false,
  edit: false,
  delete: false,
});

// Создание пустых расширенных разрешений
export const emptyExtendedPermissions = (): ExtendedPermissions => ({
  assign: false,
  edit_in_progress: false,
  reopen: false,
  force_edit: false,
});

// Создание пустых разрешений для ресурса
export const emptyResourcePermissions = (): ResourcePermissions => ({
  own: emptyCrudPermissions(),
  ownExtended: emptyExtendedPermissions(),
  companies: [],
  system: emptyCrudPermissions(),
  systemExtended: emptyExtendedPermissions(),
  passthroughIds: [],
});

// Проверка что разрешения CRUD пустые
export const isCrudEmpty = (crud: ScopeLevelPermissions): boolean => {
  return !crud.view && !crud.add && !crud.edit && !crud.delete;
};

// Проверка что расширенные разрешения пустые
export const isExtendedEmpty = (ext: ExtendedPermissions): boolean => {
  return !ext.assign && !ext.edit_in_progress && !ext.reopen && !ext.force_edit;
};

// Проверка что разрешения ресурса пустые
export const isResourceEmpty = (resource: ResourcePermissions): boolean => {
  return (
    isCrudEmpty(resource.own) &&
    isExtendedEmpty(resource.ownExtended) &&
    resource.companies.length === 0 &&
    isCrudEmpty(resource.system) &&
    isExtendedEmpty(resource.systemExtended) &&
    resource.passthroughIds.length === 0
  );
};

// Установить все CRUD разрешения
export const setAllCrud = (value: boolean): ScopeLevelPermissions => ({
  view: value,
  add: value,
  edit: value,
  delete: value,
});

// Установить все расширенные разрешения
export const setAllExtended = (value: boolean): ExtendedPermissions => ({
  assign: value,
  edit_in_progress: value,
  reopen: value,
  force_edit: value,
});

// Проверка что все CRUD разрешения установлены
export const isAllCrudSet = (crud: ScopeLevelPermissions): boolean => {
  return crud.view && crud.add && crud.edit && crud.delete;
};

// Применение "Выбрать всё" для компании
export const applyCompanySelectAll = (
  company: CompanyPermissions,
  value: boolean
): CompanyPermissions => {
  return {
    ...company,
    selectAll: value,
    companyLevel: setAllCrud(value),
    companyExtended: setAllExtended(value),
    departments: company.departments.map((dept) => ({
      ...dept,
      permissions: setAllCrud(value),
      extendedPermissions: setAllExtended(value),
    })),
  };
};

// Добавить компанию в разрешения
export const addCompanyToResource = (
  resource: ResourcePermissions,
  companyId: number,
  departments: number[] = []
): ResourcePermissions => {
  // Проверяем, не добавлена ли уже
  if (resource.companies.some((c) => c.companyId === companyId)) {
    return resource;
  }

  const newCompany: CompanyPermissions = {
    companyId,
    companyLevel: emptyCrudPermissions(),
    companyExtended: emptyExtendedPermissions(),
    departments: departments.map((deptId) => ({
      departmentId: deptId,
      permissions: emptyCrudPermissions(),
      extendedPermissions: emptyExtendedPermissions(),
    })),
    selectAll: false,
  };

  return {
    ...resource,
    companies: [...resource.companies, newCompany],
  };
};

// Удалить компанию из разрешений
export const removeCompanyFromResource = (
  resource: ResourcePermissions,
  companyId: number
): ResourcePermissions => {
  return {
    ...resource,
    companies: resource.companies.filter((c) => c.companyId !== companyId),
  };
};

// Добавить отдел к компании
export const addDepartmentToCompany = (
  company: CompanyPermissions,
  departmentId: number
): CompanyPermissions => {
  // Проверяем, не добавлен ли уже
  if (company.departments.some((d) => d.departmentId === departmentId)) {
    return company;
  }

  return {
    ...company,
    departments: [
      ...company.departments,
      {
        departmentId,
        permissions: company.selectAll ? setAllCrud(true) : emptyCrudPermissions(),
        extendedPermissions: company.selectAll ? setAllExtended(true) : emptyExtendedPermissions(),
      },
    ],
  };
};

// Удалить отдел из компании
export const removeDepartmentFromCompany = (
  company: CompanyPermissions,
  departmentId: number
): CompanyPermissions => {
  return {
    ...company,
    departments: company.departments.filter((d) => d.departmentId !== departmentId),
  };
};

// Обновить разрешения CRUD для компании
export const updateCompanyCrud = (
  company: CompanyPermissions,
  action: keyof ScopeLevelPermissions,
  value: boolean
): CompanyPermissions => {
  const newCompany = {
    ...company,
    companyLevel: {
      ...company.companyLevel,
      [action]: value,
    },
  };

  // Если снимаем галочку, убираем selectAll
  if (!value) {
    newCompany.selectAll = false;
  }

  // Если все галочки установлены, ставим selectAll
  if (isAllCrudSet(newCompany.companyLevel)) {
    newCompany.selectAll = true;
  }

  return newCompany;
};

// Обновить разрешения CRUD для отдела
export const updateDepartmentCrud = (
  company: CompanyPermissions,
  departmentId: number,
  action: keyof ScopeLevelPermissions,
  value: boolean
): CompanyPermissions => {
  return {
    ...company,
    departments: company.departments.map((dept) => {
      if (dept.departmentId === departmentId) {
        return {
          ...dept,
          permissions: {
            ...dept.permissions,
            [action]: value,
          },
        };
      }
      return dept;
    }),
  };
};

// Преобразование старой структуры в новую (для миграции)
export const convertOldToNew = (
  oldHierarchy: Record<string, Record<string, any>>
): PermissionsHierarchyV2 => {
  const newHierarchy: PermissionsHierarchyV2 = {};

  Object.entries(oldHierarchy).forEach(([resource, actions]) => {
    const resourcePerms = emptyResourcePermissions();

    Object.entries(actions).forEach(([action, scope]: [string, any]) => {
      const actionLower = action.toLowerCase();

      // CRUD действия
      if (['view', 'add', 'edit', 'delete'].includes(actionLower)) {
        const crudAction = actionLower as keyof ScopeLevelPermissions;
        if (scope.own) resourcePerms.own[crudAction] = true;
        if (scope.system) resourcePerms.system[crudAction] = true;

        scope.companies?.forEach((companyId: number) => {
          let company = resourcePerms.companies.find((c) => c.companyId === companyId);
          if (!company) {
            company = {
              companyId,
              companyLevel: emptyCrudPermissions(),
              companyExtended: emptyExtendedPermissions(),
              departments: [],
              selectAll: false,
            };
            resourcePerms.companies.push(company);
          }
          company.companyLevel[crudAction] = true;
        });
      }

      // Extended actions
      if (['assign', 'edit_in_progress', 'reopen', 'force_edit'].includes(actionLower)) {
        const extAction = actionLower as keyof ExtendedPermissions;
        if (scope.own) resourcePerms.ownExtended[extAction] = true;
        if (scope.system) resourcePerms.systemExtended[extAction] = true;
      }
    });

    newHierarchy[resource] = resourcePerms;
  });

  return newHierarchy;
};

/**
 * Преобразование массива разрешений роли в иерархическую структуру V2
 * Используется для загрузки существующих разрешений при редактировании роли
 *
 * Действия, которые UI не умеет отображать (EXPORT, IMPORT, APPROVE, DELETE_LOG),
 * сохраняются в passthroughIds и передаются обратно при сохранении без изменений.
 *
 * COMPANY/DEPARTMENT scope при отсутствии компаний/отделов НЕ переключаются на OWN —
 * они сохраняются как pass-through, чтобы не потерять данные.
 */

// Действия, которые UI может отображать и редактировать
const UI_EDITABLE_ACTIONS = ['view', 'add', 'edit', 'delete', 'assign', 'edit_in_progress', 'reopen', 'force_edit'];

export const permissionIdsToHierarchy = (
  rolePermissions: any[],
  accessibleCompanies?: { id: number; name: string }[],
  accessibleDepartments?: { id: number; company: number; name: string }[],
): PermissionsHierarchyV2 => {
  const hierarchy: PermissionsHierarchyV2 = {};

  if (!rolePermissions || rolePermissions.length === 0) {
    return hierarchy;
  }

  // Вспомогательная функция: гарантировать наличие компании в hierarchy[resource].companies
  const ensureCompany = (resource: string, companyId: number): CompanyPermissions => {
    const resPerms = hierarchy[resource];
    let company = resPerms.companies.find((c) => c.companyId === companyId);
    if (!company) {
      // Добавляем компанию с отделами
      const companyDepts = (accessibleDepartments || []).filter((d) => d.company === companyId);
      company = {
        companyId,
        companyLevel: emptyCrudPermissions(),
        companyExtended: emptyExtendedPermissions(),
        departments: companyDepts.map((dept) => ({
          departmentId: dept.id,
          permissions: emptyCrudPermissions(),
          extendedPermissions: emptyExtendedPermissions(),
        })),
        selectAll: false,
      };
      resPerms.companies.push(company);
    }
    return company;
  };

  // Функция для установки действия на уровне scope
  const setActionOnScope = (
    resource: string,
    actionLower: string,
    scope: string,
    permId: number,
  ) => {
    const isCrud = ['view', 'add', 'edit', 'delete'].includes(actionLower);
    const isExtended = ['assign', 'edit_in_progress', 'reopen', 'force_edit'].includes(actionLower);

    if (!isCrud && !isExtended) {
      // Неизвестное действие — pass-through
      hierarchy[resource].passthroughIds.push(permId);
      return;
    }

    if (scope === 'OWN') {
      if (isCrud) hierarchy[resource].own[actionLower as keyof ScopeLevelPermissions] = true;
      if (isExtended) hierarchy[resource].ownExtended[actionLower as keyof ExtendedPermissions] = true;

    } else if (scope === 'SYSTEM') {
      if (isCrud) hierarchy[resource].system[actionLower as keyof ScopeLevelPermissions] = true;
      if (isExtended) hierarchy[resource].systemExtended[actionLower as keyof ExtendedPermissions] = true;

    } else if (scope === 'COMPANY') {
      if (accessibleCompanies && accessibleCompanies.length > 0) {
        accessibleCompanies.forEach((comp) => {
          const company = ensureCompany(resource, comp.id);
          if (isCrud) company.companyLevel[actionLower as keyof ScopeLevelPermissions] = true;
          if (isExtended) company.companyExtended[actionLower as keyof ExtendedPermissions] = true;
        });
      } else {
        // Нет доступных компаний — сохраняем как pass-through, чтобы не потерять scope
        hierarchy[resource].passthroughIds.push(permId);
      }

    } else if (scope === 'DEPARTMENT') {
      if (accessibleCompanies && accessibleCompanies.length > 0 && accessibleDepartments && accessibleDepartments.length > 0) {
        accessibleCompanies.forEach((comp) => {
          const companyDepts = accessibleDepartments.filter((d) => d.company === comp.id);
          if (companyDepts.length > 0) {
            const company = ensureCompany(resource, comp.id);
            companyDepts.forEach((dept) => {
              const deptEntry = company.departments.find((d) => d.departmentId === dept.id);
              if (deptEntry) {
                if (isCrud) deptEntry.permissions[actionLower as keyof ScopeLevelPermissions] = true;
                if (isExtended) deptEntry.extendedPermissions[actionLower as keyof ExtendedPermissions] = true;
              }
            });
          }
        });
      } else {
        // Нет доступных отделов — сохраняем как pass-through, чтобы не потерять scope
        hierarchy[resource].passthroughIds.push(permId);
      }
    }
  };

  rolePermissions.forEach((perm) => {
    const resource = perm.resource;
    const actionLower = perm.action?.toLowerCase();
    const scope = perm.scope;

    if (!actionLower || !scope) return;

    // Создаём структуру для ресурса если её нет
    if (!hierarchy[resource]) {
      hierarchy[resource] = emptyResourcePermissions();
    }

    if (!UI_EDITABLE_ACTIONS.includes(actionLower)) {
      // Действие вне UI — pass-through (EXPORT, IMPORT, APPROVE, DELETE_LOG)
      hierarchy[resource].passthroughIds.push(perm.id);
    } else {
      setActionOnScope(resource, actionLower, scope, perm.id);
    }
  });

  return hierarchy;
};

// Преобразование новой структуры в массив permission_ids для бэкенда
export const hierarchyToPermissionIds = (
  hierarchy: PermissionsHierarchyV2,
  allPermissions: any[]
): number[] => {
  const permissionIds: number[] = [];

  const addPermId = (id: number) => {
    if (!permissionIds.includes(id)) permissionIds.push(id);
  };

  const findPerm = (resourceName: string, actionUpper: string, scope: string) => {
    return allPermissions.find(
      (p) => p.resource === resourceName && p.action === actionUpper && p.scope === scope
    );
  };

  Object.entries(hierarchy).forEach(([resourceName, resourcePerms]) => {
    // Pass-through IDs — добавляем без изменений
    resourcePerms.passthroughIds.forEach((id) => addPermId(id));

    // CRUD действия
    const crudActions: Array<keyof ScopeLevelPermissions> = ['view', 'add', 'edit', 'delete'];

    crudActions.forEach((action) => {
      const actionUpper = action.toUpperCase();

      // OWN scope
      if (resourcePerms.own[action]) {
        const perm = findPerm(resourceName, actionUpper, 'OWN');
        if (perm) addPermId(perm.id);
      }

      // Компании и отделы
      resourcePerms.companies.forEach((company) => {
        if (company.companyLevel[action]) {
          const perm = findPerm(resourceName, actionUpper, 'COMPANY');
          if (perm) addPermId(perm.id);
        }

        company.departments.forEach((dept) => {
          if (dept.permissions[action]) {
            const perm = findPerm(resourceName, actionUpper, 'DEPARTMENT');
            if (perm) addPermId(perm.id);
          }
        });
      });

      // SYSTEM scope
      if (resourcePerms.system[action]) {
        const perm = findPerm(resourceName, actionUpper, 'SYSTEM');
        if (perm) addPermId(perm.id);
      }
    });

    // Extended действия (ASSIGN, EDIT_IN_PROGRESS, REOPEN, FORCE_EDIT)
    const extActions: Array<keyof ExtendedPermissions> = ['assign', 'edit_in_progress', 'reopen', 'force_edit'];

    extActions.forEach((action) => {
      const actionUpper = action.toUpperCase();

      // OWN scope
      if (resourcePerms.ownExtended[action]) {
        const perm = findPerm(resourceName, actionUpper, 'OWN');
        if (perm) addPermId(perm.id);
      }

      // Компании и отделы
      resourcePerms.companies.forEach((company) => {
        if (company.companyExtended[action]) {
          const perm = findPerm(resourceName, actionUpper, 'COMPANY');
          if (perm) addPermId(perm.id);
        }

        company.departments.forEach((dept) => {
          if (dept.extendedPermissions[action]) {
            const perm = findPerm(resourceName, actionUpper, 'DEPARTMENT');
            if (perm) addPermId(perm.id);
          }
        });
      });

      // SYSTEM scope
      if (resourcePerms.systemExtended[action]) {
        const perm = findPerm(resourceName, actionUpper, 'SYSTEM');
        if (perm) addPermId(perm.id);
      }
    });
  });

  return permissionIds;
};

// Подсчет выбранных разрешений
export const countSelectedPermissions = (hierarchy: PermissionsHierarchyV2): number => {
  let count = 0;

  Object.values(hierarchy).forEach((resourcePerms) => {
    // Pass-through
    count += resourcePerms.passthroughIds.length;

    // Мои
    if (!isCrudEmpty(resourcePerms.own)) count++;
    if (!isExtendedEmpty(resourcePerms.ownExtended)) count++;

    // Компании и отделы
    resourcePerms.companies.forEach((company) => {
      if (!isCrudEmpty(company.companyLevel)) count++;
      if (!isExtendedEmpty(company.companyExtended)) count++;
      company.departments.forEach((dept) => {
        if (!isCrudEmpty(dept.permissions)) count++;
        if (!isExtendedEmpty(dept.extendedPermissions)) count++;
      });
    });

    // Система
    if (!isCrudEmpty(resourcePerms.system)) count++;
    if (!isExtendedEmpty(resourcePerms.systemExtended)) count++;
  });

  return count;
};
