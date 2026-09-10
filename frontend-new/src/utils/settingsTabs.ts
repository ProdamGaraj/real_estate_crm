// real_estate_crm/frontend-new/src/utils/settingsTabs.ts

/**
 * Состав раздела «Настройки».
 *
 * Каждая вкладка управляет своим ресурсом, поэтому доступ к ней проверяется
 * по правам роли, а не по флагу системного администратора: финансисту нужны
 * типы платежей и счета получателей, но не роли и не API-ключи.
 *
 * Ключ от раздела — право «Просмотр» на ресурс «Настройки». Без него раздел
 * закрыт целиком, какие бы права на отдельные справочники у человека ни были.
 *
 * Так сделано потому, что права на настроечные ресурсы выдают и тем, кто
 * настройки не ведёт: список компаний нужен менеджеру в форме заявки, список
 * пользователей — при выборе исполнителя встречи, типы платежей и счета — в
 * графике платежей. Пока раздел открывался по этим правам, менеджер попадал
 * в «Настройки» и видел там чужие вкладки — например «Компании» с единственной
 * своей строкой, которой ему нечего делать.
 *
 * Внутри раздела вкладка показывается, если пользователь ресурсом
 * распоряжается: может его менять («Добавление», «Редактирование» или
 * «Удаление») либо смотреть на уровне компании и выше.
 *
 * Просмотр уровня «Только свои» вкладку не открывает — это тот самый
 * справочный доступ: своя компания в списке из одной строки. Иначе даже
 * у финансиста, которому раздел открыт по делу, всплывала бы пустая
 * вкладка «Компании».
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

/** Распоряжается ли пользователь ресурсом вкладки */
function canUseResource(user: UserWithRoles | null, resource: ResourceType): boolean {
  // Право менять открывает вкладку при любой области действия:
  // тот, кто ведёт справочник, обязан его видеть
  if (MANAGE_ACTIONS.some(action => hasPermission(user, action, resource))) {
    return true;
  }
  // Просмотр — только начиная с уровня компании. Область «Только свои»
  // означает справочный доступ ради форм и вкладку не открывает.
  return hasPermission(user, 'VIEW', resource, 'COMPANY');
}

/**
 * Открыт ли пользователю сам раздел настроек.
 *
 * Отдельное право на ресурс «Настройки». Им отмечают тех, кто заходит в раздел
 * осознанно, — в отличие от прав на справочники, которые выдаются ради форм.
 */
export function hasSettingsSectionAccess(user: UserWithRoles | null): boolean {
  return isSystemAdmin(user) || hasPermission(user, 'VIEW', 'SETTINGS');
}

/** Вкладки, доступные пользователю. Системный администратор видит все. */
export function getVisibleSettingsTabs(user: UserWithRoles | null): SettingsTabConfig[] {
  if (isSystemAdmin(user)) {
    return SETTINGS_TABS;
  }

  // Нет права на просмотр настроек — раздела нет, что бы ни было выдано
  // на отдельные справочники
  if (!hasSettingsSectionAccess(user)) {
    return [];
  }

  return SETTINGS_TABS.filter(tab =>
    tab.resources.some(resource => canUseResource(user, resource))
  );
}

/** Есть ли у пользователя доступ хотя бы к одной вкладке настроек */
export function canAccessSettings(user: UserWithRoles | null): boolean {
  return getVisibleSettingsTabs(user).length > 0;
}
