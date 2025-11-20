import { Box, Paper, Tooltip, Typography } from '@mui/material';
import type { Property } from '../../api/buildings'; // Убедитесь, что этот тип экспортируется из api/buildings.ts

interface ChessboardProps {
  properties: Property[];
  onCellClick: (property: Property) => void;
}

// Группируем объекты: сначала по подъезду, потом по этажу
const groupProperties = (properties: Property[]) => {
  return properties.reduce((acc, prop) => {
    const entrance = prop.entrance || 0;
    const floor = prop.floor || 0;

    if (!acc[entrance]) {
      acc[entrance] = {};
    }
    if (!acc[entrance][floor]) {
      acc[entrance][floor] = [];
    }
    acc[entrance][floor].push(prop);
    return acc;
  }, {} as Record<number, Record<number, Property[]>>);
};

// Определяем цвет ячейки в зависимости от статуса
const getStatusColor = (status: string) => {
  switch (status) {
    case 'SELECTION': return 'success.light';
    case 'RESERVE': return 'info.light';
    case 'BOOKING': return 'warning.light';
    case 'IN_DEAL': return 'secondary.light';
    case 'SOLD': return 'error.light';
    default: return 'grey.300';
  }
};

export default function Chessboard({ properties, onCellClick }: ChessboardProps) {
  const propertiesByEntrance = groupProperties(properties);
  const entrances = Object.keys(propertiesByEntrance).map(Number).sort((a, b) => a - b);

  if (entrances.length === 0) {
    return <Typography sx={{ p: 2, color: 'text.secondary' }}>Нет объектов для отображения в шахматке.</Typography>
  }

  return (
    <Box sx={{ display: 'flex', gap: 3, overflowX: 'auto', p: 1, bgcolor: 'grey.50', borderRadius: 2 }}>
      {entrances.map(entrance => {
        const floors = Object.keys(propertiesByEntrance[entrance]).map(Number).sort((a, b) => b - a);
        return (
          <Paper key={entrance} sx={{ p: 1, minWidth: 300, flexShrink: 0 }} variant="outlined">
            <Typography variant="h6" align="center" sx={{ mb: 1 }}>
              Подъезд {entrance}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
              {floors.map((floor) => (
                <Box key={floor} sx={{ display: 'flex', borderBottom: '1px solid var(--color-border-light)' }}>
                  <Box sx={{ width: '50px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--color-border-light)' }}>
                    <Typography variant="subtitle2">{floor}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 1, p: 1 }}>
                    {propertiesByEntrance[entrance][floor]
                      .sort((a,b) => a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true }))
                      .map((prop) => (
                        <Tooltip key={prop.id} title={`№ ${prop.unit_number} | ${prop.status} | ${prop.area} м²`}>
                          <Box
                            onClick={() => onCellClick(prop)}
                            sx={{
                              width: 80,
                              height: 60,
                              bgcolor: getStatusColor(prop.status),
                              borderRadius: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              border: '1px solid var(--color-border-dark)',
                              transition: 'transform 0.1s ease-in-out',
                              '&:hover': {
                                opacity: 0.8,
                                transform: 'scale(1.05)',
                              },
                            }}
                          >
                            <Typography variant="body2" fontWeight="bold">{prop.unit_number}</Typography>
                            <Typography variant="caption">{prop.area} м²</Typography>
                          </Box>
                        </Tooltip>
                      ))}
                  </Box>
                </Box>
              ))}
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}