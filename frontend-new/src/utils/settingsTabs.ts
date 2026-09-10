// real_estate_crm/frontend-new/src/utils/settingsTabs.ts

/**
 * Состав раздела «Настройки».
 *
 * Каждая вкладка управляет своим ресурсом, поэтому доступ к ней проверяется
 * по правам роли, а не по флагу системного администратора: финансисту нужны
 * типы платежей и счета получателей, но не роли и не API-ключи.
 */

import { hasAnyViewPermission, isSystemAdmin } from './permissions';
import type { ResourceType, UserWithRoles } from './permissions';

export interface SettingsTabConfig {
  id: string;
  labelKey: string;
  /** Достаточно права VIEW на любой из ресурсов, чтобы вкладка была видна */
  resources: ResourceType[];
}

export const SETTINGS_TABS: SettingsTabConfig[] = [
  { id: 'companies', labelKey: 'pages.settings.companies_tab', resources: ['COMPANY'] },
  { id: 'departments', labelKey: 'pages.settings.departments_tab', resources: ['DEPARTMENT'] },
  { id: 'roles', labelKey: 'pages.settings.roles_tab', resources: ['ROLE'] },
  { id: 'users', labelKey: 'pages.settings.users_tab', resources: ['USER'] },
  { id: 'applications', labelKey: 'pages.settings.applications_tab', resources: ['APPLICATION_STATUS'] },
  { id: 'realty', labelKey: 'pages.settings.realty_tab', resources: ['BUILDING_TYPE'] },
  { id: 'finances', labelKey: 'pages.settings.finances_tab', resources: ['PAYMENT_TYPE', 'BENEFICIARY_ACCOUNT'] },
  { id: 'templates', labelKey: 'pages.settings.templates_tab', resources: ['TEMPLATE'] },
  { id: 'api-keys', labelKey: 'pages.settings.api_keys_tab', resources: ['PARTNER_API_KEY'] },
];

/** Все ресурсы раздела — для проверки доступа к странице целиком */
export const SETTINGS_RESOURCES: ResourceType[] = Array.from(
  new Set(SETTINGS_TABS.flatMap(tab => tab.resources))
);

/** Вкладки, доступные пользователю. Системный администратор видит все. */
export function getVisibleSettingsTabs(user: UserWithRoles | null): SettingsTabConfig[] {
  if (isSystemAdmin(user)) {
    return SETTINGS_TABS;
  }
  return SETTINGS_TABS.filter(tab =>
    tab.resources.some(resource => hasAnyViewPermission(user, resource))
  );
}

/** Есть ли у пользователя доступ хотя бы к одной вкладке настроек */
export function canAccessSettings(user: UserWithRoles | null): boolean {
  return getVisibleSettingsTabs(user).length > 0;
}
