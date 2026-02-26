import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box, Typography, CircularProgress, Alert, Link as MuiLink,
    Paper, Grid, TextField, FormControl, InputLabel, Select, MenuItem, 
    Autocomplete, Stack, Tabs, Tab, IconButton, Collapse
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import type { GridColDef } from '@mui/x-data-grid';
import ResponsiveDataView from '../components/common/ResponsiveDataView';
import type { MobileCardField } from '../components/common/MobileCardList';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { getDeals, type DealListItem, type DealFilters } from '../api/deals';
import { getUsers, type User } from '../api/users';
import DealSummary from '../components/deals/DealSummary';
import { LocalizedDateField } from '../components/common/LocalizedDateField';
import { useIsMobile } from '../hooks/useMobile';

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
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const [filtersExpanded, setFiltersExpanded] = useState(!isMobile);

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
        { 
            field: 'status', 
            headerName: t('table.status'), 
            flex: 1,
            valueGetter: (value: string) => t(`statuses.deal.${value}`, value)
        },
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

    // Mobile card fields
    const mobileFields: MobileCardField<DealListItem>[] = [
        {
            key: 'client',
            label: 'table.client',
            primary: true,
        },
        {
            key: 'property',
            label: 'table.property',
            secondary: true,
        },
        {
            key: 'status',
            label: 'table.status',
            chip: true,
            chipColor: (value: string) => {
                switch (value) {
                    case 'CLOSED_WON': return 'success';
                    case 'CANCELLED':
                    case 'TERMINATED': return 'error';
                    case 'IN_PROGRESS': return 'warning';
                    default: return 'default';
                }
            },
            render: (value: string) => t(`statuses.deal.${value}`, value),
        },
        {
            key: 'contract_price',
            label: 'table.contract_price',
            render: (value: number) => value ? value.toLocaleString() : '-',
        },
        {
            key: 'created_by',
            label: 'table.manager',
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

    const handleDealClick = (deal: DealListItem) => {
        navigate(`/deals/${deal.id}`);
    };

    return (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: isMobile ? 2 : 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant={isMobile ? 'h5' : 'h4'}>{t('pages.deals.title')}</Typography>
                {isMobile && (
                    <IconButton onClick={() => setFiltersExpanded(!filtersExpanded)} color="primary">
                        <FilterListIcon />
                    </IconButton>
                )}
            </Box>

            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs 
                    value={tabValue} 
                    onChange={(_, newValue) => setTabValue(newValue)}
                    variant={isMobile ? 'fullWidth' : 'standard'}
                >
                    <Tab label={t('pages.deals.deal_list')} />
                    <Tab label={t('pages.deals.summary_table')} />
                </Tabs>
            </Box>

            <TabPanel value={tabValue} index={0}>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Collapse in={filtersExpanded || !isMobile}>
                        <Paper sx={{ p: 2 }}>
                            {!isMobile && <Typography variant="h6" sx={{ mb: 2 }}>{t('common.filters')}</Typography>}
                            <Grid container spacing={2} alignItems="center">
                                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                    <Controller name="client_name" control={control} render={({ field }) => (
                                        <TextField {...field} label={t('pages.deals.client_filter')} fullWidth size="small" />
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
                                {!isMobile && (
                                    <>
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
                                    </>
                                )}
                            </Grid>
                        </Paper>
                    </Collapse>

                    <Box sx={{ flex: 1, width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <ResponsiveDataView
                            data={deals || []}
                            columns={columns}
                            mobileFields={mobileFields}
                            isLoading={isLoading}
                            error={isError ? t('errors.load_deals_error') : undefined}
                            onRowClick={handleDealClick}
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