import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { getPaymentTypes, getBeneficiaryAccounts, createPaymentSchedule, updatePayment, markPaymentAsReturned } from '../../api/finances';
import type { Payment, PaymentSchedulePayloadItem } from '../../api/finances';
import { getCurrencySettings, getCurrentRates } from '../../api/currency';

import {
  Box, Button, Grid, Paper, Stack, TextField, Typography, Alert, IconButton,
  FormControl, InputLabel, Select, MenuItem, TableContainer, Table, TableHead,
  TableRow, TableCell, TableBody, Chip
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import UndoIcon from '@mui/icons-material/Undo';
import { useMemo, useState, useEffect } from 'react';
import LocalizedDateField from '../common/LocalizedDateField';
import { extractApiError } from '../../utils/apiError';
import { convertAmount, crossRate, formatMoney, formatRate, roundMoney } from '../../utils/currency';

interface PaymentScheduleProps {
  dealId: number;
  contractPrice: number;
  /** Валюта сделки: в ней хранится весь график */
  dealCurrency: string;
  /** Компания сделки — её список поддерживаемых валют действует для графика */
  dealCompanyId?: number | null;
  existingPayments: Payment[];
  isDealTerminated: boolean;
  isReadOnly: boolean;
}

interface FormValues {
  payments: PaymentSchedulePayloadItem[];
}

const getStatusChipColor = (status: Payment['status']) => {
  switch (status) {
    case 'PAID': return 'success';
    case 'OVERDUE': return 'error';
    case 'TO_BE_RETURNED': return 'warning';
    case 'RETURNED': return 'info';
    default: return 'default';
  }
}

// Платежи, по которым уже прошли деньги: их нельзя удалить из графика
// и нельзя переписать сумму или срок при правке
const PROTECTED_STATUSES: Payment['status'][] = ['PAID', 'TO_BE_RETURNED', 'RETURNED'];


export default function PaymentSchedule({
  dealId, contractPrice, dealCurrency, dealCompanyId, existingPayments: unsortedPayments, isDealTerminated, isReadOnly,
}: PaymentScheduleProps) {
  // График читается по порядку сроков. API отдаёт платежи от поздних к ранним —
  // так удобно списку «Финансы», но не графику сделки
  const existingPayments = useMemo(
    () => [...unsortedPayments].sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id),
    [unsortedPayments]
  );
  const { t, i18n } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const queryClient = useQueryClient();
  const money = (value: number | string | null | undefined, currency?: string | null) =>
    formatMoney(value, currency, i18n.language);

  const { data: paymentTypes } = useQuery({ queryKey: ['paymentTypes'], queryFn: getPaymentTypes });
  const { data: accounts } = useQuery({ queryKey: ['beneficiaryAccounts'], queryFn: getBeneficiaryAccounts });

  // В каких валютах можно вводить строки: поддерживаемые валюты компании
  // сделки и сама валюта сделки (она могла выйти из списка после брони)
  const { data: currencySettings } = useQuery({
    queryKey: ['currencySettings', dealCompanyId ?? null],
    queryFn: () => getCurrencySettings(dealCompanyId),
  });
  const currencyOptions = useMemo(() => {
    const codes = currencySettings?.supported_currencies ?? [];
    return codes.includes(dealCurrency) ? codes : [dealCurrency, ...codes];
  }, [currencySettings, dealCurrency]);

  // Курсы на сегодня — по ним бэкенд пересчитает строки при сохранении.
  // Здесь они нужны для предпросмотра суммы в валюте сделки
  const needsRates = currencyOptions.some(code => code !== dealCurrency);
  const { data: currentRates, isLoading: ratesLoading } = useQuery({
    queryKey: ['exchangeRates', 'current', dealCompanyId ?? null, currencyOptions],
    queryFn: () => getCurrentRates({ currencies: currencyOptions, company: dealCompanyId }),
    enabled: needsRates && (isEditing || existingPayments.length === 0),
  });
  const rates = currentRates?.rates;

  const { control, handleSubmit, watch, reset, setValue, getValues } = useForm<FormValues>({
    defaultValues: { payments: [] },
    mode: 'onChange'
  });

  // keyName переопределён: по умолчанию useFieldArray кладёт свой ключ в поле `id`
  // и затирает им ID платежа, который нужен бэкенду
  const { fields, append, remove } = useFieldArray({ control, name: "payments", keyName: 'fieldKey' });

  // Статусы существующих платежей — по ним определяем защищённые строки формы
  const paymentStatusById = useMemo(
    () => new Map(existingPayments.map(p => [p.id, p.status])),
    [existingPayments]
  );
  const paymentById = useMemo(
    () => new Map(existingPayments.map(p => [p.id, p])),
    [existingPayments]
  );
  const isProtectedRow = (paymentId?: number) => {
    const status = paymentId ? paymentStatusById.get(paymentId) : undefined;
    return status !== undefined && PROTECTED_STATUSES.includes(status);
  };

  useEffect(() => {
    // Этот хук теперь срабатывает только один раз для установки начального шага
    if (existingPayments.length === 0 && !isEditing && paymentTypes && accounts) {
      setValue('payments', [{
        amount: contractPrice,
        due_date: '',
        payment_type_id: paymentTypes[0]?.id || 0,
        beneficiary_account_id: accounts[0]?.id || 0,
        // Новая строка — в валюте сделки. Раньше здесь был зашит сум, и
        // график долларовой сделки по умолчанию собирался в сумах
        currency: dealCurrency,
        method: 'CASHLESS'
      }]);
    }
  }, [existingPayments, isEditing, contractPrice, dealCurrency, paymentTypes, accounts, setValue]);

  const handleEditClick = () => {
    // Строки загружаются в валюте сделки — так, как они хранятся. Если вернуть
    // исходные доллары, бэкенд пересчитал бы их по сегодняшнему курсу и
    // график перестал бы сходиться с договором
    const transformedPayments = existingPayments.map(p => ({
      // ID обязателен: без него бэкенд считает строку новой,
      // а прежний платёж — удалённым вместе с отметкой об оплате
      id: p.id,
      // Берём id из ответа API. Поиск по названию давал 0, если справочник
      // переименовали или удалили, и сохранение графика падало
      payment_type_id: p.payment_type_ref
        ?? paymentTypes?.find(pt => pt.name === p.payment_type)?.id
        ?? 0,
      beneficiary_account_id: p.beneficiary_account_ref
        ?? accounts?.find(ac => ac.name === p.beneficiary_account)?.id
        ?? 0,
      amount: Number(p.amount),
      due_date: p.due_date,
      currency: p.currency,
      method: p.method as 'CASH' | 'CASHLESS',
    }));
    reset({ payments: transformedPayments });
    setIsEditing(true);
  };

  const watchedPayments = watch('payments');

  // Предпросмотр в валюте сделки: каждая строка округляется до копеек, как
  // на бэкенде. Расхождение с договором в пределах копейки валюты ввода на
  // каждую пересчитанную строку бэкенд отнесёт на последнюю такую строку
  //
  // Считается заново при каждой отрисовке и по свежим значениям формы: массив
  // из watch() при правке строки сохраняет ту же ссылку, и useMemo по нему
  // отдавал устаревший остаток — «Добавить платеж» подставлял ноль
  const computePreview = (rows: PaymentSchedulePayloadItem[]) => {
    let total = 0;
    let tolerance = 0;
    let converted = 0;
    const missing = new Set<string>();
    for (const row of rows) {
      const amount = Number(row.amount) || 0;
      const currency = row.currency || dealCurrency;
      if (currency === dealCurrency) {
        total += amount;
        continue;
      }
      const rate = crossRate(rates, currency, dealCurrency);
      if (rate === null) {
        missing.add(currency);
        continue;
      }
      total += roundMoney(amount * rate);
      tolerance += Math.max(0.01, 0.01 * rate);
      converted += 1;
    }
    total = roundMoney(total);
    const remaining = roundMoney(contractPrice - total);
    // Копеечный допуск на погрешность float у строк в валюте сделки
    const balanced = missing.size === 0 && Math.abs(remaining) <= (converted ? tolerance : 0.001);
    return { total, remaining, balanced, missing: [...missing], converted };
  };
  const preview = computePreview(watchedPayments);

  const handleAddPayment = () => {
    const left = computePreview(getValues('payments')).remaining;
    append({
      amount: left > 0 ? left : 0,
      due_date: '',
      payment_type_id: paymentTypes?.[0]?.id || 0,
      beneficiary_account_id: accounts?.[0]?.id || 0,
      currency: dealCurrency,
      method: 'CASHLESS'
    });
  };

  /**
   * Смена валюты строки пересчитывает её сумму: 252 000 000 UZS становятся
   * 21 000 USD, а не 252 000 000 USD. Без курса сумма остаётся как есть
   */
  const handleCurrencyChange = (index: number, nextCurrency: string) => {
    const row = getValues(`payments.${index}`);
    const amount = Number(row.amount) || 0;
    const converted = convertAmount(amount, row.currency || dealCurrency, nextCurrency, rates);
    setValue(`payments.${index}.currency`, nextCurrency, { shouldDirty: true });
    if (converted !== null) {
      setValue(`payments.${index}.amount`, converted, { shouldDirty: true });
    }
  };

  const createScheduleMutation = useMutation({
    mutationFn: (data: PaymentSchedulePayloadItem[]) => createPaymentSchedule({ dealId, payments: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', String(dealId)] });
      alert(t('finances.schedule_saved'));
      setIsEditing(false);
    },
    onError: (error: unknown) => alert(extractApiError(error, t('finances.error_prefix')))
  });

  const updatePaymentMutation = useMutation({
    mutationFn: updatePayment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deal', String(dealId)] }),
    // Без этого отказ сервера (например, оплата по отменённой сделке)
    // проходил незаметно: кнопка срабатывала, а статус не менялся
    onError: (error: unknown) => alert(extractApiError(error, t('finances.error_prefix'))),
  });

  const returnPaymentMutation = useMutation({
    mutationFn: markPaymentAsReturned,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', String(dealId)] });
    },
    onError: (error: unknown) => alert(extractApiError(error, t('finances.error_prefix'))),
  });


  // Отметка оплаты — с подтверждением: одним случайным щелчком платёж
  // становился «Оплачен» с сегодняшней датой
  const paymentLabel = (payment: Payment) => ({
    amount: money(payment.amount, payment.currency),
    date: new Date(payment.due_date).toLocaleDateString(),
  });

  const handleMarkAsPaid = (payment: Payment) => {
    if (!window.confirm(t('finances.confirm_mark_paid', paymentLabel(payment)))) return;
    // Локальная дата, а не UTC: toISOString() до 05:00 по Ташкенту
    // проставлял вчерашний день
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    updatePaymentMutation.mutate({ id: payment.id, payload: { payment_date: today } });
  };

  const handleCancelPayment = (payment: Payment) => {
    if (!window.confirm(t('finances.confirm_undo_payment', paymentLabel(payment)))) return;
    updatePaymentMutation.mutate({ id: payment.id, payload: { payment_date: null } });
  };

  /** «Введено: 7 000 USD по курсу 12 000» — для строк, пересчитанных из другой валюты */
  const enteredNote = (payment?: Payment) => (
    payment?.entered_currency
      ? t('finances.entered_as', {
          amount: money(payment.entered_amount, payment.entered_currency),
          rate: formatRate(payment.entered_rate, i18n.language),
        })
      : null
  );

  if (existingPayments.length > 0 && !isEditing) {
    return (
      <Stack spacing={2}>
        <Box>
          <Button startIcon={<EditIcon />} onClick={handleEditClick} disabled={isReadOnly}>{t('finances.edit_schedule')}</Button>
        </Box>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('finances.amount')}</TableCell>
                <TableCell>{t('finances.due_date')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell>{t('finances.payment_type')}</TableCell>
                <TableCell align="right">{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {existingPayments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    {money(payment.amount, payment.currency)}
                    {payment.entered_currency && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {enteredNote(payment)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{new Date(payment.due_date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Chip label={payment.status_display} color={getStatusChipColor(payment.status)} size="small" />
                  </TableCell>
                  <TableCell>{payment.payment_type}</TableCell>
                  <TableCell align="right">
                    {!isDealTerminated && payment.status !== 'PAID' && (
                      <Button startIcon={<CheckCircleOutlineIcon />} size="small" onClick={() => handleMarkAsPaid(payment)} disabled={updatePaymentMutation.isPending}>{t('pages.payments.mark_as_paid')}</Button>
                    )}
                    {!isDealTerminated && payment.status === 'PAID' && (
                      <Button startIcon={<CloseIcon />} size="small" color="secondary" onClick={() => handleCancelPayment(payment)} disabled={updatePaymentMutation.isPending}>{t('pages.payments.cancel_payment')}</Button>
                    )}
                    {isDealTerminated && payment.status === 'TO_BE_RETURNED' && (
                      <Button startIcon={<UndoIcon />} size="small" color="warning" onClick={() => returnPaymentMutation.mutate(payment.id)} disabled={returnPaymentMutation.isPending}>{t('finances.return')}</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    );
  }

  const roundingGap = preview.balanced && preview.remaining !== 0;

  return (
    <form onSubmit={handleSubmit((data) => createScheduleMutation.mutate(data.payments))}>
      <Stack spacing={3}>
        <Alert severity={preview.balanced ? "success" : "warning"}>
          {t('finances.contract_amount')}: {money(contractPrice, dealCurrency)} | {t('finances.distributed')}: {money(preview.total, dealCurrency)} | {t('finances.remaining')}: {money(preview.remaining, dealCurrency)}
          {preview.converted > 0 && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {roundingGap
                ? t('finances.rounding_gap', { amount: money(preview.remaining, dealCurrency) })
                : t('finances.converted_note', { currency: dealCurrency })}
            </Typography>
          )}
        </Alert>

        {preview.missing.length > 0 && !ratesLoading && (
          <Alert severity="error">{t('finances.no_rate_for', { currencies: preview.missing.join(', ') })}</Alert>
        )}

        {fields.map((field, index) => {
          const locked = isProtectedRow(field.id);
          const row = watchedPayments[index];
          const rowCurrency = row?.currency || dealCurrency;
          const rate = rowCurrency !== dealCurrency ? crossRate(rates, rowCurrency, dealCurrency) : null;
          const existing = field.id ? paymentById.get(field.id) : undefined;
          // Подсказка под суммой: во что строка превратится при сохранении,
          // а у ранее пересчитанной строки — как её вводили
          let helper: string | null = null;
          if (rowCurrency !== dealCurrency) {
            helper = rate === null
              ? t('finances.no_rate_short')
              : t('finances.will_be_converted', {
                  amount: money(roundMoney((Number(row?.amount) || 0) * rate), dealCurrency),
                  rate: formatRate(rate, i18n.language),
                });
          } else if (existing?.entered_currency && Number(row?.amount) === Number(existing.amount)) {
            helper = enteredNote(existing);
          }
          return (
          <Paper key={field.fieldKey} variant="outlined" sx={{ p: 2 }}>
            <Grid container spacing={2} alignItems="flex-start">
              <Grid size={{ xs: 8, md: 2.5 }}>
                <Controller name={`payments.${index}.amount`} control={control} render={({ field }) => (
                  <TextField {...field} label={t('finances.amount')} type="number" fullWidth required disabled={locked}
                    helperText={helper ?? undefined} />
                )} />
              </Grid>
              <Grid size={{ xs: 4, md: 1.5 }}>
                <FormControl fullWidth disabled={locked || currencyOptions.length < 2}>
                  <InputLabel>{t('finances.currency_label')}</InputLabel>
                  <Select
                    label={t('finances.currency_label')}
                    value={rowCurrency}
                    onChange={(e) => handleCurrencyChange(index, String(e.target.value))}
                  >
                    {/* Валюта уже проведённой строки может быть вне списка — показываем и её */}
                    {[...new Set([...currencyOptions, rowCurrency])].map(code => (
                      <MenuItem key={code} value={code}>{code}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, md: 2.5 }}>
                <Controller name={`payments.${index}.due_date`} control={control} render={({ field }) => (
                  <LocalizedDateField
                    label={t('finances.due_date')}
                    value={field.value || null}
                    onChange={(date) => field.onChange(date || '')}
                    fullWidth
                    disabled={locked}
                  />
                )} />
              </Grid>
              <Grid size={{ xs: 12, md: 2.5 }}>
                <Controller name={`payments.${index}.payment_type_id`} control={control} render={({ field }) => (
                  <FormControl fullWidth disabled={locked}>
                    <InputLabel>{t('finances.payment_type')}</InputLabel>
                    <Select {...field} label={t('finances.payment_type')} required>
                      {paymentTypes?.map(pt => <MenuItem key={pt.id} value={pt.id}>{pt.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                )} />
              </Grid>
              <Grid size={{ xs: 12, md: 2 }}>
                <Controller name={`payments.${index}.beneficiary_account_id`} control={control} render={({ field }) => (
                  <FormControl fullWidth disabled={locked}>
                    <InputLabel>{t('finances.account')}</InputLabel>
                    <Select {...field} label={t('finances.account')} required>
                      {accounts?.map(ac => <MenuItem key={ac.id} value={ac.id}>{ac.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                )} />
              </Grid>
              <Grid size={{ xs: 12, md: 1 }}>
                {locked ? (
                  // Проведённый платёж из графика не убирается: сначала отменяется оплата
                  <Chip
                    size="small"
                    label={existing?.status_display}
                    color={getStatusChipColor(paymentStatusById.get(field.id!)!)}
                  />
                ) : (
                  <IconButton onClick={() => remove(index)}>
                    <RemoveCircleOutlineIcon color="error" />
                  </IconButton>
                )}
              </Grid>
            </Grid>
          </Paper>
          );
        })}

        <Box>
          <Button startIcon={<AddCircleOutlineIcon />} onClick={handleAddPayment}>
            {t('finances.add_payment')}
          </Button>
        </Box>
        <Box>
          <Button type="submit" variant="contained" disabled={createScheduleMutation.isPending || !preview.balanced}>
            {createScheduleMutation.isPending ? t('common.saving') : t('finances.save_schedule')}
          </Button>
          {isEditing && <Button variant="outlined" onClick={() => setIsEditing(false)}>{t('common.cancel')}</Button>}
        </Box>
      </Stack>
    </form>
  );
}
