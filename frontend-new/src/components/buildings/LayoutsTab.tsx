import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Box, Typography, CircularProgress, Alert, Button, Stack } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import { getLayouts } from '../../api/layouts';
import { getPropertyTemplateUrl } from '../../api/buildings';
import LayoutCard from './LayoutCard';

interface LayoutsTabProps {
  buildingId: number;
}

export default function LayoutsTab({ buildingId }: LayoutsTabProps) {
  const { t } = useTranslation();
  const { data: layouts, isLoading, isError } = useQuery({
    queryKey: ['layouts', buildingId],
    queryFn: () => getLayouts(buildingId),
  });

  const handleDownloadTemplate = async () => {
    try {
      const url = await getPropertyTemplateUrl(buildingId);
      window.open(url, '_blank');
    } catch {
      alert(t('pages.buildings.download_error'));
    }
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
          <Button 
            variant="outlined" 
            startIcon={<DownloadIcon />}
            onClick={handleDownloadTemplate}
          >
            {t('pages.buildings.download_template')}
          </Button>
        </Stack>
      )}
    </Box>
  );
}
