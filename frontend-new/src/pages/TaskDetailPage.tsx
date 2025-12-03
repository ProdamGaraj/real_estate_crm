import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  Button,
  TextField,
  CircularProgress,
  Alert,
  Divider,
  Card,
  CardContent,
  Avatar,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Edit as EditIcon,
  PlayArrow as StartIcon,
  CheckCircle as CompleteIcon,
  Cancel as CancelIcon,
  Delete as DeleteIcon,
  Restore as RestoreIcon,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTaskById,
  getTaskComments,
  getTaskLogs,
  getSubtasks,
  startTask,
  completeTask,
  cancelTask,
  deleteTask,
  addTaskComment,
  deleteTaskLog,
} from '../api/tasks';
import { TaskFormDialog } from '../components/tasks/TaskFormDialog';
import { ReopenTaskDialog } from '../components/tasks/ReopenTaskDialog';

const statusLabels: Record<string, string> = {
  NEW: 'Новая',
  IN_PROGRESS: 'В работе',
  REVIEW: 'На проверке',
  COMPLETED: 'Завершена',
  CANCELLED: 'Отменена',
  BLOCKED: 'Заблокирована',
};

const statusColors: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info'> = {
  NEW: 'default',
  IN_PROGRESS: 'primary',
  REVIEW: 'info',
  COMPLETED: 'success',
  CANCELLED: 'error',
  BLOCKED: 'warning',
};

const priorityLabels: Record<string, string> = {
  LOW: 'Низкий',
  NORMAL: 'Обычный',
  HIGH: 'Высокий',
  URGENT: 'Срочный',
};

const priorityColors: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info'> = {
  LOW: 'default',
  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'error',
};

const TaskDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [commentText, setCommentText] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);

  const taskId = parseInt(id || '0', 10);

  // Запросы данных
  const { data: task, isLoading, error } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => getTaskById(taskId),
    enabled: !!taskId,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: () => getTaskComments(taskId),
    enabled: !!taskId,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['task-logs', taskId],
    queryFn: () => getTaskLogs(taskId),
    enabled: !!taskId,
  });

  const { data: subtasks = [] } = useQuery({
    queryKey: ['task-subtasks', taskId],
    queryFn: () => getSubtasks(taskId),
    enabled: !!taskId,
  });

  // Мутации
  const startMutation = useMutation({
    mutationFn: startTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: number) => completeTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      navigate('/tasks');
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: ({ taskId, text }: { taskId: number; text: string }) => addTaskComment(taskId, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
      setCommentText('');
    },
  });

  const deleteLogMutation = useMutation({
    mutationFn: ({ taskId, logId }: { taskId: number; logId: number }) => deleteTaskLog(taskId, logId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-logs', taskId] });
    },
  });

  const handleAddComment = () => {
    if (commentText.trim()) {
      addCommentMutation.mutate({ taskId, text: commentText });
    }
  };

  const handleDeleteLog = (logId: number) => {
    if (window.confirm('Вы уверены, что хотите удалить эту запись из истории?')) {
      deleteLogMutation.mutate({ taskId, logId });
    }
  };

  const handleDelete = () => {
    if (window.confirm('Вы уверены, что хотите удалить эту задачу?')) {
      deleteMutation.mutate(taskId);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !task) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Задача не найдена</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Шапка */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={() => navigate('/tasks')}>
            <BackIcon />
          </IconButton>
          <Typography variant="h4">Задача #{task.id}</Typography>
          <Chip
            label={task.status === 'COMPLETED' && task.completed_with_delay ? 'Просрочено ✓' : statusLabels[task.status]}
            color={task.status === 'COMPLETED' && task.completed_with_delay ? 'warning' : statusColors[task.status]}
          />
          <Chip
            label={priorityLabels[task.priority]}
            color={priorityColors[task.priority]}
          />
          {task.is_overdue && task.status !== 'COMPLETED' && <Chip label="Просрочено" color="error" />}
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          {task.status === 'NEW' && (
            <Button
              startIcon={<StartIcon />}
              variant="outlined"
              onClick={() => startMutation.mutate(taskId)}
            >
              Начать
            </Button>
          )}
          {task.status === 'IN_PROGRESS' && (
            <Button
              startIcon={<CompleteIcon />}
              variant="outlined"
              color="success"
              onClick={() => completeMutation.mutate(taskId)}
            >
              Завершить
            </Button>
          )}
          {task.status === 'CANCELLED' && (
            <Button
              startIcon={<RestoreIcon />}
              variant="outlined"
              color="primary"
              onClick={() => setReopenDialogOpen(true)}
            >
              Вернуть в работу
            </Button>
          )}
          {task.status !== 'CANCELLED' && task.status !== 'COMPLETED' && (
            <Button
              startIcon={<CancelIcon />}
              variant="outlined"
              color="error"
              onClick={() => cancelMutation.mutate(taskId)}
            >
              Отменить
            </Button>
          )}
          <Button
            startIcon={<EditIcon />}
            variant="contained"
            onClick={() => setEditDialogOpen(true)}
          >
            Редактировать
          </Button>
          <Tooltip title="Удалить">
            <IconButton color="error" onClick={handleDelete}>
              <DeleteIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 3 }}>
        {/* Основная информация */}
        <Box>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h5" gutterBottom>
              {task.title}
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
              {task.description}
            </Typography>
            
            {task.tags && (
              <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {task.tags.split(',').map((tag, idx) => (
                  <Chip key={idx} label={tag.trim()} size="small" variant="outlined" />
                ))}
              </Box>
            )}
          </Paper>

          {/* Подзадачи */}
          {subtasks.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Подзадачи ({subtasks.length})
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {subtasks.map((subtask) => (
                  <Card
                    key={subtask.id}
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/tasks/${subtask.id}`)}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle2">
                          #{subtask.id} {subtask.title}
                        </Typography>
                        <Chip
                          label={statusLabels[subtask.status]}
                          color={statusColors[subtask.status]}
                          size="small"
                        />
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </Paper>
          )}

          {/* Комментарии */}
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Комментарии ({comments.length})
            </Typography>
            
            <Box sx={{ mb: 3 }}>
              <TextField
                fullWidth
                multiline
                rows={3}
                placeholder="Добавить комментарий..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <Button
                variant="contained"
                sx={{ mt: 1 }}
                onClick={handleAddComment}
                disabled={!commentText.trim() || addCommentMutation.isPending}
              >
                Отправить
              </Button>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {comments.map((comment) => (
                <Card key={comment.id} variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Avatar sx={{ width: 32, height: 32 }}>
                        {(comment.user.full_name || comment.user.username)[0].toUpperCase()}
                      </Avatar>
                      <Box>
                        <Typography variant="subtitle2">
                          {comment.user.full_name || comment.user.username}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(comment.created_at).toLocaleString('ru-RU')}
                        </Typography>
                      </Box>
                    </Box>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {comment.text}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Paper>
        </Box>

        {/* Боковая панель */}
        <Box>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Детали
            </Typography>
            <Divider sx={{ my: 2 }} />
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Автор
                </Typography>
                <Typography variant="body2">
                  {task.creator.full_name || task.creator.username}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Исполнитель
                </Typography>
                <Typography variant="body2">
                  {task.assignee.full_name || task.assignee.username}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Срок выполнения
                </Typography>
                <Typography variant="body2" color={task.is_overdue ? 'error' : 'inherit'}>
                  {new Date(task.deadline).toLocaleDateString('ru-RU')}
                </Typography>
              </Box>

              {task.started_at && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Начата
                  </Typography>
                  <Typography variant="body2">
                    {new Date(task.started_at).toLocaleString('ru-RU')}
                  </Typography>
                </Box>
              )}

              {task.completed_at && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Завершена
                  </Typography>
                  <Typography variant="body2">
                    {new Date(task.completed_at).toLocaleString('ru-RU')}
                  </Typography>
                </Box>
              )}

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Создана
                </Typography>
                <Typography variant="body2">
                  {new Date(task.created_at).toLocaleString('ru-RU')}
                </Typography>
              </Box>

              {task.estimated_hours && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Оценка времени
                  </Typography>
                  <Typography variant="body2">{task.estimated_hours} ч</Typography>
                </Box>
              )}

              {task.actual_hours && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Фактическое время
                  </Typography>
                  <Typography variant="body2">{task.actual_hours} ч</Typography>
                </Box>
              )}

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Компания
                </Typography>
                <Typography variant="body2">{task.company_name}</Typography>
              </Box>

              {task.department_name && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Отдел
                  </Typography>
                  <Typography variant="body2">{task.department_name}</Typography>
                </Box>
              )}

              {task.watchers.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Наблюдатели
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                    {task.watchers.map((watcher) => (
                      <Typography key={watcher.id} variant="body2">
                        {watcher.full_name || watcher.username}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          </Paper>

          {/* История изменений */}
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              История изменений
            </Typography>
            <Box sx={{ mt: 2, maxHeight: 400, overflow: 'auto' }}>
              {logs.map((log) => (
                <Box key={log.id} sx={{ mb: 2, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(log.created_at).toLocaleString('ru-RU')}
                    </Typography>
                    <Typography variant="body2">
                      {log.user ? (log.user.full_name || log.user.username) : 'Система'}: {log.action}
                    </Typography>
                  </Box>
                  <Tooltip title="Удалить запись">
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteLog(log.id)}
                      disabled={deleteLogMutation.isPending}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Box>
          </Paper>
        </Box>
      </Box>

      {/* Диалог редактирования */}
      <TaskFormDialog
        open={editDialogOpen}
        task={task}
        onClose={() => setEditDialogOpen(false)}
      />

      {/* Диалог возврата задачи */}
      <ReopenTaskDialog
        open={reopenDialogOpen}
        taskId={taskId}
        onClose={() => setReopenDialogOpen(false)}
      />
    </Box>
  );
};

export default TaskDetailPage;
