import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, CircularProgress, Alert, Link as MuiLink, TextField, IconButton } from '@mui/material';
import type { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import LocalizedDataGrid from '../components/common/LocalizedDataGrid';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { getProjects, deleteProject } from '../api/projects';
import type { ProjectFilters, Project } from '../api/projects';
import ProjectForm from '../components/projects/ProjectForm';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../store/authStore';
import { hasPermission } from '../utils/permissions';
import DeleteIcon from '@mui/icons-material/Delete';

export default function ProjectsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const canCreate = hasPermission(user, 'ADD', 'PROJECT');
  const canDelete = hasPermission(user, 'DELETE', 'PROJECT');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const queryClient = useQueryClient();

  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: number) => deleteProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    },
  });

  const columns: GridColDef[] = [
    { field: 'id', headerName: t('table.id'), width: 90 },
    {
      field: 'name',
      headerName: t('pages.projects.project_name'),
      flex: 1,
      renderCell: (params) => (
        <MuiLink component={RouterLink} to={`/projects/${params.id}`} underline="hover">
          {params.value}
        </MuiLink>
      ),
    },
    { field: 'address', headerName: t('table.address'), flex: 1 },
    {
      field: 'created_at',
      headerName: t('table.created_at'),
      type: 'dateTime',
      width: 200,
      valueGetter: (value) => new Date(value),
    },
    ...(canDelete ? [{
      field: 'actions',
      headerName: t('common.actions'),
      width: 100,
      sortable: false,
      renderCell: (params: GridRenderCellParams<Project>) => (
        <IconButton
          color="error"
          onClick={() => {
            setProjectToDelete(params.row as Project);
            setDeleteDialogOpen(true);
          }}
        >
          <DeleteIcon />
        </IconButton>
      ),
    }] : []),
  ];
  const [filters, setFilters] = useState<ProjectFilters>({});
  const { register, watch } = useForm<ProjectFilters>();

  useEffect(() => {
    const subscription = watch((value) => {
      const timer = setTimeout(() => {
        setFilters(value);
      }, 300);
      return () => clearTimeout(timer);
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['projects', filters],
    queryFn: () => getProjects(filters),
  });


  const handleSuccess = () => {
    setIsModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  if (isLoading) return <CircularProgress />;
  if (isError) return <Alert severity="error">{t('errors.load_projects_error')}: {(error as Error).message}</Alert>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">
          {t('pages.projects.title')}
        </Typography>
        {canCreate && (
          <Button variant="contained" onClick={() => setIsModalOpen(true)}>
            {t('pages.projects.create_project')}
          </Button>
        )}
      </Box>
      {/* Строка поиска */}
      <TextField
        label={t('pages.projects.search_by_name_address')}
        fullWidth
        size="small"
        {...register('search')}
      />
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('pages.projects.new_project')}</DialogTitle>
        <DialogContent>
          <ProjectForm onSuccess={handleSuccess} />
        </DialogContent>
      </Dialog>

      <Box sx={{ height: 600, width: '100%' }}>
        <LocalizedDataGrid
          rows={data || []}
          columns={columns}
          initialState={{
            sorting: {
              sortModel: [{ field: 'id', sort: 'desc' }],
            },
          }}
          disableRowSelectionOnClick
        />
      </Box>

      {/* Диалог подтверждения удаления проекта */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t('pages.projects.delete_project')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('pages.projects.delete_project_confirm', { name: projectToDelete?.name })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => projectToDelete && deleteProjectMutation.mutate(projectToDelete.id)}
            disabled={deleteProjectMutation.isPending}
          >
            {deleteProjectMutation.isPending ? <CircularProgress size={20} /> : t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}