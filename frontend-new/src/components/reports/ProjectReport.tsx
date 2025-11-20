import { useState, useMemo, useRef, Fragment } from 'react';
import { Box, Typography, Paper, Grid, FormControl, InputLabel, Select, MenuItem, Button, Stack, CircularProgress, Alert, TableContainer, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlanFactReport, downloadPlanTemplate, uploadPlan, type ReportFilters } from '../../api/reports';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

const periods = [
    { value: 'month', label: 'Месяц' },
    { value: 'quarter', label: 'Квартал' },
    { value: 'half_year', label: 'Полугодие' },
    { value: 'year', label: 'Год' },
];

const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(0, i).toLocaleString('ru', { month: 'long' }) }));
const quarters = [{ value: 1, label: 'Q1' }, { value: 2, label: 'Q2' }, { value: 3, label: 'Q3' }, { value: 4, label: 'Q4' }];
const halfYears = [{ value: 1, label: '1-е полугодие' }, { value: 2, label: '2-е полугодие' }];

export default function ProjectReport() {
    const [filters, setFilters] = useState<ReportFilters | null>(null);
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

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
    }, [periodType, watch]);

    const { data: reportData, isLoading: isLoadingReport, isError, error } = useQuery({
        queryKey: ['planFactReport', filters],
        queryFn: () => getPlanFactReport(filters!),
        enabled: !!filters,
    });

    const uploadMutation = useMutation({
        mutationFn: uploadPlan,
        onSuccess: (data) => {
            alert(data.status);
            queryClient.invalidateQueries({ queryKey: ['planFactReport'] });
        },
        onError: (err) => alert(`Ошибка загрузки: ${err.message}`),
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

    return (
        <Stack spacing={3}>
            <Paper sx={{p: 2}}>
                <form onSubmit={handleSubmit(onGenerateReport)}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <Controller name="year" control={control} render={({ field }) => (
                                <FormControl fullWidth size="small">
                                    <InputLabel>Год</InputLabel>
                                    <Select {...field} label="Год">
                                        {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 3 }}>
                            <Controller name="period_type" control={control} render={({ field }) => (
                                <FormControl fullWidth size="small">
                                    <InputLabel>Период</InputLabel>
                                    <Select {...field} label="Период">
                                        {periods.map(p => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 3 }}>
                           <Controller name="period_value" control={control} render={({ field }) => (
                                <FormControl fullWidth size="small" disabled={periodType === 'year'}>
                                    <InputLabel>Значение</InputLabel>
                                    <Select {...field} label="Значение">
                                        {periodValues.map(v => <MenuItem key={v.value} value={v.value}>{v.label}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            )} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 2 }}>
                            <Button type="submit" variant="contained" fullWidth>Сформировать</Button>
                        </Grid>
                    </Grid>
                </form>
            </Paper>

            <Stack direction="row" spacing={2}>
                <Button onClick={downloadPlanTemplate} variant="outlined">Скачать шаблон</Button>
                <Button
                    variant="outlined"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadMutation.isPending}
                >
                    {uploadMutation.isPending ? 'Загрузка...' : 'Загрузить план'}
                </Button>
                <input type="file" ref={fileInputRef} hidden accept=".xlsx, .xls" onChange={handleFileUpload} />
            </Stack>

            {isLoadingReport && <CircularProgress />}
            {isError && <Alert severity="error">{(error as Error).message}</Alert>}
            {reportData && (
                <TableContainer component={Paper}>
                    <Table stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell rowSpan={2} sx={{...separatorStyle, verticalAlign: 'bottom'}}>Проекты</TableCell>
                                <TableCell align="center" colSpan={4} sx={separatorStyle}>Кол-во, шт.</TableCell>
                                <TableCell align="center" colSpan={4} sx={separatorStyle}>Контрактация</TableCell>
                                <TableCell align="center" colSpan={4}>Поступления</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell align="right">План</TableCell>
                                <TableCell align="right">Факт</TableCell>
                                <TableCell align="right">% факт</TableCell>
                                <TableCell align="right" sx={separatorStyle}>% прогноз</TableCell>
                                <TableCell align="right">План</TableCell>
                                <TableCell align="right">Факт</TableCell>
                                <TableCell align="right">% факт</TableCell>
                                <TableCell align="right" sx={separatorStyle}>% прогноз</TableCell>
                                <TableCell align="right">План</TableCell>
                                <TableCell align="right">Факт</TableCell>
                                <TableCell align="right">% факт</TableCell>
                                <TableCell align="right">% прогноз</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {reportData.map((project) => (
                                <TableRow key={project.project_id} sx={{ '&:last-child td, &:last-child th': { border: 0 }, ...(project.project_id === 'total' && {backgroundColor: 'var(--color-background-total)'}) }}>
                                    <TableCell component="th" scope="row" sx={separatorStyle}>
                                        <Typography sx={{fontWeight: project.project_id === 'total' ? 'bold' : 'normal'}}>
                                            {project.project_name}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">{project.contracting_units.plan.toLocaleString()}</TableCell>
                                    <TableCell align="right">{project.contracting_units.fact.toLocaleString()}</TableCell>
                                    <TableCell align="right">{project.contracting_units.percentage}%</TableCell>
                                    <TableCell align="right" sx={separatorStyle}>{project.contracting_units.forecast.toLocaleString()} ({project.contracting_units.forecast_percentage}%)</TableCell>
                                    <TableCell align="right">{project.contracting_money.plan.toLocaleString()}</TableCell>
                                    <TableCell align="right">{project.contracting_money.fact.toLocaleString()}</TableCell>
                                    <TableCell align="right">{project.contracting_money.percentage}%</TableCell>
                                    <TableCell align="right" sx={separatorStyle}>{project.contracting_money.forecast.toLocaleString()} ({project.contracting_money.forecast_percentage}%)</TableCell>
                                    <TableCell align="right">{project.revenue_money.plan.toLocaleString()}</TableCell>
                                    <TableCell align="right">{project.revenue_money.fact.toLocaleString()}</TableCell>
                                    <TableCell align="right">{project.revenue_money.percentage}%</TableCell>
                                    <TableCell align="right">{project.revenue_money.forecast.toLocaleString()} ({project.revenue_money.forecast_percentage}%)</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Stack>
    );
}