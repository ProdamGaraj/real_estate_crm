import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, CircularProgress, Alert, Link as MuiLink, TextField } from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../components/common/LocalizedDataGrid';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { getProjects } from '../api/projects';
import type { ProjectFilters } from '../api/projects';
import ProjectForm from '../components/projects/ProjectForm';
import { useForm } from 'react-hook-form';

export default function ProjectsPage() {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);

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
  ];
  const [filters, setFilters] = useState<ProjectFilters>({});
  const queryClient = useQueryClient();
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
        <Button variant="contained" onClick={() => setIsModalOpen(true)}>
          {t('pages.projects.create_project')}
        </Button>
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
    </Box>
  );
}