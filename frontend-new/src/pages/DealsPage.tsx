import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box, Typography, CircularProgress, Alert, Link as MuiLink,
    Paper, Grid, TextField, FormControl, InputLabel, Select, MenuItem, Autocomplete, Stack, Tabs, Tab
} from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../components/common/LocalizedDataGrid';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { getDeals, type DealListItem, type DealFilters } from '../api/deals';
import { getUsers, type User } from '../api/users';
import DealSummary from '../components/deals/DealSummary';
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

export default function DealsPage() {
    const { t } = useTranslation();

    const columns: GridColDef<DealListItem>[] = [
        {
            field: 'id',
            headerName: t('table.id'),
            width: 90,
            renderCell: (params) => (
                <MuiLink component={RouterLink} to={`/deals/${params.id}`} underline="hover">
                    {params.id}
                </MuiLink>
            )
        },
        { field: 'status', headerName: t('table.status'), flex: 1 },
        { field: 'client', headerName: t('table.client'), flex: 1 },
        { field: 'property', headerName: t('table.property'), flex: 1 },
        { field: 'contract_price', headerName: t('table.contract_price'), flex: 1, valueFormatter: (value: number) => value ? value.toLocaleString() : '' },
        { field: 'created_by', headerName: t('table.manager'), flex: 1 },
        {
            field: 'created_at',
            headerName: t('table.created_at'),
            type: 'dateTime',
            flex: 1,
            valueGetter: (value) => new Date(value),
        },
    ];
    const location = useLocation();
    const [tabValue, setTabValue] = useState(location.state?.tab || 0);
    const [filters, setFilters] = useState<DealFilters>(location.state?.filters || {});
    const { control, watch, reset } = useForm<DealFilters>({
        defaultValues: filters
    });

    useEffect(() => {
        if (location.state) {
            setTabValue(location.state.tab || 0);
            setFilters(location.state.filters || {});
            reset(location.state.filters || {});
        }
    }, [location.state, reset]);

    const { data: users, isLoading: isLoadingUsers } = useQuery<User[]>({
        queryKey: ['users'],
        queryFn: getUsers,
    });

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

    const { data: deals, isLoading, isError } = useQuery({
        queryKey: ['deals', filters],
        queryFn: () => getDeals(filters),
    });

    if (isLoading) return <CircularProgress />;
    if (isError) return <Alert severity="error">{t('errors.load_deals_error')}</Alert>;

    return (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Typography variant="h4">{t('pages.deals.title')}</Typography>

            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
                    <Tab label={t('pages.deals.deal_list')} />
                    <Tab label={t('pages.deals.summary_table')} />
                </Tabs>
            </Box>

            <TabPanel value={tabValue} index={0}>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>{t('common.filters')}</Typography>
                        <Grid container spacing={2} alignItems="center">
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Controller name="client_name" control={control} render={({ field }) => (
                                    <TextField {...field} label={t('pages.deals.client_filter')} fullWidth size="small" />
                                )} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Controller name="property_id" control={control} render={({ field }) => (
                                    <TextField {...field} value={field.value || ''} label={t('pages.deals.property_id_filter')} type="number" fullWidth size="small" />
                                )} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Controller name="created_by_id" control={control} render={({ field }) => (
                                    <Autocomplete
                                        options={users || []}
                                        loading={isLoadingUsers}
                                        getOptionLabel={(option) => `${option.first_name} ${option.last_name}`.trim() || option.username}
                                        onChange={(_, data) => field.onChange(data?.id || null)}
                                        renderInput={(params) => <TextField {...params} label={t('pages.deals.manager')} size="small" />}
                                    />
                                )} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Controller name="status" control={control} defaultValue="" render={({ field }) => (
                                    <FormControl fullWidth size="small">
                                        <InputLabel>{t('forms.status')}</InputLabel>
                                        <Select {...field} label={t('forms.status')}>
                                            <MenuItem value=""><em>{t('common.all')}</em></MenuItem>
                                            <MenuItem value="BOOKING">{t('statuses.deal.BOOKING')}</MenuItem>
                                            <MenuItem value="IN_PROGRESS">{t('statuses.deal.IN_PROGRESS')}</MenuItem>
                                            <MenuItem value="CLOSED_WON">{t('statuses.deal.CLOSED_WON')}</MenuItem>
                                            <MenuItem value="CANCELLED">{t('statuses.deal.CANCELLED')}</MenuItem>
                                            <MenuItem value="TERMINATED">{t('statuses.deal.TERMINATED')}</MenuItem>
                                        </Select>
                                    </FormControl>
                                )} />
                            </Grid>
                            <Grid size={{ xs: 6, md: 3 }}>
                                <Controller name="contract_date_after" control={control} render={({ field }) => (
                                    <LocalizedDateField
                                        label={t('pages.deals.contract_date_from')}
                                        value={field.value || null}
                                        onChange={field.onChange}
                                    />
                                )} />
                            </Grid>
                            <Grid size={{ xs: 6, md: 3 }}>
                                <Controller name="contract_date_before" control={control} render={({ field }) => (
                                    <LocalizedDateField
                                        label={t('pages.deals.contract_date_to')}
                                        value={field.value || null}
                                        onChange={field.onChange}
                                    />
                                )} />
                            </Grid>
                        </Grid>
                    </Paper>

                    <Box sx={{ flex: 1, width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <LocalizedDataGrid
                            rows={deals || []}
                            columns={columns}
                            loading={isLoading}
                        />
                    </Box>
                </Box>
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
                <DealSummary />
            </TabPanel>
        </Box>
    );
}