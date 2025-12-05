import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApplicationSummary, downloadApplicationSummary, type ApplicationSummaryFilters } from '../../api/applications';
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
    TextField,
    Paper,
    Card,
    CardContent
} from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../common/LocalizedDataGrid';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import LocalizedDateField from '../common/LocalizedDateField';

type GroupBy = 'created_by' | 'status' | 'project' | 'source';

const KpiCard = ({ title, value, color = 'text.primary', linkTo }: { title: string; value: number; color?: string, linkTo?: object }) => (
    <Card sx={{ height: '100%', textDecoration: 'none' }} component={RouterLink} to="/applications" state={linkTo}>
        <CardContent sx={{ textAlign: 'center' }}>
            <Typography color="text.secondary">{title}</Typography>
            <Typography variant="h3" component="div" color={color}>
                {value}
            </Typography>
        </CardContent>
    </Card>
);

export default function ApplicationSummary() {
    const { t } = useTranslation();
    const [filters, setFilters] = useState<ApplicationSummaryFilters>({ group_by: 'created_by', days_since_update: 7 });

    const { control, watch } = useForm<ApplicationSummaryFilters>({
        defaultValues: filters
    });

    useEffect(() => {
        const subscription = watch((value) => {
            const timer = setTimeout(() => {
                const cleanedFilters = Object.fromEntries(
                    Object.entries(value).filter(([_, v]) => v !== '' && v !== null)
                );
                setFilters(cleanedFilters as ApplicationSummaryFilters);
            }, 500);
            return () => clearTimeout(timer);
        });
        return () => subscription.unsubscribe();
    }, [watch]);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['applicationSummary', filters],
        queryFn: () => getApplicationSummary(filters),
    });

    const handleDownload = () => {
        downloadApplicationSummary(filters);
    };

    const columns: GridColDef[] = useMemo(() => [
        { field: Object.keys(data?.summary[0] || {})[0], headerName: t('pages.applications.summary_group'), flex: 1 },
        { field: 'Total Applications', headerName: t('pages.applications.total_applications'), flex: 1 },
    ], [data, t]);

    if (isLoading) return <CircularProgress />;
    if (isError) return <Alert severity="error">{t('errors.load_summary_error')}</Alert>;

    const forgotten_date = new Date();
    forgotten_date.setDate(forgotten_date.getDate() - (filters.days_since_update || 7));


    return (
        <Stack spacing={2}>
            <Grid container spacing={2}>
                <Grid item xs={12} md={9}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>{t('common.filters')}</Typography>
                        <Grid container spacing={2} alignItems="center">
                             <Grid item xs={12} sm={4}>
                                <Controller
                                    name="group_by"
                                    control={control}
                                    render={({ field }) => (
                                        <FormControl size="small" fullWidth>
                                            <InputLabel>{t('pages.finances.group_by')}</InputLabel>
                                            <Select {...field} label={t('pages.finances.group_by')}>
                                                <MenuItem value="created_by">{t('pages.applications.by_user')}</MenuItem>
                                                <MenuItem value="status">{t('pages.finances.by_status')}</MenuItem>
                                                <MenuItem value="project">{t('pages.finances.by_project')}</MenuItem>
                                                <MenuItem value="source">{t('pages.applications.by_source')}</MenuItem>
                                            </Select>
                                        </FormControl>
                                    )}
                                />
                            </Grid>
                            <Grid item xs={6} sm={4}>
                                <Controller name="created_at_after" control={control} render={({ field }) => (
                                    <LocalizedDateField {...field} label={t('pages.applications.created_from')} size="small" fullWidth />
                                )}/>
                            </Grid>
                            <Grid item xs={6} sm={4}>
                                <Controller name="created_at_before" control={control} render={({ field }) => (
                                    <LocalizedDateField {...field} label={t('pages.applications.created_to')} size="small" fullWidth />
                                )}/>
                            </Grid>
                             <Grid item xs={12} sm={4}>
                                <Button variant="contained" onClick={handleDownload} fullWidth>
                                    {t('pages.finances.export_excel')}
                                </Button>
                            </Grid>
                        </Grid>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                     <KpiCard
                        title={t('pages.applications.forgotten_applications')}
                        value={data?.forgotten_count || 0}
                        color="error.main"
                        linkTo={{ tab: 0, filters: { updated_at_before: forgotten_date.toISOString().split('T')[0] } }}
                     >
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                            <Typography color="text.secondary" variant="body2">
                                {t('pages.applications.not_updated_more_than')}
                            </Typography>
                            <Controller
                                name="days_since_update"
                                control={control}
                                render={({field}) => (
                                    <TextField
                                        {...field}
                                        type="number"
                                        size="small"
                                        sx={{width: '60px'}}
                                    />
                                )}
                            />
                            <Typography color="text.secondary" variant="body2">
                                {t('pages.applications.days')})
                            </Typography>
                        </Stack>
                     </KpiCard>
                </Grid>
            </Grid>

            <Box sx={{ height: 500, width: '100%' }}>
                <LocalizedDataGrid
                    rows={data?.summary.map((row, index) => ({ id: index, ...row })) || []}
                    columns={columns}
                />
            </Box>
        </Stack>
    );
}