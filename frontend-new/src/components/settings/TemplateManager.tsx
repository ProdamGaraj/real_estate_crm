import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getTemplates, deleteTemplate } from '../../api/templates';
import type { Template } from '../../api/templates';
import { Box, Button, CircularProgress, Typography, Link as MuiLink } from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import { GridActionsCellItem } from '@mui/x-data-grid';
import LocalizedDataGrid from '../common/LocalizedDataGrid';

import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import TemplateFormModal from './TemplateFormModal';
import { extractApiError } from '../../utils/apiError';
import { useAuthStore } from '../../store/authStore';
import { hasPermission, isSystemAdmin } from '../../utils/permissions';

export default function TemplateManager() {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<{ open: boolean; template: Template | null }>({
    open: false, template: null,
  });
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const admin = isSystemAdmin(user);
  const canAdd = hasPermission(user, 'ADD', 'TEMPLATE');
  const canEdit = hasPermission(user, 'EDIT', 'TEMPLATE');
  const canDelete = hasPermission(user, 'DELETE', 'TEMPLATE');

  const { data: templates, isLoading } = useQuery({ queryKey: ['templates'], queryFn: getTemplates });

  const deleteMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
    onError: (error: unknown) => alert(extractApiError(error, t('errors.error_occurred'))),
  });

  // Общесистемный шаблон (без компании) меняет только системный администратор
  const editable = (row: Template) => admin || row.company !== null;

  const columns: GridColDef<Template>[] = [
    { field: 'name', headerName: t('pages.templates.template_name'), flex: 1, minWidth: 180 },
    {
      // Без вида шаблона в списке не понять, почему договор не появился
      // в брони: он заведён как договор по сделке
      field: 'kind', headerName: t('pages.templates.kind'), width: 170,
      valueFormatter: (value: string) => t(`pages.templates.kind_${String(value).toLowerCase()}`, value),
    },
    {
      // Чей шаблон: администратор видит все шаблоны сразу, и без этой
      // колонки не понять, что шаблон заведён в другой компании и
      // менеджерам он недоступен
      field: 'company_name', headerName: t('common.company'), width: 170,
      valueGetter: (value: string | null) => value || t('pages.settings.finance_refs.shared'),
    },
    {
      field: 'file', headerName: t('pages.templates.template_file'), width: 130,
      renderCell: (params) => (
        <MuiLink href={params.value} target="_blank" rel="noopener noreferrer">
          {t('common.download')}
        </MuiLink>
      ),
    },
    {
      field: 'actions', type: 'actions', width: 90,
      getActions: (params) => [
        ...(canEdit && editable(params.row) ? [
          <GridActionsCellItem
            key="edit"
            icon={<EditIcon />}
            label={t('common.edit')}
            onClick={() => setDialog({ open: true, template: params.row })}
          />,
        ] : []),
        ...(canDelete && editable(params.row) ? [
          <GridActionsCellItem
            key="delete"
            icon={<DeleteIcon />}
            label={t('common.delete')}
            onClick={() => {
              if (window.confirm(t('pages.settings.finance_refs.confirm_delete', { name: params.row.name }))) {
                deleteMutation.mutate(params.row.id);
              }
            }}
          />,
        ] : []),
      ],
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">{t('pages.templates.title')}</Typography>
        {canAdd && (
          <Button variant="contained" onClick={() => setDialog({ open: true, template: null })}>
            {t('pages.templates.create_template')}
          </Button>
        )}
      </Box>

      <TemplateFormModal
        open={dialog.open}
        template={dialog.template}
        onClose={() => setDialog({ open: false, template: null })}
      />

      <Box sx={{ height: 600, width: '100%' }}>
        {isLoading ? <CircularProgress /> : <LocalizedDataGrid rows={templates || []} columns={columns} />}
      </Box>
    </Box>
  );
}
