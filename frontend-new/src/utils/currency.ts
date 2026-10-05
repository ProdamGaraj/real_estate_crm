// real_estate_crm/frontend-new/src/utils/currency.ts

/**
 * Суммы и пересчёт валют на клиенте.
 *
 * Пересчёт здесь — только предпросмотр: окончательно сумму в валюте сделки
 * считает бэкенд при сохранении, по тем же курсам. Поэтому формулы те же:
 * курс — сумов за 1 единицу валюты, кросс-курс = курс(из) / курс(в),
 * округление до копеек только у итоговой суммы.
 */

import type { ExchangeRate } from '../api/currency';

const NUMBER_LOCALES: Record<string, string> = { ru: 'ru-RU', en: 'en-US', uz: 'uz-UZ' };

export const numberLocale = (language: string) => NUMBER_LOCALES[language] || 'ru-RU';

/** Округление до копеек без двоичного «хвоста» вида 0.30000000000000004 */
export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** «252 000 000 UZS». Валюта не указана — только число */
export function formatMoney(
  value: number | string | null | undefined,
  currency?: string | null,
  language = 'ru',
): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const number = Number(value);
  if (Number.isNaN(number)) {
    return String(value);
  }
  const text = number.toLocaleString(numberLocale(language), { maximumFractionDigits: 2 });
  return currency ? `${text} ${currency}` : text;
}

/** Сколько единиц валюты `to` даёт единица `from`; null — нет курса одной из валют */
export function crossRate(rates: Record<string, ExchangeRate> | undefined, from: string, to: string): number | null {
  if (from === to) {
    return 1;
  }
  const fromRate = Number(rates?.[from]?.rate);
  const toRate = Number(rates?.[to]?.rate);
  if (!fromRate || !toRate) {
    return null;
  }
  return fromRate / toRate;
}

/** Сумма в другой валюте, округлённая до копеек; null — нет курса */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, ExchangeRate> | undefined,
): number | null {
  const rate = crossRate(rates, from, to);
  return rate === null ? null : roundMoney(amount * rate);
}

/** Курс для показа: «12 000» или «0,0000849» — без лишних нулей */
export function formatRate(rate: number | string | null | undefined, language = 'ru'): string {
  if (rate === null || rate === undefined || rate === '') {
    return '';
  }
  return Number(rate).toLocaleString(numberLocale(language), { maximumSignificantDigits: 8 });
}
