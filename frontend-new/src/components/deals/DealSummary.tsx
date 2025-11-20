import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDealSummary, downloadDealSummary, type DealSummaryFilters } from '../../api/deals';
import { Link as RouterLink } from 'react-router-dom';
import {
    Box,
    Typography,
    CircularProgress,
    Alert,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Button,
    Stack,
    Grid,
    Paper,
    Card,
    CardContent,
    TextField
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useForm, Controller } from 'react-hook-form';

type GroupBy = 'created_by' | 'project' | 'status';

const KpiCard = ({ title, value, color = 'text.primary', linkTo }: { title: string; value: number; color?: string, linkTo?: object }) => (
    <Card sx={{ height: '100%', textDecoration: 'none' }} component={RouterLink} to="/deals" state={linkTo}>
        <CardContent sx={{ textAlign: 'center' }}>
            <Typography color="text.secondary">{title}</Typography>
            <Typography variant="h4" component="div" color={color}>
                {value}
            </Typography>
        </CardContent>
    </Card>
);

export default function DealSummary() {
    const [filters, setFilters] = useState<DealSummaryFilters>({ group_by: 'created_by' });

    const { control, watch } = useForm<DealSummaryFilters>({
        defaultValues: {
            group_by: 'created_by',
            created_at_after: '',
            created_at_before: ''
        }
    });

    useEffect(() => {
        const subscription = watch((value) => {
            const timer = setTimeout(() => {
                const cleanedFilters = Object.fromEntries(
                    Object.entries(value).filter(([_, v]) => v !== '' && v !== null)
                );
                setFilters(cleanedFilters as DealSummaryFilters);
            }, 500);
            return () => clearTimeout(timer);
        });
        return () => subscription.unsubscribe();
    }, [watch]);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['dealSummary', filters],
        queryFn: () => getDealSummary(filters),
    });

    const columns: GridColDef[] = [
        { field: Object.keys(data?.summary[0] || {})[0], headerName: 'Группа', flex: 1 },
        { field: 'Total Deals', headerName: 'Всего сделок', flex: 1 },
    ];

    const handleDownload = () => {
        downloadDealSummary(filters);
    };

    if (isLoading) return <CircularProgress />;
    if (isError) return <Alert severity="error">Ошибка загрузки сводки</Alert>;

    return (
        <Stack spacing={2}>
            <Grid container spacing={2}>
                <Grid item xs={12} sm={4} md={2.4}><KpiCard title="Бронь" value={data?.widgets.booking_count || 0} color="info.main" linkTo={{ tab: 0, filters: { status: 'BOOKING' } }} /></Grid>
                <Grid item xs={12} sm={4} md={2.4}><KpiCard title="В работе" value={data?.widgets.in_progress_count || 0} color="primary.main" linkTo={{ tab: 0, filters: { status: 'IN_PROGRESS' } }}/></Grid>
                <Grid item xs={12} sm={4} md={2.4}><KpiCard title="Завершенные" value={data?.widgets.closed_won_count || 0} color="success.main" linkTo={{ tab: 0, filters: { status: 'CLOSED_WON' } }}/></Grid>
                <Grid item xs={12} sm={6} md={2.4}><KpiCard title="Расторгнутые" value={data?.widgets.terminated_count || 0} color="warning.main" linkTo={{ tab: 0, filters: { status: 'TERMINATED' } }}/></Grid>
                <Grid item xs={12} sm={6} md={2.4}><KpiCard title="Отмененные" value={data?.widgets.cancelled_count || 0} color="error.main" linkTo={{ tab: 0, filters: { status: 'CANCELLED' } }}/></Grid>
            </Grid>

            <Paper sx={{ p: 2 }}>
                <Grid container spacing={2} alignItems="center">
                     <Grid item xs={12} sm={4}>
                        <Controller
                            name="group_by"
                            control={control}
                            render={({ field }) => (
                                <FormControl size="small" fullWidth>
                                    <InputLabel>Группировать по</InputLabel>
                                    <Select {...field} label="Группировать по">
                                        <MenuItem value="created_by">Менеджеру</MenuItem>
                                        <MenuItem value="project">Проекту</MenuItem>
                                        <MenuItem value="status">Статусу</MenuItem>
                                    </Select>
                                </FormControl>
                            )}
                        />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Controller name="created_at_after" control={control} render={({ field }) => (
                            <TextField {...field} label="Дата создания от" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} />
                        )}/>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Controller name="created_at_before" control={control} render={({ field }) => (
                            <TextField {...field} label="Дата создания до" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} />
                        )}/>
                    </Grid>
                     <Grid item xs={12} sm={2}>
                        <Button variant="contained" onClick={handleDownload} fullWidth>
                            Выгрузить в Excel
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            <Box sx={{ height: 500, width: '100%' }}>
                <DataGrid
                    rows={data?.summary.map((row, index) => ({ id: index, ...row })) || []}
                    columns={columns}
                />
            </Box>
        </Stack>
    );
}