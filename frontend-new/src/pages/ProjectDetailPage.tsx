import { useState, useRef, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
    getProjectById, createBuilding, getBuildings, updateProject,
    uploadProjectImage, deleteProjectImage
} from '../api/projects';
import type {
    ProjectDetail, BuildingPayload, BuildingFilters, Building, ProjectUpdatePayload
} from '../api/projects';
import {
    Box, Button, CircularProgress, Paper, Tab, Tabs, Typography, Dialog,
    DialogTitle, DialogContent, TextField, Stack, Link as MuiLink, Grid,
    Avatar, IconButton, Card, CardMedia, CardActions, Alert, CardContent, CardHeader
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import BuildingForm from '../components/buildings/BuildingForm';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import DeleteIcon from '@mui/icons-material/Delete';
import BusinessIcon from '@mui/icons-material/Business';
import ArticleIcon from '@mui/icons-material/Article';
import StarIcon from '@mui/icons-material/Star';

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

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tabValue, setTabValue] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [buildingFilters, setBuildingFilters] = useState<BuildingFilters>({});
  const { register: registerBuildingFilter, watch: watchBuildingFilter } = useForm<BuildingFilters>();

  const { data: project, isLoading: isLoadingProject, isError } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProjectById(Number(projectId)),
    enabled: !!projectId,
  });

  const { data: buildings, isLoading: isLoadingBuildings } = useQuery({
    queryKey: ['buildings', projectId, buildingFilters],
    queryFn: () => getBuildings({ projectId: Number(projectId), filters: buildingFilters }),
    enabled: !!projectId,
  });

  const { register, handleSubmit, reset } = useForm<ProjectUpdatePayload>();

  useEffect(() => {
    if (project) {
      reset(project);
    }
  }, [project, reset]);

  useEffect(() => {
    const subscription = watchBuildingFilter((value) => {
      const timer = setTimeout(() => { setBuildingFilters({ search: value.search }); }, 300);
      return () => clearTimeout(timer);
    });
    return () => subscription.unsubscribe();
  }, [watchBuildingFilter]);


  const updateProjectMutation = useMutation({
    mutationFn: (data: ProjectUpdatePayload) => updateProject({ id: Number(projectId), payload: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      alert('Проект обновлен!');
    },
  });

  const uploadImageMutation = useMutation({
    mutationFn: (formData: FormData) => uploadProjectImage({ projectId: Number(projectId), formData }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });

  const deleteImageMutation = useMutation({
    mutationFn: (imageId: number) => deleteProjectImage({ projectId: Number(projectId), imageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });

  const createBuildingMutation = useMutation({
    mutationFn: createBuilding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buildings', projectId] });
      setIsModalOpen(false);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const formData = new FormData();
      formData.append('image', e.target.files[0]);
      uploadImageMutation.mutate(formData);
    }
  };

  const onUpdateSubmit = (data: ProjectUpdatePayload) => {
    updateProjectMutation.mutate(data);
  };

  const handleCreateBuilding = (data: BuildingPayload) => {
    if (!projectId) return;
    createBuildingMutation.mutate({ projectId: Number(projectId), payload: data });
  };

  if (isLoadingProject) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError || !project) {
    return <Alert severity="error">Не удалось загрузить данные проекта.</Alert>;
  }

  const buildingColumns: GridColDef<Building>[] = [
    { field: 'id', headerName: 'ID', width: 90 },
    {
      field: 'name', headerName: 'Название/Номер', flex: 1,
      renderCell: (params) => (
        <MuiLink component={RouterLink} to={`/projects/${projectId}/buildings/${params.id}`} underline="hover">
          {params.value}
        </MuiLink>
      )
    },
    { field: 'floors_count', headerName: 'Этажей' },
  ];

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar src={project.logo || undefined} sx={{ width: 64, height: 64 }} variant="rounded">
                {project.name.charAt(0)}
            </Avatar>
            <Box>
                <Typography variant="h4">{project.name}</Typography>
                <Typography color="text.secondary">{project.address}</Typography>
            </Box>
          </Stack>
      </Paper>

      <Box>
        <Tabs value={tabValue} onChange={(_, newVal) => setTabValue(newVal)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Детали проекта" />
          <Tab label={`Дома (${buildings?.length ?? 0})`} />
          <Tab label={`Галерея (${project.gallery_images.length})`} />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <form onSubmit={handleSubmit(onUpdateSubmit)}>
          <Stack spacing={3}>
            <Card variant="outlined">
                <CardHeader title="Основная информация" avatar={<BusinessIcon />} />
                <CardContent>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Название проекта" {...register('name')} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Адрес" {...register('address')} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Плановая дата кадастра" type="date" InputLabelProps={{ shrink: true }} {...register('cadastre_date_plan')} /></Grid>
                        <Grid size={{ xs: 12 }}><TextField fullWidth multiline rows={4} label="Описание" {...register('description')} /></Grid>
                    </Grid>
                </CardContent>
            </Card>

            <Card variant="outlined">
                <CardHeader title="Уникальные торговые предложения (УТП)" avatar={<StarIcon />} />
                <CardContent>
                     <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label="УТП 1" {...register('usp_1')} /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label="УТП 2" {...register('usp_2')} /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label="УТП 3" {...register('usp_3')} /></Grid>
                    </Grid>
                </CardContent>
            </Card>

            <Card variant="outlined">
                <CardHeader title="Юридическая информация" avatar={<ArticleIcon />} />
                <CardContent>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12 }}><TextField fullWidth multiline rows={3} label="Реквизиты застройщика" {...register('developer_details')} /></Grid>
                    </Grid>
                </CardContent>
            </Card>

            <Box>
                <Button type="submit" variant="contained" disabled={updateProjectMutation.isPending}>Сохранить изменения</Button>
            </Box>
          </Stack>
        </form>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <Stack spacing={2} sx={{ mb: 2 }}>
            <Button variant="contained" onClick={() => setIsModalOpen(true)}>Добавить дом</Button>
            <TextField label="Поиск по названию дома" fullWidth size="small" {...registerBuildingFilter('search')} />
        </Stack>
        <Box sx={{ height: 400, width: '100%' }}>
          <DataGrid rows={buildings || []} columns={buildingColumns} loading={isLoadingBuildings} />
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <Button variant="contained" component="label" startIcon={<PhotoCamera />} sx={{ mb: 2 }}>
            Загрузить изображение
            <input type="file" hidden accept="image/*" ref={fileInputRef} onChange={handleFileSelect} />
        </Button>
        <Grid container spacing={2}>
            {project.gallery_images.map((image) => (
                <Grid key={image.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                    <Card>
                        <CardMedia component="img" height="140" image={image.image} alt={image.caption || `Image ${image.id}`} />
                        <CardActions>
                            <IconButton onClick={() => deleteImageMutation.mutate(image.id)} disabled={deleteImageMutation.isPending}>
                                <DeleteIcon />
                            </IconButton>
                        </CardActions>
                    </Card>
                </Grid>
            ))}
        </Grid>
      </TabPanel>

      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Новый дом</DialogTitle>
        <DialogContent>
          <BuildingForm onSubmit={handleCreateBuilding} isPending={createBuildingMutation.isPending} />
        </DialogContent>
      </Dialog>
    </Stack>
  );
}