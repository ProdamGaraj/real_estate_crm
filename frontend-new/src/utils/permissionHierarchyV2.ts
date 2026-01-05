/**
 * Новая иерархическая система разрешений V2
 * 
 * Структура:
 * Ресурс → Scope Level (own/companies/system) → Actions (CRUD)
 */

// CRUD операции
export type CrudAction = 'VIEW' | 'ADD' | 'EDIT' | 'DELETE';

// Разрешения для конкретного уровня (own/company/department/system)
export interface ScopeLevelPermissions {
  view: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
}

// Разрешения для отдела
export interface DepartmentPermissions {
  departmentId: number;
  permissions: ScopeLevelPermissions;
}

// Разрешения для компании (включая отделы)
export interface CompanyPermissions {
  companyId: number;
  // Разрешения на уровне всей компании
  companyLevel: ScopeLevelPermissions;
  // Разрешения для конкретных отделов
  departments: DepartmentPermissions[];
  // Флаг "выбрать всё" для компании
  selectAll: boolean;
}

// Структура разрешений для одного ресурса
export interface ResourcePermissions {
  // Мои данные
  own: ScopeLevelPermissions;
  // Компании и их отделы
  companies: CompanyPermissions[];
  // Вся система
  system: ScopeLevelPermissions;
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

// Создание пустых разрешений для ресурса
export const emptyResourcePermissions = (): ResourcePermissions => ({
  own: emptyCrudPermissions(),
  companies: [],
  system: emptyCrudPermissions(),
});

// Проверка что разрешения CRUD пустые
export const isCrudEmpty = (crud: ScopeLevelPermissions): boolean => {
  return !crud.view && !crud.add && !crud.edit && !crud.delete;
};

// Проверка что разрешения ресурса пустые
export const isResourceEmpty = (resource: ResourcePermissions): boolean => {
  return (
    isCrudEmpty(resource.own) &&
    resource.companies.length === 0 &&
    isCrudEmpty(resource.system)
  );
};

// Установить все CRUD разрешения
export const setAllCrud = (value: boolean): ScopeLevelPermissions => ({
  view: value,
  add: value,
  edit: value,
  delete: value,
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
    departments: company.departments.map((dept) => ({
      ...dept,
      permissions: setAllCrud(value),
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
    departments: departments.map((deptId) => ({
      departmentId: deptId,
      permissions: emptyCrudPermissions(),
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
      const crudAction = action.toLowerCase() as keyof ScopeLevelPermissions;

      // Мои
      if (scope.own) {
        resourcePerms.own[crudAction] = true;
      }

      // Компании
      scope.companies?.forEach((companyId: number) => {
        let company = resourcePerms.companies.find((c) => c.companyId === companyId);
        if (!company) {
          company = {
            companyId,
            companyLevel: emptyCrudPermissions(),
            departments: [],
            selectAll: false,
          };
          resourcePerms.companies.push(company);
        }
        company.companyLevel[crudAction] = true;
      });

      // Отделы
      scope.departments?.forEach((_deptId: number) => {
        // TODO: Нужно найти компанию для этого отдела
        // Пока просто добавляем как отдельную запись
      });

      // Система
      if (scope.system) {
        resourcePerms.system[crudAction] = true;
      }
    });

    newHierarchy[resource] = resourcePerms;
  });

  return newHierarchy;
};

/**
 * Преобразование массива разрешений роли в иерархическую структуру V2
 * Используется для загрузки существующих разрешений при редактировании роли
 */
export const permissionIdsToHierarchy = (
  rolePermissions: any[]
): PermissionsHierarchyV2 => {
  const hierarchy: PermissionsHierarchyV2 = {};

  if (!rolePermissions || rolePermissions.length === 0) {
    return hierarchy;
  }

  rolePermissions.forEach((perm) => {
    const resource = perm.resource;
    const action = perm.action?.toLowerCase() as keyof ScopeLevelPermissions;
    const scope = perm.scope;

    // Проверяем что action валидный
    if (!action || !['view', 'add', 'edit', 'delete'].includes(action)) {
      return; // Пропускаем нестандартные действия
    }

    // Создаём структуру для ресурса если её нет
    if (!hierarchy[resource]) {
      hierarchy[resource] = emptyResourcePermissions();
    }

    // Устанавливаем флаг в зависимости от scope
    if (scope === 'OWN') {
      hierarchy[resource].own[action] = true;
    } else if (scope === 'SYSTEM') {
      hierarchy[resource].system[action] = true;
    } else if (scope === 'COMPANY') {
      // Для COMPANY scope добавляем на уровень own (упрощённая логика)
      // В полной версии нужно добавлять конкретную компанию
      hierarchy[resource].own[action] = true;
    } else if (scope === 'DEPARTMENT') {
      // Для DEPARTMENT scope тоже добавляем на уровень own
      hierarchy[resource].own[action] = true;
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

  Object.entries(hierarchy).forEach(([resourceName, resourcePerms]) => {
    // Для каждого уровня (own, companies, system) и каждого действия
    const actions: Array<keyof ScopeLevelPermissions> = ['view', 'add', 'edit', 'delete'];

    actions.forEach((action) => {
      const actionUpper = action.toUpperCase();

      // Мои (OWN scope)
      if (resourcePerms.own[action]) {
        const perm = allPermissions.find(
          (p) => p.resource === resourceName && p.action === actionUpper && p.scope === 'OWN'
        );
        if (perm) permissionIds.push(perm.id);
      }

      // Компании и отделы
      resourcePerms.companies.forEach((company) => {
        // На уровне компании (COMPANY scope)
        if (company.companyLevel[action]) {
          const perm = allPermissions.find(
            (p) =>
              p.resource === resourceName &&
              p.action === actionUpper &&
              p.scope === 'COMPANY'
          );
          if (perm) permissionIds.push(perm.id);
        }

        // На уровне отделов
        company.departments.forEach((dept) => {
          if (dept.permissions[action]) {
            const perm = allPermissions.find(
              (p) =>
                p.resource === resourceName &&
                p.action === actionUpper &&
                p.department_id === dept.departmentId
            );
            if (perm) permissionIds.push(perm.id);
          }
        });
      });

      // Система
      if (resourcePerms.system[action]) {
        const perm = allPermissions.find(
          (p) =>
            p.resource === resourceName &&
            p.action === actionUpper &&
            p.scope === 'SYSTEM'
        );
        if (perm) permissionIds.push(perm.id);
      }
    });
  });

  return permissionIds;
};

// Подсчет выбранных разрешений
export const countSelectedPermissions = (hierarchy: PermissionsHierarchyV2): number => {
  let count = 0;

  Object.values(hierarchy).forEach((resourcePerms) => {
    // Мои
    if (!isCrudEmpty(resourcePerms.own)) count++;

    // Компании и отделы
    resourcePerms.companies.forEach((company) => {
      if (!isCrudEmpty(company.companyLevel)) count++;
      company.departments.forEach((dept) => {
        if (!isCrudEmpty(dept.permissions)) count++;
      });
    });

    // Система
    if (!isCrudEmpty(resourcePerms.system)) count++;
  });

  return count;
};
