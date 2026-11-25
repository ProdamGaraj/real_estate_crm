// real_estate_crm/frontend-new/src/components/settings/BookingSettingsManager.tsx

/**
 * Вкладка «Брони»: взнос за бронь, счёт получателя и минимальный срок.
 *
 * Взнос — фиксированная сумма в валюте сделок компании (прайс проекта может
 * быть в другой валюте, а платят в сумах). По нему создаётся единственный
 * платёж брони, и это реальный долг: не оплачен — подлежит оплате, бронь
 * снята или истекла — долг снимается.
 *
 * Ноль означает бесплатную бронь: платёж не создаётся. Но если взнос задан,
 * счёт получателя обязателен — без счёта платёж в базе не завести.
 */

import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, FormControl, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { getBookingSettings, updateBookingSettings } from '../../api/bookings';
import { useAuthStore } from '../../store/authStore';
import { hasPermission } from '../../utils/permissions';
import { extractApiError } from '../../utils/apiError';

export default function BookingSettingsManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const canEdit = hasPermission(user, 'EDIT', 'SETTINGS');

  const { data, isLoading } = useQuery({
    queryKey: ['bookingSettings'],
    queryFn: getBookingSettings,
  });

  const [amount, setAmount] = useState('');
  const [account, setAccount] = useState<number | ''>('');
  const [minDays, setMinDays] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setAmount(data.booking_fee_amount);
    setAccount(data.booking_fee_account ?? '');
    setMinDays(String(data.min_booking_days));
  }, [data]);

  const mutation = useMutation({
    mutationFn: updateBookingSettings,
    onSuccess: () => {
      setError(null);
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['bookingSettings'] });
    },
    onError: (problem: unknown) => {
      setSaved(false);
      setError(extractApiError(problem, t('errors.update_error')));
    },
  });

  if (isLoading) return <Typography>{t('common.loading')}</Typography>;
  if (!data?.company) return <Alert severity="info">{t('pages.settings.booking.no_company')}</Alert>;

  return (
    <Paper sx={{ p: 2, maxWidth: 640 }}>
      <Typography variant="h6" gutterBottom>{t('pages.settings.booking.title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('pages.settings.booking.hint')}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {saved && !error && <Alert severity="success" sx={{ mb: 2 }}>{t('common.saved')}</Alert>}

      <Stack spacing={2}>
        <TextField
          label={t('pages.settings.booking.fee_amount')}
          value={amount}
          onChange={(event) => { setAmount(event.target.value); setSaved(false); }}
          disabled={!canEdit}
          helperText={t('pages.settings.booking.fee_amount_hint', { currency: data.booking_fee_currency })}
          inputProps={{ inputMode: 'decimal' }}
        />
        <FormControl disabled={!canEdit}>
          <InputLabel>{t('pages.settings.booking.fee_account')}</InputLabel>
          <Select
            label={t('pages.settings.booking.fee_account')}
            value={account}
            onChange={(event) => { setAccount(event.target.value as number | ''); setSaved(false); }}
          >
            <MenuItem value="">{t('common.not_selected')}</MenuItem>
            {data.accounts.map((row) => (
              <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          type="number"
          label={t('pages.settings.booking.min_days')}
          value={minDays}
          onChange={(event) => { setMinDays(event.target.value); setSaved(false); }}
          disabled={!canEdit}
          helperText={t('pages.settings.booking.min_days_hint')}
          inputProps={{ min: 1, step: 1 }}
        />
        {Number(amount) > 0 && !account && (
          <Alert severity="warning">{t('pages.settings.booking.account_required')}</Alert>
        )}
        <Box>
          <Button
            variant="contained"
            disabled={!canEdit || mutation.isPending}
            onClick={() => mutation.mutate({
              booking_fee_amount: amount || '0',
              booking_fee_account: account === '' ? null : Number(account),
              min_booking_days: Number(minDays) || 1,
            })}
          >
            {t('common.save')}
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
