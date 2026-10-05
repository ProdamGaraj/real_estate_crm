// real_estate_crm/frontend-new/src/components/settings/CurrencySettingsManager.tsx

/**
 * Вкладка «Валюты»: валюта сделок компании, поддерживаемые валюты и курсы.
 *
 * Валюта сделок одна на компанию: в ней ведутся новые сделки и графики
 * платежей, к ней приводятся дашборд и отчёты. Поддерживаемые валюты — в чём
 * ещё можно вводить суммы графика: при сохранении они пересчитываются в
 * валюту сделки по курсу на день сохранения.
 *
 * Курсы ЦБ загружаются автоматически каждый час и по кнопке. Ручной курс
 * действует только внутри своей компании и перекрывает курс ЦБ на свою дату.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, FormControl, Grid, InputLabel, MenuItem, OutlinedInput,
  Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import { GridActionsCellItem } from '@mui/x-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import LocalizedDataGrid from '../common/LocalizedDataGrid';
import LocalizedDateField from '../common/LocalizedDateField';
import {
  createManualRate, deleteManualRate, getCurrencySettings, getCurrentRates, getRateHistory,
  refreshCbuRates, updateCurrencySettings,
} from '../../api/currency';
import type { ExchangeRate } from '../../api/currency';
import { getCompanies } from '../../api/permissions';
import { useAuthStore } from '../../store/authStore';
import { hasPermission, isSystemAdmin } from '../../utils/permissions';
import { extractApiError } from '../../utils/apiError';
import { formatRate } from '../../utils/currency';

const todayIso = () => {
  // Локальная дата: toISOString() до 05:00 по Ташкенту дал бы вчерашний день
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
};

export default function CurrencySettingsManager() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const systemAdmin = isSystemAdmin(user);
  const canEdit = hasPermission(user, 'EDIT', 'EXCHANGE_RATE');
  const canAdd = hasPermission(user, 'ADD', 'EXCHANGE_RATE');
  const canDelete = hasPermission(user, 'DELETE', 'EXCHANGE_RATE');

  // Системный администратор настраивает любую компанию; остальные — свою
  const [companyId, setCompanyId] = useState<number | null>(null);
  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: () => getCompanies(),
    enabled: systemAdmin,
  });

  const settingsQuery = useQuery({
    queryKey: ['currencySettings', companyId],
    queryFn: () => getCurrencySettings(companyId),
  });
  const settings = settingsQuery.data;

  const [dealCurrency, setDealCurrency] = useState('');
  const [supported, setSupported] = useState<string[]>([]);
  useEffect(() => {
    if (settings) {
      setDealCurrency(settings.deal_currency);
      setSupported(settings.supported_currencies);
    }
  }, [settings]);

  const currencyName = useMemo(() => {
    const names = new Map(settings?.available_currencies.map(c => [c.code, c.name]) ?? []);
    return (code: string) => names.get(code) ?? code;
  }, [settings]);

  const ratesQuery = useQuery({
    queryKey: ['exchangeRates', 'current', companyId, settings?.supported_currencies],
    queryFn: () => getCurrentRates({ company: companyId }),
    enabled: !!settings,
  });

  const historyQuery = useQuery({
    queryKey: ['exchangeRates', 'history', companyId],
    queryFn: () => getRateHistory({ company: companyId, limit: 200 }),
  });

  const invalidateRates = () => queryClient.invalidateQueries({ queryKey: ['exchangeRates'] });

  const saveSettings = useMutation({
    mutationFn: updateCurrencySettings,
    onSuccess: (data) => {
      queryClient.setQueryData(['currencySettings', companyId], data);
      // Без компании в ключе — это настройки своей компании, их читают график и дашборд
      queryClient.invalidateQueries({ queryKey: ['currencySettings'] });
      invalidateRates();
      alert(t('common.changes_saved'));
    },
    onError: (error: unknown) => alert(extractApiError(error, t('errors.update_error'))),
  });

  const refresh = useMutation({
    mutationFn: refreshCbuRates,
    onSuccess: (data) => {
      invalidateRates();
      alert(t('pages.settings.currencies.refreshed', { saved: data.saved }));
    },
    onError: (error: unknown) => alert(extractApiError(error, t('pages.settings.currencies.refresh_error'))),
  });

  const [manual, setManual] = useState({ currency: '', date: todayIso(), rate: '' });
  const addManual = useMutation({
    mutationFn: createManualRate,
    onSuccess: () => {
      invalidateRates();
      setManual(prev => ({ ...prev, rate: '' }));
    },
    onError: (error: unknown) => alert(extractApiError(error, t('errors.error_occurred'))),
  });

  const removeManual = useMutation({
    mutationFn: deleteManualRate,
    onSuccess: invalidateRates,
    onError: (error: unknown) => alert(extractApiError(error, t('errors.error_occurred'))),
  });

  const available = settings?.available_currencies ?? [];
  const baseCurrency = settings?.base_currency ?? 'UZS';
  const dirty = !!settings && (
    dealCurrency !== settings.deal_currency
    || [...supported].sort().join() !== [...settings.supported_currencies].sort().join()
  );

  const handleSupportedChange = (value: string[]) => {
    // Валюта сделок всегда остаётся в поддерживаемых
    setSupported(value.includes(dealCurrency) ? value : [dealCurrency, ...value]);
  };

  const handleDealCurrencyChange = (value: string) => {
    setDealCurrency(value);
    setSupported(prev => (prev.includes(value) ? prev : [value, ...prev]));
  };

  const sourceLabel = (rate: ExchangeRate) => {
    if (rate.source === 'MANUAL') return t('pages.settings.currencies.source_manual');
    if (rate.source === 'BASE') return t('pages.settings.currencies.source_base');
    return t('pages.settings.currencies.source_cbu');
  };

  const historyColumns: GridColDef<ExchangeRate>[] = [
    {
      field: 'date', headerName: t('forms.date'), width: 120,
      valueFormatter: (value: string) => (value ? new Date(value).toLocaleDateString(i18n.language) : ''),
    },
    { field: 'currency', headerName: t('pages.settings.currencies.currency'), width: 100 },
    {
      field: 'rate', headerName: t('pages.settings.currencies.rate_in_base', { base: baseCurrency }), flex: 1,
      valueFormatter: (value: string) => formatRate(value, i18n.language),
    },
    {
      field: 'source', headerName: t('pages.settings.currencies.source'), flex: 1,
      valueGetter: (_value, row) => sourceLabel(row),
    },
    { field: 'created_by', headerName: t('pages.settings.currencies.entered_by'), flex: 1 },
    {
      field: 'actions', type: 'actions', width: 60,
      // Удаляются только ручные курсы: курсы ЦБ — общая история для всех компаний
      getActions: (params) => (params.row.source === 'MANUAL' && canDelete ? [
        <GridActionsCellItem
          key="delete"
          icon={<DeleteIcon />}
          label={t('common.delete')}
          onClick={() => {
            if (window.confirm(t('pages.settings.currencies.confirm_delete'))) {
              removeManual.mutate(params.row.id!);
            }
          }}
        />,
      ] : []),
    },
  ];

  if (settingsQuery.isError) {
    return <Alert severity="error">{extractApiError(settingsQuery.error, t('errors.load_error'))}</Alert>;
  }

  const currentRates = ratesQuery.data?.rates ?? {};
  const missing = Object.values(currentRates).filter(r => r.rate === null).map(r => r.currency);

  return (
    <Stack spacing={4}>
      {systemAdmin && (
        <FormControl size="small" sx={{ maxWidth: 360 }}>
          <InputLabel shrink>{t('common.company')}</InputLabel>
          <Select
            label={t('common.company')}
            displayEmpty
            notched
            value={companyId ?? ''}
            onChange={(e) => {
              const value = e.target.value as number | '';
              setCompanyId(value === '' ? null : Number(value));
            }}
          >
            <MenuItem value="">{t('pages.settings.currencies.own_company')}</MenuItem>
            {companies?.map(company => (
              <MenuItem key={company.id} value={company.id}>{company.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* Валюта сделок и поддерживаемые валюты */}
      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>{t('pages.settings.currencies.settings_title')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('pages.settings.currencies.settings_hint')}
        </Typography>
        <Grid container spacing={2} alignItems="flex-start">
          <Grid size={{ xs: 12, md: 4 }}>
            <FormControl fullWidth disabled={!canEdit}>
              <InputLabel>{t('pages.settings.currencies.deal_currency')}</InputLabel>
              <Select
                label={t('pages.settings.currencies.deal_currency')}
                value={dealCurrency}
                onChange={(e) => handleDealCurrencyChange(String(e.target.value))}
              >
                {available.map(c => <MenuItem key={c.code} value={c.code}>{c.code} — {c.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <FormControl fullWidth disabled={!canEdit}>
              <InputLabel>{t('pages.settings.currencies.supported')}</InputLabel>
              <Select
                multiple
                value={supported}
                onChange={(e) => handleSupportedChange(
                  typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value
                )}
                input={<OutlinedInput label={t('pages.settings.currencies.supported')} />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map(code => (
                      <Chip key={code} size="small" label={code} color={code === dealCurrency ? 'primary' : 'default'} />
                    ))}
                  </Box>
                )}
              >
                {available.map(c => (
                  <MenuItem key={c.code} value={c.code} disabled={c.code === dealCurrency}>
                    {c.code} — {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
        {settings && dealCurrency !== settings.deal_currency && (
          <Alert severity="warning" sx={{ mt: 2 }}>{t('pages.settings.currencies.deal_currency_change_warning')}</Alert>
        )}
        {canEdit && (
          <Button
            variant="contained"
            sx={{ mt: 2 }}
            disabled={!dirty || saveSettings.isPending}
            onClick={() => saveSettings.mutate({ deal_currency: dealCurrency, supported_currencies: supported, company: companyId })}
          >
            {saveSettings.isPending ? t('common.saving') : t('common.save')}
          </Button>
        )}
      </Box>

      {/* Курсы на сегодня */}
      <Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="h6">{t('pages.settings.currencies.rates_title')}</Typography>
          {(canAdd || canEdit) && (
            <Button startIcon={<RefreshIcon />} variant="outlined" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              {refresh.isPending ? t('pages.settings.currencies.refreshing') : t('pages.settings.currencies.refresh')}
            </Button>
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('pages.settings.currencies.rates_hint', { base: baseCurrency })}
        </Typography>
        {missing.length > 0 && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {t('pages.settings.currencies.missing_rates', { currencies: missing.join(', ') })}
          </Alert>
        )}
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('pages.settings.currencies.currency')}</TableCell>
                <TableCell align="right">{t('pages.settings.currencies.rate_in_base', { base: baseCurrency })}</TableCell>
                <TableCell>{t('pages.settings.currencies.rate_date')}</TableCell>
                <TableCell>{t('pages.settings.currencies.source')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.values(currentRates).map(rate => (
                <TableRow key={rate.currency}>
                  <TableCell>{rate.currency} — {currencyName(rate.currency)}</TableCell>
                  <TableCell align="right">{rate.rate === null ? '—' : formatRate(rate.rate, i18n.language)}</TableCell>
                  <TableCell>{rate.date ? new Date(rate.date).toLocaleDateString(i18n.language) : '—'}</TableCell>
                  <TableCell>{rate.rate === null ? t('pages.settings.currencies.no_rate') : sourceLabel(rate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Ручной курс */}
      {canAdd && (
        <Box>
          <Typography variant="h6" sx={{ mb: 1 }}>{t('pages.settings.currencies.manual_title')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('pages.settings.currencies.manual_hint')}
          </Typography>
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, sm: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel>{t('pages.settings.currencies.currency')}</InputLabel>
                <Select
                  label={t('pages.settings.currencies.currency')}
                  value={manual.currency}
                  onChange={(e) => setManual(prev => ({ ...prev, currency: String(e.target.value) }))}
                >
                  {available.filter(c => c.code !== baseCurrency).map(c => (
                    <MenuItem key={c.code} value={c.code}>{c.code} — {c.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <LocalizedDateField
                label={t('forms.date')}
                value={manual.date || null}
                onChange={(date) => setManual(prev => ({ ...prev, date: date || '' }))}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                label={t('pages.settings.currencies.rate_in_base', { base: baseCurrency })}
                type="number"
                size="small"
                fullWidth
                value={manual.rate}
                onChange={(e) => setManual(prev => ({ ...prev, rate: e.target.value }))}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <Button
                variant="contained"
                disabled={!manual.currency || !manual.date || !(Number(manual.rate) > 0) || addManual.isPending}
                onClick={() => addManual.mutate({ ...manual, company: companyId })}
              >
                {t('common.add')}
              </Button>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* История */}
      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>{t('pages.settings.currencies.history_title')}</Typography>
        <Box sx={{ height: 420, width: '100%' }}>
          <LocalizedDataGrid
            rows={historyQuery.data ?? []}
            columns={historyColumns}
            loading={historyQuery.isLoading}
            getRowId={(row: ExchangeRate) => row.id!}
          />
        </Box>
      </Box>
    </Stack>
  );
}
