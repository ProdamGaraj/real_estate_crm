import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Switch,
  IconButton,
  Chip,
} from '@mui/material';
import { GridActionsCellItem } from '@mui/x-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../common/LocalizedDataGrid';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getApplicationStatuses,
  createApplicationStatus,
  updateApplicationStatus,
  deleteApplicationStatus,
} from '../../api/settings';
import type { ApplicationStatus, ApplicationStatusPayload } from '../../api/settings';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useForm, Controller } from 'react-hook-form';

interface StatusFormData {
  code: string;
  name: string;
  color: string;
  order: number;
  is_active: boolean;
  is_final: boolean;
}

const defaultFormValues: StatusFormData = {
  code: '',
  name: '',
  color: '#9e9e9e',
  order: 0,
  is_active: true,
  is_final: false,
};

export default function ApplicationStatusManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<ApplicationStatus | null>(null);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<StatusFormData>({
    defaultValues: defaultFormValues,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['applicationStatuses'],
    queryFn: () => getApplicationStatuses(),
  });

  const createMutation = useMutation({
    mutationFn: createApplicationStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applicationStatuses'] });
      handleCloseDialog();
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateApplicationStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applicationStatuses'] });
      handleCloseDialog();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteApplicationStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applicationStatuses'] });
    },
  });

  const handleOpenDialog = (status?: ApplicationStatus) => {
    if (status) {
      setEditingStatus(status);
      reset({
        code: status.code,
        name: status.name,
        color: status.color,
        order: status.order,
        is_active: status.is_active,
        is_final: status.is_final,
      });
    } else {
      setEditingStatus(null);
      reset(defaultFormValues);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingStatus(null);
    reset(defaultFormValues);
  };

  const onSubmit = (formData: StatusFormData) => {
    const payload: ApplicationStatusPayload = {
      code: formData.code,
      name: formData.name,
      color: formData.color,
      order: formData.order,
      is_active: formData.is_active,
      is_final: formData.is_final,
    };

    if (editingStatus) {
      updateMutation.mutate({ id: editingStatus.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (id: number) => {
    if (window.confirm(t('pages.settings.application_statuses.confirm_delete'))) {
      deleteMutation.mutate(id);
    }
  };

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    { field: 'code', headerName: t('pages.settings.application_statuses.code'), width: 150 },
    { field: 'name', headerName: t('pages.settings.application_statuses.status_name'), flex: 1 },
    {
      field: 'color',
      headerName: t('pages.settings.application_statuses.color'),
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.value}
          size="small"
          sx={{ backgroundColor: params.value, color: '#fff', fontWeight: 500 }}
        />
      ),
    },
    { field: 'order', headerName: t('pages.settings.application_statuses.order'), width: 100 },
    {
      field: 'is_active',
      headerName: t('common.status'),
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.value ? t('common.active') : t('common.inactive')}
          color={params.value ? 'success' : 'default'}
          size="small"
        />
      ),
    },
    {
      field: 'is_final',
      headerName: t('pages.settings.application_statuses.is_final'),
      width: 120,
      renderCell: (params) => (
        params.value ? <Chip label={t('common.yes')} color="info" size="small" /> : null
      ),
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: t('common.actions'),
      width: 100,
      getActions: (params) => [
        <GridActionsCellItem
          icon={<EditIcon />}
          label={t('common.edit')}
          onClick={() => handleOpenDialog(params.row)}
        />,
        <GridActionsCellItem
          icon={<DeleteIcon />}
          label={t('common.delete')}
          onClick={() => handleDelete(params.row.id)}
        />,
      ],
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">{t('pages.settings.application_statuses.title')}</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          {t('pages.settings.application_statuses.add_status')}
        </Button>
      </Box>

      <Box sx={{ height: 400, width: '100%' }}>
        <LocalizedDataGrid
          rows={data || []}
          columns={columns}
          loading={isLoading}
        />
      </Box>

      {/* Dialog for creating/editing status */}
      <Dialog open={isDialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingStatus
            ? t('pages.settings.application_statuses.edit_status')
            : t('pages.settings.application_statuses.new_status')}
        </DialogTitle>
        <DialogContent>
          <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Controller
              name="code"
              control={control}
              rules={{ required: t('common.required_field') }}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={t('pages.settings.application_statuses.code')}
                  fullWidth
                  error={!!errors.code}
                  helperText={errors.code?.message || t('pages.settings.application_statuses.code_hint')}
                  disabled={!!editingStatus}
                />
              )}
            />
            <Controller
              name="name"
              control={control}
              rules={{ required: t('common.required_field') }}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={t('pages.settings.application_statuses.status_name')}
                  fullWidth
                  error={!!errors.name}
                  helperText={errors.name?.message}
                />
              )}
            />
            <Controller
              name="color"
              control={control}
              render={({ field }) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <TextField
                    {...field}
                    label={t('pages.settings.application_statuses.color')}
                    fullWidth
                    placeholder="#9e9e9e"
                  />
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 1,
                      backgroundColor: field.value || '#9e9e9e',
                      border: '1px solid',
                      borderColor: 'divider',
                      flexShrink: 0,
                    }}
                  />
                  <input
                    type="color"
                    value={field.value || '#9e9e9e'}
                    onChange={(e) => field.onChange(e.target.value)}
                    style={{ width: 48, height: 48, cursor: 'pointer', border: 'none' }}
                  />
                </Box>
              )}
            />
            <Controller
              name="order"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="number"
                  label={t('pages.settings.application_statuses.order')}
                  fullWidth
                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                />
              )}
            />
            <Controller
              name="is_active"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch checked={field.value} onChange={field.onChange} />}
                  label={t('pages.settings.application_statuses.is_active')}
                />
              )}
            />
            <Controller
              name="is_final"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch checked={field.value} onChange={field.onChange} />}
                  label={t('pages.settings.application_statuses.is_final')}
                />
              )}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleSubmit(onSubmit)}
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {createMutation.isPending || updateMutation.isPending
              ? t('common.saving')
              : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
