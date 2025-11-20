import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm, Controller } from 'react-hook-form';
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


export default function PaymentSchedule({ dealId, contractPrice, existingPayments, isDealTerminated, isReadOnly }: PaymentScheduleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const queryClient = useQueryClient();

  const { data: paymentTypes } = useQuery({ queryKey: ['paymentTypes'], queryFn: getPaymentTypes });
  const { data: accounts } = useQuery({ queryKey: ['beneficiaryAccounts'], queryFn: getBeneficiaryAccounts });

  const { control, handleSubmit, watch, reset, setValue } = useForm<FormValues>({
    defaultValues: { payments: [] }
  });

  const { fields, append, remove } = useFieldArray({ control, name: "payments" });

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
        payment_type_id: paymentTypes?.find(pt => pt.name === p.payment_type)?.id || 0,
        beneficiary_account_id: accounts?.find(ac => ac.name === p.beneficiary_account)?.id || 0,
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
  const remainingAmount = contractPrice - totalAmount;

  const createScheduleMutation = useMutation({
    mutationFn: (data: PaymentSchedulePayloadItem[]) => createPaymentSchedule({ dealId, payments: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', String(dealId)] });
      alert('График платежей успешно сохранен!');
      setIsEditing(false);
    },
    onError: (error: any) => alert(`Ошибка: ${error.response?.data?.error || error.message}`)
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
    const today = new Date().toISOString().split('T')[0];
    updatePaymentMutation.mutate({ id: paymentId, payload: { payment_date: today } });
  };

  const handleCancelPayment = (paymentId: number) => {
    updatePaymentMutation.mutate({ id: paymentId, payload: { payment_date: null } });
  };

  if (existingPayments.length > 0 && !isEditing) {
    return (
        <Stack spacing={2}>
            <Box>
                <Button startIcon={<EditIcon />} onClick={handleEditClick} disabled={isReadOnly}>Редактировать график</Button>
            </Box>
            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Сумма</TableCell>
                            <TableCell>К оплате</TableCell>
                            <TableCell>Статус</TableCell>
                            <TableCell>Тип</TableCell>
                            <TableCell align="right">Действия</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {existingPayments.map((payment) => (
                        <TableRow key={payment.id}>
                            <TableCell>{payment.amount} {payment.currency}</TableCell>
                            <TableCell>{new Date(payment.due_date).toLocaleDateString()}</TableCell>
                            <TableCell>
                                <Chip label={payment.status_display} color={getStatusChipColor(payment.status)} size="small"/>
                            </TableCell>
                            <TableCell>{payment.payment_type}</TableCell>
                            <TableCell align="right">
                                {!isDealTerminated && payment.status !== 'PAID' && (
                                    <Button startIcon={<CheckCircleOutlineIcon />} size="small" onClick={() => handleMarkAsPaid(payment.id)} disabled={updatePaymentMutation.isPending}>Оплачен</Button>
                                )}
                                {!isDealTerminated && payment.status === 'PAID' && (
                                    <Button startIcon={<CloseIcon />} size="small" color="secondary" onClick={() => handleCancelPayment(payment.id)} disabled={updatePaymentMutation.isPending}>Отменить</Button>
                                )}
                                {isDealTerminated && payment.status === 'TO_BE_RETURNED' && (
                                    <Button startIcon={<UndoIcon />} size="small" color="warning" onClick={() => returnPaymentMutation.mutate(payment.id)} disabled={returnPaymentMutation.isPending}>Вернуть</Button>
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
          Сумма по договору: {contractPrice.toLocaleString()} | Распределено: {totalAmount.toLocaleString()} | Остаток: {remainingAmount.toLocaleString()}
        </Alert>

        {fields.map((field, index) => (
          <Paper key={field.id} variant="outlined" sx={{ p: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={2.5}>
                <Controller name={`payments.${index}.amount`} control={control} render={({ field }) => <TextField {...field} label="Сумма" type="number" fullWidth required/>}/>
              </Grid>
              <Grid item xs={12} md={2.5}>
                <Controller name={`payments.${index}.due_date`} control={control} render={({ field }) => <TextField {...field} label="Дата к оплате" type="date" fullWidth required InputLabelProps={{ shrink: true }}/>}/>
              </Grid>
              <Grid item xs={12} md={3}>
                <Controller name={`payments.${index}.payment_type_id`} control={control} render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>Тип платежа</InputLabel>
                    <Select {...field} label="Тип платежа" required>
                      {paymentTypes?.map(pt => <MenuItem key={pt.id} value={pt.id}>{pt.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}/>
              </Grid>
              <Grid item xs={12} md={3}>
                <Controller name={`payments.${index}.beneficiary_account_id`} control={control} render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>Счет</InputLabel>
                    <Select {...field} label="Счет" required>
                      {accounts?.map(ac => <MenuItem key={ac.id} value={ac.id}>{ac.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}/>
              </Grid>
              <Grid item xs={12} md={1}>
                <IconButton onClick={() => remove(index)}>
                  <RemoveCircleOutlineIcon color="error"/>
                </IconButton>
              </Grid>
            </Grid>
          </Paper>
        ))}

        <Box>
            <Button startIcon={<AddCircleOutlineIcon />} onClick={() => append({ amount: remainingAmount > 0 ? remainingAmount : 0, due_date: '', payment_type_id: paymentTypes?.[0]?.id || 0, beneficiary_account_id: accounts?.[0]?.id || 0, currency: 'UZS', method: 'CASHLESS' })}>
                Добавить платеж
            </Button>
        </Box>
        <Box>
            <Button type="submit" variant="contained" disabled={createScheduleMutation.isPending || remainingAmount !== 0}>
                {createScheduleMutation.isPending ? 'Сохранение...' : 'Сохранить график'}
            </Button>
            {isEditing && <Button variant="outlined" onClick={() => setIsEditing(false)}>Отмена</Button>}
        </Box>
      </Stack>
    </form>
  );
}