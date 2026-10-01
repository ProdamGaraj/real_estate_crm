import i18n from '../i18n';
import { ru, enUS, uz } from 'date-fns/locale';
import type { Locale } from 'date-fns';

/**
 * Returns date-fns locale based on current i18n language
 */
export const getDateFnsLocale = (): Locale => {
  const lang = i18n.language;
  switch (lang) {
    case 'uz':
      return uz;
    case 'en':
      return enUS;
    case 'ru':
    default:
      return ru;
  }
};

/**
 * Translates status values from database to localized strings
 * Use this for translating system data like statuses, types, etc.
 */

// Client statuses
export const translateClientStatus = (status: string): string => {
  return i18n.t(`statuses.client.${status}`, { defaultValue: status });
};

// Application statuses
export const translateApplicationStatus = (status: string): string => {
  return i18n.t(`statuses.application.${status}`, { defaultValue: status });
};

// Application source
export const translateApplicationSource = (source: string): string => {
  return i18n.t(`statuses.application_source.${source}`, { defaultValue: source });
};

// Meeting statuses
export const translateMeetingStatus = (status: string): string => {
  return i18n.t(`statuses.meeting.${status}`, { defaultValue: status });
};

// Deal statuses
export const translateDealStatus = (status: string): string => {
  return i18n.t(`statuses.deal.${status}`, { defaultValue: status });
};

// Task statuses
export const translateTaskStatus = (status: string): string => {
  return i18n.t(`statuses.task.${status}`, { defaultValue: status });
};

// Task priorities
export const translateTaskPriority = (priority: string): string => {
  return i18n.t(`statuses.task_priority.${priority}`, { defaultValue: priority });
};

// Payment statuses
export const translatePaymentStatus = (status: string): string => {
  return i18n.t(`statuses.payment.${status}`, { defaultValue: status });
};

// Building statuses
export const translateBuildingStatus = (status: string): string => {
  return i18n.t(`statuses.building.${status}`, { defaultValue: status });
};

// Property statuses
export const translatePropertyStatus = (status: string): string => {
  return i18n.t(`statuses.property.${status}`, { defaultValue: status });
};

// Property types
export const translatePropertyType = (type: string): string => {
  return i18n.t(`statuses.property_type.${type}`, { defaultValue: type });
};

// Role scopes
export const translateRoleScope = (scope: string): string => {
  return i18n.t(`statuses.role_scope.${scope}`, { defaultValue: scope });
};

// Role categories
export const translateRoleCategory = (category: string): string => {
  return i18n.t(`statuses.role_category.${category}`, { defaultValue: category });
};

// Permission actions
export const translatePermissionAction = (action: string): string => {
  return i18n.t(`statuses.permission_action.${action}`, { defaultValue: action });
};

// Permission scopes
export const translatePermissionScope = (scope: string): string => {
  return i18n.t(`statuses.permission_scope.${scope}`, { defaultValue: scope });
};

// Resources
export const translateResource = (resource: string): string => {
  return i18n.t(`resources.${resource}`, { defaultValue: resource });
};

/**
 * Generic status translator - tries to find translation in all status categories
 */
export const translateStatus = (status: string, category?: string): string => {
  if (category) {
    const key = `statuses.${category}.${status}`;
    const translated = i18n.t(key, { defaultValue: '' });
    if (translated && translated !== key) {
      return translated;
    }
  }
  
  // Try to find in any category
  const categories = [
    'client', 'application', 'application_source', 'meeting', 
    'deal', 'task', 'task_priority', 'payment', 'building', 
    'property', 'property_type', 'role_scope', 'role_category',
    'permission_action', 'permission_scope'
  ];
  
  for (const cat of categories) {
    const key = `statuses.${cat}.${status}`;
    const translated = i18n.t(key, { defaultValue: '' });
    if (translated && translated !== key && translated !== '') {
      return translated;
    }
  }
  
  return status;
};
