import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getMeetingSummary, downloadMeetingSummary, type MeetingSummaryFilters } from '../../api/meetings';
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
    CardContent
} from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../common/LocalizedDataGrid';
import LocalizedDateField from '../common/LocalizedDateField';
import { useForm, Controller } from 'react-hook-form';

type GroupBy = 'executor' | 'project' | 'status';

const KpiCard = ({ title, value, color = 'text.primary', linkTo, isLoading, subtitle }: { title: string; value: number; color?: string, linkTo?: object, isLoading: boolean, subtitle?: string }) => (
    <Card sx={{ height: '100%', textDecoration: 'none' }} component={RouterLink} to="/meetings" state={linkTo}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
            <Typography color="text.secondary">{title}</Typography>
            <Typography variant="h3" component="div" color={color}>
                {isLoading ? <CircularProgress size={40} /> : value}
            </Typography>
            {subtitle && (
                <Typography color="text.secondary" variant="body2">
                    {subtitle}
                </Typography>
            )}
        </CardContent>
    </Card>
);

export default function MeetingSummary() {
    const { t } = useTranslation();
    const [filters, setFilters] = useState<MeetingSummaryFilters>({ group_by: 'executor' });
    const { control, watch } = useForm<MeetingSummaryFilters>({
        defaultValues: {
            group_by: 'executor',
            planned_date_after: '',
            planned_date_before: '',
            actual_date_after: '',
            actual_date_before: ''
        }
    });

    useEffect(() => {
        const subscription = watch((value) => {
            const timer = setTimeout(() => {
                const cleanedFilters = Object.fromEntries(
                    Object.entries(value).filter(([_, v]) => v !== '' && v !== null)
                );
                setFilters(cleanedFilters as MeetingSummaryFilters);
            }, 300);
            return () => clearTimeout(timer);
        });
        return () => subscription.unsubscribe();
    }, [watch]);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['meetingSummary', filters],
        queryFn: () => getMeetingSummary(filters),
    });

    const groupBy = filters.group_by;

    const getGroupByHeaderName = () => {
        switch (groupBy) {
            case 'executor': return t('pages.meetings.executor');
            case 'project': return t('pages.meetings.project');
            case 'status': return t('pages.meetings.status');
            default: return groupBy;
        }
    };

    const columns: GridColDef[] = [
        { field: groupBy === 'executor' ? 'Executor' : (groupBy === 'project' ? 'Project' : 'Status'), headerName: getGroupByHeaderName(), flex: 1 },
        { field: 'Total Meetings', headerName: t('pages.meetings.total_meetings'), flex: 1 },
        { field: 'New Meetings', headerName: t('pages.meetings.new_meetings'), flex: 1, hide: groupBy === 'status' },
        { field: 'Completed Meetings', headerName: t('pages.meetings.completed_meetings'), flex: 1, hide: groupBy === 'status' },
        { field: 'Cancelled Meetings', headerName: t('pages.meetings.cancelled_meetings'), flex: 1, hide: groupBy === 'status' },
    ];

    const handleDownload = () => {
        downloadMeetingSummary(filters);
    };

    return (
        <Stack spacing={2}>
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 9 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>{t('pages.meetings.filters')}</Typography>
                        <Grid container spacing={2} alignItems="center">
                             <Grid size={{ xs: 12, sm: 4 }}>
                                <Controller
                                    name="group_by"
                                    control={control}
                                    render={({ field }) => (
                                        <FormControl size="small" fullWidth>
                                            <InputLabel>{t('pages.meetings.group_by')}</InputLabel>
                                            <Select {...field} label={t('pages.meetings.group_by')}>
                                                <MenuItem value="executor">{t('pages.meetings.group_by_executor')}</MenuItem>
                                                <MenuItem value="project">{t('pages.meetings.group_by_project')}</MenuItem>
                                                <MenuItem value="status">{t('pages.meetings.group_by_status')}</MenuItem>
                                            </Select>
                                        </FormControl>
                                    )}
                                />
                            </Grid>
                            <Grid size={{ xs: 6, sm: 4 }}>
                                <Controller name="planned_date_after" control={control} render={({ field }) => (
                                    <LocalizedDateField
                                        label={t('pages.meetings.plan_from')}
                                        value={field.value || null}
                                        onChange={(date) => field.onChange(date || '')}
                                        size="small"
                                        fullWidth
                                    />
                                )}/>
                            </Grid>
                            <Grid size={{ xs: 6, sm: 4 }}>
                                <Controller name="planned_date_before" control={control} render={({ field }) => (
                                    <LocalizedDateField
                                        label={t('pages.meetings.plan_to')}
                                        value={field.value || null}
                                        onChange={(date) => field.onChange(date || '')}
                                        size="small"
                                        fullWidth
                                    />
                                )}/>
                            </Grid>
                            <Grid size={{ xs: 6, sm: 4 }}>
                                <Controller name="actual_date_after" control={control} render={({ field }) => (
                                    <LocalizedDateField
                                        label={t('pages.meetings.actual_from')}
                                        value={field.value || null}
                                        onChange={(date) => field.onChange(date || '')}
                                        size="small"
                                        fullWidth
                                    />
                                )}/>
                            </Grid>
                             <Grid size={{ xs: 6, sm: 4 }}>
                                <Controller name="actual_date_before" control={control} render={({ field }) => (
                                    <LocalizedDateField
                                        label={t('pages.meetings.actual_to')}
                                        value={field.value || null}
                                        onChange={(date) => field.onChange(date || '')}
                                        size="small"
                                        fullWidth
                                    />
                                )}/>
                            </Grid>
                             <Grid size={{ xs: 12, sm: 4 }}>
                                <Button variant="contained" onClick={handleDownload} fullWidth>
                                    {t('pages.meetings.export_excel')}
                                </Button>
                            </Grid>
                        </Grid>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                     <KpiCard
                        title={t('pages.meetings.overdue_meetings')}
                        value={data?.overdue_count || 0}
                        color="error.main"
                        isLoading={isLoading}
                        subtitle={t('pages.meetings.according_filters')}
                        linkTo={{
                            tab: 0,
                            filters: {
                                status: 'NEW',
                                planned_date_before: new Date().toISOString().split('T')[0]
                            }
                        }}
                     />
                </Grid>
            </Grid>

            {isError ? <Alert severity="error">{t('errors.load_summary_error')}</Alert> :
            <Box sx={{ height: 500, width: '100%' }}>
                <LocalizedDataGrid
                    loading={isLoading}
                    rows={data?.summary.map((row, index) => ({ id: index, ...row })) || []}
                    columns={columns.filter(c => !(groupBy === 'status' && ['New Meetings', 'Completed Meetings', 'Cancelled Meetings'].includes(c.field)))}
                />
            </Box>
            }
        </Stack>
    );
}

