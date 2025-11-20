import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFinanceSummary, downloadFinanceSummary, type FinanceSummaryFilters } from '../../api/finances';
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
    TextField,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useForm, Controller } from 'react-hook-form';

type GroupBy = 'status' | 'project' | 'manager';

const KpiCard = ({ title, value, color = 'text.primary', linkTo }: { title: string; value: number; color?: string, linkTo?: object }) => (
    <Card sx={{ height: '100%', textDecoration: 'none' }} component={RouterLink} to="/finances" state={linkTo}>
        <CardContent sx={{ textAlign: 'center' }}>
            <Typography color="text.secondary">{title}</Typography>
            <Typography variant="h4" component="div" color={color}>
                {value.toLocaleString()}
            </Typography>
        </CardContent>
    </Card>
);

export default function FinanceSummary() {
    const [filters, setFilters] = useState<FinanceSummaryFilters>({ group_by: 'status' });

    const { control, watch } = useForm<FinanceSummaryFilters>({
        defaultValues: {
            group_by: 'status',
            due_date_after: '',
            due_date_before: '',
            payment_date_after: '',
            payment_date_before: ''
        }
    });

    useEffect(() => {
        const subscription = watch((value) => {
            const timer = setTimeout(() => {
                const cleanedFilters = Object.fromEntries(
                    Object.entries(value).filter(([_, v]) => v !== '' && v !== null)
                );
                setFilters(cleanedFilters as FinanceSummaryFilters);
            }, 500);
            return () => clearTimeout(timer);
        });
        return () => subscription.unsubscribe();
    }, [watch]);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['financeSummary', filters],
        queryFn: () => getFinanceSummary(filters),
    });

    const columns: GridColDef[] = [
        { field: Object.keys(data?.summary[0] || {})[0], headerName: 'Группа', flex: 1 },
        { field: 'Total Amount', headerName: 'Общая сумма', flex: 1, valueFormatter: (value: number) => value ? value.toLocaleString() : '0' },
    ];

    const handleDownload = () => {
        downloadFinanceSummary(filters);
    };

    if (isLoading) return <CircularProgress />;
    if (isError) return <Alert severity="error">Ошибка загрузки сводки</Alert>;

    return (
        <Stack spacing={2}>
            <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                    <KpiCard
                        title="Просроченные платежи"
                        value={data?.widgets.overdue_sum || 0}
                        color="error.main"
                        linkTo={{ tab: 0, filters: { status: 'OVERDUE' } }}
                    />
                </Grid>
                <Grid item xs={12} md={6}>
                    <KpiCard
                        title="Оплаченные платежи"
                        value={data?.widgets.paid_sum || 0}
                        color="success.main"
                        linkTo={{ tab: 0, filters: { status: 'PAID' } }}
                    />
                </Grid>
            </Grid>

            <Paper sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>Фильтры</Typography>
                <Grid container spacing={2} alignItems="center">
                     <Grid item xs={12} sm={6}>
                        <Controller
                            name="group_by"
                            control={control}
                            render={({ field }) => (
                                <FormControl size="small" fullWidth>
                                    <InputLabel>Группировать по</InputLabel>
                                    <Select {...field} label="Группировать по">
                                        <MenuItem value="status">Статусу</MenuItem>
                                        <MenuItem value="project">Проекту</MenuItem>
                                        <MenuItem value="manager">Менеджеру</MenuItem>
                                    </Select>
                                </FormControl>
                            )}
                        />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Controller name="due_date_after" control={control} render={({ field }) => (
                            <TextField {...field} label="К оплате от" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} />
                        )}/>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Controller name="due_date_before" control={control} render={({ field }) => (
                            <TextField {...field} label="К оплате до" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} />
                        )}/>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Controller name="payment_date_after" control={control} render={({ field }) => (
                            <TextField {...field} label="Факт оплаты от" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} />
                        )}/>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Controller name="payment_date_before" control={control} render={({ field }) => (
                            <TextField {...field} label="Факт оплаты до" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} />
                        )}/>
                    </Grid>
                     <Grid item xs={12} sm={6}>
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