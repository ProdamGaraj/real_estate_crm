import { useState, useEffect } from 'react';
import {
    Box, Typography, Chip, Link as MuiLink,
    Paper, Grid, TextField, FormControl, InputLabel, Select, MenuItem, 
    Autocomplete, Stack, Tabs, Tab, IconButton, Collapse
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useTranslation } from 'react-i18next';
import { translateMeetingStatus } from '../utils/translations';
import type { GridColDef } from '@mui/x-data-grid';
import ResponsiveDataView from '../components/common/ResponsiveDataView';
import type { MobileCardField } from '../components/common/MobileCardList';
import LocalizedDateField from '../components/common/LocalizedDateField';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMeetings, type Meeting, type MeetingFilters } from '../api/meetings';
import MeetingDetailModal from '../components/meetings/MeetingDetailModal';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { getUsers, type User } from '../api/users';
import MeetingSummary from '../components/meetings/MeetingSummary';
import { useIsMobile } from '../hooks/useMobile';

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
    isMobile?: boolean;
}

function TabPanel(props: TabPanelProps) {
    const { children, value, index, isMobile = false, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: isMobile ? 1 : 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

export default function MeetingsPage() {
    const { t } = useTranslation();
    const location = useLocation();
    const isMobile = useIsMobile();
    const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
    const [tabValue, setTabValue] = useState(location.state?.tab || 0);
    const [filters, setFilters] = useState<MeetingFilters>(location.state?.filters || {});
    const [filtersExpanded, setFiltersExpanded] = useState(!isMobile);
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

    // Mobile card fields
    const mobileFields: MobileCardField<Meeting>[] = [
        {
            key: 'client.full_name',
            label: 'table.client',
            primary: true,
        },
        {
            key: 'planned_date',
            label: 'pages.meetings.planned_date',
            secondary: true,
            render: (value: string) => new Date(value).toLocaleString(),
        },
        {
            key: 'status',
            label: 'forms.status',
            chip: true,
            chipColor: (value: string) => {
                switch (value) {
                    case 'COMPLETED': return 'success';
                    case 'CANCELLED': return 'warning';
                    default: return 'default';
                }
            },
            render: (value: string) => translateMeetingStatus(value),
        },
        {
            key: 'executor',
            label: 'pages.meetings.executor',
        },
    ];

    const handleMeetingClick = (meeting: Meeting) => {
        setSelectedMeeting(meeting);
    };

    return (
        <Stack spacing={isMobile ? 2 : 3}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant={isMobile ? 'h5' : 'h4'}>{t('pages.meetings.title')}</Typography>
                {isMobile && (
                    <IconButton onClick={() => setFiltersExpanded(!filtersExpanded)} color="primary">
                        <FilterListIcon />
                    </IconButton>
                )}
            </Box>

            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs 
                    value={tabValue} 
                    onChange={(_e, newValue) => setTabValue(newValue)}
                    variant={isMobile ? 'fullWidth' : 'standard'}
                >
                    <Tab label={t('pages.meetings.meeting_list')} />
                    <Tab label={t('pages.meetings.summary_table')} />
                </Tabs>
            </Box>

            <TabPanel value={tabValue} index={0} isMobile={isMobile}>
                <Stack spacing={2}>
                    <Collapse in={filtersExpanded || !isMobile}>
                        <Paper sx={{ p: 2 }}>
                            {!isMobile && <Typography variant="h6" sx={{ mb: 2 }}>{t('common.filters')}</Typography>}
                            <Grid container spacing={2} alignItems="center">
                                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                    <Controller name="client_name" control={control} render={({ field }) => (
                                            <TextField {...field} onChange={field.onChange} value={field.value || ''} label={t('pages.meetings.search_by_client')} fullWidth size="small" />
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
                                {!isMobile && (
                                    <>
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
                                    </>
                                )}
                            </Grid>
                        </Paper>
                    </Collapse>

                    <Box sx={{ width: '100%' }}>
                        <ResponsiveDataView
                            data={sortedMeetings}
                            columns={columns}
                            mobileFields={mobileFields}
                            isLoading={isLoading}
                            error={isError ? t('errors.load_meetings_error') : undefined}
                            onRowClick={handleMeetingClick}
                        />
                    </Box>
                </Stack>
            </TabPanel>

            <TabPanel value={tabValue} index={1} isMobile={isMobile}>
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

