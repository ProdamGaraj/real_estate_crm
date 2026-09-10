import apiClient from './axios';

// Интерфейсы
export interface Company {
  id: number;
  name: string;
  code: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Счётчики приходят с сервера и показываются в карточке компании */
  departments_count?: number;
  employees_count?: number;
}

export interface Department {
  id: number;
  company: number;
  company_name?: string;
  name: string;
  code?: string;
  parent_department?: number | null;
  parent_department_name?: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  children?: Department[];
}

export interface Permission {
  id: number;
  code: string;
  action: string;
  resource: string;
  scope: string;
  description?: string;
  is_active: boolean;
}

export interface Role {
  id: number;
  name: string;
  code: string;
  scope: string;
  scope_display?: string;
  category: string;
  category_display?: string;
  description?: string;
  is_system: boolean;
  is_active: boolean;
  permissions: Permission[];
  companies: number[];
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: number;
  user: number;
  user_username?: string;
  user_full_name?: string;
  company?: number;
  company_name?: string;
  department?: number;
  department_name?: string;
  roles: Role[];
  position?: string;
  phone?: string;
  is_system_admin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PermissionLog {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  user: number;
  user_username?: string;
  changes?: any;
  ip_address?: string;
  timestamp: string;
}

// Фильтры
export interface CompanyFilters {
  search?: string;
  is_active?: boolean;
}

export interface DepartmentFilters {
  company?: number;
  parent_department?: number;
  is_active?: boolean;
}

export interface RoleFilters {
  scope?: string;
  category?: string;
  is_system?: boolean;
  is_active?: boolean;
}

export interface UserProfileFilters {
  company?: number;
  department?: number;
  role?: number;
  is_active?: boolean;
  search?: string;
}

// API функции для компаний
export const getCompanies = async (filters?: CompanyFilters): Promise<Company[]> => {
  const params = new URLSearchParams();
  if (filters?.search) params.append('search', filters.search);
  if (filters?.is_active !== undefined) params.append('is_active', String(filters.is_active));
  
  const response = await apiClient.get(`/permissions/companies/?${params}`);
  return response.data;
};

export const getCompany = async (id: number): Promise<Company> => {
  const response = await apiClient.get(`/permissions/companies/${id}/`);
  return response.data;
};

export const createCompany = async (data: Partial<Company>): Promise<Company> => {
  const response = await apiClient.post(`/permissions/companies/`, data);
  return response.data;
};

export const updateCompany = async (id: number, data: Partial<Company>): Promise<Company> => {
  const response = await apiClient.patch(`/permissions/companies/${id}/`, data);
  return response.data;
};

export const deleteCompany = async (id: number): Promise<void> => {
  await apiClient.delete(`/permissions/companies/${id}/`);
};

// Получить доступные компании для назначения в роли
export const getAccessibleCompanies = async (): Promise<Company[]> => {
  const response = await apiClient.get(`/permissions/companies/accessible/`);
  return response.data;
};

// API функции для отделов
export const getDepartments = async (filters?: DepartmentFilters): Promise<Department[]> => {
  const params = new URLSearchParams();
  if (filters?.company) params.append('company', String(filters.company));
  if (filters?.parent_department) params.append('parent_department', String(filters.parent_department));
  if (filters?.is_active !== undefined) params.append('is_active', String(filters.is_active));
  
  const response = await apiClient.get(`/permissions/departments/?${params}`);
  return response.data;
};

export const getDepartment = async (id: number): Promise<Department> => {
  const response = await apiClient.get(`/permissions/departments/${id}/`);
  return response.data;
};

export const createDepartment = async (data: Partial<Department>): Promise<Department> => {
  const response = await apiClient.post(`/permissions/departments/`, data);
  return response.data;
};

export const updateDepartment = async (id: number, data: Partial<Department>): Promise<Department> => {
  const response = await apiClient.patch(`/permissions/departments/${id}/`, data);
  return response.data;
};

export const deleteDepartment = async (id: number): Promise<void> => {
  await apiClient.delete(`/permissions/departments/${id}/`);
};

// Получить доступные отделы для назначения в роли
export const getAccessibleDepartments = async (): Promise<Department[]> => {
  const response = await apiClient.get(`/permissions/departments/accessible/`);
  return response.data;
};

// API функции для разрешений
export const getPermissions = async (filters?: { resource?: string; action?: string; scope?: string }): Promise<Permission[]> => {
  const params = new URLSearchParams();
  if (filters?.resource) params.append('resource', filters.resource);
  if (filters?.action) params.append('action', filters.action);
  if (filters?.scope) params.append('scope', filters.scope);
  
  const response = await apiClient.get(`/permissions/permissions/?${params}`);
  return response.data;
};

export const getGroupedPermissions = async (): Promise<any> => {
  const response = await apiClient.get(`/permissions/permissions/grouped_by_resource/`);
  return response.data;
};

// API функции для ролей
export const getRoles = async (filters?: RoleFilters): Promise<Role[]> => {
  const params = new URLSearchParams();
  if (filters?.scope) params.append('scope', filters.scope);
  if (filters?.category) params.append('category', filters.category);
  if (filters?.is_system !== undefined) params.append('is_system', String(filters.is_system));
  if (filters?.is_active !== undefined) params.append('is_active', String(filters.is_active));
  
  const response = await apiClient.get(`/permissions/roles/?${params}`);
  return response.data;
};

export const getRole = async (id: number): Promise<Role> => {
  const response = await apiClient.get(`/permissions/roles/${id}/`);
  return response.data;
};

export const createRole = async (data: Partial<Role> & { permission_ids?: number[] }): Promise<Role> => {
  const response = await apiClient.post(`/permissions/roles/`, data);
  return response.data;
};

export const updateRole = async (id: number, data: Partial<Role> & { permission_ids?: number[] }): Promise<Role> => {
  const response = await apiClient.patch(`/permissions/roles/${id}/`, data);
  return response.data;
};

export const deleteRole = async (id: number): Promise<void> => {
  await apiClient.delete(`/permissions/roles/${id}/`);
};

export const assignPermissionsToRole = async (
  roleId: number,
  permissionIds: number[],
  action: 'add' | 'remove' | 'set' = 'set'
): Promise<Role> => {
  const response = await apiClient.post(
    `/permissions/roles/${roleId}/assign_permissions/`,
    { permission_ids: permissionIds, action }
  );
  return response.data;
};

// API функции для профилей пользователей
export const getUserProfiles = async (filters?: UserProfileFilters): Promise<UserProfile[]> => {
  const params = new URLSearchParams();
  if (filters?.company) params.append('company', String(filters.company));
  if (filters?.department) params.append('department', String(filters.department));
  if (filters?.role) params.append('role', String(filters.role));
  if (filters?.is_active !== undefined) params.append('is_active', String(filters.is_active));
  if (filters?.search) params.append('search', filters.search);
  
  const response = await apiClient.get(`/permissions/user-profiles/?${params}`);
  return response.data;
};

export const getUserProfile = async (id: number): Promise<UserProfile> => {
  const response = await apiClient.get(`/permissions/user-profiles/${id}/`);
  return response.data;
};

export const createUserProfile = async (data: {
  username: string;
  password: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  company_id?: number;
  department_id?: number;
  role_ids?: number[];
  position?: string;
  phone?: string;
  is_system_admin?: boolean;
  is_active?: boolean;
}): Promise<UserProfile> => {
  const response = await apiClient.post(`/permissions/user-profiles/create_user/`, data);
  return response.data;
};

export const updateUserProfile = async (
  id: number,
  data: Partial<{
    company_id?: number;
    department_id?: number;
    role_ids?: number[];
    position?: string;
    phone?: string;
    is_system_admin?: boolean;
    is_active?: boolean;
  }>
): Promise<UserProfile> => {
  const response = await apiClient.patch(`/permissions/user-profiles/${id}/`, data);
  return response.data;
};

export const deleteUserProfile = async (id: number): Promise<void> => {
  await apiClient.delete(`/permissions/user-profiles/${id}/`);
};

export const banUser = async (id: number): Promise<{ success: boolean; message: string }> => {
  const response = await apiClient.post(`/permissions/user-profiles/${id}/ban/`);
  return response.data;
};

export const unbanUser = async (id: number): Promise<{ success: boolean; message: string }> => {
  const response = await apiClient.post(`/permissions/user-profiles/${id}/unban/`);
  return response.data;
};

export const softDeleteUser = async (id: number): Promise<{ success: boolean; message: string }> => {
  const response = await apiClient.post(`/permissions/user-profiles/${id}/soft_delete/`);
  return response.data;
};

export const changeUserPassword = async (
  profileId: number,
  newPassword: string,
  confirmPassword: string
): Promise<{ success: boolean; message: string }> => {
  const response = await apiClient.post(
    `/permissions/user-profiles/${profileId}/change_password/`,
    { new_password: newPassword, confirm_password: confirmPassword }
  );
  return response.data;
};

export const getCurrentUserProfile = async (): Promise<UserProfile> => {
  const response = await apiClient.get(`/permissions/me/`);
  return response.data;
};

export const getUserPermissions = async (profileId: number): Promise<Permission[]> => {
  const response = await apiClient.get(`/permissions/user-profiles/${profileId}/permissions/`);
  return response.data;
};

export const checkUserPermission = async (
  profileId: number,
  action: string,
  resource: string,
  scope: string
): Promise<{ has_permission: boolean }> => {
  const response = await apiClient.post(
    `/permissions/user-profiles/${profileId}/check_permission/`,
    { action, resource, scope }
  );
  return response.data;
};

// API функции для статистики
export interface PermissionStats {
  total_companies: number;
  total_departments: number;
  total_users: number;
  total_roles: number;
  total_permissions: number;
  active_users: number;
}

export const getPermissionStats = async (): Promise<PermissionStats> => {
  const response = await apiClient.get(`/permissions/stats/`);
  return response.data;
};

// API функции для логов
export const getPermissionLogs = async (filters?: {
  entity_type?: string;
  entity_id?: number;
  user?: number;
}): Promise<PermissionLog[]> => {
  const params = new URLSearchParams();
  if (filters?.entity_type) params.append('entity_type', filters.entity_type);
  if (filters?.entity_id) params.append('entity_id', String(filters.entity_id));
  if (filters?.user) params.append('user', String(filters.user));
  
  const response = await apiClient.get(`/permissions/logs/?${params}`);
  return response.data;
};
