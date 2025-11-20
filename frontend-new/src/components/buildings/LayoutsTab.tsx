import { useQuery } from '@tanstack/react-query';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';
import { getLayouts } from '../../api/layouts';
import LayoutCard from './LayoutCard';

interface LayoutsTabProps {
  buildingId: number;
}

export default function LayoutsTab({ buildingId }: LayoutsTabProps) {
  const { data: layouts, isLoading, isError } = useQuery({
    queryKey: ['layouts', buildingId],
    queryFn: () => getLayouts(buildingId),
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    return <Alert severity="error">Не удалось загрузить планировки.</Alert>;
  }

  return (
    <Box>
      {layouts && layouts.length > 0 ? (
        layouts.map((layout) => (
          <LayoutCard key={layout.id} layout={layout} buildingId={buildingId} />
        ))
      ) : (
        <Typography>Планировки для этого дома еще не были загружены через Excel.</Typography>
      )}
    </Box>
  );
}
