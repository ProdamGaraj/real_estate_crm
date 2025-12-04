import { useState, useEffect } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Link as MuiLink,
    Paper, Grid, TextField, FormControl, InputLabel, Select, MenuItem, Autocomplete, Stack, Tabs, Tab
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { getDeals, type DealListItem, type DealFilters } from '../api/deals';
import { getUsers, type User } from '../api/users';
import DealSummary from '../components/deals/DealSummary';

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

const columns: GridColDef<DealListItem>[] = [
    {
        field: 'id',
        headerName: 'ID',
        width: 90,
        renderCell: (params) => (
            <MuiLink component={RouterLink} to={`/deals/${params.id}`} underline="hover">
                {params.id}
            </MuiLink>
        )
    },
    { field: 'status', headerName: 'Статус', flex: 1 },
    { field: 'client', headerName: 'Клиент', flex: 1 },
    { field: 'property', headerName: 'Объект', flex: 1 },
    { field: 'contract_price', headerName: 'Цена по договору', flex: 1, valueFormatter: (value: number) => value ? value.toLocaleString() : '' },
    { field: 'created_by', headerName: 'Менеджер', flex: 1 },
    {
        field: 'created_at',
        headerName: 'Дата создания',
        type: 'dateTime',
        flex: 1,
        valueGetter: (value) => new Date(value),
    },
];

export default function DealsPage() {
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
    if (isError) return <Alert severity="error">Ошибка загрузки сделок</Alert>;

    return (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Typography variant="h4">Сделки</Typography>

            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
                    <Tab label="Список сделок" />
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
                                <Controller name="property_id" control={control} render={({ field }) => (
                                    <TextField {...field} value={field.value || ''} label="ID Объекта" type="number" fullWidth size="small" />
                                )} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Controller name="created_by_id" control={control} render={({ field }) => (
                                    <Autocomplete
                                        options={users || []}
                                        loading={isLoadingUsers}
                                        getOptionLabel={(option) => `${option.first_name} ${option.last_name}`.trim() || option.username}
                                        onChange={(_, data) => field.onChange(data?.id || null)}
                                        renderInput={(params) => <TextField {...params} label="Менеджер" size="small" />}
                                    />
                                )} />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Controller name="status" control={control} defaultValue="" render={({ field }) => (
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Статус</InputLabel>
                                        <Select {...field} label="Статус">
                                            <MenuItem value=""><em>Все</em></MenuItem>
                                            <MenuItem value="BOOKING">Бронь</MenuItem>
                                            <MenuItem value="IN_PROGRESS">В работе</MenuItem>
                                            <MenuItem value="CLOSED_WON">Успешно закрыта</MenuItem>
                                            <MenuItem value="CANCELLED">Отменена</MenuItem>
                                            <MenuItem value="TERMINATED">Расторгнута</MenuItem>
                                        </Select>
                                    </FormControl>
                                )} />
                            </Grid>
                            <Grid size={{ xs: 6, md: 3 }}>
                                <Controller name="contract_date_after" control={control} render={({ field }) => (
                                    <TextField {...field} label="Дата договора (от)" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} />
                                )} />
                            </Grid>
                            <Grid size={{ xs: 6, md: 3 }}>
                                <Controller name="contract_date_before" control={control} render={({ field }) => (
                                    <TextField {...field} label="Дата договора (до)" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} />
                                )} />
                            </Grid>
                        </Grid>
                    </Paper>

                    <Box sx={{ flex: 1, width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <DataGrid
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