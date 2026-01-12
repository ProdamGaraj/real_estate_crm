// src/components/applications/ApplicationsKanban.tsx
import { useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Card, CardContent, CardActionArea,
  Chip, Stack, Skeleton, Alert, IconButton, Menu, MenuItem, ListItemIcon, ListItemText,
  Snackbar
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApplicationStatuses, type ApplicationStatus } from '../../api/settings';
import { updateApplication, type Application } from '../../api/applications';
import { translateApplicationSource } from '../../utils/translations';
import PersonIcon from '@mui/icons-material/Person';
import SourceIcon from '@mui/icons-material/Campaign';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CircleIcon from '@mui/icons-material/Circle';

interface ApplicationsKanbanProps {
  applications: Application[];
  isLoading?: boolean;
}

// Карточка заявки
function ApplicationCard({ 
  application, 
  statuses,
  onStatusChange 
}: { 
  application: Application;
  statuses: ApplicationStatus[];
  onStatusChange: (appId: number, newStatus: string) => void;
}) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const formattedDate = new Date(application.created_at).toLocaleDateString(
    i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'uz' ? 'uz-UZ' : 'en-US',
    { day: '2-digit', month: 'short', year: 'numeric' }
  );

  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleStatusSelect = (statusCode: string) => {
    onStatusChange(application.id, statusCode);
    handleMenuClose();
  };

  // Фильтруем статусы - исключаем текущий
  const availableStatuses = statuses.filter(s => s.code !== application.status && s.is_active);

  return (
    <Card 
      sx={{ 
        mb: 1.5,
        '&:hover': { 
          boxShadow: 3,
          transform: 'translateY(-2px)',
          transition: 'all 0.2s ease-in-out'
        }
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Typography 
            variant="subtitle2" 
            color="primary" 
            sx={{ cursor: 'pointer' }}
            onClick={() => navigate(`/applications/${application.id}`)}
          >
            #{application.id}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip 
              label={translateApplicationSource(application.source)} 
              size="small" 
              variant="outlined"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
            <IconButton size="small" onClick={handleMenuOpen} sx={{ ml: 0.5, p: 0.25 }}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
        
        <Stack spacing={0.5} onClick={() => navigate(`/applications/${application.id}`)} sx={{ cursor: 'pointer' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <PersonIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
            <Typography variant="body2" noWrap title={application.client}>
              {application.client || t('common.no_client')}
            </Typography>
          </Box>
          
          {application.created_by && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <SourceIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary" noWrap>
                {application.created_by}
              </Typography>
            </Box>
          )}
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <AccessTimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              {formattedDate}
            </Typography>
          </Box>
        </Stack>

        {/* Меню смены статуса */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5, display: 'block' }}>
            {t('pages.applications.kanban.change_status')}
          </Typography>
          {availableStatuses.map((status) => (
            <MenuItem key={status.id} onClick={() => handleStatusSelect(status.code)}>
              <ListItemIcon>
                <CircleIcon sx={{ color: status.color, fontSize: 16 }} />
              </ListItemIcon>
              <ListItemText>{status.name}</ListItemText>
            </MenuItem>
          ))}
        </Menu>
      </CardContent>
    </Card>
  );
}

// Колонка Kanban
function KanbanColumn({ 
  status, 
  applications,
  statuses,
  onStatusChange
}: { 
  status: ApplicationStatus;
  applications: Application[];
  statuses: ApplicationStatus[];
  onStatusChange: (appId: number, newStatus: string) => void;
}) {
  const { t } = useTranslation();
  
  return (
    <Paper
      sx={{
        width: 280,
        minWidth: 280,
        maxHeight: 'calc(100vh - 300px)',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.default',
        borderTop: `4px solid ${status.color}`,
      }}
      elevation={1}
    >
      {/* Заголовок колонки */}
      <Box 
        sx={{ 
          p: 1.5, 
          borderBottom: 1, 
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          position: 'sticky',
          top: 0,
          zIndex: 1
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" fontWeight="bold">
            {status.name}
          </Typography>
          <Chip 
            label={applications.length} 
            size="small" 
            sx={{ 
              backgroundColor: status.color,
              color: 'white',
              fontWeight: 'bold',
              minWidth: 28
            }} 
          />
        </Box>
      </Box>
      
      {/* Карточки */}
      <Box 
        sx={{ 
          p: 1.5, 
          overflowY: 'auto',
          flexGrow: 1,
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': { 
            backgroundColor: 'divider',
            borderRadius: 3 
          }
        }}
      >
        {applications.length === 0 ? (
          <Typography 
            variant="body2" 
            color="text.secondary" 
            sx={{ textAlign: 'center', py: 2 }}
          >
            {t('pages.applications.kanban.no_applications')}
          </Typography>
        ) : (
          applications.map((app) => (
            <ApplicationCard 
              key={app.id} 
              application={app} 
              statuses={statuses}
              onStatusChange={onStatusChange}
            />
          ))
        )}
      </Box>
    </Paper>
  );
}

export default function ApplicationsKanban({ applications, isLoading }: ApplicationsKanbanProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });

  // Загружаем статусы
  const { data: statuses, isLoading: statusesLoading, isError: statusesError } = useQuery({
    queryKey: ['applicationStatuses', true],
    queryFn: () => getApplicationStatuses(true), // только активные
  });

  // Мутация для смены статуса
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => 
      updateApplication({ id, payload: { status } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      setSnackbar({ open: true, message: t('pages.applications.kanban.status_changed'), severity: 'success' });
    },
    onError: () => {
      setSnackbar({ open: true, message: t('pages.applications.kanban.status_change_error'), severity: 'error' });
    }
  });

  const handleStatusChange = (appId: number, newStatus: string) => {
    statusMutation.mutate({ id: appId, status: newStatus });
  };

  // Группируем заявки по статусам
  const applicationsByStatus = useMemo(() => {
    if (!statuses || !applications) return new Map<string, Application[]>();
    
    const grouped = new Map<string, Application[]>();
    
    // Инициализируем все статусы пустыми массивами
    statuses.forEach(status => {
      grouped.set(status.code, []);
    });
    
    // Распределяем заявки
    applications.forEach(app => {
      const existing = grouped.get(app.status);
      if (existing) {
        existing.push(app);
      }
    });
    
    return grouped;
  }, [applications, statuses]);

  if (statusesLoading || isLoading) {
    return (
      <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', py: 2 }}>
        {[1, 2, 3, 4].map((i) => (
          <Paper key={i} sx={{ width: 280, minWidth: 280, p: 2 }}>
            <Skeleton variant="text" width="60%" height={32} />
            <Skeleton variant="rectangular" height={100} sx={{ mt: 2, borderRadius: 1 }} />
            <Skeleton variant="rectangular" height={100} sx={{ mt: 1, borderRadius: 1 }} />
          </Paper>
        ))}
      </Box>
    );
  }

  if (statusesError) {
    return <Alert severity="error">{t('errors.load_statuses_error')}</Alert>;
  }

  if (!statuses || statuses.length === 0) {
    return (
      <Alert severity="info">
        {t('pages.applications.kanban.no_statuses')}
      </Alert>
    );
  }

  // Сортируем статусы по order
  const sortedStatuses = [...statuses].sort((a, b) => a.order - b.order);

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          py: 2,
          px: 1,
          minHeight: 400,
          '&::-webkit-scrollbar': { height: 8 },
          '&::-webkit-scrollbar-thumb': { 
            backgroundColor: 'divider',
            borderRadius: 4 
          }
        }}
      >
        {sortedStatuses.map((status) => (
          <KanbanColumn
            key={status.id}
            status={status}
            applications={applicationsByStatus.get(status.code) || []}
            statuses={statuses}
            onStatusChange={handleStatusChange}
          />
        ))}
      </Box>
      
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        message={snackbar.message}
      />
    </>
  );
}
