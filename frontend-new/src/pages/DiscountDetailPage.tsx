import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getDiscountById } from '../api/discounts';
import { Typography, CircularProgress, Alert, Paper, Box, Tabs, Tab } from '@mui/material';
import { Timeline, TimelineItem, TimelineSeparator, TimelineConnector, TimelineContent, TimelineDot, timelineOppositeContentClasses } from '@mui/lab';

// Вспомогательный компонент для панели вкладок
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}
function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function DiscountDetailPage() {
  const { discountId } = useParams<{ discountId: string }>();
  const [tabValue, setTabValue] = useState(0);

  const { data: discount, isLoading, isError } = useQuery({
    queryKey: ['discount', discountId],
    queryFn: () => getDiscountById(Number(discountId)),
    enabled: !!discountId,
  });

  if (isLoading) return <CircularProgress />;
  if (isError || !discount) return <Alert severity="error">Не удалось загрузить данные скидки.</Alert>;

  return (
    <Paper sx={{ width: '100%' }}>
      <Typography variant="h4" sx={{ p: 3, pb: 0 }}>
        Скидка: {discount.name}
      </Typography>
      <Typography color="text.secondary" sx={{ px: 3 }}>
        Процент: {discount.percentage_value}%
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 2 }}>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
          <Tab label="Основная информация" />
          <Tab label={`Логи (${discount.logs?.length || 0})`} />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <Typography>Детальная информация о скидке...</Typography>
        {/* Здесь можно будет разместить форму редактирования */}
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <Timeline sx={{ [`& .${timelineOppositeContentClasses.root}`]: { flex: 0.2 } }}>
          {discount.logs?.map((log) => (
            <TimelineItem key={log.id}>
              <TimelineSeparator>
                <TimelineDot color="grey" />
                <TimelineConnector />
              </TimelineSeparator>
              <TimelineContent sx={{ py: '12px', px: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {new Date(log.created_at).toLocaleString('ru-RU')}
                </Typography>
                <Typography component="span" fontWeight="bold">{log.user || 'Система'}</Typography>
                <Typography>{log.action}</Typography>
              </TimelineContent>
            </TimelineItem>
          ))}
        </Timeline>
      </TabPanel>
    </Paper>
  );
}
