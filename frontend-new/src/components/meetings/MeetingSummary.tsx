import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
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
    TextField,
    Paper,
    Card,
    CardContent
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useForm, Controller } from 'react-hook-form';

type GroupBy = 'executor' | 'project' | 'status';

const KpiCard = ({ title, value, color = 'text.primary', linkTo, isLoading }: { title: string; value: number; color?: string, linkTo?: object, isLoading: boolean }) => (
    <Card sx={{ height: '100%', textDecoration: 'none' }} component={RouterLink} to="/meetings" state={linkTo}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
            <Typography color="text.secondary">{title}</Typography>
            <Typography variant="h3" component="div" color={color}>
                {isLoading ? <CircularProgress size={40} /> : value}
            </Typography>
            <Typography color="text.secondary" variant="body2">
                (согласно фильтрам)
            </Typography>
        </CardContent>
    </Card>
);

export default function MeetingSummary() {
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

    const columns: GridColDef[] = [
        { field: groupBy === 'executor' ? 'Executor' : (groupBy === 'project' ? 'Project' : 'Status'), headerName: groupBy.charAt(0).toUpperCase() + groupBy.slice(1), flex: 1 },
        { field: 'Total Meetings', headerName: 'Total Meetings', flex: 1 },
        { field: 'New Meetings', headerName: 'New Meetings', flex: 1, hide: groupBy === 'status' },
        { field: 'Completed Meetings', headerName: 'Completed Meetings', flex: 1, hide: groupBy === 'status' },
        { field: 'Cancelled Meetings', headerName: 'Cancelled Meetings', flex: 1, hide: groupBy === 'status' },
    ];

    const handleDownload = () => {
        downloadMeetingSummary(filters);
    };

    return (
        <Stack spacing={2}>
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 9 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>Фильтры</Typography>
                        <Grid container spacing={2} alignItems="center">
                             <Grid size={{ xs: 12, sm: 4 }}>
                                <Controller
                                    name="group_by"
                                    control={control}
                                    render={({ field }) => (
                                        <FormControl size="small" fullWidth>
                                            <InputLabel>Группировать по</InputLabel>
                                            <Select {...field} label="Группировать по">
                                                <MenuItem value="executor">Исполнителю</MenuItem>
                                                <MenuItem value="project">Проекту</MenuItem>
                                                <MenuItem value="status">Статусу</MenuItem>
                                            </Select>
                                        </FormControl>
                                    )}
                                />
                            </Grid>
                            <Grid size={{ xs: 6, sm: 4 }}>
                                <Controller name="planned_date_after" control={control} render={({ field }) => (
                                    <TextField {...field} label="План от" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} />
                                )}/>
                            </Grid>
                            <Grid size={{ xs: 6, sm: 4 }}>
                                <Controller name="planned_date_before" control={control} render={({ field }) => (
                                    <TextField {...field} label="План до" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} />
                                )}/>
                            </Grid>
                            <Grid size={{ xs: 6, sm: 4 }}>
                                <Controller name="actual_date_after" control={control} render={({ field }) => (
                                    <TextField {...field} label="Факт от" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} />
                                )}/>
                            </Grid>
                             <Grid size={{ xs: 6, sm: 4 }}>
                                <Controller name="actual_date_before" control={control} render={({ field }) => (
                                    <TextField {...field} label="Факт до" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} />
                                )}/>
                            </Grid>
                             <Grid size={{ xs: 12, sm: 4 }}>
                                <Button variant="contained" onClick={handleDownload} fullWidth>
                                    Выгрузить в Excel
                                </Button>
                            </Grid>
                        </Grid>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                     <KpiCard
                        title="Просроченные встречи"
                        value={data?.overdue_count || 0}
                        color="error.main"
                        isLoading={isLoading}
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

            {isError ? <Alert severity="error">Ошибка загрузки сводки</Alert> :
            <Box sx={{ height: 500, width: '100%' }}>
                <DataGrid
                    loading={isLoading}
                    rows={data?.summary.map((row, index) => ({ id: index, ...row })) || []}
                    columns={columns.filter(c => !(groupBy === 'status' && ['New Meetings', 'Completed Meetings', 'Cancelled Meetings'].includes(c.field)))}
                />
            </Box>
            }
        </Stack>
    );
}