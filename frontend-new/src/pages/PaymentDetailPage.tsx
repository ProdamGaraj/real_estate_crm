// real_estate_crm/frontend-new/src/pages/PaymentDetailPage.tsx

import { useParams, Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPaymentById, updatePayment, markPaymentAsReturned } from '../api/finances';
import {
    Typography, CircularProgress, Alert, Paper, Grid, Box, Button,
    Link as MuiLink, Stack, Chip, Card, CardHeader, CardContent, Avatar
} from '@mui/material';
import PaymentsIcon from '@mui/icons-material/Payments';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import UndoIcon from '@mui/icons-material/Undo';

const getStatusChipColor = (status: string) => {
    switch (status) {
        case 'PAID': return 'success';
        case 'OVERDUE': return 'error';
        case 'TO_BE_RETURNED': return 'warning';
        case 'RETURNED': return 'info';
        default: return 'default';
    }
}

export default function PaymentDetailPage() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const queryClient = useQueryClient();

  const { data: payment, isLoading, isError } = useQuery({
    queryKey: ['payment', paymentId],
    queryFn: () => getPaymentById(Number(paymentId)),
    enabled: !!paymentId,
  });

  const updatePaymentMutation = useMutation({
    mutationFn: updatePayment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment', paymentId] })
  });

  const returnPaymentMutation = useMutation({
    mutationFn: markPaymentAsReturned,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment', paymentId] })
  });

  const handleMarkAsPaid = () => {
    const today = new Date().toISOString().split('T')[0];
    updatePaymentMutation.mutate({ id: Number(paymentId), payload: { payment_date: today } });
  };

  const handleCancelPayment = () => {
    updatePaymentMutation.mutate({ id: Number(paymentId), payload: { payment_date: null } });
  };

  if (isLoading) return <CircularProgress />;
  if (isError || !payment) return <Alert severity="error">Не удалось загрузить данные платежа.</Alert>;

  const isDealTerminated = payment.deal?.status === 'TERMINATED';

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
            <Avatar sx={{ width: 64, height: 64 }} variant="rounded">
                <PaymentsIcon fontSize="large" />
            </Avatar>
            <Box>
                <Typography variant="h4" gutterBottom>
                    Платеж №{payment.id} <Chip label={payment.status_display} color={getStatusChipColor(payment.status)} size="small" />
                </Typography>
                <Typography color="text.secondary">
                    Клиент: <MuiLink component={RouterLink} to={`/clients/${payment.client.id}`}>{payment.client.full_name}</MuiLink>
                </Typography>
            </Box>
        </Stack>
      </Paper>

       <Card variant="outlined">
        <CardHeader title="Детали платежа" />
        <CardContent>
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <Typography><b>Сумма:</b> {Number(payment.amount).toLocaleString()} {payment.currency}</Typography>
                    <Typography><b>Тип:</b> {payment.payment_type}</Typography>
                    <Typography><b>Метод:</b> {payment.method}</Typography>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <Typography><b>К оплате:</b> {new Date(payment.due_date).toLocaleDateString()}</Typography>
                    <Typography><b>Фактически оплачен:</b> {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString() : 'Нет'}</Typography>
                    {payment.deal && <Typography><b>Сделка:</b> <MuiLink component={RouterLink} to={`/deals/${payment.deal.id}`}>№{payment.deal.id}</MuiLink></Typography>}
                </Grid>
            </Grid>
        </CardContent>
       </Card>

        <Card variant="outlined">
            <CardHeader title="Действия"/>
            <CardContent>
                 <Stack direction="row" spacing={2}>
                    {!isDealTerminated && (payment.status === 'PENDING' || payment.status === 'OVERDUE') ? (
                        <Button startIcon={<CheckCircleOutlineIcon />} onClick={handleMarkAsPaid} disabled={updatePaymentMutation.isPending}>Отметить как оплаченный</Button>
                    ) : null}
                     {!isDealTerminated && payment.status === 'PAID' ? (
                        <Button startIcon={<CloseIcon />} color="secondary" onClick={handleCancelPayment} disabled={updatePaymentMutation.isPending}>Отменить оплату</Button>
                    ) : null}
                    {payment.status === 'TO_BE_RETURNED' ? (
                        <Button startIcon={<UndoIcon />} color="warning" onClick={() => returnPaymentMutation.mutate(payment.id)} disabled={returnPaymentMutation.isPending}>Отметить как возвращенный</Button>
                    ) : null}
                 </Stack>
            </CardContent>
        </Card>
    </Stack>
  );
}