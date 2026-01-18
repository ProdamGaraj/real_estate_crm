import { useState, useRef, useEffect } from 'react';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
    getProjectById, createBuilding, getBuildings, updateProject,
    uploadProjectImage, deleteProjectImage, deleteProject, deleteBuilding
} from '../api/projects';
import type {
    ProjectDetail, BuildingFilters, Building, ProjectUpdatePayload
} from '../api/projects';
import { getMediaUrl } from '../utils/media';
import {
    Box, Button, CircularProgress, Paper, Tab, Tabs, Typography, Dialog,
    DialogTitle, DialogContent, DialogActions, DialogContentText, TextField, Stack, Link as MuiLink, Grid,
    Avatar, IconButton, Card, CardMedia, CardActions, Alert, CardContent, CardHeader,
    FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import { getCompanies } from '../api/permissions';
import { useAuthStore } from '../store/authStore';
import { hasPermission } from '../utils/permissions';
import type { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import LocalizedDataGrid from '../components/common/LocalizedDataGrid';
import LocalizedDateField from '../components/common/LocalizedDateField';
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
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [tabValue, setTabValue] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false);
  const [deleteBuildingDialogOpen, setDeleteBuildingDialogOpen] = useState(false);
  const [buildingToDelete, setBuildingToDelete] = useState<Building | null>(null);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuthStore();
  const isSystemAdmin = user?.is_system_admin;
  const canDeleteProject = hasPermission(user, 'DELETE', 'PROJECT');
  const canDeleteBuilding = hasPermission(user, 'DELETE', 'BUILDING');

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

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: getCompanies,
    enabled: !!isSystemAdmin,
  });

  const { register, handleSubmit, reset, control } = useForm<ProjectUpdatePayload>();

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
      alert(t('pages.projects.project_updated'));
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

  const deleteProjectMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
    },
  });

  const deleteBuildingMutation = useMutation({
    mutationFn: (buildingId: number) => deleteBuilding({ projectId: Number(projectId), buildingId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buildings', projectId] });
      setDeleteBuildingDialogOpen(false);
      setBuildingToDelete(null);
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
    return <Alert severity="error">{t('errors.load_project_error')}</Alert>;
  }

  const buildingColumns: GridColDef<Building>[] = [
    { field: 'id', headerName: 'ID', width: 90 },
    {
      field: 'name', headerName: t('pages.buildings.building_name'), flex: 1,
      renderCell: (params) => (
        <MuiLink component={RouterLink} to={`/projects/${projectId}/buildings/${params.id}`} underline="hover">
          {params.value}
        </MuiLink>
      )
    },
    { field: 'floors_count', headerName: t('pages.buildings.floors_count') },
    ...(canDeleteBuilding ? [{
      field: 'actions',
      headerName: t('common.actions'),
      width: 100,
      sortable: false,
      renderCell: (params: GridRenderCellParams<Building>) => (
        <IconButton
          color="error"
          onClick={() => {
            setBuildingToDelete(params.row as Building);
            setDeleteBuildingDialogOpen(true);
          }}
        >
          <DeleteIcon />
        </IconButton>
      ),
    }] : []),
  ];

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar src={project.logo || undefined} sx={{ width: 64, height: 64 }} variant="rounded">
                  {project.name.charAt(0)}
              </Avatar>
              <Box>
                  <Typography variant="h4">{project.name}</Typography>
                  <Typography color="text.secondary">{project.address}</Typography>
              </Box>
            </Stack>
            {canDeleteProject && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => setDeleteProjectDialogOpen(true)}
              >
                {t('pages.projects.delete_project')}
              </Button>
            )}
          </Stack>
      </Paper>

      <Box>
        <Tabs value={tabValue} onChange={(_, newVal) => setTabValue(newVal)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={t('pages.projects.project_details')} />
          <Tab label={`${t('pages.projects.buildings')} (${buildings?.length ?? 0})`} />
          <Tab label={`${t('pages.projects.gallery')} (${project.gallery_images.length})`} />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <form onSubmit={handleSubmit(onUpdateSubmit)}>
          <Stack spacing={3}>
            <Card variant="outlined">
                <CardHeader title={t('pages.projects.main_info')} avatar={<BusinessIcon />} />
                <CardContent>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={t('pages.projects.project_name')} {...register('name')} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={t('pages.projects.address')} {...register('address')} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Controller name="cadastre_date_plan" control={control} render={({ field }) => (
                            <LocalizedDateField
                              label={t('pages.projects.cadastre_date_plan')}
                              value={field.value || null}
                              onChange={(date) => field.onChange(date || '')}
                              fullWidth
                            />
                          )}/>
                        </Grid>
                        {isSystemAdmin && (
                          <Grid size={{ xs: 12, md: 6 }}>
                            <Controller
                              name="company"
                              control={control}
                              render={({ field }) => (
                                <FormControl fullWidth>
                                  <InputLabel>{t('pages.projects.company')}</InputLabel>
                                  <Select
                                    {...field}
                                    label={t('pages.projects.company')}
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                                  >
                                    <MenuItem value="">{t('common.not_selected')}</MenuItem>
                                    {companies.map((c) => (
                                      <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>
                              )}
                            />
                          </Grid>
                        )}
                        <Grid size={{ xs: 12 }}><TextField fullWidth multiline rows={4} label={t('pages.projects.description')} {...register('description')} /></Grid>
                    </Grid>
                </CardContent>
            </Card>

            <Card variant="outlined">
                <CardHeader title={t('pages.projects.usp_title')} avatar={<StarIcon />} />
                <CardContent>
                     <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={t('pages.projects.usp_1')} {...register('usp_1')} /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={t('pages.projects.usp_2')} {...register('usp_2')} /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={t('pages.projects.usp_3')} {...register('usp_3')} /></Grid>
                    </Grid>
                </CardContent>
            </Card>

            <Card variant="outlined">
                <CardHeader title={t('pages.projects.legal_info')} avatar={<ArticleIcon />} />
                <CardContent>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12 }}><TextField fullWidth multiline rows={3} label={t('pages.projects.developer_details')} {...register('developer_details')} /></Grid>
                    </Grid>
                </CardContent>
            </Card>

            <Box>
                <Button type="submit" variant="contained" disabled={updateProjectMutation.isPending}>{t('common.save')}</Button>
            </Box>
          </Stack>
        </form>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <Stack spacing={2} sx={{ mb: 2 }}>
            <Button variant="contained" onClick={() => setIsModalOpen(true)}>{t('pages.projects.add_building')}</Button>
            <TextField label={t('pages.projects.search_building')} fullWidth size="small" {...registerBuildingFilter('search')} />
        </Stack>
        <Box sx={{ height: 400, width: '100%' }}>
          <LocalizedDataGrid rows={buildings || []} columns={buildingColumns} loading={isLoadingBuildings} />
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <Button variant="contained" component="label" startIcon={<PhotoCamera />} sx={{ mb: 2 }}>
            {t('pages.projects.upload_image')}
            <input type="file" hidden accept="image/*" ref={fileInputRef} onChange={handleFileSelect} />
        </Button>
        <Grid container spacing={2}>
            {project.gallery_images.map((image) => (
                <Grid key={image.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                    <Card>
                        <CardMedia component="img" height="140" image={getMediaUrl(image.image) || ''} alt={image.caption || `Image ${image.id}`} />
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

      {/* Диалог создания дома */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('pages.buildings.new_building')}</DialogTitle>
        <DialogContent>
          <BuildingForm onSubmit={handleCreateBuilding} isPending={createBuildingMutation.isPending} />
        </DialogContent>
      </Dialog>

      {/* Диалог подтверждения удаления проекта */}
      <Dialog open={deleteProjectDialogOpen} onClose={() => setDeleteProjectDialogOpen(false)}>
        <DialogTitle>{t('pages.projects.delete_project')}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('pages.projects.delete_project_confirm', { name: project.name })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteProjectDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button 
            color="error" 
            variant="contained"
            onClick={() => deleteProjectMutation.mutate(Number(projectId))}
            disabled={deleteProjectMutation.isPending}
          >
            {deleteProjectMutation.isPending ? t('common.deleting') : t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог подтверждения удаления дома */}
      <Dialog open={deleteBuildingDialogOpen} onClose={() => setDeleteBuildingDialogOpen(false)}>
        <DialogTitle>{t('pages.buildings.delete_building')}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('pages.buildings.delete_building_confirm', { name: buildingToDelete?.name })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteBuildingDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button 
            color="error" 
            variant="contained"
            onClick={() => buildingToDelete && deleteBuildingMutation.mutate(buildingToDelete.id)}
            disabled={deleteBuildingMutation.isPending}
          >
            {deleteBuildingMutation.isPending ? t('common.deleting') : t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}