import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Grid, Link as MuiLink, Paper, Stack, TextField, Typography,
} from '@mui/material';
import {
  cancelBooking, extendBooking, getBookingById, updateBooking, uploadBookingScan,
} from '../api/bookings';
import type { Booking } from '../api/bookings';
import { createDeal } from '../api/deals';
import { formatMoney } from '../utils/currency';
import { formatDate, formatDateTime } from '../utils/dateLocale';
import { extractApiError } from '../utils/apiError';
import { useAuthStore } from '../store/authStore';
import { hasPermission } from '../utils/permissions';
import BookingDocumentGeneration from '../components/deals/BookingDocumentGeneration';

/**
 * Карточка брони.
 *
 * Здесь всё, чего у брони не было, пока она была статусом сделки: свой срок,
 * своя цена, свой договор, свой взнос и место в очереди на объект. Сделка
 * оформляется отсюда же — цена берётся из брони, а не из прайса, потому что
 * прайс мог подняться, пока бронь действовала.
 */
export default function BookingDetailPage() {
  const { bookingId } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const canAddDeal = hasPermission(user, 'ADD', 'DEAL');

  const [extendOpen, setExtendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const [contract, setContract] = useState<{ number: string; date: string } | null>(null);

  const { data: booking, isLoading, isError } = useQuery<Booking>({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(Number(bookingId)),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    queryClient.invalidateQueries({ queryKey: ['bookingSummary'] });
  };

  const onError = (error: unknown) => alert(extractApiError(error, t('errors.error_occurred')));

  const extendMutation = useMutation({
    mutationFn: extendBooking,
    onSuccess: () => { setExtendOpen(false); refresh(); },
    onError,
  });
  const cancelMutation = useMutation({
    mutationFn: cancelBooking,
    onSuccess: () => { setCancelOpen(false); refresh(); },
    onError,
  });
  const updateMutation = useMutation({
    mutationFn: updateBooking,
    onSuccess: () => { setContract(null); refresh(); },
    onError,
  });
  const scanMutation = useMutation({ mutationFn: uploadBookingScan, onSuccess: refresh, onError });
  const dealMutation = useMutation({
    mutationFn: createDeal,
    onSuccess: (deal) => { refresh(); navigate(`/deals/${deal.id}`); },
    onError,
  });

  if (isLoading) return <CircularProgress />;
  if (isError || !booking) return <Alert severity="error">{t('errors.load_error')}</Alert>;

  const live = ['ACTIVE', 'PENDING_QUEUE'].includes(booking.status);
  const canEdit = booking.can_edit !== false;
  const start = booking.start_date || booking.projected_start_date;
  const end = booking.end_date || booking.projected_end_date;
  const expired = Boolean(booking.end_date && new Date(booking.end_date) < new Date());
  const missingPassport = booking.client_missing_passport_fields || [];

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" sx={{ mb: 2 }}>
        <Typography variant="h4">{t('pages.bookings.card_title', { id: booking.id })}</Typography>
        <Chip label={t(`statuses.booking.${booking.status}`, booking.status)}
              color={booking.status === 'ACTIVE' ? 'primary' : booking.status === 'CONVERTED' ? 'success' : 'default'} />
        {booking.queue_position ? (
          <Chip variant="outlined" label={t('pages.bookings.queue_position', { position: booking.queue_position })} />
        ) : null}
      </Stack>

      {/* Срок истёк, а ночной прогон ещё не прошёл: бронь уже не продлить */}
      {booking.status === 'ACTIVE' && expired && (
        <Alert severity="warning" sx={{ mb: 2 }}>{t('pages.bookings.expired_notice')}</Alert>
      )}
      {booking.status === 'CONVERTED' && booking.deal_id && (
        <Alert severity="success" sx={{ mb: 2 }}
               action={<Button component={RouterLink} to={`/deals/${booking.deal_id}`} color="inherit" size="small">
                 {t('pages.properties.go_to_deal')}
               </Button>}>
          {t('pages.bookings.converted_notice', { id: booking.deal_id })}
        </Alert>
      )}
      {booking.cancellation_reason && !live && booking.status !== 'CONVERTED' && (
        <Alert severity="info" sx={{ mb: 2 }}>{booking.cancellation_reason}</Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>{t('common.details')}</Typography>
            <Stack spacing={1}>
              <Typography>
                <b>{t('pages.deals.client')}:</b>{' '}
                <MuiLink component={RouterLink} to={`/clients/${booking.client.id}`}>
                  {booking.client.full_name}
                </MuiLink>
              </Typography>
              <Typography><b>{t('table.property')}:</b> {booking.property.unit_number}
                {' · '}{booking.property.area} {t('pages.properties.sqm')}
                {' · '}{t('pages.properties.floor')} {booking.property.floor}
              </Typography>
              <Divider />
              <Typography>
                <b>{t('pages.bookings.duration')}:</b> {t('pages.bookings.days', { count: booking.duration_days })}
              </Typography>
              <Typography>
                <b>{t('pages.bookings.dates')}:</b>{' '}
                {start && end
                  ? `${formatDateTime(start, i18n.language)} — ${formatDateTime(end, i18n.language)}`
                  : t('pages.bookings.waiting_for_deal')}
                {booking.dates_projected && start ? ` (${t('pages.bookings.projected')})` : ''}
              </Typography>
              {booking.dates_projected && (
                <Typography variant="caption" color="text.secondary">
                  {t('pages.bookings.projected_hint')}
                </Typography>
              )}
              <Typography>
                <b>{t('pages.bookings.booked_price')}:</b>{' '}
                {booking.price
                  ? formatMoney(booking.price, booking.currency, i18n.language)
                  : t('pages.bookings.price_on_activation')}
              </Typography>
              <Typography><b>{t('table.manager')}:</b> {booking.created_by || '—'}</Typography>
              <Typography><b>{t('table.created_at')}:</b> {formatDateTime(booking.created_at, i18n.language)}</Typography>
            </Stack>

            {canEdit && live && (
              <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                <Button variant="outlined" onClick={() => { setDays(String(booking.duration_days)); setExtendOpen(true); }}>
                  {t('pages.bookings.extend')}
                </Button>
                <Button variant="outlined" color="error" onClick={() => setCancelOpen(true)}>
                  {t('pages.bookings.cancel')}
                </Button>
                {booking.status === 'ACTIVE' && !expired && canAddDeal && (
                  <Button
                    variant="contained"
                    disabled={dealMutation.isPending || missingPassport.length > 0}
                    onClick={() => dealMutation.mutate({
                      client: booking.client.id,
                      property: booking.property.id,
                      booking: booking.id,
                    })}
                  >
                    {t('pages.bookings.make_deal')}
                  </Button>
                )}
              </Stack>
            )}
            {/* Паспорт нужен не для брони, а для договора: предупреждаем заранее */}
            {booking.status === 'ACTIVE' && missingPassport.length > 0 && (
              <Alert severity="warning" sx={{ mt: 2 }}
                     action={<Button component={RouterLink} to={`/clients/${booking.client.id}`} color="inherit" size="small">
                       {t('pages.bookings.fill_passport')}
                     </Button>}>
                {t('pages.bookings.passport_needed', {
                  fields: missingPassport.map((field) => t(`pages.clients.${field}`, field)).join(', '),
                })}
              </Alert>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>{t('pages.bookings.fee')}</Typography>
            {booking.fee_status ? (
              <Stack spacing={1}>
                <Typography>
                  <b>{t('table.amount')}:</b>{' '}
                  {formatMoney(booking.fee_status.amount, booking.fee_status.currency, i18n.language)}
                </Typography>
                <Typography><b>{t('table.status')}:</b> {booking.fee_status.status_display}</Typography>
                <Typography><b>{t('table.due_date')}:</b> {formatDate(booking.fee_status.due_date, i18n.language)}</Typography>
                <Button component={RouterLink} to={`/finances/${booking.fee_status.id}`} size="small">
                  {t('pages.bookings.open_fee')}
                </Button>
              </Stack>
            ) : (
              <Typography color="text.secondary">{t('pages.bookings.no_fee')}</Typography>
            )}
          </Paper>

          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="h6" gutterBottom>{t('pages.bookings.contract')}</Typography>
            <Stack spacing={1}>
              <Typography><b>{t('pages.bookings.contract_number')}:</b> {booking.contract_number || '—'}</Typography>
              <Typography><b>{t('pages.bookings.contract_date')}:</b> {formatDate(booking.contract_date, i18n.language)}</Typography>
              {booking.signed_scan && (
                <MuiLink href={booking.signed_scan} target="_blank" rel="noopener">
                  {t('pages.bookings.open_scan')}
                </MuiLink>
              )}
            </Stack>
            {canEdit && live && (
              <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                <Button size="small" variant="outlined" onClick={() => setContract({
                  number: booking.contract_number || '',
                  date: booking.contract_date || '',
                })}>
                  {t('pages.bookings.edit_contract')}
                </Button>
                <Button size="small" component="label" variant="outlined" disabled={scanMutation.isPending}>
                  {booking.signed_scan ? t('pages.bookings.replace_scan') : t('pages.bookings.upload_scan')}
                  <input type="file" hidden onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) scanMutation.mutate({ id: booking.id, file });
                  }} />
                </Button>
              </Stack>
            )}
            <Box sx={{ mt: 2 }}>
              <BookingDocumentGeneration bookingId={booking.id} disabled={!live} />
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>{t('pages.bookings.queue_title')}</Typography>
            <Stack spacing={1}>
              {booking.queue.map((row, index) => (
                <Stack key={row.id} direction="row" spacing={2} alignItems="center" flexWrap="wrap"
                       sx={{ fontWeight: row.is_current ? 600 : 400 }}>
                  <Typography variant="body2" sx={{ minWidth: 24 }}>{index === 0 ? '▸' : `${index}.`}</Typography>
                  <Typography variant="body2" sx={{ minWidth: 160 }}>
                    {row.is_current
                      ? `${row.client} (${t('pages.bookings.this_booking')})`
                      : (
                        <MuiLink component={RouterLink} to={`/bookings/${row.id}`} underline="hover">
                          {row.client || `№${row.id}`}
                        </MuiLink>
                      )}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('pages.bookings.days', { count: row.duration_days })}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {row.start_date && row.end_date
                      ? `${formatDate(row.start_date, i18n.language)} — ${formatDate(row.end_date, i18n.language)}`
                      : t('pages.bookings.waiting_for_deal')}
                    {row.projected ? ` (${t('pages.bookings.projected')})` : ''}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              {t('pages.deals.history')} {booking.logs_total ? `(${booking.logs_total})` : ''}
            </Typography>
            <Stack spacing={1} divider={<Divider flexItem />}>
              {booking.logs.map((log) => (
                <Box key={log.id}>
                  <Typography variant="body2">{log.action}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDateTime(log.created_at, i18n.language)} — {log.user || t('common.system')}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={extendOpen} onClose={() => setExtendOpen(false)}>
        <DialogTitle>{t('pages.bookings.extend')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('pages.bookings.extend_hint')}
          </Typography>
          <TextField
            autoFocus fullWidth type="number" label={t('pages.bookings.duration_days')}
            value={days} onChange={(event) => setDays(event.target.value)}
            inputProps={{ min: 1, step: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExtendOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            disabled={extendMutation.isPending || !days}
            onClick={() => extendMutation.mutate({ id: booking.id, duration_days: Number(days) })}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('pages.bookings.cancel')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('pages.bookings.cancel_hint')}
          </Typography>
          <TextField
            autoFocus fullWidth multiline rows={3} required
            label={t('pages.deals.cancellation_reason')}
            value={reason} onChange={(event) => setReason(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained" color="error"
            disabled={cancelMutation.isPending || !reason.trim()}
            onClick={() => cancelMutation.mutate({ id: booking.id, cancellation_reason: reason })}
          >
            {t('pages.bookings.cancel_confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={contract !== null} onClose={() => setContract(null)} fullWidth maxWidth="sm">
        <DialogTitle>{t('pages.bookings.edit_contract')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t('pages.bookings.contract_number')}
              value={contract?.number || ''}
              onChange={(event) => setContract((value) => ({ ...(value || { number: '', date: '' }), number: event.target.value }))}
            />
            <TextField
              type="date" label={t('pages.bookings.contract_date')}
              InputLabelProps={{ shrink: true }}
              value={contract?.date || ''}
              onChange={(event) => setContract((value) => ({ ...(value || { number: '', date: '' }), date: event.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContract(null)}>{t('common.cancel')}</Button>
          <Button
            variant="contained" disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate({
              id: booking.id,
              payload: {
                contract_number: contract?.number || null,
                contract_date: contract?.date || null,
              },
            })}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
