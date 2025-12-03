import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Avatar,
} from '@mui/material';
import {
  CalendarToday as CalendarIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import type { KanbanColumn, TaskListItem } from '../../api/tasks';

interface TaskKanbanViewProps {
  columns: KanbanColumn[];
  loading: boolean;
  onRefresh: () => void;
}

const priorityColors: Record<string, string> = {
  LOW: '#757575',
  NORMAL: '#2196f3',
  HIGH: '#ff9800',
  URGENT: '#f44336',
};

const TaskCard: React.FC<{ task: TaskListItem }> = ({ task }) => {
  const navigate = useNavigate();

  return (
    <Card
      sx={{
        mb: 1.5,
        cursor: 'pointer',
        transition: 'all 0.2s',
        borderLeft: `4px solid ${priorityColors[task.priority] || '#757575'}`,
        '&:hover': {
          boxShadow: 3,
          transform: 'translateY(-2px)',
        },
      }}
      onClick={() => navigate(`/tasks/${task.id}`)}
    >
      <CardContent sx={{ pb: 1 }}>
        <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
          #{task.id} {task.title}
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 1, mt: 1, mb: 1, flexWrap: 'wrap' }}>
          {task.tags && task.tags.split(',').map((tag, idx) => (
            <Chip
              key={idx}
              label={tag.trim()}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.7rem', height: 20 }}
            />
          ))}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
          <Avatar
            sx={{ width: 24, height: 24, fontSize: '0.75rem' }}
            alt={task.assignee?.full_name || task.assignee?.username}
          >
            {(task.assignee?.full_name || task.assignee?.username || '?')[0].toUpperCase()}
          </Avatar>
          <Typography variant="caption" color="text.secondary">
            {task.assignee?.full_name || task.assignee?.username || 'Не назначен'}
          </Typography>
        </Box>

        {task.deadline && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              mt: 1,
              color: task.is_overdue ? 'error.main' : 'text.secondary',
            }}
          >
            <CalendarIcon sx={{ fontSize: 16 }} />
            <Typography variant="caption">
              {new Date(task.deadline).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
            </Typography>
            {task.is_overdue && task.status !== 'COMPLETED' && (
              <Chip label="Просрочено" color="error" size="small" sx={{ ml: 0.5, height: 18 }} />
            )}
            {task.completed_with_delay && task.status === 'COMPLETED' && (
              <Chip label="Просрочено ✓" color="warning" size="small" sx={{ ml: 0.5, height: 18 }} />
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

const TaskKanbanView: React.FC<TaskKanbanViewProps> = ({ columns, loading }) => {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        overflowX: 'auto',
        pb: 2,
        minHeight: '70vh',
      }}
    >
      {columns.map((column) => (
        <Paper
          key={column.status}
          sx={{
            minWidth: 320,
            maxWidth: 320,
            p: 2,
            backgroundColor: '#f5f5f5',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {column.status_label}
            </Typography>
            <Chip label={column.count} color="primary" size="small" />
          </Box>

          <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
            {column.tasks.length === 0 ? (
              <Box
                sx={{
                  p: 3,
                  textAlign: 'center',
                  color: 'text.secondary',
                  border: '2px dashed #ccc',
                  borderRadius: 1,
                }}
              >
                <Typography variant="body2">Нет задач</Typography>
              </Box>
            ) : (
              column.tasks.map((task) => <TaskCard key={task.id} task={task} />)
            )}
          </Box>
        </Paper>
      ))}
    </Box>
  );
};

export default TaskKanbanView;
