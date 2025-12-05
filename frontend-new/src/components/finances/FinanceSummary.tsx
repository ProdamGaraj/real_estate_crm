import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
} from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../common/LocalizedDataGrid';
import { useForm, Controller } from 'react-hook-form';
import { LocalizedDateField } from '../common/LocalizedDateField';

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
    const { t } = useTranslation();
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
        { field: Object.keys(data?.summary[0] || {})[0], headerName: t('pages.finances.summary_group'), flex: 1 },
        { field: 'Total Amount', headerName: t('pages.finances.total_amount'), flex: 1, valueFormatter: (value: number) => value ? value.toLocaleString() : '0' },
    ];

    const handleDownload = () => {
        downloadFinanceSummary(filters);
    };

    if (isLoading) return <CircularProgress />;
    if (isError) return <Alert severity="error">{t('errors.load_summary_error')}</Alert>;

    return (
        <Stack spacing={2}>
            <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                    <KpiCard
                        title={t('pages.finances.overdue_payments')}
                        value={data?.widgets.overdue_sum || 0}
                        color="error.main"
                        linkTo={{ tab: 0, filters: { status: 'OVERDUE' } }}
                    />
                </Grid>
                <Grid item xs={12} md={6}>
                    <KpiCard
                        title={t('pages.finances.paid_payments')}
                        value={data?.widgets.paid_sum || 0}
                        color="success.main"
                        linkTo={{ tab: 0, filters: { status: 'PAID' } }}
                    />
                </Grid>
            </Grid>

            <Paper sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>{t('common.filters')}</Typography>
                <Grid container spacing={2} alignItems="center">
                     <Grid item xs={12} sm={6}>
                        <Controller
                            name="group_by"
                            control={control}
                            render={({ field }) => (
                                <FormControl size="small" fullWidth>
                                    <InputLabel>{t('pages.finances.group_by')}</InputLabel>
                                    <Select {...field} label={t('pages.finances.group_by')}>
                                        <MenuItem value="status">{t('pages.finances.by_status')}</MenuItem>
                                        <MenuItem value="project">{t('pages.finances.by_project')}</MenuItem>
                                        <MenuItem value="manager">{t('pages.finances.by_manager')}</MenuItem>
                                    </Select>
                                </FormControl>
                            )}
                        />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Controller name="due_date_after" control={control} render={({ field }) => (
                            <LocalizedDateField
                                label={t('pages.finances.due_date_from')}
                                value={field.value || null}
                                onChange={field.onChange}
                            />
                        )}/>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Controller name="due_date_before" control={control} render={({ field }) => (
                            <LocalizedDateField
                                label={t('pages.finances.due_date_to')}
                                value={field.value || null}
                                onChange={field.onChange}
                            />
                        )}/>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Controller name="payment_date_after" control={control} render={({ field }) => (
                            <LocalizedDateField
                                label={t('pages.finances.payment_date_from')}
                                value={field.value || null}
                                onChange={field.onChange}
                            />
                        )}/>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Controller name="payment_date_before" control={control} render={({ field }) => (
                            <LocalizedDateField
                                label={t('pages.finances.payment_date_to')}
                                value={field.value || null}
                                onChange={field.onChange}
                            />
                        )}/>
                    </Grid>
                     <Grid item xs={12} sm={6}>
                        <Button variant="contained" onClick={handleDownload} fullWidth>
                            {t('pages.finances.export_excel')}
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            <Box sx={{ height: 500, width: '100%' }}>
                <LocalizedDataGrid
                    rows={data?.summary.map((row, index) => ({ id: index, ...row })) || []}
                    columns={columns}
                />
            </Box>
        </Stack>
    );
}