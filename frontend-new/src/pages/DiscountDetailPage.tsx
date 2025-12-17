import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getDiscountById, updateDiscount, type DiscountPayload } from '../api/discounts';
import {
  Typography, CircularProgress, Alert, Paper, Box, Tabs, Tab, Button,
  Stack, Card, CardHeader, CardContent, Grid, Chip
} from '@mui/material';
import { Timeline, TimelineItem, TimelineSeparator, TimelineConnector, TimelineContent, TimelineDot } from '@mui/lab';
import PercentIcon from '@mui/icons-material/Percent';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import HumanizedLog from '../components/logs/HumanizedLog';
import DiscountForm from '../components/discounts/DiscountForm';
import { useAuthStore } from '../store/authStore';
import { hasPermission } from '../utils/permissions';
import { translatePropertyType } from '../utils/translations';

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

// Компонент для отображения поля информации
interface InfoFieldProps {
  label: string;
  value: React.ReactNode;
}
function InfoField({ label, value }: InfoFieldProps) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography variant="body1">{value || '—'}</Typography>
    </Box>
  );
}

export default function DiscountDetailPage() {
  const { discountId } = useParams<{ discountId: string }>();
  const [tabValue, setTabValue] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const canEdit = hasPermission(user, 'EDIT', 'DISCOUNT');

  const getDateLocale = () => {
    const localeMap: Record<string, string> = { ru: 'ru-RU', en: 'en-US', uz: 'uz-UZ' };
    return localeMap[i18n.language] || 'ru-RU';
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString(getDateLocale());
  };

  const { data: discount, isLoading, isError } = useQuery({
    queryKey: ['discount', discountId],
    queryFn: () => getDiscountById(Number(discountId)),
    enabled: !!discountId,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: DiscountPayload) => updateDiscount({ id: Number(discountId), payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discount', discountId] });
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      setIsEditing(false);
    },
    onError: (error) => {
      console.error('Error updating discount:', error);
    },
  });

  const handleFormSubmit = (data: DiscountPayload) => {
    console.log('Submitting discount data:', data);
    updateMutation.mutate(data);
  };

  if (isLoading) return <CircularProgress />;
  if (isError || !discount) return <Alert severity="error">{t('errors.load_discount_error')}</Alert>;

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Paper sx={{ p: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 2,
                bgcolor: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PercentIcon sx={{ color: 'white', fontSize: 32 }} />
            </Box>
            <Box>
              <Typography variant="h4">{discount.name}</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label={`${discount.percentage_value}%`}
                  color="success"
                  size="small"
                />
                {discount.property_type && (
                  <Chip
                    label={translatePropertyType(discount.property_type)}
                    variant="outlined"
                    size="small"
                  />
                )}
              </Stack>
            </Box>
          </Stack>
          {canEdit && !isEditing && (
            <Button
              variant="outlined"
              startIcon={<EditIcon />}
              onClick={() => setIsEditing(true)}
            >
              {t('common.edit')}
            </Button>
          )}
          {isEditing && (
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<CloseIcon />}
              onClick={() => setIsEditing(false)}
            >
              {t('common.cancel')}
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Tabs */}
      <Box>
        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label={t('pages.discounts.main_info')} />
          <Tab label={`${t('common.logs')} (${discount.logs?.length || 0})`} />
        </Tabs>
      </Box>

      {/* Main Info Tab */}
      <TabPanel value={tabValue} index={0}>
        {isEditing ? (
          <Card variant="outlined">
            <CardHeader title={t('pages.discounts.edit_discount')} />
            <CardContent>
              <DiscountForm
                onSubmit={handleFormSubmit}
                isPending={updateMutation.isPending}
                initialData={discount}
              />
            </CardContent>
          </Card>
        ) : (
          <Stack spacing={3}>
            {/* Основная информация */}
            <Card variant="outlined">
              <CardHeader
                avatar={<PercentIcon />}
                title={t('pages.discounts.discount_details')}
              />
              <CardContent>
                <Grid container spacing={3}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <InfoField
                      label={t('pages.discounts.discount_name')}
                      value={discount.name}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <InfoField
                      label={t('pages.discounts.percentage')}
                      value={`${discount.percentage_value}%`}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <InfoField
                      label={t('pages.discounts.property_type')}
                      value={discount.property_type ? translatePropertyType(discount.property_type) : t('common.all')}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <InfoField
                      label={t('pages.discounts.applied_to_buildings')}
                      value={
                        discount.buildings_info && discount.buildings_info.length > 0
                          ? discount.buildings_info.join(', ')
                          : t('pages.discounts.no_building_restriction')
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <InfoField
                      label={t('pages.discounts.start_date_label')}
                      value={formatDate(discount.start_date)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <InfoField
                      label={t('pages.discounts.end_date_label')}
                      value={formatDate(discount.end_date) || t('pages.discounts.indefinite')}
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <InfoField
                      label={t('pages.discounts.short_description')}
                      value={discount.comment || t('pages.discounts.no_comment')}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Stack>
        )}
      </TabPanel>

      {/* Logs Tab */}
      <TabPanel value={tabValue} index={1}>
        {discount.logs && discount.logs.length > 0 ? (
          <Timeline position="right">
            {discount.logs.map((log) => (
              <TimelineItem key={log.id}>
                <TimelineSeparator>
                  <TimelineDot />
                  <TimelineConnector />
                </TimelineSeparator>
                <TimelineContent sx={{ py: '12px', px: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(log.created_at).toLocaleString(getDateLocale())} - {log.user || t('common.system')}
                  </Typography>
                  <HumanizedLog log={log} />
                </TimelineContent>
              </TimelineItem>
            ))}
          </Timeline>
        ) : (
          <Typography color="text.secondary">{t('common.no_data')}</Typography>
        )}
      </TabPanel>
    </Stack>
  );
}
