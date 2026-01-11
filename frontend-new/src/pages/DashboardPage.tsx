import { Avatar, Box, Card, CardContent, CardHeader, Grid, Paper, Typography, List, ListItem, ListItemAvatar, ListItemText, Divider, Stack, CircularProgress, Alert } from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import AssignmentIcon from '@mui/icons-material/Assignment';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import EventIcon from '@mui/icons-material/Event';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getDashboardData } from '../api/dashboard';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { useTheme } from '@mui/material/styles';


// Вспомогательный компонент для карточек KPI
const KpiCard = ({ title, value, icon, color = 'primary.main' }: { title: string, value: string, icon: React.ReactElement, color?: string }) => (
    <Card variant="outlined">
        <CardContent>
            <Stack direction="row" spacing={2} alignItems="center">
                <Avatar sx={{ bgcolor: color, width: 56, height: 56 }}>{icon}</Avatar>
                <Box>
                    <Typography variant="h5" fontWeight="bold">{value}</Typography>
                    <Typography color="text.secondary">{title}</Typography>
                </Box>
            </Stack>
        </CardContent>
    </Card>
);

// Цвета для статусов заявок
const statusColors: Record<string, string> = {
    'new': '#2196f3',
    'in_progress': '#ff9800',
    'qualified': '#4caf50',
    'rejected': '#f44336',
    'converted': '#9c27b0',
};

// Цвета для источников
const sourceColors = [
    '#D4A017', '#2196f3', '#4caf50', '#ff9800', '#f44336', 
    '#9c27b0', '#00bcd4', '#795548', '#607d8b', '#e91e63'
];


export default function DashboardPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data, isLoading, isError } = useQuery({
      queryKey: ['dashboardData'],
      queryFn: getDashboardData
  });

  if (isLoading) return <CircularProgress />;
  if (isError || !data) return <Alert severity="error">{t('errors.load_data_error')}</Alert>;

  const { kpi, charts, topManagers, upcomingMeetings } = data;

  // Подготовка данных для графика статусов заявок
  const statusData = charts?.applicationStatuses?.map((item, index) => ({
    id: index,
    value: item.count,
    label: t(`application.statuses.${item.status}`, item.status),
    color: statusColors[item.status] || sourceColors[index % sourceColors.length],
  })) || [];

  // Подготовка данных для графика источников
  const sourceData = charts?.applicationSources?.map((item, index) => ({
    id: index,
    value: item.count,
    label: t(`application.sources.${item.source}`, item.source),
    color: sourceColors[index % sourceColors.length],
  })) || [];

  // Данные для bar chart (статусы)
  const barChartData = charts?.applicationStatuses?.map(item => item.count) || [];
  const barChartLabels = charts?.applicationStatuses?.map(item => 
    t(`application.statuses.${item.status}`, item.status)
  ) || [];

  return (
    <Box>
        <Typography variant="h4" sx={{ mb: 3 }}>
            {t('pages.dashboard.title')}
        </Typography>

        {/* Блок KPI */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}><KpiCard title={t('pages.dashboard.new_clients_today')} value={String(kpi.newClientsToday)} icon={<PeopleIcon />} /></Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}><KpiCard title={t('pages.dashboard.new_applications_today')} value={String(kpi.newApplicationsToday)} icon={<AssignmentIcon />} color="success.main" /></Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}><KpiCard title={t('pages.dashboard.monthly_sales')} value={`${kpi.monthlySales.toLocaleString()} ${t('common.currency')}`} icon={<MonetizationOnIcon />} color="info.main"/></Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}><KpiCard title={t('pages.dashboard.overdue_payments')} value={`${kpi.overduePayments.toLocaleString()} ${t('common.currency')}`} icon={<EventBusyIcon />} color="error.main"/></Grid>
        </Grid>

        {/* Блок воронок и графиков */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 8 }}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        {t('pages.dashboard.applications_dynamics')}
                    </Typography>
                    {barChartData.length > 0 ? (
                        <BarChart
                            xAxis={[{ 
                                scaleType: 'band', 
                                data: barChartLabels,
                                tickLabelStyle: {
                                    fill: theme.palette.text.primary,
                                },
                            }]}
                            series={[{ 
                                data: barChartData,
                                color: theme.palette.primary.main,
                            }]}
                            height={300}
                            sx={{
                                '& .MuiChartsAxis-tickLabel': {
                                    fill: theme.palette.text.primary,
                                },
                                '& .MuiChartsAxis-line': {
                                    stroke: theme.palette.divider,
                                },
                            }}
                        />
                    ) : (
                        <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography color="text.secondary">{t('pages.dashboard.no_data')}</Typography>
                        </Box>
                    )}
                </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        {t('pages.dashboard.application_sources')}
                    </Typography>
                    {sourceData.length > 0 ? (
                        <PieChart
                            series={[{
                                data: sourceData,
                                highlightScope: { fade: 'global', highlight: 'item' },
                                innerRadius: 30,
                                outerRadius: 100,
                                paddingAngle: 2,
                                cornerRadius: 5,
                            }]}
                            height={300}
                            slotProps={{
                                legend: {
                                    direction: 'column',
                                    position: { vertical: 'middle', horizontal: 'right' },
                                    padding: 0,
                                    labelStyle: {
                                        fill: theme.palette.text.primary,
                                        fontSize: 12,
                                    },
                                },
                            }}
                        />
                    ) : (
                        <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography color="text.secondary">{t('pages.dashboard.no_data')}</Typography>
                        </Box>
                    )}
                </Paper>
            </Grid>
        </Grid>

         {/* Блок менеджеров и встреч */}
        <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
                 <Paper variant="outlined">
                    <CardHeader
                        avatar={<LeaderboardIcon />}
                        title={t('pages.dashboard.manager_activity')}
                        subheader={t('pages.dashboard.top_sales_month')}
                    />
                    <CardContent>
                         <List>
                            {topManagers.map((manager, index) => (
                                <ListItem key={index} divider>
                                    <ListItemText primary={`${manager.first_name} ${manager.last_name}`} secondary={`${t('pages.dashboard.sales_label')} ${manager.total_sales.toLocaleString()} ${t('common.currency')}`} />
                                </ListItem>
                            ))}
                        </List>
                    </CardContent>
                 </Paper>
            </Grid>
             <Grid size={{ xs: 12, md: 6 }}>
                 <Paper variant="outlined">
                    <CardHeader
                        avatar={<EventIcon />}
                        title={t('pages.dashboard.upcoming_meetings')}
                    />
                     <CardContent>
                        <List>
                            {upcomingMeetings.map((meeting, index) => (
                                <ListItem key={index} divider>
                                     <ListItemText primary={meeting.client} secondary={new Date(meeting.time).toLocaleString()} />
                                </ListItem>
                            ))}
                        </List>
                     </CardContent>
                 </Paper>
            </Grid>
        </Grid>
    </Box>
  );
}