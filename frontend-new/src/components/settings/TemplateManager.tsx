import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTemplates, deleteTemplate } from '../../api/templates';
import { Box, Button, CircularProgress, Typography, IconButton, Link as MuiLink } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';

import DeleteIcon from '@mui/icons-material/Delete';
import TemplateFormModal from './TemplateFormModal'; // <--- Раскомментируйте эту строку

export default function TemplateManager() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery({ queryKey: ['templates'], queryFn: getTemplates });

  const deleteMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] })
  });

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'Название шаблона', flex: 1 },
    { field: 'file', headerName: 'Файл', flex: 1, renderCell: (params) => <MuiLink href={params.value} target="_blank" rel="noopener noreferrer">Скачать</MuiLink> },
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
        <Typography variant="h6">Менеджер шаблонов</Typography>
        <Button variant="contained" onClick={() => setIsModalOpen(true)}>Добавить шаблон</Button>
      </Box>

      {/* --- Раскомментируйте этот блок --- */}
      <TemplateFormModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <Box sx={{ height: 600, width: '100%' }}>
        {isLoading ? <CircularProgress /> : <DataGrid rows={templates || []} columns={columns} />}
      </Box>
    </Box>
  );
}