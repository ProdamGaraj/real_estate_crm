import { useState, useMemo, useRef, Fragment } from 'react';
import { Box, Typography, Paper, Grid, FormControl, InputLabel, Select, MenuItem, Button, Stack, CircularProgress, Alert, TableContainer, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getEmployeePlanFactReport, downloadEmployeePlanTemplate, uploadEmployeePlan, type ReportFilters } from '../../api/reports';
import { useIsMobile } from '../../hooks/useMobile';
import { extractApiError } from '../../utils/apiError';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

export default function EmployeeReport() {
    const { t } = useTranslation();
    const isMobile = useIsMobile();
    const [filters, setFilters] = useState<ReportFilters | null>(null);
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const periods = useMemo(() => [
        { value: 'month', label: t('pages.reports.month') },
        { value: 'quarter', label: t('pages.reports.quarter') },
        { value: 'half_year', label: t('pages.reports.half_year') },
        { value: 'year', label: t('pages.reports.year') },
    ], [t]);

    const months = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ 
        value: i + 1, 
        label: t(`months.${i + 1}`)
    })), [t]);

    const quarters = [{ value: 1, label: 'Q1' }, { value: 2, label: 'Q2' }, { value: 3, label: 'Q3' }, { value: 4, label: 'Q4' }];
    const halfYears = useMemo(() => [
        { value: 1, label: t('pages.reports.h1') }, 
        { value: 2, label: t('pages.reports.h2') }
    ], [t]);

    const { control, handleSubmit, watch } = useForm<ReportFilters>({
        defaultValues: {
            year: currentYear,
            period_type: 'month',
            period_value: new Date().getMonth() + 1,
        }
    });

    const periodType = watch('period_type');

    const periodValues = useMemo(() => {
        switch (periodType) {
            case 'quarter': return quarters;
            case 'half_year': return halfYears;
            case 'year': return [{ value: 1, label: `${watch('year')}` }];
            default: return months;
        }
    }, [periodType, watch, halfYears, months]);


    const { data: reportData, isLoading: isLoadingReport, isError, error } = useQuery({
        queryKey: ['employeePlanFactReport', filters],
        queryFn: () => getEmployeePlanFactReport(filters!),
        enabled: !!filters,
    });

    const uploadMutation = useMutation({
        mutationFn: uploadEmployeePlan,
        onSuccess: (data) => {
            alert(data.status);
            queryClient.invalidateQueries({ queryKey: ['employeePlanFactReport'] });
        },
        onError: (err: unknown) => alert(extractApiError(err, t('pages.reports.upload_error'))),
    });

    const onGenerateReport = (data: ReportFilters) => {
        setFilters(data);
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const formData = new FormData();
            formData.append('file', file);
            uploadMutation.mutate(formData);
        }
    };

    const separatorStyle = { borderRight: '1px solid var(--color-border-default)' };
    
    // Sticky first column style for mobile horizontal scroll
    const stickyColumnStyle = isMobile ? {
        position: 'sticky' as const,
        left: 0,
        background: 'var(--color-background-paper, #fff)',
        zIndex: 1,
        minWidth: 120,
    } : {};

    return (
        <Stack spacing={isMobile ? 2 : 3}>
            <Paper sx={{p: isMobile ? 1.5 : 2}}>
                <form onSubmit={handleSubmit(onGenerateReport)}>
                    <Grid container spacing={isMobile ? 1 : 2} alignItems="center">
                        <Grid size={{ xs: 6, sm: 4 }}>
                            <Controller name="year" control={control} render={({ field }) => (
                                <FormControl fullWidth size="small">
                                    <InputLabel>{t('pages.reports.year')}</InputLabel>
                                    <Select {...field} label={t('pages.reports.year')}>
                                        {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            )} />
                        </Grid>
                        <Grid size={{ xs: 6, sm: 3 }}>
                            <Controller name="period_type" control={control} render={({ field }) => (
                                <FormControl fullWidth size="small">
                                    <InputLabel>{t('pages.reports.period')}</InputLabel>
                                    <Select {...field} label={t('pages.reports.period')}>
                                        {periods.map(p => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            )} />
                        </Grid>
                        <Grid size={{ xs: 6, sm: 3 }}>
                           <Controller name="period_value" control={control} render={({ field }) => (
                                <FormControl fullWidth size="small" disabled={periodType === 'year'}>
                                    <InputLabel>{t('pages.reports.period_value')}</InputLabel>
                                    <Select {...field} label={t('pages.reports.period_value')}>
                                        {periodValues.map(v => <MenuItem key={v.value} value={v.value}>{v.label}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            )} />
                        </Grid>
                        <Grid size={{ xs: 6, sm: 2 }}>
                            <Button type="submit" variant="contained" fullWidth size={isMobile ? 'small' : 'medium'}>{t('pages.reports.generate')}</Button>
                        </Grid>
                    </Grid>
                </form>
            </Paper>

            <Stack direction={isMobile ? 'column' : 'row'} spacing={isMobile ? 1 : 2}>
                <Button onClick={downloadEmployeePlanTemplate} variant="outlined" size={isMobile ? 'small' : 'medium'} fullWidth={isMobile}>{t('pages.reports.download_template')}</Button>
                <Button
                    variant="outlined"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadMutation.isPending}
                    size={isMobile ? 'small' : 'medium'}
                    fullWidth={isMobile}
                >
                    {uploadMutation.isPending ? t('pages.reports.uploading') : t('pages.reports.upload_plan')}
                </Button>
                <input type="file" ref={fileInputRef} hidden accept=".xlsx, .xls" onChange={handleFileUpload} />
            </Stack>

            {isLoadingReport && <CircularProgress />}
            {isError && <Alert severity="error">{(error as Error).message}</Alert>}
            {reportData && (
                <TableContainer component={Paper} sx={{ maxWidth: '100%', overflowX: 'auto' }}>
                    <Table stickyHeader size={isMobile ? 'small' : 'medium'}>
                        <TableHead>
                            <TableRow>
                                <TableCell rowSpan={2} sx={{...separatorStyle, ...stickyColumnStyle, verticalAlign: 'bottom'}}>{t('pages.reports.employee_column')}</TableCell>
                                <TableCell align="center" colSpan={4} sx={separatorStyle}>{t('pages.reports.quantity_pcs')}</TableCell>
                                <TableCell align="center" colSpan={4} sx={separatorStyle}>{t('pages.reports.contracting')}</TableCell>
                                <TableCell align="center" colSpan={4}>{t('pages.reports.revenue')}</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell align="right">{t('pages.reports.plan')}</TableCell>
                                <TableCell align="right">{t('pages.reports.fact')}</TableCell>
                                <TableCell align="right">{t('pages.reports.fact_percent')}</TableCell>
                                <TableCell align="right" sx={separatorStyle}>{t('pages.reports.forecast_percent')}</TableCell>
                                <TableCell align="right">{t('pages.reports.plan')}</TableCell>
                                <TableCell align="right">{t('pages.reports.fact')}</TableCell>
                                <TableCell align="right">{t('pages.reports.fact_percent')}</TableCell>
                                <TableCell align="right" sx={separatorStyle}>{t('pages.reports.forecast_percent')}</TableCell>
                                <TableCell align="right">{t('pages.reports.plan')}</TableCell>
                                <TableCell align="right">{t('pages.reports.fact')}</TableCell>
                                <TableCell align="right">{t('pages.reports.fact_percent')}</TableCell>
                                <TableCell align="right">{t('pages.reports.forecast_percent')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {reportData.map((employee) => (
                                <TableRow key={employee.employee_id} sx={{ '&:last-child td, &:last-child th': { border: 0 }, ...(employee.employee_id === 'total' && {backgroundColor: 'var(--color-background-total)'}) }}>
                                    <TableCell component="th" scope="row" sx={{...separatorStyle, ...stickyColumnStyle, ...(employee.employee_id === 'total' && {backgroundColor: 'var(--color-background-total)'})}}>
                                        <Typography variant={isMobile ? 'body2' : 'body1'} sx={{fontWeight: employee.employee_id === 'total' ? 'bold' : 'normal'}}>
                                            {employee.employee_name}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">{employee.contracting_units.plan.toLocaleString()}</TableCell>
                                    <TableCell align="right">{employee.contracting_units.fact.toLocaleString()}</TableCell>
                                    <TableCell align="right">{employee.contracting_units.percentage}%</TableCell>
                                    <TableCell align="right" sx={separatorStyle}>{employee.contracting_units.forecast.toLocaleString()} ({employee.contracting_units.forecast_percentage}%)</TableCell>
                                    <TableCell align="right">{employee.contracting_money.plan.toLocaleString()}</TableCell>
                                    <TableCell align="right">{employee.contracting_money.fact.toLocaleString()}</TableCell>
                                    <TableCell align="right">{employee.contracting_money.percentage}%</TableCell>
                                    <TableCell align="right" sx={separatorStyle}>{employee.contracting_money.forecast.toLocaleString()} ({employee.contracting_money.forecast_percentage}%)</TableCell>
                                    <TableCell align="right">{employee.revenue_money.plan.toLocaleString()}</TableCell>
                                    <TableCell align="right">{employee.revenue_money.fact.toLocaleString()}</TableCell>
                                    <TableCell align="right">{employee.revenue_money.percentage}%</TableCell>
                                    <TableCell align="right">{employee.revenue_money.forecast.toLocaleString()} ({employee.revenue_money.forecast_percentage}%)</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Stack>
    );
}