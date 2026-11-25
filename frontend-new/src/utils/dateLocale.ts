import i18n from '../i18n';

/**
 * Локаль для `toLocaleDateString` / `toLocaleString` по языку интерфейса.
 *
 * Та же таблица была скопирована в нескольких страницах. Новые экраны
 * берут её отсюда, чтобы дата в брони, сделке и объекте выглядела
 * одинаково.
 */
const LOCALES: Record<string, string> = { ru: 'ru-RU', en: 'en-US', uz: 'uz-UZ' };

export const getDateLocale = (language?: string) =>
  LOCALES[language || i18n.language] || 'ru-RU';

/** Дата без времени: «25.11.2026». Пустое значение — пустая строка */
export const formatDate = (value?: string | null, language?: string) =>
  value ? new Date(value).toLocaleDateString(getDateLocale(language)) : '';

/** Дата со временем: «25.11.2026, 14:30» */
export const formatDateTime = (value?: string | null, language?: string) =>
  value ? new Date(value).toLocaleString(getDateLocale(language)) : '';
