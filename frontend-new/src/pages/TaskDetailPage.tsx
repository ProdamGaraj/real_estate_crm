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
import { useTranslation } from 'react-i18next';
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

const statusColors: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info'> = {
  NEW: 'default',
  IN_PROGRESS: 'primary',
  REVIEW: 'info',
  COMPLETED: 'success',
  CANCELLED: 'error',
  BLOCKED: 'warning',
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
  const { t, i18n } = useTranslation();

  const [commentText, setCommentText] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);

  const taskId = parseInt(id || '0', 10);

  // Get localized date format based on current language
  const getDateLocale = () => {
    const localeMap: Record<string, string> = {
      ru: 'ru-RU',
      en: 'en-US',
      uz: 'uz-UZ',
    };
    return localeMap[i18n.language] || 'ru-RU';
  };

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
    if (window.confirm(t('pages.tasks.confirm_delete_history'))) {
      deleteLogMutation.mutate({ taskId, logId });
    }
  };

  const handleDelete = () => {
    if (window.confirm(t('pages.tasks.confirm_delete_task'))) {
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
        <Alert severity="error">{t('pages.tasks.task_not_found')}</Alert>
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
          <Typography variant="h4">{t('pages.tasks.task_number', { id: task.id })}</Typography>
          <Chip
            label={task.status === 'COMPLETED' && task.completed_with_delay ? t('pages.tasks.overdue_completed') : t(`statuses.task.${task.status}`)}
            color={task.status === 'COMPLETED' && task.completed_with_delay ? 'warning' : statusColors[task.status]}
          />
          <Chip
            label={t(`statuses.task_priority.${task.priority}`)}
            color={priorityColors[task.priority]}
          />
          {task.is_overdue && task.status !== 'COMPLETED' && <Chip label={t('pages.tasks.overdue')} color="error" />}
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          {task.status === 'NEW' && (
            <Button
              startIcon={<StartIcon />}
              variant="outlined"
              onClick={() => startMutation.mutate(taskId)}
            >
              {t('pages.tasks.start')}
            </Button>
          )}
          {task.status === 'IN_PROGRESS' && (
            <Button
              startIcon={<CompleteIcon />}
              variant="outlined"
              color="success"
              onClick={() => completeMutation.mutate(taskId)}
            >
              {t('pages.tasks.complete')}
            </Button>
          )}
          {task.status === 'CANCELLED' && (
            <Button
              startIcon={<RestoreIcon />}
              variant="outlined"
              color="primary"
              onClick={() => setReopenDialogOpen(true)}
            >
              {t('pages.tasks.return_to_work')}
            </Button>
          )}
          {task.status !== 'CANCELLED' && task.status !== 'COMPLETED' && (
            <Button
              startIcon={<CancelIcon />}
              variant="outlined"
              color="error"
              onClick={() => cancelMutation.mutate(taskId)}
            >
              {t('pages.tasks.cancel_task')}
            </Button>
          )}
          <Button
            startIcon={<EditIcon />}
            variant="contained"
            onClick={() => setEditDialogOpen(true)}
          >
            {t('common.edit')}
          </Button>
          <Tooltip title={t('common.delete')}>
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
                {t('pages.tasks.subtasks')} ({subtasks.length})
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
                          label={t(`statuses.task.${subtask.status}`)}
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
              {t('pages.tasks.comments')} ({comments.length})
            </Typography>
            
            <Box sx={{ mb: 3 }}>
              <TextField
                fullWidth
                multiline
                rows={3}
                placeholder={t('pages.tasks.add_comment')}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <Button
                variant="contained"
                sx={{ mt: 1 }}
                onClick={handleAddComment}
                disabled={!commentText.trim() || addCommentMutation.isPending}
              >
                {t('common.send')}
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
                          {new Date(comment.created_at).toLocaleString(getDateLocale())}
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
              {t('common.details')}
            </Typography>
            <Divider sx={{ my: 2 }} />
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('pages.tasks.author')}
                </Typography>
                <Typography variant="body2">
                  {task.creator.full_name || task.creator.username}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('pages.tasks.assignee')}
                </Typography>
                <Typography variant="body2">
                  {task.assignee.full_name || task.assignee.username}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('pages.tasks.deadline')}
                </Typography>
                <Typography variant="body2" color={task.is_overdue ? 'error' : 'inherit'}>
                  {new Date(task.deadline).toLocaleDateString(getDateLocale())}
                </Typography>
              </Box>

              {task.started_at && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('pages.tasks.started_at')}
                  </Typography>
                  <Typography variant="body2">
                    {new Date(task.started_at).toLocaleString(getDateLocale())}
                  </Typography>
                </Box>
              )}

              {task.completed_at && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('pages.tasks.completed_at')}
                  </Typography>
                  <Typography variant="body2">
                    {new Date(task.completed_at).toLocaleString(getDateLocale())}
                  </Typography>
                </Box>
              )}

              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('pages.tasks.created_at')}
                </Typography>
                <Typography variant="body2">
                  {new Date(task.created_at).toLocaleString(getDateLocale())}
                </Typography>
              </Box>

              {task.estimated_hours && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('pages.tasks.estimated_hours')}
                  </Typography>
                  <Typography variant="body2">{task.estimated_hours} {t('pages.tasks.hours_abbr')}</Typography>
                </Box>
              )}

              {task.actual_hours && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('pages.tasks.actual_hours')}
                  </Typography>
                  <Typography variant="body2">{task.actual_hours} {t('pages.tasks.hours_abbr')}</Typography>
                </Box>
              )}

              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('common.company')}
                </Typography>
                <Typography variant="body2">{task.company_name}</Typography>
              </Box>

              {task.department_name && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('pages.users.department')}
                  </Typography>
                  <Typography variant="body2">{task.department_name}</Typography>
                </Box>
              )}

              {task.watchers.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('pages.tasks.watchers')}
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
              {t('pages.tasks.history')}
            </Typography>
            <Box sx={{ mt: 2, maxHeight: 400, overflow: 'auto' }}>
              {logs.map((log) => (
                <Box key={log.id} sx={{ mb: 2, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(log.created_at).toLocaleString(getDateLocale())}
                    </Typography>
                    <Typography variant="body2">
                      {log.user ? (log.user.full_name || log.user.username) : t('common.system')}: {log.action}
                    </Typography>
                  </Box>
                  <Tooltip title={t('pages.tasks.delete_history_entry')}>
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
