import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getTemplates, deleteTemplate } from '../../api/templates';
import { Box, Button, CircularProgress, Typography, IconButton, Link as MuiLink } from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import LocalizedDataGrid from '../common/LocalizedDataGrid';

import DeleteIcon from '@mui/icons-material/Delete';
import TemplateFormModal from './TemplateFormModal';

export default function TemplateManager() {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery({ queryKey: ['templates'], queryFn: getTemplates });

  const deleteMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] })
  });

  const columns: GridColDef[] = [
    { field: 'name', headerName: t('pages.templates.template_name'), flex: 1 },
    { field: 'file', headerName: t('pages.templates.template_file'), flex: 1, renderCell: (params) => <MuiLink href={params.value} target="_blank" rel="noopener noreferrer">{t('common.download')}</MuiLink> },
    {
      field: 'actions',
      type: 'actions',
      getActions: (params) => [
        <IconButton onClick={() => deleteMutation.mutate(params.row.id)}>
            <DeleteIcon />
        </IconButton>
      ]
    }
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">{t('pages.templates.title')}</Typography>
        <Button variant="contained" onClick={() => setIsModalOpen(true)}>{t('pages.templates.create_template')}</Button>
      </Box>

      <TemplateFormModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <Box sx={{ height: 600, width: '100%' }}>
        {isLoading ? <CircularProgress /> : <LocalizedDataGrid rows={templates || []} columns={columns} />}
      </Box>
    </Box>
  );
}