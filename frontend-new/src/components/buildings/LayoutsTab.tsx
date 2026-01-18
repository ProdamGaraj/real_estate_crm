import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { 
  Box, Typography, CircularProgress, Alert, Button, Stack, 
  Dialog, DialogTitle, DialogContent, DialogActions,
  List, ListItem, ListItemIcon, ListItemText, Chip, LinearProgress
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ImageIcon from '@mui/icons-material/Image';
import { getLayouts, bulkUploadLayoutImages, type BulkUploadResult } from '../../api/layouts';
import { getPropertyTemplateUrl } from '../../api/buildings';
import LayoutCard from './LayoutCard';
import { useAuthStore } from '../../store/authStore';
import { hasPermission } from '../../utils/permissions';

interface LayoutsTabProps {
  projectId: number;
  buildingId: number;
}

export default function LayoutsTab({ projectId, buildingId }: LayoutsTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadResult, setUploadResult] = useState<BulkUploadResult | null>(null);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  
  const { user } = useAuthStore();
  const canEdit = hasPermission(user, 'EDIT', 'LAYOUT');
  
  const { data: layouts, isLoading, isError } = useQuery({
    queryKey: ['layouts', buildingId],
    queryFn: () => getLayouts(buildingId),
  });

  const bulkUploadMutation = useMutation({
    mutationFn: (files: File[]) => bulkUploadLayoutImages({ buildingId, files }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['layouts', buildingId] });
      setUploadResult(result);
      setResultDialogOpen(true);
    },
    onError: (error: Error) => {
      alert(`${t('common.error')}: ${error.message}`);
    },
  });

  const handleDownloadTemplate = async () => {
    try {
      // Для window.open нужен полный путь с /api
      const url = `/api${getPropertyTemplateUrl(projectId, buildingId)}`;
      window.open(url, '_blank');
    } catch {
      alert(t('pages.buildings.download_error'));
    }
  };

  const handleBulkUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      bulkUploadMutation.mutate(Array.from(files));
    }
    // Сбрасываем значение input чтобы можно было загрузить те же файлы повторно
    event.target.value = '';
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    return <Alert severity="error">{t('pages.buildings.layouts.load_error')}</Alert>;
  }

  return (
    <Box>
      {/* Кнопка массовой загрузки */}
      {canEdit && (
        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            onClick={handleBulkUpload}
            disabled={bulkUploadMutation.isPending}
          >
            {bulkUploadMutation.isPending 
              ? t('common.uploading', 'Загрузка...') 
              : t('pages.buildings.layouts.bulk_upload', 'Массовая загрузка')}
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            hidden
            multiple
            accept="image/*"
            onChange={handleFilesSelected}
          />
        </Stack>
      )}

      {bulkUploadMutation.isPending && (
        <Box sx={{ mb: 2 }}>
          <LinearProgress />
          <Typography variant="caption" color="text.secondary">
            {t('pages.buildings.layouts.uploading_files', 'Загрузка файлов...')}
          </Typography>
        </Box>
      )}

      {layouts && layouts.length > 0 ? (
        layouts.map((layout) => (
          <LayoutCard key={layout.id} layout={layout} buildingId={buildingId} />
        ))
      ) : (
        <Stack spacing={2} alignItems="flex-start">
          <Alert severity="info">{t('pages.buildings.layouts.not_loaded')}</Alert>
          <Typography variant="body2" color="text.secondary">
            {t('pages.buildings.layouts.upload_hint')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('pages.buildings.layouts.bulk_upload_hint', 'Для массовой загрузки используйте формат имени файла: название_тип.расширение')}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {t('pages.buildings.layouts.bulk_upload_types', 'Типы: main (планировка), extra (доп. планировка), floor (на этаже), usp (УТП)')}
            <br />
            {t('pages.buildings.layouts.bulk_upload_example', 'Пример: Студия_main.jpg, 1-комн 35м_floor.png')}
          </Typography>
          <Button 
            variant="outlined" 
            startIcon={<DownloadIcon />}
            onClick={handleDownloadTemplate}
          >
            {t('pages.buildings.download_template')}
          </Button>
        </Stack>
      )}

      {/* Диалог результатов загрузки */}
      <Dialog 
        open={resultDialogOpen} 
        onClose={() => setResultDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {t('pages.buildings.layouts.upload_result', 'Результат загрузки')}
        </DialogTitle>
        <DialogContent>
          {uploadResult && (
            <Box>
              <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                <Chip 
                  icon={<CheckCircleIcon />} 
                  label={`${t('common.success', 'Успешно')}: ${uploadResult.uploaded}`}
                  color="success"
                  variant="outlined"
                />
                {uploadResult.errors_count > 0 && (
                  <Chip 
                    icon={<ErrorIcon />} 
                    label={`${t('common.errors', 'Ошибки')}: ${uploadResult.errors_count}`}
                    color="error"
                    variant="outlined"
                  />
                )}
              </Stack>

              {uploadResult.created_layouts.length > 0 && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  {t('pages.buildings.layouts.created_layouts', 'Созданы новые планировки')}: {uploadResult.created_layouts.join(', ')}
                </Alert>
              )}

              {uploadResult.details.success.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    {t('pages.buildings.layouts.uploaded_files', 'Загруженные файлы')}:
                  </Typography>
                  <List dense>
                    {uploadResult.details.success.map((item, index) => (
                      <ListItem key={index}>
                        <ListItemIcon>
                          <ImageIcon color="success" />
                        </ListItemIcon>
                        <ListItemText 
                          primary={item.file}
                          secondary={`${item.layout} → ${item.field}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}

              {uploadResult.details.errors.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" gutterBottom color="error">
                    {t('pages.buildings.layouts.failed_files', 'Файлы с ошибками')}:
                  </Typography>
                  <List dense>
                    {uploadResult.details.errors.map((item, index) => (
                      <ListItem key={index}>
                        <ListItemIcon>
                          <ErrorIcon color="error" />
                        </ListItemIcon>
                        <ListItemText 
                          primary={item.file}
                          secondary={item.error}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResultDialogOpen(false)}>
            {t('common.close', 'Закрыть')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
