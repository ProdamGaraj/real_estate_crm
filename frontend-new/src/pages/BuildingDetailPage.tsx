import { useState, useEffect, useMemo } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  getBuildingById, uploadProperties, getPropertyTemplateUrl, updateBuilding,
  uploadBuildingImage, deleteBuildingImage
} from '../api/buildings';
import type { Property, BuildingUpdatePayload } from '../api/buildings';
import { getBuildingTypes } from '../api/projects';
import type { BuildingType } from '../api/projects';
import apiClient from '../api/axios';
import { getMediaUrl } from '../utils/media';

import { styled } from '@mui/material/styles';
import {
    Box, CircularProgress, Paper, Typography, ToggleButtonGroup, ToggleButton, Alert, Link as MuiLink,
    Stack, Button, Tabs, Tab, Grid, TextField, FormControl, InputLabel, Select, MenuItem,
    Card, CardMedia, CardActions, IconButton, CardHeader, CardContent
} from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../components/common/LocalizedDataGrid';
import LocalizedDateField from '../components/common/LocalizedDateField';
import { Timeline, TimelineItem, TimelineSeparator, TimelineConnector, TimelineContent, TimelineDot } from '@mui/lab';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile'; // <-- НОВЫЙ ИМПОРТ
import BusinessIcon from '@mui/icons-material/Business';
import StarIcon from '@mui/icons-material/Star';

import Chessboard from '../components/buildings/Chessboard';
import LayoutsTab from '../components/buildings/LayoutsTab';
import PropertyDetailModal from '../components/buildings/PropertyDetailModal';
import HumanizedLog from '../components/logs/HumanizedLog';

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

// НОВЫЙ КОМПОНЕНТ ДЛЯ СКРЫТОГО ПОЛЯ ВВОДА
const VisuallyHiddenInput = styled('input')({
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  overflow: 'hidden',
  position: 'absolute',
  bottom: 0,
  left: 0,
  whiteSpace: 'nowrap',
  width: 1,
});


export default function BuildingDetailPage() {
  const { projectId, buildingId } = useParams<{ projectId: string; buildingId: string }>();
  const { t, i18n } = useTranslation();
  const [tabValue, setTabValue] = useState(0);
  const [viewMode, setViewMode] = useState<'table' | 'chessboard'>('chessboard');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const queryClient = useQueryClient();
  const [propertyFilters, setPropertyFilters] = useState({ unit_number: '', status: '' });

  const getDateLocale = () => {
    const localeMap: Record<string, string> = { ru: 'ru-RU', en: 'en-US', uz: 'uz-UZ' };
    return localeMap[i18n.language] || 'ru-RU';
  };
  // const fileInputRef = useRef<HTMLInputElement>(null); // <-- ЭТОТ REF БОЛЬШЕ НЕ НУЖЕН

  const { data: building, isLoading, isError } = useQuery({
    queryKey: ['building', buildingId],
    queryFn: () => getBuildingById({ projectId: Number(projectId), buildingId: Number(buildingId) }),
    enabled: !!projectId && !!buildingId,
  });

  const { data: buildingTypes } = useQuery<BuildingType[]>({
    queryKey: ['buildingTypes'],
    queryFn: getBuildingTypes,
  });

  const { register, handleSubmit, control, reset } = useForm<BuildingUpdatePayload>();

  useEffect(() => {
    if (building) {
      reset({
        ...building,
        building_type_id: building.building_type?.id,
      });
    }
  }, [building, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: BuildingUpdatePayload) => updateBuilding({ projectId: Number(projectId), buildingId: Number(buildingId), payload: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['building', buildingId] });
      alert(t('pages.buildings.update_success'));
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadProperties({ projectId: Number(projectId), buildingId: Number(buildingId), file }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['building', buildingId] });
      alert(data.status);
    },
    onError: (error) => {
      alert(`${t('pages.buildings.upload_error')}: ${error.message}`);
    }
  });

  const uploadImageMutation = useMutation({
    mutationFn: (formData: FormData) => uploadBuildingImage({ projectId: Number(projectId), buildingId: Number(buildingId), formData }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['building', buildingId] });
    },
  });

  const deleteImageMutation = useMutation({
    mutationFn: (imageId: number) => deleteBuildingImage({ projectId: Number(projectId), buildingId: Number(buildingId), imageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['building', buildingId] });
    },
  });

  // ОБНОВЛЕННЫЙ ОБРАБОТЧИК
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
    // Сбрасываем значение инпута, чтобы можно было загрузить тот же файл повторно
    if (event.target) {
        event.target.value = '';
    }
  };

  const handleGalleryFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.[0]) {
      const formData = new FormData();
      formData.append('image', event.target.files[0]);
      uploadImageMutation.mutate(formData);
    }
  };

  const handleDownload = async () => {
    if (!projectId || !buildingId) return;
    try {
      const url = getPropertyTemplateUrl(Number(projectId), Number(buildingId));
      const response = await apiClient.get(url, { responseType: 'blob' });
      const downloadUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', 'property_template.xlsx');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Error downloading file:", error);
      alert(t('pages.buildings.download_error'));
    }
  };

  const propertyTypes = useMemo(() => {
    if (!building?.properties) return [];
    return [...new Set(building.properties.map(p => p.property_type))];
  }, [building]);

  useEffect(() => {
    if (!selectedType && propertyTypes.length > 0) {
      setSelectedType(propertyTypes[0]);
    }
  }, [propertyTypes, selectedType]);

  const filteredProperties = useMemo(() => {
    if (!building?.properties) return [];
    let properties = building.properties;

    if (selectedType) {
        properties = properties.filter(p => p.property_type === selectedType);
    }
    if (propertyFilters.unit_number) {
        properties = properties.filter(p => p.unit_number.toLowerCase().includes(propertyFilters.unit_number.toLowerCase()));
    }
    if (propertyFilters.status) {
        properties = properties.filter(p => p.status === propertyFilters.status);
    }
    return properties;
  }, [building, selectedType, propertyFilters]);


  if (isLoading) return <CircularProgress />;
  if (isError || !building) return <Alert severity="error">{t('errors.load_building')}</Alert>;

  const propertyColumns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 90 },
    { field: 'unit_number', headerName: t('pages.buildings.unit_number'), flex: 1 },
    { field: 'status', headerName: t('common.status'), flex: 1 },
    { field: 'area', headerName: t('pages.buildings.area'), type: 'number' },
    { field: 'price', headerName: t('pages.buildings.price'), type: 'number', flex: 1 },
  ];

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h4">{building.name}</Typography>
        <Typography color="text.secondary">
          {t('pages.buildings.project')}: <MuiLink component={RouterLink} to={`/projects/${projectId}`} underline="hover">{building.project.name}</MuiLink>
        </Typography>
      </Paper>

      <Box>
        <Tabs value={tabValue} onChange={(_, newVal) => setTabValue(newVal)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={t('pages.buildings.details_tab')} />
          <Tab label={`${t('pages.buildings.properties_tab')} (${building?.properties?.length ?? 0})`} />
          <Tab label={t('pages.buildings.layouts_tab')} />
          <Tab label={`${t('pages.buildings.gallery_tab')} (${building?.gallery_images?.length ?? 0})`} />
          <Tab label={`${t('pages.buildings.logs_tab')} (${building?.logs?.length ?? 0})`} />
        </Tabs>
      </Box>

      {/* ВКЛАДКА "ДЕТАЛИ ДОМА" */}
      <TabPanel value={tabValue} index={0}>
        <form onSubmit={handleSubmit((data) => updateMutation.mutate(data))}>
          <Stack spacing={3}>
            <Card variant="outlined">
                <CardHeader title={t('pages.buildings.main_info')} avatar={<BusinessIcon />} />
                <CardContent>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={t('pages.buildings.name_number')} {...register('name')} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Controller name="cadastre_date_plan" control={control} render={({ field }) => (
                            <LocalizedDateField
                              label={t('pages.buildings.cadastre_date_plan')}
                              value={field.value || null}
                              onChange={(date) => field.onChange(date || '')}
                              fullWidth
                            />
                          )}/>
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <Controller name="status" control={control} defaultValue={building.status || ''} render={({ field }) => (
                                <FormControl fullWidth><InputLabel>{t('common.status')}</InputLabel>
                                <Select {...field} label={t('common.status')}>
                                    <MenuItem value="UNDER_REVIEW">{t('statuses.building.UNDER_REVIEW')}</MenuItem>
                                    <MenuItem value="FOR_SALE">{t('statuses.building.FOR_SALE')}</MenuItem>
                                    <MenuItem value="COMPLETED">{t('statuses.building.COMPLETED')}</MenuItem>
                                    <MenuItem value="ARCHIVED">{t('statuses.building.ARCHIVED')}</MenuItem>
                                </Select></FormControl>
                            )}/>
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <Controller name="building_type_id" control={control} defaultValue={building.building_type?.id || ''} render={({ field }) => (
                                <FormControl fullWidth><InputLabel>{t('pages.buildings.building_type')}</InputLabel>
                                <Select {...field} label={t('pages.buildings.building_type')}>
                                    {buildingTypes?.map(bt => <MenuItem key={bt.id} value={bt.id}>{bt.name}</MenuItem>)}
                                </Select></FormControl>
                            )}/>
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={t('pages.buildings.floors_count')} type="number" {...register('floors_count')} /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={t('pages.buildings.ceiling_height')} {...register('ceiling_height')} /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={t('pages.buildings.material')} {...register('material')} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Controller name="sales_start_date" control={control} render={({ field }) => (
                            <LocalizedDateField
                              label={t('pages.buildings.sales_start_date')}
                              value={field.value || null}
                              onChange={(date) => field.onChange(date || '')}
                              fullWidth
                            />
                          )}/>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            <Card variant="outlined">
                <CardHeader title={t('pages.buildings.usp_title')} avatar={<StarIcon />} />
                <CardContent>
                     <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={t('pages.buildings.usp_1')} {...register('usp_1')} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={t('pages.buildings.usp_2')} {...register('usp_2')} /></Grid>
                    </Grid>
                </CardContent>
            </Card>

            <Box>
                <Button type="submit" variant="contained" disabled={updateMutation.isPending}>{t('common.save')}</Button>
            </Box>
          </Stack>
        </form>
      </TabPanel>

      {/* ВКЛАДКА "ОБЪЕКТЫ" */}
      <TabPanel value={tabValue} index={1}>
        <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
                <ToggleButtonGroup
                value={selectedType}
                exclusive
                onChange={(_, newValue) => { if (newValue) setSelectedType(newValue); }}
                >
                {propertyTypes.map(type => (
                    <ToggleButton key={type} value={type}>{type}</ToggleButton>
                ))}
                </ToggleButtonGroup>
                <ToggleButtonGroup
                value={viewMode}
                exclusive
                onChange={(_, newMode) => { if (newMode) setViewMode(newMode); }}
                >
                <ToggleButton value="table"><ViewListIcon /></ToggleButton>
                <ToggleButton value="chessboard"><ViewModuleIcon /></ToggleButton>
                </ToggleButtonGroup>
            </Stack>

            <Stack direction="row" spacing={2} alignItems="center">
                <TextField
                    label={t('pages.buildings.search_by_number')}
                    size="small"
                    value={propertyFilters.unit_number}
                    onChange={(e) => setPropertyFilters(prev => ({ ...prev, unit_number: e.target.value }))}
                />
                <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>{t('common.status')}</InputLabel>
                    <Select
                        value={propertyFilters.status}
                        label={t('common.status')}
                        onChange={(e) => setPropertyFilters(prev => ({ ...prev, status: e.target.value }))}
                    >
                        <MenuItem value=""><em>{t('common.all')}</em></MenuItem>
                        <MenuItem value="SELECTION">{t('statuses.property.SELECTION')}</MenuItem>
                        <MenuItem value="RESERVE">{t('statuses.property.RESERVE')}</MenuItem>
                        <MenuItem value="BOOKING">{t('statuses.property.BOOKING')}</MenuItem>
                        <MenuItem value="IN_DEAL">{t('statuses.property.IN_DEAL')}</MenuItem>
                        <MenuItem value="SOLD">{t('statuses.property.SOLD')}</MenuItem>
                    </Select>
                </FormControl>
            </Stack>

            <Stack direction="row" spacing={2}>
                <Button variant="outlined" onClick={handleDownload}>
                    {t('pages.buildings.download_template')}
                </Button>
                {/* === ОБНОВЛЕННАЯ КНОПКА ЗАГРУЗКИ === */}
                <Button
                    component="label"
                    role={undefined}
                    variant="contained"
                    tabIndex={-1}
                    startIcon={<UploadFileIcon />}
                    disabled={uploadMutation.isPending}
                >
                    {uploadMutation.isPending ? t('common.uploading') : t('pages.buildings.upload_excel')}
                    <VisuallyHiddenInput
                        type="file"
                        onChange={handleFileChange}
                        accept=".xlsx, .xls"
                    />
                </Button>
            </Stack>
        </Stack>

        <Box sx={{ mt: 2 }}>
          {viewMode === 'table' ? (
            <Box sx={{ height: 500, width: '100%' }}>
              <LocalizedDataGrid rows={filteredProperties} columns={propertyColumns} />
            </Box>
          ) : (
            <Chessboard
              properties={filteredProperties}
              onCellClick={(property) => setSelectedProperty(property)}
            />
          )}
        </Box>
      </TabPanel>

      {/* ВКЛАДКА "ПЛАНИРОВКИ" */}
      <TabPanel value={tabValue} index={2}>
        <LayoutsTab buildingId={Number(buildingId)} />
      </TabPanel>

      {/* ВКЛАДКА "ГАЛЕРЕЯ" */}
      <TabPanel value={tabValue} index={3}>
        <Button variant="contained" component="label" startIcon={<PhotoCamera />} sx={{ mb: 2 }}>
            {t('pages.buildings.upload_photo')}
            <input type="file" hidden accept="image/*" onChange={handleGalleryFileChange} />
        </Button>
        <Grid container spacing={2}>
            {building?.gallery_images?.map((image) => (
                <Grid key={image.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                    <Card>
                        <CardMedia component="img" height="160" image={getMediaUrl(image.image) || ''} alt={image.caption} />
                        <CardActions>
                            <IconButton onClick={() => deleteImageMutation.mutate(image.id)} disabled={deleteImageMutation.isPending} size="small">
                                <DeleteIcon />
                            </IconButton>
                        </CardActions>
                    </Card>
                </Grid>
            ))}
        </Grid>
      </TabPanel>

      {/* ВКЛАДКА "ЛОГИ" */}
       <TabPanel value={tabValue} index={4}>
            <Timeline>
                {building?.logs?.map((log) => (
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
        </TabPanel>

      <PropertyDetailModal
        property={selectedProperty}
        buildingId={Number(buildingId)}
        open={!!selectedProperty}
        onClose={() => setSelectedProperty(null)}
      />
    </Stack>
  );
}

