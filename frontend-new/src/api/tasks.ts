import apiClient from './axios';

// Типы данных
export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  status: 'NEW' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'CANCELLED' | 'BLOCKED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  creator: User;
  assignee: User;
  watchers: User[];
  created_at: string;
  started_at: string | null;
  deadline: string;
  completed_at: string | null;
  completed_with_delay: boolean;
  updated_at: string;
  company: number;
  company_name: string;
  department: number | null;
  department_name: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  tags: string;
  parent_task: number | null;
  is_overdue: boolean;
  time_spent: number;
  comments_count: number;
  subtasks_count: number;
}

export interface TaskListItem {
  id: number;
  title: string;
  status: string;
  priority: string;
  creator: User;
  assignee: User;
  created_at: string;
  deadline: string;
  is_overdue: boolean;
  completed_with_delay: boolean;
  company_name: string;
  department_name: string | null;
  tags: string;
}

export interface TaskComment {
  id: number;
  task: number;
  user: User;
  text: string;
  attachment: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskLog {
  id: number;
  task: number;
  user: User | null;
  action: string;
  old_value: any;
  new_value: any;
  created_at: string;
}

export interface TaskFilters {
  status?: string[];
  priority?: string[];
  creator?: number;
  assignee?: number;
  company?: number;
  department?: number;
  tags?: string;
  created_at_from?: string;
  created_at_to?: string;
  deadline_from?: string;
  deadline_to?: string;
  started_at_from?: string;
  started_at_to?: string;
  completed_at_from?: string;
  completed_at_to?: string;
  search?: string;
  is_overdue?: boolean;
  parent_task?: number;
  has_parent?: boolean;
}

export interface TaskPayload {
  title: string;
  description: string;
  assignee_id: number;
  started_at?: string; // datetime в формате ISO
  deadline: string; // datetime в формате ISO
  priority?: string;
  tags?: string;
  watcher_ids?: number[];
  parent_task?: number;
}

export interface TaskUpdatePayload {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee_id?: number;
  started_at?: string; // datetime в формате ISO
  deadline?: string; // datetime в формате ISO
  actual_hours?: number;
  tags?: string;
  watcher_ids?: number[];
}

export interface KanbanColumn {
  status: string;
  status_label: string;
  count: number;
  tasks: TaskListItem[];
}

export interface TaskStats {
  total: number;
  by_status: Record<string, { label: string; count: number }>;
  by_priority: Record<string, { label: string; count: number }>;
  overdue: number;
  my_tasks: number;
  created_by_me: number;
}

// API функции

/**
 * Получить список задач с фильтрами
 */
export const getTasks = async (filters: TaskFilters = {}): Promise<TaskListItem[]> => {
  const params: any = {};
  
  if (filters.status && filters.status.length > 0) {
    params.status = filters.status.join(',');
  }
  if (filters.priority && filters.priority.length > 0) {
    params.priority = filters.priority.join(',');
  }
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && key !== 'status' && key !== 'priority') {
      params[key] = value;
    }
  });

  const response = await apiClient.get('/tasks/', { params });
  return response.data;
};

/**
 * Получить задачу по ID
 */
export const getTaskById = async (id: number): Promise<Task> => {
  const response = await apiClient.get(`/tasks/${id}/`);
  return response.data;
};

/**
 * Создать новую задачу
 */
export const createTask = async (payload: TaskPayload): Promise<Task> => {
  const response = await apiClient.post('/tasks/', payload);
  return response.data;
};

/**
 * Обновить задачу
 */
export const updateTask = async ({ id, payload }: { id: number; payload: TaskUpdatePayload }): Promise<Task> => {
  const response = await apiClient.patch(`/tasks/${id}/`, payload);
  return response.data;
};

/**
 * Удалить задачу
 */
export const deleteTask = async (id: number): Promise<void> => {
  await apiClient.delete(`/tasks/${id}/`);
};

/**
 * Получить мои задачи (где я исполнитель)
 */
export const getMyTasks = async (): Promise<TaskListItem[]> => {
  const response = await apiClient.get('/tasks/my_tasks/');
  return response.data;
};

/**
 * Получить задачи, созданные мной
 */
export const getCreatedByMeTasks = async (): Promise<TaskListItem[]> => {
  const response = await apiClient.get('/tasks/created_by_me/');
  return response.data;
};

/**
 * Получить просроченные задачи
 */
export const getOverdueTasks = async (): Promise<TaskListItem[]> => {
  const response = await apiClient.get('/tasks/overdue/');
  return response.data;
};

/**
 * Получить данные для канбан-доски
 */
export const getKanbanData = async (filters: TaskFilters = {}): Promise<KanbanColumn[]> => {
  const params: any = {};
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params[key] = value;
    }
  });
  
  const response = await apiClient.get('/tasks/kanban/', { params });
  return response.data;
};

/**
 * Получить данные для календаря
 */
export const getCalendarData = async (year?: number, month?: number): Promise<TaskListItem[]> => {
  const params: any = {};
  if (year) params.year = year;
  if (month) params.month = month;
  
  const response = await apiClient.get('/tasks/calendar/', { params });
  return response.data;
};

/**
 * Начать работу над задачей
 */
export const startTask = async (id: number): Promise<Task> => {
  const response = await apiClient.post(`/tasks/${id}/start/`);
  return response.data;
};

/**
 * Завершить задачу
 */
export const completeTask = async (id: number, actual_hours?: number): Promise<Task> => {
  const response = await apiClient.post(`/tasks/${id}/complete/`, {
    actual_hours
  });
  return response.data;
};

/**
 * Отменить задачу
 */
export const cancelTask = async (id: number): Promise<Task> => {
  const response = await apiClient.post(`/tasks/${id}/cancel/`);
  return response.data;
};

/**
 * Вернуть отменённую задачу в работу
 */
export const reopenTask = async (params: {
  id: number;
  started_at?: string;
  deadline: string;
}): Promise<Task> => {
  const response = await apiClient.post(`/tasks/${params.id}/reopen/`, {
    started_at: params.started_at,
    deadline: params.deadline,
  });
  return response.data;
};

/**
 * Получить комментарии к задаче
 */
export const getTaskComments = async (taskId: number): Promise<TaskComment[]> => {
  const response = await apiClient.get(`/tasks/${taskId}/comments/`);
  return response.data;
};

/**
 * Добавить комментарий к задаче
 */
export const addTaskComment = async (taskId: number, text: string, attachment?: File): Promise<TaskComment> => {
  const formData = new FormData();
  formData.append('text', text);
  if (attachment) {
    formData.append('attachment', attachment);
  }

  const response = await apiClient.post(`/tasks/${taskId}/add_comment/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

/**
 * Получить логи задачи
 */
export const getTaskLogs = async (taskId: number): Promise<TaskLog[]> => {
  const response = await apiClient.get(`/tasks/${taskId}/logs/`);
  return response.data;
};

/**
 * Удалить лог задачи (только для администраторов)
 */
export const deleteTaskLog = async (taskId: number, logId: number): Promise<void> => {
  await apiClient.delete(`/tasks/${taskId}/logs/${logId}/`);
};

/**
 * Получить подзадачи
 */
export const getSubtasks = async (taskId: number): Promise<TaskListItem[]> => {
  const response = await apiClient.get(`/tasks/${taskId}/subtasks/`);
  return response.data;
};

/**
 * Получить статистику по задачам
 */
export const getTaskStats = async (): Promise<TaskStats> => {
  const response = await apiClient.get('/tasks/stats/');
  return response.data;
};
