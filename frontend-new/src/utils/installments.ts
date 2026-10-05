// real_estate_crm/frontend-new/src/utils/installments.ts

/**
 * Расчёт вариантов оплаты по условиям рассрочки.
 *
 * Цена со скидкой = базовая цена × (1 − скидка), до целых единиц валюты.
 * Первый взнос и ежемесячные платежи округляются до шага (для сумов — до
 * тысячи), остаток от округления приходится на последний платёж. Поэтому
 * сумма графика всегда в точности равна цене со скидкой — бэкенд примет
 * такой график без расхождений.
 */

import type { InstallmentTerm } from '../api/installments';

export interface ScheduleRow {
  number: number;
  /** Дата платежа, ГГГГ-ММ-ДД */
  date: string;
  amount: number;
  /** Остаток после этого платежа */
  balance: number;
  kind: 'full' | 'down' | 'monthly';
}

export interface InstallmentVariant {
  term: InstallmentTerm;
  months: number;
  basePrice: number;
  termDiscountPercent: number;
  /** Скидка за срок плюс скидки, уже применённые в сделке */
  discountPercent: number;
  discountAmount: number;
  price: number;
  downPaymentPercent: number;
  downPayment: number;
  /** Обычный ежемесячный платёж; последний может отличаться на остаток округления */
  monthly: number;
  rows: ScheduleRow[];
}

/** Шаг округления платежей: суммы в сумах — до тысячи, остальные — до целых */
export const roundingStep = (currency: string) => (currency === 'UZS' ? 1000 : 1);

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

const pad = (n: number) => String(n).padStart(2, '0');

export const todayIso = () => {
  // Локальная дата: toISOString() до 05:00 по Ташкенту дал бы вчерашний день
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** Дата через n месяцев; 31 января + 1 месяц — последний день февраля */
export function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const totalMonth = month - 1 + months;
  const targetYear = year + Math.floor(totalMonth / 12);
  const targetMonth = ((totalMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(Math.min(day, lastDay))}`;
}

export function buildVariant(
  basePrice: number,
  term: InstallmentTerm,
  options: { currency: string; startDate: string; extraDiscountPercent?: number; downPaymentPercent?: number },
): InstallmentVariant {
  const step = roundingStep(options.currency);
  const termDiscountPercent = Number(term.discount_percent) || 0;
  // Проценты складываются в float: 2.5 + 0.1 дало бы 2.6000000000000001 %
  const discountPercent = Math.min(100, Math.round((termDiscountPercent + (options.extraDiscountPercent || 0)) * 100) / 100);
  const price = Math.round(basePrice * (1 - discountPercent / 100));
  const months = term.months;

  const variant: InstallmentVariant = {
    term, months, basePrice, termDiscountPercent, discountPercent,
    discountAmount: basePrice - price, price,
    downPaymentPercent: 100, downPayment: price, monthly: 0, rows: [],
  };

  if (months === 0) {
    variant.rows = [{ number: 1, date: options.startDate, amount: price, balance: 0, kind: 'full' }];
    return variant;
  }

  // Менеджер может взять взнос больше минимального, но не меньше
  const minimum = Number(term.down_payment_percent) || 0;
  const downPaymentPercent = Math.min(99.99, Math.max(minimum, options.downPaymentPercent ?? minimum));
  const downPayment = Math.min(price, roundTo(price * downPaymentPercent / 100, step));
  const financed = price - downPayment;
  const monthly = Math.max(0, Math.floor(financed / months / step) * step);

  const rows: ScheduleRow[] = [];
  let balance = price;
  if (downPayment > 0) {
    balance -= downPayment;
    rows.push({ number: 1, date: options.startDate, amount: downPayment, balance, kind: 'down' });
  }
  for (let i = 1; i <= months; i += 1) {
    const amount = i === months ? financed - monthly * (months - 1) : monthly;
    balance -= amount;
    rows.push({ number: rows.length + 1, date: addMonths(options.startDate, i), amount, balance, kind: 'monthly' });
  }

  // При совсем малой сумме платежи могли бы округлиться до нуля — такие строки не нужны
  const nonZero = rows.filter(row => row.amount > 0).map((row, index) => ({ ...row, number: index + 1 }));

  return { ...variant, downPaymentPercent, downPayment, monthly, rows: nonZero };
}
