// real_estate_crm/frontend-new/src/components/installments/InstallmentCalculator.tsx

/**
 * Калькулятор вариантов оплаты по планам компании.
 *
 * Порядок расчёта: скидки → цена → план. Менеджер отмечает скидки, которые
 * действуют для объекта сегодня; в каждой колонке плана учитываются только
 * скидки, действующие при этом плане (скидка может быть «только для 100%
 * оплаты»). Получившуюся цену план делит на платежи: вид плана, срок и
 * минимальный первоначальный взнос заданы в типе платежа. Своей скидки у
 * плана нет.
 *
 * В сделке доступна кнопка «Создать график»: в сделку сохраняются план,
 * скидки, действующие при нём, и стоимость по договору — цена варианта,
 * а график — строками варианта с типом платежа плана. Дальше график
 * правится вручную.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, FormControlLabel, Grid, InputLabel, MenuItem, Radio, Select, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import LocalizedDateField from '../common/LocalizedDateField';
import { getBeneficiaryAccounts, getPaymentTypes } from '../../api/finances';
import type { PaymentType } from '../../api/finances';
import { getAvailableDiscounts } from '../../api/deals';
import { discountFitsPlan, getPropertyAvailableDiscounts } from '../../api/discounts';
import type { Discount } from '../../api/discounts';
import { useIsMobile } from '../../hooks/useMobile';
import { formatMoney } from '../../utils/currency';
import { buildVariant, comparePlans, isPlan, todayIso } from '../../utils/installments';
import type { InstallmentVariant } from '../../utils/installments';

export interface ScheduleOptions {
  accountId: number;
  /** Отмеченные скидки, действующие при выбранном плане */
  discountIds: number[];
}

/** Откуда брать скидки: доступные для сделки или для объекта (карточка на шахматке) */
export type DiscountSource = { dealId: number } | { propertyId: number };

interface InstallmentCalculatorProps {
  open: boolean;
  onClose: () => void;
  /** Цена до скидок, в валюте currency */
  basePrice: number | null;
  currency: string;
  discountSource: DiscountSource;
  /** Скидки, уже применённые в сделке: отмечены сразу, даже если срок их действия прошёл */
  appliedDiscounts?: Discount[];
  /** План сделки — выбран сразу */
  preferredPlanId?: number | null;
  /** Строки шапки для экрана и печати: проект, дом, объект, площадь */
  heading: string[];
  /** Пояснение к цене, например пересчёт из прайса по курсу */
  priceNote?: string | null;
  /** Компания сделки: системному администратору показываем только её планы и общие */
  companyId?: number | null;
  /** Только в сделке: создать график по выбранному варианту */
  onCreateSchedule?: (variant: InstallmentVariant, options: ScheduleOptions) => void;
  createDisabledReason?: string | null;
  isCreating?: boolean;
  /** Текущая стоимость по договору — показывается при подтверждении замены */
  currentContractPrice?: number | null;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default function InstallmentCalculator({
  open, onClose, basePrice, currency, discountSource, appliedDiscounts, preferredPlanId, heading, priceNote,
  companyId, onCreateSchedule, createDisabledReason, isCreating, currentContractPrice,
}: InstallmentCalculatorProps) {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const money = (value: number) => formatMoney(value, currency, i18n.language);
  const dateText = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language);

  const scheduleMode = Boolean(onCreateSchedule);
  const typesQuery = useQuery({ queryKey: ['paymentTypes'], queryFn: getPaymentTypes, enabled: open });
  const { data: accounts } = useQuery({
    queryKey: ['beneficiaryAccounts'], queryFn: getBeneficiaryAccounts, enabled: open && scheduleMode,
  });
  const discountsQuery = useQuery({
    queryKey: 'dealId' in discountSource
      ? ['availableDiscounts', discountSource.dealId]
      : ['propertyDiscounts', discountSource.propertyId],
    queryFn: () => ('dealId' in discountSource
      ? getAvailableDiscounts(discountSource.dealId)
      : getPropertyAvailableDiscounts(discountSource.propertyId)),
    enabled: open,
  });

  // Доступные сегодня скидки плюс уже применённые в сделке (их срок мог пройти)
  const discounts = useMemo(() => {
    const byId = new Map<number, Discount>();
    [...(appliedDiscounts ?? []), ...(discountsQuery.data ?? [])].forEach(d => byId.set(d.id, d));
    return [...byId.values()];
  }, [appliedDiscounts, discountsQuery.data]);

  // Планы — типы платежей с заданным планом. Системный администратор видит
  // справочники всех компаний: в сделке оставляем планы её компании и общие
  const plans = useMemo(() => (typesQuery.data ?? [])
    .filter(isPlan)
    .filter(plan => !companyId || plan.company === null || plan.company === companyId)
    .sort(comparePlans), [typesQuery.data, companyId]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checkedDiscounts, setCheckedDiscounts] = useState<number[]>([]);
  const [downPercent, setDownPercent] = useState<string>('');
  const [startDate, setStartDate] = useState(todayIso());
  const [accountId, setAccountId] = useState(0);

  useEffect(() => {
    if (open) {
      setStartDate(todayIso());
      setDownPercent('');
      setCheckedDiscounts((appliedDiscounts ?? []).map(d => d.id));
      setSelectedId(preferredPlanId ?? null);
    }
  }, [open, appliedDiscounts, preferredPlanId]);

  useEffect(() => {
    if (plans.length && !plans.some(plan => plan.id === selectedId)) {
      setSelectedId(plans[0].id);
    }
  }, [plans, selectedId]);

  useEffect(() => {
    if (accounts && !accounts.some(account => account.id === accountId)) {
      setAccountId(accounts[0]?.id ?? 0);
    }
  }, [accounts, accountId]);

  /** Отмеченные скидки, действующие при плане */
  const discountsFor = (plan: PaymentType) =>
    discounts.filter(d => checkedDiscounts.includes(d.id) && discountFitsPlan(d, plan.id));
  const percentFor = (plan: PaymentType) => discountsFor(plan).reduce((sum, d) => sum + Number(d.percentage_value), 0);

  // Сравнение — по минимальному взносу; выбранный план — с учётом введённого взноса
  const variants = useMemo(() => (basePrice ? plans.map(plan => buildVariant(basePrice, plan, {
    currency, startDate, discountPercent: percentFor(plan),
  })) : []), [basePrice, plans, currency, startDate, discounts, checkedDiscounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedPlan: PaymentType | null = plans.find(plan => plan.id === selectedId) ?? null;
  const selected = useMemo(() => (basePrice && selectedPlan ? buildVariant(basePrice, selectedPlan, {
    currency, startDate, discountPercent: percentFor(selectedPlan),
    downPaymentPercent: downPercent === '' ? undefined : Number(downPercent),
  }) : null), [basePrice, selectedPlan, currency, startDate, discounts, checkedDiscounts, downPercent]); // eslint-disable-line react-hooks/exhaustive-deps

  const planNames = (discount: Discount) => discount.payment_plans_info?.join(', ') ?? '';
  const kindLabel = (kind: string) => t(`installments.kind_${kind}`);
  /** Как платится остаток после взноса: «12 × 13 700 000 UZS», «164 409 353 UZS через 3 мес.» */
  const restText = (v: InstallmentVariant) => {
    if (v.plan.plan_kind === 'FULL') return '—';
    if (v.plan.plan_kind === 'DEFERRED') {
      return v.plan.plan_months > 0
        ? t('installments.rest_after', { amount: money(v.rest), months: v.plan.plan_months })
        : t('installments.rest_now', { amount: money(v.rest) });
    }
    return t('installments.monthly_times', { count: Math.max(1, v.plan.plan_months), amount: money(v.monthly) });
  };

  const comparisonRows: { label: string; value: (v: InstallmentVariant) => string }[] = [
    { label: t('installments.row_discount_percent'), value: v => (v.discountPercent ? `${v.discountPercent}%` : '—') },
    { label: t('installments.row_discount_amount'), value: v => (v.discountAmount ? money(v.discountAmount) : '—') },
    { label: t('installments.row_price'), value: v => money(v.price) },
    {
      label: t('installments.row_down'),
      value: v => (v.plan.plan_kind === 'FULL' ? '—' : `${money(v.downPayment)} (${v.downPaymentPercent}%)`),
    },
    { label: t('installments.row_rest'), value: restText },
  ];

  const handlePrint = () => {
    if (!selected) return;
    const head = heading.map(line => `<div>${escapeHtml(line)}</div>`).join('');
    const applied = discountsFor(selected.plan).map(d => `${d.name} — ${d.percentage_value}%`).join('; ');
    const compareHead = variants.map(v => `<th>${escapeHtml(v.plan.name)}</th>`).join('');
    const compareBody = comparisonRows.map(row =>
      `<tr><th class="l">${escapeHtml(row.label)}</th>${variants.map(v => `<td>${escapeHtml(row.value(v))}</td>`).join('')}</tr>`
    ).join('');
    const scheduleBody = selected.rows.map(r =>
      `<tr><td>${r.number}</td><td>${escapeHtml(dateText(r.date))}</td><td class="l">${escapeHtml(kindLabel(r.kind))}</td>`
      + `<td>${escapeHtml(money(r.amount))}</td><td>${escapeHtml(money(r.balance))}</td></tr>`
    ).join('');
    const html = `<!doctype html><html lang="${i18n.language}"><head><meta charset="utf-8">
<title>${escapeHtml(t('installments.print_title'))}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:13px}
  h1{font-size:20px;margin:0 0 8px} h2{font-size:15px;margin:24px 0 8px}
  .head div{margin:2px 0} .note{color:#555;margin-top:6px}
  table{border-collapse:collapse;width:100%} th,td{border:1px solid #bbb;padding:5px 8px;text-align:right}
  th{background:#f2f2f2} .l{text-align:left}
  .foot{color:#555;margin-top:16px;font-size:12px}
  @media print{body{margin:10mm}}
</style></head><body>
<h1>${escapeHtml(t('installments.print_title'))}</h1>
<div class="head">${head}<div>${escapeHtml(t('installments.base_price'))}: <b>${escapeHtml(money(basePrice ?? 0))}</b></div>
${priceNote ? `<div class="note">${escapeHtml(priceNote)}</div>` : ''}</div>
<h2>${escapeHtml(t('installments.compare_title'))}</h2>
<table><thead><tr><th class="l"></th>${compareHead}</tr></thead><tbody>${compareBody}</tbody></table>
<h2>${escapeHtml(t('installments.schedule_title', { variant: selected.plan.name }))}</h2>
${applied ? `<div class="note">${escapeHtml(t('installments.discounts_applied', { list: applied }))}</div>` : ''}
<table><thead><tr><th>${escapeHtml(t('installments.col_number'))}</th><th>${escapeHtml(t('installments.col_date'))}</th>
<th class="l">${escapeHtml(t('installments.col_kind'))}</th><th>${escapeHtml(t('installments.col_amount'))}</th>
<th>${escapeHtml(t('installments.col_balance'))}</th></tr></thead><tbody>${scheduleBody}</tbody>
<tfoot><tr><th class="l" colspan="3">${escapeHtml(t('installments.total'))}</th><th>${escapeHtml(money(selected.price))}</th><th></th></tr></tfoot></table>
<div class="foot">${escapeHtml(t('installments.disclaimer', { date: dateText(todayIso()) }))}</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
    const win = window.open('', '_blank');
    if (!win) {
      alert(t('installments.popup_blocked'));
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const handleCreate = () => {
    if (!selected || !onCreateSchedule) return;
    const message = currentContractPrice && currentContractPrice !== selected.price
      ? t('installments.create_confirm_replace', {
          price: money(selected.price), current: money(currentContractPrice), count: selected.rows.length,
        })
      : t('installments.create_confirm', { price: money(selected.price), count: selected.rows.length });
    if (window.confirm(message)) {
      onCreateSchedule(selected, { accountId, discountIds: discountsFor(selected.plan).map(d => d.id) });
    }
  };

  const hasDownPayment = selectedPlan !== null && selectedPlan.plan_kind !== 'FULL';
  const minDown = Number(selectedPlan?.down_payment_percent ?? 0);
  const downInvalid = downPercent !== '' && (Number(downPercent) < minDown || Number(downPercent) >= 100);
  // Почему график по варианту создать нельзя — показываем, а не просто гасим кнопку
  let blockReason = createDisabledReason ?? null;
  if (!blockReason && scheduleMode && accounts && !accounts.length) {
    blockReason = t('installments.no_accounts');
  }
  if (!blockReason && selected && (selected.price <= 0 || !selected.rows.length)) {
    blockReason = t('installments.zero_price');
  }
  const canCreate = Boolean(selected) && !blockReason && !downInvalid && accountId > 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" fullScreen={isMobile}>
      <DialogTitle>{t('installments.title')}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box>
            {heading.map(line => <Typography key={line} variant="body2">{line}</Typography>)}
            <Typography variant="body1" sx={{ mt: 0.5 }}>
              <b>{t('installments.base_price')}:</b> {basePrice ? money(basePrice) : '—'}
            </Typography>
            {priceNote && <Typography variant="caption" color="text.secondary">{priceNote}</Typography>}
          </Box>

          {/* Скидки → цена: в колонке плана учитываются только скидки, действующие при нём */}
          <Box>
            <Typography variant="subtitle1">{t('installments.discounts_title')}</Typography>
            {discountsQuery.isLoading && <CircularProgress size={20} />}
            {discountsQuery.isSuccess && !discounts.length && (
              <Typography variant="body2" color="text.secondary">{t('installments.no_discounts')}</Typography>
            )}
            {discountsQuery.isError && <Alert severity="warning">{t('installments.no_discounts_access')}</Alert>}
            <Stack>
              {discounts.map(discount => (
                <FormControlLabel
                  key={discount.id}
                  control={(
                    <Checkbox
                      size="small"
                      checked={checkedDiscounts.includes(discount.id)}
                      onChange={(e) => setCheckedDiscounts(prev => (e.target.checked
                        ? [...prev, discount.id] : prev.filter(id => id !== discount.id)))}
                    />
                  )}
                  label={(
                    <Typography variant="body2">
                      {discount.name} — {discount.percentage_value}%
                      {discount.payment_plans?.length > 0 && (
                        <Typography component="span" variant="caption" color="text.secondary">
                          {' '}({t('installments.discount_only_for', { plans: planNames(discount) })})
                        </Typography>
                      )}
                    </Typography>
                  )}
                />
              ))}
            </Stack>
          </Box>

          {typesQuery.isLoading && <CircularProgress />}
          {typesQuery.isError && <Alert severity="warning">{t('installments.no_types_access')}</Alert>}
          {typesQuery.isSuccess && !plans.length && <Alert severity="info">{t('installments.no_plans')}</Alert>}

          {variants.length > 0 && (
            <>
              <Typography variant="subtitle1">{t('installments.compare_title')}</Typography>
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell />
                      {variants.map(v => (
                        <TableCell
                          key={v.plan.id}
                          align="right"
                          onClick={() => {
                            // Взнос, введённый для прежнего плана, мог быть ниже минимума нового
                            setSelectedId(v.plan.id);
                            setDownPercent('');
                          }}
                          sx={{ cursor: 'pointer', bgcolor: v.plan.id === selectedId ? 'action.selected' : undefined }}
                        >
                          <Radio size="small" checked={v.plan.id === selectedId} sx={{ p: 0.5 }} />
                          {v.plan.name}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {comparisonRows.map(row => (
                      <TableRow key={row.label}>
                        <TableCell component="th">{row.label}</TableCell>
                        {variants.map(v => (
                          <TableCell
                            key={v.plan.id}
                            align="right"
                            sx={{ whiteSpace: 'nowrap', bgcolor: v.plan.id === selectedId ? 'action.selected' : undefined }}
                          >
                            {row.value(v)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {selected && (
            <>
              <Typography variant="subtitle1">{t('installments.schedule_title', { variant: selected.plan.name })}</Typography>
              <Grid container spacing={2}>
                {hasDownPayment && (
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      label={t('installments.down_percent')}
                      type="number"
                      size="small"
                      fullWidth
                      value={downPercent === '' ? selected.downPaymentPercent : downPercent}
                      onChange={(e) => setDownPercent(e.target.value)}
                      error={downInvalid}
                      helperText={t('installments.min_hint', { percent: minDown })}
                      inputProps={{ min: minDown, max: 99, step: 1 }}
                    />
                  </Grid>
                )}
                <Grid size={{ xs: 12, sm: 4 }}>
                  <LocalizedDateField
                    label={t('installments.start_date')}
                    value={startDate}
                    onChange={(date) => setStartDate(date || todayIso())}
                  />
                </Grid>
                {scheduleMode && !blockReason && (
                  <Grid size={{ xs: 12, sm: 4 }}>
                    {/* Тип платежа у всех строк — выбранный план; остаётся выбрать счёт */}
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('finances.account')}</InputLabel>
                      <Select
                        label={t('finances.account')}
                        value={accountId || ''}
                        onChange={(e) => setAccountId(Number(e.target.value))}
                      >
                        {accounts?.map(account => <MenuItem key={account.id} value={account.id}>{account.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                )}
              </Grid>
              <TableContainer sx={{ maxHeight: 360 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('installments.col_number')}</TableCell>
                      <TableCell>{t('installments.col_date')}</TableCell>
                      <TableCell>{t('installments.col_kind')}</TableCell>
                      <TableCell align="right">{t('installments.col_amount')}</TableCell>
                      <TableCell align="right">{t('installments.col_balance')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selected.rows.map(row => (
                      <TableRow key={row.number}>
                        <TableCell>{row.number}</TableCell>
                        <TableCell>{dateText(row.date)}</TableCell>
                        <TableCell>{kindLabel(row.kind)}</TableCell>
                        <TableCell align="right">{money(row.amount)}</TableCell>
                        <TableCell align="right">{money(row.balance)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={3}><b>{t('installments.total')}</b></TableCell>
                      <TableCell align="right"><b>{money(selected.price)}</b></TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {scheduleMode && selected && blockReason && <Alert severity="info">{blockReason}</Alert>}

          <Typography variant="caption" color="text.secondary">
            {t('installments.disclaimer', { date: dateText(todayIso()) })}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button startIcon={<PrintIcon />} onClick={handlePrint} disabled={!selected}>{t('installments.print')}</Button>
        {scheduleMode && (
          <Button variant="contained" onClick={handleCreate} disabled={!canCreate || isCreating}>
            {isCreating ? t('installments.creating') : t('installments.create_schedule')}
          </Button>
        )}
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
