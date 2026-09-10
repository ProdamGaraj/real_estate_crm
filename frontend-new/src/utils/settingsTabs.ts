// real_estate_crm/frontend-new/src/utils/settingsTabs.ts

/**
 * Состав раздела «Настройки».
 *
 * Каждая вкладка управляет своим ресурсом, поэтому доступ к ней проверяется
 * по правам роли, а не по флагу системного администратора: финансисту нужны
 * типы платежей и счета получателей, но не роли и не API-ключи.
 *
 * Важно, каким именно правом открывается вкладка. Право «Просмотр» на
 * настроечный ресурс выдают и тем, кто настройки не ведёт: список компаний
 * нужен менеджеру в форме заявки, список пользователей — при выборе
 * исполнителя встречи, типы платежей — в графике. Если открывать вкладку по
 * любому VIEW, менеджер попадает в «Настройки» и видит там, например, вкладку
 * «Компании» с единственной своей строкой, которой ему нечего делать.
 *
 * Поэтому вкладка показывается, когда пользователь ей действительно
 * распоряжается:
 *
 * 1. может менять настройку — есть право «Добавление», «Редактирование» или
 *    «Удаление» на её ресурс;
 * 2. либо ему открыт сам раздел настроек (право «Просмотр» на ресурс
 *    «Настройки») и есть право «Просмотр» на ресурс вкладки — это доступ
 *    «только смотреть», например для аудитора.
 *
 * Права, выданные ради форм, под эти условия не подходят и раздел не открывают.
 */

import { hasPermission, isSystemAdmin } from './permissions';
import type { ActionType, ResourceType, UserWithRoles } from './permissions';

export interface SettingsTabConfig {
  id: string;
  labelKey: string;
  /** Ресурсы вкладки: достаточно прав на любой из них */
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

/** Все ресурсы раздела — например, для проверок на стороне маршрута */
export const SETTINGS_RESOURCES: ResourceType[] = Array.from(
  new Set(SETTINGS_TABS.flatMap(tab => tab.resources))
);

/** Действия, которые означают «пользователь ведёт эту настройку» */
const MANAGE_ACTIONS: ActionType[] = ['ADD', 'EDIT', 'DELETE'];

/** Может ли пользователь менять настройку — тогда вкладку показываем всегда */
function canManageResource(user: UserWithRoles | null, resource: ResourceType): boolean {
  return MANAGE_ACTIONS.some(action => hasPermission(user, action, resource));
}

/**
 * Открыт ли пользователю сам раздел настроек.
 *
 * Это отдельное право на ресурс «Настройки»: им отмечают тех, кто заходит
 * в раздел осознанно, а не получил доступ к справочнику ради формы.
 */
function hasSettingsSectionAccess(user: UserWithRoles | null): boolean {
  return hasPermission(user, 'VIEW', 'SETTINGS');
}

/** Вкладки, доступные пользователю. Системный администратор видит все. */
export function getVisibleSettingsTabs(user: UserWithRoles | null): SettingsTabConfig[] {
  if (isSystemAdmin(user)) {
    return SETTINGS_TABS;
  }

  const sectionAccess = hasSettingsSectionAccess(user);

  return SETTINGS_TABS.filter(tab =>
    tab.resources.some(resource => {
      if (canManageResource(user, resource)) {
        return true;
      }
      // Просмотр без права менять открывает вкладку только вместе
      // с доступом к самому разделу настроек
      return sectionAccess && hasPermission(user, 'VIEW', resource);
    })
  );
}

/** Есть ли у пользователя доступ хотя бы к одной вкладке настроек */
export function canAccessSettings(user: UserWithRoles | null): boolean {
  return getVisibleSettingsTabs(user).length > 0;
}
