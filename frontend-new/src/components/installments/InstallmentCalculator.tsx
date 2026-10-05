// real_estate_crm/frontend-new/src/components/installments/InstallmentCalculator.tsx

/**
 * Калькулятор рассрочки: варианты оплаты по условиям компании.
 *
 * Сверху — сравнение всех сроков (скидка, цена, взнос, ежемесячный платёж),
 * ниже — помесячный график выбранного срока. Таблицу можно распечатать или
 * сохранить в PDF, чтобы показать клиенту.
 *
 * В сделке доступна кнопка «Создать график»: стоимость по договору становится
 * ценой выбранного варианта, а график сохраняется строками этого варианта.
 * Дальше график правится вручную, как обычно.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, Grid, InputLabel, MenuItem, Radio, Select, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import LocalizedDateField from '../common/LocalizedDateField';
import { getInstallmentTerms } from '../../api/installments';
import { getBeneficiaryAccounts, getPaymentTypes } from '../../api/finances';
import { useIsMobile } from '../../hooks/useMobile';
import { formatMoney } from '../../utils/currency';
import { buildVariant, todayIso } from '../../utils/installments';
import type { InstallmentVariant } from '../../utils/installments';

export interface ScheduleOptions {
  /** Тип платежа для оплаты всей суммой сразу (срок 0) */
  fullPaymentTypeId: number;
  downPaymentTypeId: number;
  monthlyPaymentTypeId: number;
  accountId: number;
}

/** Тип платежа строки графика по её виду */
export const paymentTypeFor = (kind: 'full' | 'down' | 'monthly', options: ScheduleOptions) =>
  (kind === 'full' ? options.fullPaymentTypeId : kind === 'down' ? options.downPaymentTypeId : options.monthlyPaymentTypeId);

interface InstallmentCalculatorProps {
  open: boolean;
  onClose: () => void;
  /** Цена, от которой считаются скидки, в валюте currency */
  basePrice: number | null;
  currency: string;
  /** Скидки, уже применённые в сделке, % — складываются со скидкой за срок */
  extraDiscountPercent?: number;
  /** Строки шапки для экрана и печати: проект, дом, объект, площадь */
  heading: string[];
  /** Пояснение к цене, например пересчёт из прайса по курсу */
  priceNote?: string | null;
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

/** Тип платежа по названию: «Первоначальный взнос», «Рассрочка» — если такие заведены */
const findType = (types: { id: number; name: string }[] | undefined, words: string[]) =>
  types?.find(type => words.some(word => type.name.toLowerCase().includes(word)))?.id ?? types?.[0]?.id ?? 0;

export default function InstallmentCalculator({
  open, onClose, basePrice, currency, extraDiscountPercent = 0, heading, priceNote, companyId,
  onCreateSchedule, createDisabledReason, isCreating, currentContractPrice,
}: InstallmentCalculatorProps) {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const money = (value: number) => formatMoney(value, currency, i18n.language);
  const dateText = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language);

  const { data: terms, isLoading } = useQuery({
    queryKey: ['installmentTerms', companyId ?? null],
    queryFn: () => getInstallmentTerms({ company: companyId }),
    enabled: open,
  });
  const scheduleMode = Boolean(onCreateSchedule);
  const { data: paymentTypes } = useQuery({ queryKey: ['paymentTypes'], queryFn: getPaymentTypes, enabled: open && scheduleMode });
  const { data: accounts } = useQuery({ queryKey: ['beneficiaryAccounts'], queryFn: getBeneficiaryAccounts, enabled: open && scheduleMode });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [downPercent, setDownPercent] = useState<string>('');
  const [startDate, setStartDate] = useState(todayIso());
  const [options, setOptions] = useState<ScheduleOptions>({
    fullPaymentTypeId: 0, downPaymentTypeId: 0, monthlyPaymentTypeId: 0, accountId: 0,
  });

  useEffect(() => {
    if (open) {
      setStartDate(todayIso());
      setDownPercent('');
    }
  }, [open]);

  useEffect(() => {
    if (terms?.length && !terms.some(term => term.id === selectedId)) {
      setSelectedId(terms[0].id);
    }
  }, [terms, selectedId]);

  useEffect(() => {
    if (paymentTypes && accounts) {
      setOptions({
        fullPaymentTypeId: findType(paymentTypes, ['полн', '100', "to'liq", 'to‘liq']),
        downPaymentTypeId: findType(paymentTypes, ['взнос', 'первонач', 'boshlang']),
        monthlyPaymentTypeId: findType(paymentTypes, ['рассроч', "bo'lib", 'bo‘lib']),
        accountId: accounts[0]?.id ?? 0,
      });
    }
  }, [paymentTypes, accounts]);

  // Сравнение сроков — по минимальному взносу; выбранный срок — с учётом введённого взноса
  const variants = useMemo(() => (basePrice && terms ? terms.map(term => buildVariant(basePrice, term, {
    currency, startDate, extraDiscountPercent,
  })) : []), [basePrice, terms, currency, startDate, extraDiscountPercent]);

  const selectedTerm = terms?.find(term => term.id === selectedId) ?? null;
  const selected = useMemo(() => (basePrice && selectedTerm ? buildVariant(basePrice, selectedTerm, {
    currency, startDate, extraDiscountPercent,
    downPaymentPercent: downPercent === '' ? undefined : Number(downPercent),
  }) : null), [basePrice, selectedTerm, currency, startDate, extraDiscountPercent, downPercent]);

  const termLabel = (months: number) =>
    (months === 0 ? t('installments.full_payment') : t('installments.months', { months }));
  const kindLabel = (kind: string) => t(`installments.kind_${kind}`);

  const comparisonRows: { label: string; value: (v: InstallmentVariant) => string }[] = [
    { label: t('installments.row_discount_percent'), value: v => `${v.discountPercent}%` },
    { label: t('installments.row_discount_amount'), value: v => money(v.discountAmount) },
    { label: t('installments.row_price'), value: v => money(v.price) },
    { label: t('installments.row_down'), value: v => (v.months === 0 ? '—' : `${money(v.downPayment)} (${v.downPaymentPercent}%)`) },
    { label: t('installments.row_monthly'), value: v => (v.months === 0 ? '—' : money(v.monthly)) },
  ];

  const handlePrint = () => {
    if (!selected) return;
    const head = heading.map(line => `<div>${escapeHtml(line)}</div>`).join('');
    const compareHead = variants.map(v => `<th>${escapeHtml(termLabel(v.months))}</th>`).join('');
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
  th{background:#f2f2f2} .l{text-align:left} .sel{background:#e8f0fe}
  .foot{color:#555;margin-top:16px;font-size:12px}
  @media print{body{margin:10mm}}
</style></head><body>
<h1>${escapeHtml(t('installments.print_title'))}</h1>
<div class="head">${head}<div>${escapeHtml(t('installments.base_price'))}: <b>${escapeHtml(money(basePrice ?? 0))}</b></div>
${priceNote ? `<div class="note">${escapeHtml(priceNote)}</div>` : ''}</div>
<h2>${escapeHtml(t('installments.compare_title'))}</h2>
<table><thead><tr><th class="l"></th>${compareHead}</tr></thead><tbody>${compareBody}</tbody></table>
<h2>${escapeHtml(t('installments.schedule_title', { variant: termLabel(selected.months) }))}</h2>
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
      onCreateSchedule(selected, options);
    }
  };

  const minDown = Number(selectedTerm?.down_payment_percent ?? 0);
  const downInvalid = downPercent !== '' && (Number(downPercent) < minDown || Number(downPercent) >= 100);
  // Почему график по варианту создать нельзя — показываем, а не просто гасим кнопку
  let blockReason = createDisabledReason ?? null;
  if (!blockReason && scheduleMode && paymentTypes && accounts && (!paymentTypes.length || !accounts.length)) {
    blockReason = t('installments.no_types');
  }
  if (!blockReason && selected && (selected.price <= 0 || !selected.rows.length)) {
    blockReason = t('installments.zero_price');
  }
  const typesChosen = Boolean(selected) && options.accountId > 0
    && selected!.rows.every(row => paymentTypeFor(row.kind, options) > 0);
  const canCreate = Boolean(selected) && !blockReason && !downInvalid && typesChosen;

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
            {extraDiscountPercent > 0 && (
              <Typography variant="caption" color="text.secondary" display="block">
                {t('installments.applied_discounts', { percent: extraDiscountPercent })}
              </Typography>
            )}
          </Box>

          {isLoading && <CircularProgress />}
          {!isLoading && !terms?.length && <Alert severity="info">{t('installments.no_terms')}</Alert>}

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
                          key={v.term.id}
                          align="right"
                          onClick={() => {
                            // Взнос, введённый для прежнего срока, мог быть ниже минимума нового
                            setSelectedId(v.term.id);
                            setDownPercent('');
                          }}
                          sx={{ cursor: 'pointer', whiteSpace: 'nowrap', bgcolor: v.term.id === selectedId ? 'action.selected' : undefined }}
                        >
                          <Radio size="small" checked={v.term.id === selectedId} sx={{ p: 0.5 }} />
                          {termLabel(v.months)}
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
                            key={v.term.id}
                            align="right"
                            sx={{ whiteSpace: 'nowrap', bgcolor: v.term.id === selectedId ? 'action.selected' : undefined }}
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
              <Typography variant="subtitle1">{t('installments.schedule_title', { variant: termLabel(selected.months) })}</Typography>
              <Grid container spacing={2}>
                {selected.months > 0 && (
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

          {scheduleMode && selected && (
            <>
              {blockReason && <Alert severity="info">{blockReason}</Alert>}
              {!blockReason && (
                <Grid container spacing={2}>
                  {selected.months > 0 && (
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel>{t('installments.down_type')}</InputLabel>
                        <Select
                          label={t('installments.down_type')}
                          value={options.downPaymentTypeId || ''}
                          onChange={(e) => setOptions(prev => ({ ...prev, downPaymentTypeId: Number(e.target.value) }))}
                        >
                          {paymentTypes?.map(type => <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Grid>
                  )}
                  <Grid size={{ xs: 12, sm: 4 }}>
                    {/* Полная оплата и ежемесячные платежи — разные типы платежа */}
                    <FormControl fullWidth size="small">
                      <InputLabel>{selected.months > 0 ? t('installments.monthly_type') : t('finances.payment_type')}</InputLabel>
                      <Select
                        label={selected.months > 0 ? t('installments.monthly_type') : t('finances.payment_type')}
                        value={(selected.months > 0 ? options.monthlyPaymentTypeId : options.fullPaymentTypeId) || ''}
                        onChange={(e) => setOptions(prev => (selected.months > 0
                          ? { ...prev, monthlyPaymentTypeId: Number(e.target.value) }
                          : { ...prev, fullPaymentTypeId: Number(e.target.value) }))}
                      >
                        {paymentTypes?.map(type => <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('finances.account')}</InputLabel>
                      <Select
                        label={t('finances.account')}
                        value={options.accountId || ''}
                        onChange={(e) => setOptions(prev => ({ ...prev, accountId: Number(e.target.value) }))}
                      >
                        {accounts?.map(account => <MenuItem key={account.id} value={account.id}>{account.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              )}
            </>
          )}

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
