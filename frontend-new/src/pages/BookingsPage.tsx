import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert, Box, Card, CardContent, Chip, Collapse, FormControl, Grid, IconButton, InputLabel,
  Link as MuiLink, MenuItem, Paper, Select, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { GridColDef } from '@mui/x-data-grid';
import { ResponsiveDataView } from '../components/common/ResponsiveDataView';
import type { MobileCardField } from '../components/common/MobileCardList';
import { getBookings, getBookingSummary } from '../api/bookings';
import type { BookingFilters, BookingListItem } from '../api/bookings';
import { formatMoney } from '../utils/currency';
import { formatDate } from '../utils/dateLocale';
import { useIsMobile } from '../hooks/useMobile';

/**
 * Список броней.
 *
 * Бронь живёт отдельно от сделки, поэтому и список свой: в воронке сделок
 * брони только мешали — 279 из 724 «сделок» были бронями и мёртвыми
 * бронями без договора и без денег.
 *
 * Даты броней в очереди расчётные: конец предыдущей — начало следующей.
 * В таблице они помечены, чтобы менеджер не принимал их за обещание.
 */
const KpiCard = ({ title, value, color = 'text.primary' }: { title: string; value: number; color?: string }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent sx={{ textAlign: 'center' }}>
      <Typography color="text.secondary">{title}</Typography>
      <Typography variant="h4" component="div" color={color}>{value}</Typography>
    </CardContent>
  </Card>
);

export default function BookingsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [filtersExpanded, setFiltersExpanded] = useState(!isMobile);
  const [filters, setFilters] = useState<BookingFilters>({ live: true });

  const { data: summary } = useQuery({
    queryKey: ['bookingSummary'],
    queryFn: () => getBookingSummary(),
  });
  const { data: bookings, isLoading, isError } = useQuery({
    queryKey: ['bookings', filters],
    queryFn: () => getBookings(filters),
  });

  const dates = (row: BookingListItem) => {
    const start = row.start_date || row.projected_start_date;
    const end = row.end_date || row.projected_end_date;
    if (!start || !end) return t('pages.bookings.waiting_for_deal');
    const text = `${formatDate(start, i18n.language)} — ${formatDate(end, i18n.language)}`;
    return row.dates_projected ? `${text} (${t('pages.bookings.projected')})` : text;
  };

  const columns: GridColDef<BookingListItem>[] = [
    {
      field: 'id', headerName: t('table.id'), width: 90,
      renderCell: (params) => (
        <MuiLink component={RouterLink} to={`/bookings/${params.id}`} underline="hover">
          {params.id}
        </MuiLink>
      ),
    },
    {
      field: 'status', headerName: t('table.status'), flex: 1, minWidth: 130,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography variant="body2">{t(`statuses.booking.${params.row.status}`, params.row.status)}</Typography>
          {params.row.queue_position ? (
            <Tooltip title={t('pages.bookings.queue_position', { position: params.row.queue_position })}>
              <Chip size="small" label={`#${params.row.queue_position}`} />
            </Tooltip>
          ) : null}
        </Stack>
      ),
    },
    { field: 'client', headerName: t('table.client'), flex: 1, minWidth: 160 },
    { field: 'property', headerName: t('table.property'), flex: 1.4, minWidth: 180 },
    {
      field: 'duration_days', headerName: t('pages.bookings.duration'), width: 110,
      valueFormatter: (value: number) => t('pages.bookings.days', { count: value }),
    },
    {
      field: 'start_date', headerName: t('pages.bookings.dates'), flex: 1.4, minWidth: 220,
      valueGetter: (_value, row) => dates(row),
    },
    {
      field: 'price', headerName: t('pages.bookings.booked_price'), flex: 1, minWidth: 130,
      valueFormatter: (value: string | null, row: BookingListItem) =>
        value ? formatMoney(value, row.currency, i18n.language) : '—',
    },
    {
      field: 'fee_status', headerName: t('pages.bookings.fee'), flex: 1, minWidth: 150,
      renderCell: (params) => {
        const fee = params.row.fee_status;
        if (!fee) return <Typography variant="body2" color="text.secondary">—</Typography>;
        return (
          <MuiLink component={RouterLink} to={`/finances/${fee.id}`} underline="hover">
            {formatMoney(fee.amount, fee.currency, i18n.language)} · {fee.status_display}
          </MuiLink>
        );
      },
    },
    { field: 'contract_number', headerName: t('pages.bookings.contract_number'), flex: 1, minWidth: 140 },
    { field: 'created_by', headerName: t('table.manager'), flex: 1, minWidth: 140 },
  ];

  const mobileFields: MobileCardField<BookingListItem>[] = [
    { key: 'client', label: t('table.client'), primary: true },
    {
      key: 'status', label: t('table.status'), chip: true,
      render: (_value, row) => t(`statuses.booking.${row.status}`, row.status),
    },
    { key: 'property', label: t('table.property'), secondary: true },
    { key: 'duration_days', label: t('pages.bookings.dates'), render: (_value, row) => dates(row) },
    {
      key: 'fee_status', label: t('pages.bookings.fee'),
      render: (_value, row) => row.fee_status
        ? `${formatMoney(row.fee_status.amount, row.fee_status.currency, i18n.language)} · ${row.fee_status.status_display}`
        : '—',
    },
    { key: 'created_by', label: t('table.manager') },
  ];

  const widgets = summary?.widgets;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>{t('pages.bookings.title')}</Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <KpiCard title={t('statuses.booking.ACTIVE')} value={widgets?.active_count || 0} color="primary.main" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <KpiCard title={t('statuses.booking.PENDING_QUEUE')} value={widgets?.queued_count || 0} color="info.main" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <KpiCard title={t('statuses.booking.CONVERTED')} value={widgets?.converted_count || 0} color="success.main" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <KpiCard title={t('statuses.booking.EXPIRED')} value={widgets?.expired_count || 0} color="warning.main" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <KpiCard title={t('statuses.booking.CANCELLED')} value={widgets?.cancelled_count || 0} color="error.main" />
        </Grid>
      </Grid>

      {/* Срок истёк, а ночной прогон ещё не прошёл: иначе «действующих»
          на экране больше, чем их есть на самом деле */}
      {Boolean(widgets?.overdue_count) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t('pages.bookings.overdue_notice', { count: widgets?.overdue_count })}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">{t('common.filters')}</Typography>
          <IconButton onClick={() => setFiltersExpanded((value) => !value)}>
            <FilterListIcon />
          </IconButton>
        </Stack>
        <Collapse in={filtersExpanded}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth size="small" label={t('pages.bookings.client_name')}
                value={filters.client_name || ''}
                onChange={(event) => setFilters((f) => ({ ...f, client_name: event.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth size="small" label={t('pages.bookings.contract_number')}
                value={filters.contract_number || ''}
                onChange={(event) => setFilters((f) => ({ ...f, contract_number: event.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel>{t('table.status')}</InputLabel>
                <Select
                  label={t('table.status')}
                  value={filters.status ?? (filters.live ? 'LIVE' : 'ALL')}
                  onChange={(event) => {
                    const value = String(event.target.value);
                    if (value === 'LIVE') setFilters((f) => ({ ...f, status: undefined, live: true }));
                    else if (value === 'ALL') setFilters((f) => ({ ...f, status: undefined, live: undefined }));
                    else setFilters((f) => ({ ...f, status: value, live: undefined }));
                  }}
                >
                  <MenuItem value="LIVE">{t('pages.bookings.filter_live')}</MenuItem>
                  <MenuItem value="ALL">{t('pages.bookings.filter_all')}</MenuItem>
                  <MenuItem value="ACTIVE">{t('statuses.booking.ACTIVE')}</MenuItem>
                  <MenuItem value="PENDING_QUEUE">{t('statuses.booking.PENDING_QUEUE')}</MenuItem>
                  <MenuItem value="CONVERTED">{t('statuses.booking.CONVERTED')}</MenuItem>
                  <MenuItem value="EXPIRED">{t('statuses.booking.EXPIRED')}</MenuItem>
                  <MenuItem value="CANCELLED">{t('statuses.booking.CANCELLED')}</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Collapse>
      </Paper>

      <ResponsiveDataView
        tableKey="bookings"
        data={bookings || []}
        columns={columns}
        mobileFields={mobileFields}
        isLoading={isLoading}
        error={isError ? t('errors.load_error') : undefined}
        onRowClick={(row) => navigate(`/bookings/${row.id}`)}
      />
    </Box>
  );
}
