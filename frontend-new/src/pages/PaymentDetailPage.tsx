// real_estate_crm/frontend-new/src/pages/PaymentDetailPage.tsx

import { useParams, Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation();

  const getDateLocale = () => {
    const localeMap: Record<string, string> = { ru: 'ru-RU', en: 'en-US', uz: 'uz-UZ' };
    return localeMap[i18n.language] || 'ru-RU';
  };

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
  if (isError || !payment) return <Alert severity="error">{t('errors.load_payment_error')}</Alert>;

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
                    {t('pages.payments.payment_number', { id: payment.id })} <Chip label={payment.status_display} color={getStatusChipColor(payment.status)} size="small" />
                </Typography>
                <Typography color="text.secondary">
                    {t('pages.deals.client')}: <MuiLink component={RouterLink} to={`/clients/${payment.client.id}`}>{payment.client.full_name}</MuiLink>
                </Typography>
            </Box>
        </Stack>
      </Paper>

       <Card variant="outlined">
        <CardHeader title={t('pages.finances.payment_details')} />
        <CardContent>
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <Typography><b>{t('pages.finances.amount')}:</b> {Number(payment.amount).toLocaleString()} {payment.currency}</Typography>
                    <Typography><b>{t('pages.finances.payment_type')}:</b> {payment.payment_type}</Typography>
                    <Typography><b>{t('pages.payments.method')}:</b> {payment.method}</Typography>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <Typography><b>{t('pages.finances.due_date')}:</b> {new Date(payment.due_date).toLocaleDateString(getDateLocale())}</Typography>
                    <Typography><b>{t('pages.payments.actually_paid')}:</b> {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString(getDateLocale()) : t('common.no')}</Typography>
                    {payment.deal && <Typography><b>{t('pages.deals.title')}:</b> <MuiLink component={RouterLink} to={`/deals/${payment.deal.id}`}>№{payment.deal.id}</MuiLink></Typography>}
                </Grid>
            </Grid>
        </CardContent>
       </Card>

        <Card variant="outlined">
            <CardHeader title={t('common.actions')}/>
            <CardContent>
                 <Stack direction="row" spacing={2}>
                    {!isDealTerminated && (payment.status === 'PENDING' || payment.status === 'OVERDUE') ? (
                        <Button startIcon={<CheckCircleOutlineIcon />} onClick={handleMarkAsPaid} disabled={updatePaymentMutation.isPending}>{t('pages.payments.mark_as_paid')}</Button>
                    ) : null}
                     {!isDealTerminated && payment.status === 'PAID' ? (
                        <Button startIcon={<CloseIcon />} color="secondary" onClick={handleCancelPayment} disabled={updatePaymentMutation.isPending}>{t('pages.payments.cancel_payment')}</Button>
                    ) : null}
                    {payment.status === 'TO_BE_RETURNED' ? (
                        <Button startIcon={<UndoIcon />} color="warning" onClick={() => returnPaymentMutation.mutate(payment.id)} disabled={returnPaymentMutation.isPending}>{t('pages.payments.mark_as_returned')}</Button>
                    ) : null}
                 </Stack>
            </CardContent>
        </Card>
    </Stack>
  );
}