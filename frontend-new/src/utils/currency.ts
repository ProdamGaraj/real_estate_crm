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

/** Разделитель разрядов — неразрывный пробел: число не переносится по строкам */
const GROUP_SEPARATOR = '\u00A0';

/**
 * Число с пробелами между разрядами на любом языке: «151 164 678».
 * В английском интерфейсе раньше были запятые, а суммы в сумах с запятыми
 * читаются плохо. Десятичный разделитель — по языку: «,» для ru/uz, «.» для en.
 */
export function formatNumber(value: number | string, language = 'ru', options: Intl.NumberFormatOptions = {}): string {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return String(value);
  }
  const decimal = language === 'en' ? '.' : ',';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, ...options })
    .formatToParts(number)
    .map(part => (part.type === 'group' ? GROUP_SEPARATOR : part.type === 'decimal' ? decimal : part.value))
    .join('');
}

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
  const text = formatNumber(number, language);
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
  return formatNumber(rate, language, { maximumSignificantDigits: 8, maximumFractionDigits: undefined });
}

// Сумма вида «151 164 678 UZS» или «12 950 245,5»: разряды через пробел, валюта — по желанию
const FORMATTED_NUMBER = /^[-−]?\d{1,3}(?:[ \u00A0\u202F]\d{3})*(?:[.,]\d+)?(?:[ \u00A0\u202F]*[A-Z]{3})?$/;

/**
 * Число для буфера обмена: без пробелов между разрядами и без кода валюты
 * («151 164 678 UZS» → «151164678»), чтобы его можно было вставить в Excel
 * или калькулятор. Для любого другого текста — null.
 */
export function plainNumberForClipboard(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || !/[ \u00A0\u202F]|[A-Z]{3}$/.test(trimmed) || !FORMATTED_NUMBER.test(trimmed)) {
    return null;
  }
  return trimmed.replace(/[A-Z]{3}$/, '').replace(/[\s\u00A0\u202F]/g, '').replace('−', '-');
}

/** Копирование отформатированной суммы со страницы или из поля отдаёт число без пробелов */
export function installNumberCopyHandler() {
  document.addEventListener('copy', (event: ClipboardEvent) => {
    let text = '';
    const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    try {
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
          && typeof active.selectionStart === 'number' && typeof active.selectionEnd === 'number') {
        text = active.value.slice(active.selectionStart, active.selectionEnd);
      } else {
        text = window.getSelection()?.toString() ?? '';
      }
    } catch {
      return; // поле без выделения (например, type=number) — копирование как обычно
    }
    const plain = plainNumberForClipboard(text);
    if (plain !== null && event.clipboardData) {
      event.clipboardData.setData('text/plain', plain);
      event.preventDefault();
    }
  });
}
