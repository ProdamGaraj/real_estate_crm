import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Paper, Typography, Button, Stack, Card, CardContent, CardMedia } from '@mui/material';
import { updateLayoutImage } from '../../api/layouts';
import type { Layout } from '../../api/layouts';
import UploadIcon from '@mui/icons-material/Upload';
import { getMediaUrl } from '../../utils/media';

interface LayoutCardProps {
  layout: Layout;
  buildingId: number;
}

// Вспомогательный компонент для одного загрузчика
const ImageUploader = ({ title, imageUrl, onFileSelect, replaceLabel, uploadLabel }: { title: string, imageUrl: string | null, onFileSelect: (file: File) => void, replaceLabel: string, uploadLabel: string }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Card variant="outlined">
      {imageUrl && <CardMedia component="img" height="140" image={imageUrl} alt={title} />}
      <CardContent>
        <Typography gutterBottom variant="body2" component="div">
          {title}
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<UploadIcon />}
          onClick={() => inputRef.current?.click()}
        >
          {imageUrl ? replaceLabel : uploadLabel}
        </Button>
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

  const handleFileUpdate = (fieldName: string, file: File) => {
    const formData = new FormData();
    formData.append(fieldName, file);
    mutation.mutate({ buildingId, layoutId: layout.id, formData });
  };

  const replaceLabel = t('buildings.replace');
  const uploadLabel = t('common.upload');

  return (
    <Paper sx={{ p: 2, mb: 2 }} variant="outlined">
      <Typography variant="h6" sx={{ mb: 2 }}>{layout.name}</Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <ImageUploader title={t('buildings.layout_main')} imageUrl={getMediaUrl(layout.main_layout_image)} onFileSelect={(file) => handleFileUpdate('main_layout_image', file)} replaceLabel={replaceLabel} uploadLabel={uploadLabel} />
        <ImageUploader title={t('buildings.layout_extra')} imageUrl={getMediaUrl(layout.extra_layout_image)} onFileSelect={(file) => handleFileUpdate('extra_layout_image', file)} replaceLabel={replaceLabel} uploadLabel={uploadLabel} />
        <ImageUploader title={t('buildings.layout_floor')} imageUrl={getMediaUrl(layout.floor_plan_image)} onFileSelect={(file) => handleFileUpdate('floor_plan_image', file)} replaceLabel={replaceLabel} uploadLabel={uploadLabel} />
        <ImageUploader title={t('buildings.layout_usp')} imageUrl={getMediaUrl(layout.usp_image)} onFileSelect={(file) => handleFileUpdate('usp_image', file)} replaceLabel={replaceLabel} uploadLabel={uploadLabel} />
      </Stack>
    </Paper>
  );
}