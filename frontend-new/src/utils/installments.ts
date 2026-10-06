// real_estate_crm/frontend-new/src/utils/installments.ts

/**
 * Расчёт вариантов оплаты по планам — типам платежей с заданным планом.
 *
 * Цена со скидкой = базовая цена × (1 − скидка), до целых единиц валюты.
 * Первый взнос и платежи округляются до шага (для сумов — до тысячи),
 * остаток от округления приходится на последний платёж. Поэтому сумма
 * графика всегда в точности равна цене со скидкой — бэкенд примет такой
 * график без расхождений.
 *
 * Виды планов:
 * - FULL — вся сумма одним платежом;
 * - INSTALLMENT — первый взнос и plan_months равных ежемесячных платежей;
 * - DEFERRED — первый взнос и остаток одним платежом через plan_months
 *   месяцев (ипотека: остаток платит банк).
 */

import type { PaymentType } from '../api/finances';

export interface ScheduleRow {
  number: number;
  /** Дата платежа, ГГГГ-ММ-ДД */
  date: string;
  amount: number;
  /** Остаток после этого платежа */
  balance: number;
  kind: 'full' | 'down' | 'monthly' | 'rest';
}

export interface InstallmentVariant {
  plan: PaymentType;
  basePrice: number;
  planDiscountPercent: number;
  /** Скидка плана плюс скидки, уже применённые в сделке */
  discountPercent: number;
  discountAmount: number;
  price: number;
  downPaymentPercent: number;
  downPayment: number;
  /** Обычный ежемесячный платёж (рассрочка); последний может отличаться на остаток округления */
  monthly: number;
  /** Остаток одним платежом (план DEFERRED) */
  rest: number;
  rows: ScheduleRow[];
}

/** Тип платежа с заданным планом — показывается в калькуляторе */
export const isPlan = (type: PaymentType) => Boolean(type.plan_kind);

const KIND_ORDER: Record<string, number> = { FULL: 0, INSTALLMENT: 1, DEFERRED: 2 };

/** Порядок колонок: полная оплата, рассрочки по сроку, затем ипотека */
export const comparePlans = (a: PaymentType, b: PaymentType) =>
  (KIND_ORDER[a.plan_kind] ?? 9) - (KIND_ORDER[b.plan_kind] ?? 9) || a.plan_months - b.plan_months
  || a.name.localeCompare(b.name);

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
  plan: PaymentType,
  options: { currency: string; startDate: string; extraDiscountPercent?: number; downPaymentPercent?: number },
): InstallmentVariant {
  const step = roundingStep(options.currency);
  const planDiscountPercent = Number(plan.discount_percent) || 0;
  // Проценты складываются в float: 2.5 + 0.1 дало бы 2.6000000000000001 %
  const discountPercent = Math.min(100, Math.round((planDiscountPercent + (options.extraDiscountPercent || 0)) * 100) / 100);
  const price = Math.round(basePrice * (1 - discountPercent / 100));
  const months = plan.plan_months;

  const variant: InstallmentVariant = {
    plan, basePrice, planDiscountPercent, discountPercent,
    discountAmount: basePrice - price, price,
    downPaymentPercent: 100, downPayment: price, monthly: 0, rest: 0, rows: [],
  };

  if (plan.plan_kind === 'FULL') {
    variant.rows = price > 0 ? [{ number: 1, date: options.startDate, amount: price, balance: 0, kind: 'full' }] : [];
    return variant;
  }

  // Менеджер может взять взнос больше минимального, но не меньше
  const minimum = Number(plan.down_payment_percent) || 0;
  const downPaymentPercent = Math.min(99.99, Math.max(minimum, options.downPaymentPercent ?? minimum));
  const downPayment = Math.min(price, roundTo(price * downPaymentPercent / 100, step));
  const financed = price - downPayment;

  const rows: ScheduleRow[] = [];
  let balance = price;
  if (downPayment > 0) {
    balance -= downPayment;
    rows.push({ number: 1, date: options.startDate, amount: downPayment, balance, kind: 'down' });
  }

  let monthly = 0;
  if (plan.plan_kind === 'DEFERRED') {
    // Остаток одним платежом через plan_months месяцев (0 — в тот же день)
    rows.push({ number: rows.length + 1, date: addMonths(options.startDate, months), amount: financed, balance: 0, kind: 'rest' });
  } else {
    const count = Math.max(1, months);
    monthly = Math.max(0, Math.floor(financed / count / step) * step);
    for (let i = 1; i <= count; i += 1) {
      const amount = i === count ? financed - monthly * (count - 1) : monthly;
      balance -= amount;
      rows.push({ number: rows.length + 1, date: addMonths(options.startDate, i), amount, balance, kind: 'monthly' });
    }
  }

  // При совсем малой сумме платежи могли бы округлиться до нуля — такие строки не нужны
  const nonZero = rows.filter(row => row.amount > 0).map((row, index) => ({ ...row, number: index + 1 }));

  return { ...variant, downPaymentPercent, downPayment, monthly, rest: plan.plan_kind === 'DEFERRED' ? financed : 0, rows: nonZero };
}
