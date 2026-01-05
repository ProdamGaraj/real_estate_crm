import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Paper, Typography, Button, Stack, Card, CardContent, CardMedia, IconButton, Tooltip } from '@mui/material';
import { updateLayoutImage, deleteLayoutImage } from '../../api/layouts';
import type { Layout } from '../../api/layouts';
import UploadIcon from '@mui/icons-material/Upload';
import DeleteIcon from '@mui/icons-material/Delete';
import { getMediaUrl } from '../../utils/media';
import { useAuthStore } from '../../store/authStore';
import { hasPermission } from '../../utils/permissions';

interface LayoutCardProps {
  layout: Layout;
  buildingId: number;
}

// Вспомогательный компонент для одного загрузчика
const ImageUploader = ({
  title,
  imageUrl,
  onFileSelect,
  onDelete,
  replaceLabel,
  uploadLabel,
  downloadLabel,
  canEdit
}: {
  title: string,
  imageUrl: string | null,
  onFileSelect: (file: File) => void,
  onDelete?: () => void,
  replaceLabel: string,
  uploadLabel: string,
  downloadLabel: string,
  canEdit: boolean
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDownload = () => {
    if (imageUrl) {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = title.replace(/\s+/g, '_') + '.png';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <Card variant="outlined">
      {imageUrl && <CardMedia component="img" height="140" image={imageUrl} alt={title} />}
      <CardContent>
        <Typography gutterBottom variant="body2" component="div">
          {title}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {canEdit && imageUrl && onDelete && (
            <Tooltip title="Удалить">
              <IconButton size="small" color="error" onClick={onDelete}>
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          )}
          {canEdit && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<UploadIcon />}
              onClick={() => inputRef.current?.click()}
            >
              {imageUrl ? replaceLabel : uploadLabel}
            </Button>
          )}
          {imageUrl && (
            <Button
              variant="text"
              size="small"
              onClick={handleDownload}
            >
              {downloadLabel}
            </Button>
          )}
        </Stack>
        {canEdit && (
          <input
            type="file"
            ref={inputRef}
            hidden
            accept="image/*"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                onFileSelect(e.target.files[0]);
              }
            }}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default function LayoutCard({ layout, buildingId }: LayoutCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: updateLayoutImage,
    onSuccess: () => {
      // Обновляем список планировок после успешной загрузки
      queryClient.invalidateQueries({ queryKey: ['layouts', buildingId] });
    },
    onError: () => {
      alert(t('buildings.image_upload_error'));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLayoutImage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layouts', buildingId] });
    },
    onError: () => {
      alert(t('common.error_occurred'));
    }
  });

  const handleFileUpdate = (fieldName: string, file: File) => {
    const formData = new FormData();
    formData.append(fieldName, file);
    mutation.mutate({ buildingId, layoutId: layout.id, formData });
  };

  const handleFileDelete = (fieldName: string) => {
    if (confirm(t('common.confirm_delete') || 'Are you sure?')) {
      deleteMutation.mutate({ buildingId, layoutId: layout.id, fieldName });
    }
  };

  const replaceLabel = t('buildings.replace', 'Заменить');
  const uploadLabel = t('common.upload');
  const downloadLabel = t('common.download');

  const { user } = useAuthStore();
  const canEdit = hasPermission(user, 'EDIT', 'LAYOUT');

  return (
    <Paper sx={{ p: 2, mb: 2 }} variant="outlined">
      <Typography variant="h6" sx={{ mb: 2 }}>{layout.name}</Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <ImageUploader
          title={t('pages.buildings.layout_main')}
          imageUrl={layout.main_layout_image ? getMediaUrl(layout.main_layout_image) : null}
          onFileSelect={(file) => handleFileUpdate('main_layout_image', file)}
          onDelete={() => handleFileDelete('main_layout_image')}
          replaceLabel={t('pages.buildings.replace', 'Заменить')}
          uploadLabel={uploadLabel}
          downloadLabel={downloadLabel}
          canEdit={canEdit}
        />
        <ImageUploader
          title={t('pages.buildings.layout_extra')}
          imageUrl={layout.extra_layout_image ? getMediaUrl(layout.extra_layout_image) : null}
          onFileSelect={(file) => handleFileUpdate('extra_layout_image', file)}
          onDelete={() => handleFileDelete('extra_layout_image')}
          replaceLabel={t('pages.buildings.replace', 'Заменить')}
          uploadLabel={uploadLabel}
          downloadLabel={downloadLabel}
          canEdit={canEdit}
        />
        <ImageUploader
          title={t('pages.buildings.layout_floor')}
          imageUrl={layout.floor_plan_image ? getMediaUrl(layout.floor_plan_image) : null}
          onFileSelect={(file) => handleFileUpdate('floor_plan_image', file)}
          onDelete={() => handleFileDelete('floor_plan_image')}
          replaceLabel={t('pages.buildings.replace', 'Заменить')}
          uploadLabel={uploadLabel}
          downloadLabel={downloadLabel}
          canEdit={canEdit}
        />
        <ImageUploader
          title={t('pages.buildings.layout_usp')}
          imageUrl={layout.usp_image ? getMediaUrl(layout.usp_image) : null}
          onFileSelect={(file) => handleFileUpdate('usp_image', file)}
          onDelete={() => handleFileDelete('usp_image')}
          replaceLabel={t('pages.buildings.replace', 'Заменить')}
          uploadLabel={uploadLabel}
          downloadLabel={downloadLabel}
          canEdit={canEdit}
        />
      </Stack>
    </Paper>
  );
}