import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Paper,
  Tabs,
  Tab,
  Typography,
  Button,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  Stack,
  Collapse,
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  FilterList as FilterListIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { getTasks, getKanbanData, getTaskStats } from '../api/tasks';
import TaskListView from '../components/tasks/TaskListView';
import TaskKanbanView from '../components/tasks/TaskKanbanView';
import TaskCalendarView from '../components/tasks/TaskCalendarView';
import TaskFilterForm from '../components/tasks/TaskFilterForm';
import { TaskFormDialog } from '../components/tasks/TaskFormDialog';
import type { TaskFilters } from '../api/tasks';
import { hasAnyViewPermission } from '../utils/permissions';
import { useAuthStore } from '../store/authStore';
import { useIsMobile } from '../hooks/useMobile';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
  isMobile?: boolean;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, isMobile = false, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tasks-tabpanel-${index}`}
      aria-labelledby={`tasks-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: isMobile ? 1 : 3 }}>{children}</Box>}
    </div>
  );
}

const TasksPage: React.FC = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  // On mobile, default to Kanban view (index 1)
  const [tabValue, setTabValue] = useState(isMobile ? 1 : 0);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<TaskFilters>({});
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);

  // Update tabValue if isMobile changes
  useEffect(() => {
    if (isMobile && tabValue === 0) {
      setTabValue(1); // Switch to Kanban on mobile
    }
  }, [isMobile]);

  const { user } = useAuthStore();

  // Проверка прав
  const canView = hasAnyViewPermission(user, 'TASK');

  // Запросы данных
  const {
    data: tasks,
    isLoading: tasksLoading,
    error: tasksError,
    refetch: refetchTasks,
  } = useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => getTasks(filters),
    enabled: canView && tabValue === 0,
  });

  const {
    data: kanbanData,
    isLoading: kanbanLoading,
    error: kanbanError,
    refetch: refetchKanban,
  } = useQuery({
    queryKey: ['tasks-kanban', filters],
    queryFn: () => getKanbanData(filters),
    enabled: canView && tabValue === 1,
  });

  const {
    data: stats,
    error: statsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['tasks-stats'],
    queryFn: getTaskStats,
    enabled: canView,
  });

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleRefresh = () => {
    if (tabValue === 0) {
      refetchTasks();
    } else if (tabValue === 1) {
      refetchKanban();
    }
    refetchStats();
  };

  const handleApplyFilters = (newFilters: TaskFilters) => {
    setFilters(newFilters);
    setShowFilters(false);
  };

  const handleResetFilters = () => {
    setFilters({});
    setShowFilters(false);
  };

  if (!canView) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          {t('pages.tasks.no_view_permission')}
        </Alert>
      </Box>
    );
  }

  // Показываем ошибки если есть
  if (tasksError || kanbanError || statsError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          {t('errors.error_prefix')} {(tasksError as Error)?.message || (kanbanError as Error)?.message || (statsError as Error)?.message}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: isMobile ? 1 : 3 }}>
      {/* Заголовок */}
      <Stack 
        direction={isMobile ? 'column' : 'row'} 
        justifyContent="space-between" 
        alignItems={isMobile ? 'stretch' : 'center'} 
        spacing={2}
        sx={{ mb: isMobile ? 2 : 3 }}
      >
        <Box>
          <Typography variant={isMobile ? 'h5' : 'h4'} gutterBottom>
            {t('pages.tasks.title')}
          </Typography>
          {stats && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
              <Chip label={`${t('pages.tasks.total_count')} ${stats.total}`} color="default" size="small" />
              <Chip label={`${t('pages.tasks.my_tasks')} ${stats.my_tasks}`} color="primary" size="small" />
              {stats.overdue > 0 && (
                <Chip label={`${t('pages.tasks.overdue_count')} ${stats.overdue}`} color="error" size="small" />
              )}
            </Box>
          )}
        </Box>
        <Stack direction="row" spacing={1} justifyContent={isMobile ? 'flex-end' : 'flex-start'}>
          <Tooltip title={t('common.refresh')}>
            <IconButton onClick={handleRefresh} size={isMobile ? 'small' : 'medium'}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('common.filters')}>
            <IconButton
              onClick={() => setShowFilters(!showFilters)}
              color={Object.keys(filters).length > 0 ? 'primary' : 'default'}
              size={isMobile ? 'small' : 'medium'}
            >
              <FilterListIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={!isMobile && <AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            size={isMobile ? 'small' : 'medium'}
          >
            {isMobile ? <AddIcon /> : t('pages.tasks.create_task')}
          </Button>
        </Stack>
      </Stack>

      {/* Панель фильтров */}
      <Collapse in={showFilters}>
        <Paper sx={{ p: 2, mb: isMobile ? 2 : 3 }}>
          <TaskFilterForm
            filters={filters}
            onApply={handleApplyFilters}
            onReset={handleResetFilters}
          />
        </Paper>
      </Collapse>

      {/* Вкладки */}
      <Paper sx={{ mb: 2 }}>
        <Tabs 
          value={tabValue} 
          onChange={handleTabChange}
          variant={isMobile ? 'fullWidth' : 'standard'}
        >
          <Tab label={t('pages.tasks.list_view')} />
          <Tab label={t('pages.tasks.kanban_view')} />
          {!isMobile && <Tab label={t('pages.tasks.calendar_view')} />}
        </Tabs>
      </Paper>

      {/* Содержимое вкладок */}
      <TabPanel value={tabValue} index={0} isMobile={isMobile}>
        <TaskListView
          tasks={tasks || []}
          loading={tasksLoading}
          onRefresh={refetchTasks}
          onEdit={(task) => {
            setEditingTask(task);
            setEditDialogOpen(true);
          }}
        />
      </TabPanel>

      <TabPanel value={tabValue} index={1} isMobile={isMobile}>
        <TaskKanbanView
          columns={kanbanData || []}
          loading={kanbanLoading}
          onRefresh={refetchKanban}
        />
      </TabPanel>

      {!isMobile && (
        <TabPanel value={tabValue} index={2} isMobile={isMobile}>
          <TaskCalendarView filters={filters} />
        </TabPanel>
      )}

      {/* Диалог создания задачи */}
      <TaskFormDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />

      {/* Диалог редактирования задачи */}
      <TaskFormDialog
        open={editDialogOpen}
        task={editingTask}
        onClose={() => {
          setEditDialogOpen(false);
          setEditingTask(null);
        }}
      />
    </Box>
  );
};

export default TasksPage;
