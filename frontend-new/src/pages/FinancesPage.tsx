// real_estate_crm/frontend-new/src/pages/FinancesPage.tsx

import { useState, useEffect } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Link as MuiLink,
    Paper, Grid, TextField, FormControl, InputLabel, Select, MenuItem, Stack, Chip, Tabs, Tab,
    useTheme, alpha
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { translatePaymentStatus } from '../utils/translations';
import type { GridColDef, GridRowClassNameParams } from '@mui/x-data-grid';
import LocalizedDataGrid from '../components/common/LocalizedDataGrid';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { getPayments, type Payment, type PaymentFilters } from '../api/finances';
import FinanceSummary from '../components/finances/FinanceSummary';
import { LocalizedDateField } from '../components/common/LocalizedDateField';

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function TabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
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

const getColumns = (t: (key: string) => string): GridColDef<Payment>[] => [
    {
        field: 'id',
        headerName: t('table.id'),
        width: 80,
        renderCell: (params) => (
            <MuiLink component={RouterLink} to={`/finances/${params.id}`} underline="hover">
                {params.id}
            </MuiLink>
        )
    },
    {
        field: 'client', headerName: t('table.client'), flex: 1,
        renderCell: (params) => {
            if (!params.row.client) {
                return 'N/A';
            }
            return (
                <MuiLink component={RouterLink} to={`/clients/${params.row.client.id}`} underline="hover">
                    {params.row.client.full_name}
                </MuiLink>
            )
        }
    },
    {
        field: 'deal', headerName: t('table.deal'), width: 100,
        renderCell: (params) => params.row.deal ? (
            <MuiLink component={RouterLink} to={`/deals/${params.row.deal.id}`} underline="hover">
                №{params.row.deal.id}
            </MuiLink>
        ) : 'N/A'
    },
    { field: 'amount', headerName: t('table.amount'), flex: 1, valueFormatter: (value: number) => value ? value.toLocaleString() : '' },
    { field: 'due_date', headerName: t('table.due_date'), type: 'date', width: 120, valueGetter: (value) => new Date(value) },
    {
        field: 'status', headerName: t('table.status'), width: 150,
        renderCell: (params) => <Chip label={translatePaymentStatus(params.row.status)} color={getStatusChipColor(params.row.status)} size="small" />
    },
    { field: 'payment_type', headerName: t('table.payment_type'), flex: 1 },
];


export default function FinancesPage() {
    const { t } = useTranslation();
    const theme = useTheme();
    const location = useLocation();
    const [tabValue, setTabValue] = useState(location.state?.tab || 0);
    const columns = getColumns(t);
    const [filters, setFilters] = useState<PaymentFilters>(location.state?.filters || {});
    const { control, watch, reset } = useForm<PaymentFilters>({
        defaultValues: filters
    });

    useEffect(() => {
        if (location.state) {
            setTabValue(location.state.tab || 0);
            setFilters(location.state.filters || {});
            reset(location.state.filters || {});
        }
    }, [location.state, reset]);


    useEffect(() => {
        const subscription = watch((value) => {
            const timer = setTimeout(() => {
                const cleanedFilters = Object.fromEntries(
                    Object.entries(value).filter(([_, v]) => v !== '' && v !== null)
                );
                setFilters(cleanedFilters);
            }, 300);
            return () => clearTimeout(timer);
        });
        return () => subscription.unsubscribe();
    }, [watch]);

    const { data: payments, isLoading, isError } = useQuery({
        queryKey: ['payments', filters],
        queryFn: () => getPayments(filters),
    });

    // Функция для условной стилизации строк
    const getRowClassName = (params: GridRowClassNameParams<Payment>) => {
        if (params.row.status === 'OVERDUE') {
            return 'overdue-row';
        }
        return '';
    };

    if (isLoading) return <CircularProgress />;
    if (isError) return <Alert severity="error">{t('errors.load_payments_error')}</Alert>;

    // Цвета для подсветки просроченных строк с учётом темы
    const overdueRowBg = alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.2 : 0.1);
    const overdueRowHoverBg = alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.3 : 0.15);

    return (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <style>
                {`
                    .overdue-row {
                        background-color: ${overdueRowBg} !important;
                    }
                    .overdue-row:hover {
                        background-color: ${overdueRowHoverBg} !important;
                    }
                `}
            </style>
            <Typography variant="h4">{t('pages.finances.title')}</Typography>

            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
                    <Tab label={t('pages.finances.payment_list')} />
                    <Tab label={t('pages.finances.summary_table')} />
                </Tabs>
            </Box>

            <TabPanel value={tabValue} index={0}>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>{t('common.filters')}</Typography>
                        <Grid container spacing={2} alignItems="center">
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Controller name="client_name" control={control} render={({ field }) => (
                                    <TextField {...field} label={t('pages.finances.client_filter')} fullWidth size="small" />
                                )} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Controller name="deal_id" control={control} render={({ field }) => (
                                    <TextField {...field} value={field.value || ''} label={t('pages.finances.deal_id_filter')} type="number" fullWidth size="small" />
                                )} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Controller name="status" control={control} defaultValue="" render={({ field }) => (
                                    <FormControl fullWidth size="small">
                                        <InputLabel>{t('forms.status')}</InputLabel>
                                        <Select {...field} label={t('forms.status')}>
                                            <MenuItem value=""><em>{t('common.all')}</em></MenuItem>
                                            <MenuItem value="PENDING">{t('statuses.payment.pending')}</MenuItem>
                                            <MenuItem value="PAID">{t('statuses.payment.paid')}</MenuItem>
                                            <MenuItem value="OVERDUE">{t('statuses.payment.overdue')}</MenuItem>
                                            <MenuItem value="TO_BE_RETURNED">{t('statuses.payment.to_be_returned')}</MenuItem>
                                            <MenuItem value="RETURNED">{t('statuses.payment.returned')}</MenuItem>
                                        </Select>
                                    </FormControl>
                                )} />
                            </Grid>
                            <Grid size={{ xs: 6, md: 3 }}>
                                <Controller name="due_date_after" control={control} render={({ field }) => (
                                    <LocalizedDateField
                                        label={t('pages.finances.due_date_from')}
                                        value={field.value || null}
                                        onChange={field.onChange}
                                    />
                                )} />
                            </Grid>
                            <Grid size={{ xs: 6, md: 3 }}>
                                <Controller name="due_date_before" control={control} render={({ field }) => (
                                    <LocalizedDateField
                                        label={t('pages.finances.due_date_to')}
                                        value={field.value || null}
                                        onChange={field.onChange}
                                    />
                                )} />
                            </Grid>
                            {/* Вторая дата платежа: по ней собирают отчёт о поступлениях.
                                Сводная таблица умела по ней фильтровать, список — нет. */}
                            <Grid size={{ xs: 6, md: 3 }}>
                                <Controller name="payment_date_after" control={control} render={({ field }) => (
                                    <LocalizedDateField
                                        label={t('pages.finances.payment_date_from')}
                                        value={field.value || null}
                                        onChange={field.onChange}
                                    />
                                )} />
                            </Grid>
                            <Grid size={{ xs: 6, md: 3 }}>
                                <Controller name="payment_date_before" control={control} render={({ field }) => (
                                    <LocalizedDateField
                                        label={t('pages.finances.payment_date_to')}
                                        value={field.value || null}
                                        onChange={field.onChange}
                                    />
                                )} />
                            </Grid>
                        </Grid>
                    </Paper>

                    <Box sx={{ flex: 1, width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <LocalizedDataGrid
                            rows={payments || []}
                            columns={columns}
                            loading={isLoading}
                            getRowClassName={getRowClassName}
                        />
                    </Box>
                </Box>
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
                <FinanceSummary />
            </TabPanel>
        </Box>
    );
}