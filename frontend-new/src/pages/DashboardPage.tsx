import { Avatar, Box, Card, CardContent, CardHeader, Grid, Paper, Typography, List, ListItem, ListItemAvatar, ListItemText, Divider, Stack, CircularProgress, Alert } from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import AssignmentIcon from '@mui/icons-material/Assignment';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import BarChartIcon from '@mui/icons-material/BarChart';
import DonutLargeIcon from '@mui/icons-material/DonutLarge';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import EventIcon from '@mui/icons-material/Event';
import { useQuery } from '@tanstack/react-query';
import { getDashboardData } from '../api/dashboard';


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

// Вспомогательный компонент-заглушка для графика
const ChartPlaceholder = ({ title, icon }: { title: string, icon: React.ReactElement }) => (
     <Paper variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h6" sx={{ p: 2, pb: 0 }}>{title}</Typography>
        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', flexDirection: 'column', gap: 1 }}>
            {icon}
            <Typography variant="caption">(здесь будет график)</Typography>
        </Box>
    </Paper>
);


export default function DashboardPage() {
  const { data, isLoading, isError } = useQuery({
      queryKey: ['dashboardData'],
      queryFn: getDashboardData
  });

  if (isLoading) return <CircularProgress />;
  if (isError || !data) return <Alert severity="error">Не удалось загрузить данные для дашборда.</Alert>;

  const { kpi, topManagers, upcomingMeetings } = data;

  return (
    <Box>
        <Typography variant="h4" sx={{ mb: 3 }}>
            Аналитика
        </Typography>

        {/* Блок KPI */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}><KpiCard title="Новых клиентов сегодня" value={String(kpi.newClientsToday)} icon={<PeopleIcon />} /></Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}><KpiCard title="Новых заявок сегодня" value={String(kpi.newApplicationsToday)} icon={<AssignmentIcon />} color="success.main" /></Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}><KpiCard title="Продажи за месяц" value={`${kpi.monthlySales.toLocaleString()} у.е.`} icon={<MonetizationOnIcon />} color="info.main"/></Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}><KpiCard title="Просроченные платежи" value={`${kpi.overduePayments.toLocaleString()} у.е.`} icon={<EventBusyIcon />} color="error.main"/></Grid>
        </Grid>

        {/* Блок воронок и графиков */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 8 }}>
                <ChartPlaceholder title="Динамика заявок за неделю" icon={<BarChartIcon sx={{ fontSize: 80 }} />} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
                 <ChartPlaceholder title="Источники заявок" icon={<DonutLargeIcon sx={{ fontSize: 80 }} />} />
            </Grid>
        </Grid>

         {/* Блок менеджеров и встреч */}
        <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
                 <Paper variant="outlined">
                    <CardHeader
                        avatar={<LeaderboardIcon />}
                        title="Активность менеджеров"
                        subheader="Топ по продажам за месяц"
                    />
                    <CardContent>
                         <List>
                            {topManagers.map((manager, index) => (
                                <ListItem key={index} divider>
                                    <ListItemText primary={`${manager.first_name} ${manager.last_name}`} secondary={`Продажи: ${manager.total_sales.toLocaleString()} у.е.`} />
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
                        title="Ближайшие встречи"
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