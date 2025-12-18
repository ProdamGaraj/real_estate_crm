import { useState, useEffect } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Chip, Link as MuiLink,
    Paper, Grid, TextField, FormControl, InputLabel, Select, MenuItem, Autocomplete, Stack, Tabs, Tab
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { translateMeetingStatus } from '../utils/translations';
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../components/common/LocalizedDataGrid';
import LocalizedDateField from '../components/common/LocalizedDateField';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMeetings, type Meeting, type MeetingFilters } from '../api/meetings';
import MeetingDetailModal from '../components/meetings/MeetingDetailModal';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { getUsers, type User } from '../api/users';
import MeetingSummary from '../components/meetings/MeetingSummary'; // Import the new component

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

export default function MeetingsPage() {
    const { t } = useTranslation();
    const location = useLocation();
    const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
    const [tabValue, setTabValue] = useState(location.state?.tab || 0);
    const [filters, setFilters] = useState<MeetingFilters>(location.state?.filters || {});
    const queryClient = useQueryClient();
    const { control, watch, reset } = useForm<MeetingFilters>({
        defaultValues: filters,
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
            const timer = setTimeout(() => setFilters(value), 300);
            return () => clearTimeout(timer);
        });
        return () => subscription.unsubscribe();
    }, [watch]);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['meetings', filters],
        queryFn: () => getMeetings(filters),
    });

    const sortedMeetings = [...(data || [])].sort((a, b) => {
        const aNeedsResult = a.is_auto_created && !a.result_comment;
        const bNeedsResult = b.is_auto_created && !b.result_comment;
        if (aNeedsResult && !bNeedsResult) return -1;
        if (!aNeedsResult && bNeedsResult) return 1;
        return new Date(b.planned_date).getTime() - new Date(a.planned_date).getTime();
    });

    const columns: GridColDef<Meeting>[] = [
        { field: 'id', headerName: t('table.id'), width: 80 },
        {
            field: 'client', headerName: t('table.client'), width: 220,
            renderCell: (params) => (
                <MuiLink component={RouterLink} to={`/clients/${params.row.client.id}`} underline="hover">
                    {params.row.client.full_name}
                </MuiLink>
            )
        },
        {
            field: 'status',
            headerName: t('forms.status'),
            width: 180,
            renderCell: (params) => {
                const needsResult = params.row.is_auto_created && !params.row.result_comment;
                let label = translateMeetingStatus(params.row.status);
                let color: "default" | "success" | "warning" | "error" | "info" = "default";

                if (needsResult) {
                    label = t('pages.meetings.needs_result');
                    color = "info";
                } else if (params.row.is_overdue) {
                    label = t('pages.meetings.overdue');
                    color = 'error';
                } else if (params.value === 'COMPLETED') {
                    color = 'success';
                } else if (params.value === 'CANCELLED') {
                    color = 'warning';
                }
                return <Chip label={label} color={color} size="small" variant={needsResult ? "outlined" : "filled"} />;
            },
        },
        { field: 'planned_date', headerName: t('pages.meetings.planned_date'), width: 180, type: 'dateTime', valueGetter: (value) => new Date(value) },
        { field: 'executor', headerName: t('pages.meetings.executor'), width: 150 },
        { field: 'creator', headerName: t('pages.meetings.creator'), width: 150, valueGetter: (value) => value || t('common.system') },
    ];

    if (isLoading) return <CircularProgress />;
    if (isError) return <Alert severity="error">{t('errors.load_meetings_error')}</Alert>;

    return (
        <Stack spacing={3}>
            <Typography variant="h4">{t('pages.meetings.title')}</Typography>

            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={tabValue} onChange={(_e, newValue) => setTabValue(newValue)}>
                    <Tab label={t('pages.meetings.meeting_list')} />
                    <Tab label={t('pages.meetings.summary_table')} />
                </Tabs>
            </Box>

            <TabPanel value={tabValue} index={0}>
                <Stack spacing={2}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>{t('common.filters')}</Typography>
                        <Grid container spacing={2} alignItems="center">
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Controller name="client_name" control={control} render={({ field }) => (
                                        <TextField {...field} onChange={field.onChange} value={field.value || ''} label={t('pages.meetings.search_by_client')} fullWidth size="small" />
                                    )}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <Controller name="executor_id" control={control} render={({ field }) => (
                                        <Autocomplete
                                            options={users || []}
                                            loading={isLoadingUsers}
                                            getOptionLabel={(option) => `${option.first_name} ${option.last_name}`.trim() || option.username}
                                            onChange={(_, data) => field.onChange(data?.id || null)}
                                            renderInput={(params) => <TextField {...params} label={t('pages.meetings.executor')} size="small" />}
                                        />
                                    )}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                                <Controller name="status" control={control} render={({ field }) => (
                                    <FormControl fullWidth size="small">
                                      <InputLabel>{t('forms.status')}</InputLabel>
                                      <Select {...field} value={field.value || ''} label={t('forms.status')}>
                                        <MenuItem value=""><em>{t('common.all')}</em></MenuItem>
                                        <MenuItem value="NEW">{t('statuses.meeting.new')}</MenuItem>
                                        <MenuItem value="COMPLETED">{t('statuses.meeting.completed')}</MenuItem>
                                        <MenuItem value="CANCELLED">{t('statuses.meeting.cancelled')}</MenuItem>
                                      </Select>
                                    </FormControl>
                                  )}
                                />
                            </Grid>
                            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
                                <Controller name="planned_date_after" control={control} render={({ field }) => (
                                    <LocalizedDateField
                                        label={t('pages.meetings.plan_from')}
                                        value={field.value || null}
                                        onChange={(date) => field.onChange(date || '')}
                                        size="small"
                                        fullWidth
                                    />
                                )} />
                            </Grid>
                            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
                                <Controller name="planned_date_before" control={control} render={({ field }) => (
                                    <LocalizedDateField
                                        label={t('pages.meetings.plan_to')}
                                        value={field.value || null}
                                        onChange={(date) => field.onChange(date || '')}
                                        size="small"
                                        fullWidth
                                    />
                                )} />
                            </Grid>
                        </Grid>
                    </Paper>

                    <Box sx={{ height: 600, width: '100%' }}>
                        <LocalizedDataGrid
                            rows={sortedMeetings}
                            columns={columns}
                            onRowClick={(params) => setSelectedMeeting(params.row)}
                        />
                    </Box>
                </Stack>
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
                <MeetingSummary />
            </TabPanel>


            <MeetingDetailModal
                meeting={selectedMeeting}
                open={!!selectedMeeting}
                onClose={() => setSelectedMeeting(null)}
                onUpdate={() => queryClient.invalidateQueries({ queryKey: ['meetings'] })}
            />
        </Stack>
    );
}

