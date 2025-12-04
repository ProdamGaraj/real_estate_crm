// real_estate_crm/frontend-new/src/pages/FinancesPage.tsx

import { useState, useEffect } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Link as MuiLink,
    Paper, Grid, TextField, FormControl, InputLabel, Select, MenuItem, Stack, Chip, Tabs, Tab
} from '@mui/material';
import { DataGrid, type GridColDef, type GridRowClassNameParams } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { getPayments, type Payment, type PaymentFilters } from '../api/finances';
import FinanceSummary from '../components/finances/FinanceSummary';

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

const columns: GridColDef<Payment>[] = [
    {
        field: 'id',
        headerName: 'ID',
        width: 80,
        renderCell: (params) => (
            <MuiLink component={RouterLink} to={`/finances/${params.id}`} underline="hover">
                {params.id}
            </MuiLink>
        )
    },
    {
        field: 'client', headerName: 'Клиент', flex: 1,
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
        field: 'deal', headerName: 'Сделка', width: 100,
        renderCell: (params) => params.row.deal ? (
            <MuiLink component={RouterLink} to={`/deals/${params.row.deal.id}`} underline="hover">
                №{params.row.deal.id}
            </MuiLink>
        ) : 'N/A'
    },
    { field: 'amount', headerName: 'Сумма', flex: 1, valueFormatter: (value: number) => value ? value.toLocaleString() : '' },
    { field: 'due_date', headerName: 'К оплате', type: 'date', width: 120, valueGetter: (value) => new Date(value) },
    {
        field: 'status', headerName: 'Статус', width: 150,
        renderCell: (params) => <Chip label={params.row.status_display} color={getStatusChipColor(params.row.status)} size="small" />
    },
    { field: 'payment_type', headerName: 'Тип платежа', flex: 1 },
];


export default function FinancesPage() {
    const location = useLocation();
    const [tabValue, setTabValue] = useState(location.state?.tab || 0);
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
    if (isError) return <Alert severity="error">Ошибка загрузки платежей</Alert>;

    return (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <style>
                {`
                    .overdue-row {
                        background-color: var(--color-error-lighter) !important;
                    }
                    .overdue-row:hover {
                        background-color: var(--color-error-light) !important;
                    }
                `}
            </style>
            <Typography variant="h4">Финансы</Typography>

            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
                    <Tab label="Список платежей" />
                    <Tab label="Сводная таблица" />
                </Tabs>
            </Box>

            <TabPanel value={tabValue} index={0}>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>Фильтры</Typography>
                        <Grid container spacing={2} alignItems="center">
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Controller name="client_name" control={control} render={({ field }) => (
                                    <TextField {...field} label="Клиент" fullWidth size="small" />
                                )} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Controller name="deal_id" control={control} render={({ field }) => (
                                    <TextField {...field} value={field.value || ''} label="ID Сделки" type="number" fullWidth size="small" />
                                )} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Controller name="status" control={control} defaultValue="" render={({ field }) => (
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Статус</InputLabel>
                                        <Select {...field} label="Статус">
                                            <MenuItem value=""><em>Все</em></MenuItem>
                                            <MenuItem value="PENDING">К оплате</MenuItem>
                                            <MenuItem value="PAID">Оплачен</MenuItem>
                                            <MenuItem value="OVERDUE">Просрочен</MenuItem>
                                            <MenuItem value="TO_BE_RETURNED">К возврату</MenuItem>
                                            <MenuItem value="RETURNED">Возвращен</MenuItem>
                                        </Select>
                                    </FormControl>
                                )} />
                            </Grid>
                            <Grid size={{ xs: 6, md: 3 }}>
                                <Controller name="due_date_after" control={control} render={({ field }) => (
                                    <TextField {...field} label="Дата к оплате (от)" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} />
                                )} />
                            </Grid>
                            <Grid size={{ xs: 6, md: 3 }}>
                                <Controller name="due_date_before" control={control} render={({ field }) => (
                                    <TextField {...field} label="Дата к оплате (до)" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} />
                                )} />
                            </Grid>
                        </Grid>
                    </Paper>

                    <Box sx={{ flex: 1, width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <DataGrid
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