import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { getPaymentTypes, getBeneficiaryAccounts, createPaymentSchedule, updatePayment, markPaymentAsReturned } from '../../api/finances';
import type { Payment, PaymentSchedulePayloadItem } from '../../api/finances';

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

interface PaymentScheduleProps {
  dealId: number;
  contractPrice: number;
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


export default function PaymentSchedule({ dealId, contractPrice, existingPayments, isDealTerminated, isReadOnly }: PaymentScheduleProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const queryClient = useQueryClient();

  const { data: paymentTypes } = useQuery({ queryKey: ['paymentTypes'], queryFn: getPaymentTypes });
  const { data: accounts } = useQuery({ queryKey: ['beneficiaryAccounts'], queryFn: getBeneficiaryAccounts });

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
        currency: 'UZS',
        method: 'CASHLESS'
      }]);
    }
  }, [existingPayments, isEditing, contractPrice, paymentTypes, accounts, setValue]);

  const handleEditClick = () => {
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
      currency: p.currency as 'UZS' | 'USD' | 'EUR',
      method: p.method as 'CASH' | 'CASHLESS',
    }));
    reset({ payments: transformedPayments });
    setIsEditing(true);
  };

  const watchedPayments = watch('payments');
  const totalAmount = useMemo(() => watchedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0), [watchedPayments]);
  // Округляем до копеек: остаток вида -1.4e-10 навсегда блокировал кнопку
  const remainingAmount = Math.round((contractPrice - totalAmount) * 100) / 100;

  const handleAddPayment = () => {
    const currentPayments = getValues('payments');
    const currentTotal = currentPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const left = contractPrice - currentTotal;

    append({
      amount: left > 0 ? left : 0,
      due_date: '',
      payment_type_id: paymentTypes?.[0]?.id || 0,
      beneficiary_account_id: accounts?.[0]?.id || 0,
      currency: 'UZS',
      method: 'CASHLESS'
    });
  };

  const createScheduleMutation = useMutation({
    mutationFn: (data: PaymentSchedulePayloadItem[]) => createPaymentSchedule({ dealId, payments: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', String(dealId)] });
      alert(t('finances.schedule_saved'));
      setIsEditing(false);
    },
    onError: (error: any) => alert(`${t('finances.error_prefix')} ${error.response?.data?.error || error.message}`)
  });

  const updatePaymentMutation = useMutation({
    mutationFn: updatePayment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deal', String(dealId)] })
  });

  const returnPaymentMutation = useMutation({
    mutationFn: markPaymentAsReturned,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', String(dealId)] });
    }
  });


  const handleMarkAsPaid = (paymentId: number) => {
    // Локальная дата, а не UTC: toISOString() до 05:00 по Ташкенту
    // проставлял вчерашний день
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    updatePaymentMutation.mutate({ id: paymentId, payload: { payment_date: today } });
  };

  const handleCancelPayment = (paymentId: number) => {
    updatePaymentMutation.mutate({ id: paymentId, payload: { payment_date: null } });
  };

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
                  <TableCell>{payment.amount} {payment.currency}</TableCell>
                  <TableCell>{new Date(payment.due_date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Chip label={payment.status_display} color={getStatusChipColor(payment.status)} size="small" />
                  </TableCell>
                  <TableCell>{payment.payment_type}</TableCell>
                  <TableCell align="right">
                    {!isDealTerminated && payment.status !== 'PAID' && (
                      <Button startIcon={<CheckCircleOutlineIcon />} size="small" onClick={() => handleMarkAsPaid(payment.id)} disabled={updatePaymentMutation.isPending}>{t('finances.paid')}</Button>
                    )}
                    {!isDealTerminated && payment.status === 'PAID' && (
                      <Button startIcon={<CloseIcon />} size="small" color="secondary" onClick={() => handleCancelPayment(payment.id)} disabled={updatePaymentMutation.isPending}>{t('common.cancel')}</Button>
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

  return (
    <form onSubmit={handleSubmit((data) => createScheduleMutation.mutate(data.payments))}>
      <Stack spacing={3}>
        <Alert severity={remainingAmount === 0 ? "success" : "warning"}>
          {t('finances.contract_amount')}: {contractPrice.toLocaleString()} | {t('finances.distributed')}: {totalAmount.toLocaleString()} | {t('finances.remaining')}: {remainingAmount.toLocaleString()}
        </Alert>

        {fields.map((field, index) => {
          const locked = isProtectedRow(field.id);
          return (
          <Paper key={field.fieldKey} variant="outlined" sx={{ p: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={2.5}>
                <Controller name={`payments.${index}.amount`} control={control} render={({ field }) => <TextField {...field} label={t('finances.amount')} type="number" fullWidth required disabled={locked} />} />
              </Grid>
              <Grid item xs={12} md={2.5}>
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
              <Grid item xs={12} md={3}>
                <Controller name={`payments.${index}.payment_type_id`} control={control} render={({ field }) => (
                  <FormControl fullWidth disabled={locked}>
                    <InputLabel>{t('finances.payment_type')}</InputLabel>
                    <Select {...field} label={t('finances.payment_type')} required>
                      {paymentTypes?.map(pt => <MenuItem key={pt.id} value={pt.id}>{pt.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                )} />
              </Grid>
              <Grid item xs={12} md={3}>
                <Controller name={`payments.${index}.beneficiary_account_id`} control={control} render={({ field }) => (
                  <FormControl fullWidth disabled={locked}>
                    <InputLabel>{t('finances.account')}</InputLabel>
                    <Select {...field} label={t('finances.account')} required>
                      {accounts?.map(ac => <MenuItem key={ac.id} value={ac.id}>{ac.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                )} />
              </Grid>
              <Grid item xs={12} md={1}>
                {locked ? (
                  // Проведённый платёж из графика не убирается: сначала отменяется оплата
                  <Chip
                    size="small"
                    label={existingPayments.find(p => p.id === field.id)?.status_display}
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
          <Button type="submit" variant="contained" disabled={createScheduleMutation.isPending || remainingAmount !== 0}>
            {createScheduleMutation.isPending ? t('common.saving') : t('finances.save_schedule')}
          </Button>
          {isEditing && <Button variant="outlined" onClick={() => setIsEditing(false)}>{t('common.cancel')}</Button>}
        </Box>
      </Stack>
    </form>
  );
}