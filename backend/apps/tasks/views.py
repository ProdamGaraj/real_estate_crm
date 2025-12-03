"""
Views для системы управления задачами
Интегрировано с системой разрешений
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, Count
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend

from permissions.backends import get_filtered_queryset
from .models import Task, TaskComment, TaskLog
from .serializers import (
    TaskSerializer, TaskListSerializer, TaskCommentSerializer,
    TaskLogSerializer, TaskKanbanSerializer
)
from .filters import TaskFilter
from .permissions import TaskPermission


class TaskViewSet(viewsets.ModelViewSet):
    """
    ViewSet для управления задачами
    Поддерживает CRUD операции, фильтрацию и специальные представления
    """
    queryset = Task.objects.all()
    permission_classes = [IsAuthenticated, TaskPermission]
    filter_backends = [DjangoFilterBackend]
    filterset_class = TaskFilter
    
    def get_serializer_class(self):
        """Выбор сериализатора в зависимости от действия"""
        if self.action == 'list':
            return TaskListSerializer
        return TaskSerializer
    
    def get_queryset(self):
        """
        Автоматическая фильтрация задач на основе разрешений пользователя
        """
        queryset = super().get_queryset()
        user = self.request.user
        
        # Применяем фильтрацию через систему разрешений
        queryset = get_filtered_queryset(user, queryset, 'TASK')
        
        # Оптимизация запросов
        queryset = queryset.select_related(
            'creator', 'assignee', 'company', 'department', 'parent_task'
        ).prefetch_related('watchers', 'comments', 'subtasks')
        
        return queryset
    
    @action(detail=False, methods=['get'])
    def my_tasks(self, request):
        """
        Получить задачи текущего пользователя (где он исполнитель)
        GET /api/tasks/my_tasks/
        """
        queryset = self.filter_queryset(self.get_queryset())
        queryset = queryset.filter(assignee=request.user)
        
        serializer = TaskListSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def created_by_me(self, request):
        """
        Получить задачи, созданные текущим пользователем
        GET /api/tasks/created_by_me/
        """
        queryset = self.filter_queryset(self.get_queryset())
        queryset = queryset.filter(creator=request.user)
        
        serializer = TaskListSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """
        Получить просроченные задачи
        GET /api/tasks/overdue/
        """
        queryset = self.filter_queryset(self.get_queryset())
        queryset = queryset.filter(
            deadline__lt=timezone.now()
        ).exclude(
            Q(status=Task.TaskStatus.COMPLETED) |
            Q(status=Task.TaskStatus.CANCELLED)
        )
        
        serializer = TaskListSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def kanban(self, request):
        """
        Получить данные для канбан-доски (группировка по статусам)
        GET /api/tasks/kanban/
        """
        queryset = self.filter_queryset(self.get_queryset())
        
        # Группируем задачи по статусам
        kanban_data = []
        for status_choice in Task.TaskStatus.choices:
            status_code = status_choice[0]
            status_label = status_choice[1]
            
            status_tasks = queryset.filter(status=status_code)
            kanban_data.append({
                'status': status_code,
                'status_label': status_label,
                'tasks': TaskListSerializer(status_tasks, many=True).data,
                'count': status_tasks.count()
            })
        
        return Response(kanban_data)
    
    @action(detail=False, methods=['get'])
    def calendar(self, request):
        """
        Получить данные для календаря (группировка по датам дедлайна)
        GET /api/tasks/calendar/?year=2025&month=11
        """
        queryset = self.filter_queryset(self.get_queryset())
        
        # Фильтрация по году и месяцу если указаны
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        
        if year and month:
            queryset = queryset.filter(
                deadline__year=year,
                deadline__month=month
            )
        
        # Сортируем по дедлайну
        queryset = queryset.order_by('deadline')
        
        serializer = TaskListSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """
        Начать работу над задачей (изменить статус на IN_PROGRESS)
        POST /api/tasks/{id}/start/
        """
        task = self.get_object()
        
        if task.status != Task.TaskStatus.NEW:
            return Response(
                {'error': 'Можно начать только новую задачу'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        old_status = task.status
        task.status = Task.TaskStatus.IN_PROGRESS
        task.started_at = timezone.now()
        task.save()
        
        # Создаем лог
        TaskLog.objects.create(
            task=task,
            user=request.user,
            action="Работа над задачей начата",
            old_value={'status': old_status},
            new_value={'status': task.status, 'started_at': task.started_at.isoformat()}
        )
        
        serializer = self.get_serializer(task)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """
        Завершить задачу
        POST /api/tasks/{id}/complete/
        Body: {"actual_hours": 5.5} (опционально)
        """
        task = self.get_object()
        
        if task.status == Task.TaskStatus.COMPLETED:
            return Response(
                {'error': 'Задача уже завершена'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        task.status = Task.TaskStatus.COMPLETED
        task.completed_at = timezone.now()
        
        # Проверяем просрочку
        is_overdue = task.deadline < timezone.now()
        if is_overdue:
            task.completed_with_delay = True
        
        # Устанавливаем фактическое время если передано
        actual_hours = request.data.get('actual_hours')
        if actual_hours:
            task.actual_hours = actual_hours
        
        task.save()
        
        # Создаем лог
        log_action = "Задача завершена"
        if is_overdue:
            delay_time = task.completed_at - task.deadline
            delay_hours = delay_time.total_seconds() / 3600
            log_action = f"Задача завершена с просрочкой ({delay_hours:.1f} ч)"
        
        TaskLog.objects.create(
            task=task,
            user=request.user,
            action=log_action,
            new_value={
                'status': task.status,
                'completed_at': task.completed_at.isoformat(),
                'actual_hours': float(task.actual_hours) if task.actual_hours else None,
                'completed_with_delay': task.completed_with_delay
            }
        )
        
        serializer = self.get_serializer(task)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """
        Отменить задачу
        POST /api/tasks/{id}/cancel/
        Body: {"reason": "причина отмены"} (опционально)
        """
        task = self.get_object()
        
        if task.status in [Task.TaskStatus.COMPLETED, Task.TaskStatus.CANCELLED]:
            return Response(
                {'error': 'Нельзя отменить завершенную или уже отмененную задачу'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        old_status = task.status
        reason = request.data.get('reason', '')
        
        task.status = Task.TaskStatus.CANCELLED
        task.save()
        
        # Создаем лог
        action_text = 'Задача отменена'
        if reason:
            action_text += f': {reason}'
        
        TaskLog.objects.create(
            task=task,
            user=request.user,
            action=action_text,
            old_value={'status': old_status},
            new_value={'status': task.status, 'reason': reason}
        )
        
        serializer = self.get_serializer(task)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        """
        Вернуть отменённую задачу в работу с изменением сроков
        POST /api/tasks/{id}/reopen/
        Body: {"started_at": "2025-11-26T10:00:00Z", "deadline": "2025-11-30T18:00:00Z"}
        """
        from permissions.backends import can_user_perform_action
        from django.utils.dateparse import parse_datetime
        from dateutil import parser as date_parser
        
        try:
            task = self.get_object()
            
            # Проверяем права на возврат задачи
            if not can_user_perform_action(request.user, 'REOPEN', 'TASK', obj=task):
                return Response(
                    {'error': 'У вас нет прав для возврата отменённой задачи'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            if task.status != Task.TaskStatus.CANCELLED:
                return Response(
                    {'error': 'Можно вернуть только отменённую задачу'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Получаем новые сроки из запроса
            new_started_at = request.data.get('started_at')
            new_deadline = request.data.get('deadline')
            
            if not new_deadline:
                return Response(
                    {'error': 'Необходимо указать новый дедлайн'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Валидация дедлайна
            if isinstance(new_deadline, str):
                try:
                    new_deadline = date_parser.parse(new_deadline)
                    if timezone.is_naive(new_deadline):
                        new_deadline = timezone.make_aware(new_deadline)
                except (ValueError, TypeError) as e:
                    return Response(
                        {'error': f'Неверный формат дедлайна: {str(e)}'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            
            if new_deadline < timezone.now():
                return Response(
                    {'error': 'Дедлайн не может быть в прошлом'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Валидация времени начала
            if new_started_at:
                if isinstance(new_started_at, str):
                    try:
                        new_started_at = date_parser.parse(new_started_at)
                        if timezone.is_naive(new_started_at):
                            new_started_at = timezone.make_aware(new_started_at)
                    except (ValueError, TypeError) as e:
                        return Response(
                            {'error': f'Неверный формат времени начала: {str(e)}'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                
                if new_started_at < timezone.now():
                    return Response(
                        {'error': 'Время начала не может быть в прошлом'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            
            # Обновляем задачу
            task.status = Task.TaskStatus.RETURNED
            task.started_at = new_started_at
            task.deadline = new_deadline
            task.save()
            
            # Создаем лог
            TaskLog.objects.create(
                task=task,
                user=request.user,
                action='Задача возвращена в работу',
                new_value={
                    'status': task.status,
                    'started_at': task.started_at.isoformat() if task.started_at else None,
                    'deadline': task.deadline.isoformat()
                }
            )
            
            serializer = self.get_serializer(task)
            return Response(serializer.data)
            
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            print(f"Ошибка в reopen: {error_trace}")
            return Response(
                {'error': f'Произошла ошибка при возврате задачи: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def comments(self, request, pk=None):
        """
        Получить комментарии к задаче
        GET /api/tasks/{id}/comments/
        """
        task = self.get_object()
        comments = task.comments.all().order_by('created_at')
        serializer = TaskCommentSerializer(comments, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def add_comment(self, request, pk=None):
        """
        Добавить комментарий к задаче
        POST /api/tasks/{id}/add_comment/
        Body: {"text": "Комментарий", "attachment": file}
        """
        task = self.get_object()
        
        serializer = TaskCommentSerializer(
            data={'task': task.id, **request.data},
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        # Создаем лог
        TaskLog.objects.create(
            task=task,
            user=request.user,
            action="Добавлен комментарий"
        )
        
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['get'])
    def logs(self, request, pk=None):
        """
        Получить историю изменений задачи
        GET /api/tasks/{id}/logs/
        """
        task = self.get_object()
        logs = task.logs.all().order_by('-created_at')
        serializer = TaskLogSerializer(logs, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['delete'], url_path='logs/(?P<log_id>[^/.]+)')
    def delete_log(self, request, pk=None, log_id=None):
        """
        Удалить запись из истории изменений задачи (только для администраторов)
        DELETE /api/tasks/{id}/logs/{log_id}/
        """
        from permissions.backends import can_user_perform_action
        
        task = self.get_object()
        
        # Проверяем права на удаление логов
        if not can_user_perform_action(request.user, 'DELETE_LOG', 'TASK_LOG', obj=task):
            return Response(
                {'error': 'У вас нет прав для удаления логов задач'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            log = TaskLog.objects.get(id=log_id, task=task)
            log_action = log.action
            log.delete()
            
            # Создаем запись об удалении лога
            TaskLog.objects.create(
                task=task,
                user=request.user,
                action=f'Удалена запись из истории: "{log_action}"',
                old_value={'deleted_log_id': log_id}
            )
            
            return Response(status=status.HTTP_204_NO_CONTENT)
            
        except TaskLog.DoesNotExist:
            return Response(
                {'error': 'Лог не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['get'])
    def subtasks(self, request, pk=None):
        """
        Получить подзадачи
        GET /api/tasks/{id}/subtasks/
        """
        task = self.get_object()
        subtasks = task.subtasks.all()
        serializer = TaskListSerializer(subtasks, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """
        Получить статистику по задачам
        GET /api/tasks/stats/
        """
        queryset = self.filter_queryset(self.get_queryset())
        
        stats = {
            'total': queryset.count(),
            'by_status': {},
            'by_priority': {},
            'overdue': queryset.filter(
                deadline__lt=timezone.now()
            ).exclude(
                Q(status=Task.TaskStatus.COMPLETED) |
                Q(status=Task.TaskStatus.CANCELLED)
            ).count(),
            'my_tasks': queryset.filter(assignee=request.user).count(),
            'created_by_me': queryset.filter(creator=request.user).count(),
        }
        
        # Статистика по статусам
        for status_choice in Task.TaskStatus.choices:
            status_code = status_choice[0]
            status_label = status_choice[1]
            stats['by_status'][status_code] = {
                'label': status_label,
                'count': queryset.filter(status=status_code).count()
            }
        
        # Статистика по приоритетам
        for priority_choice in Task.TaskPriority.choices:
            priority_code = priority_choice[0]
            priority_label = priority_choice[1]
            stats['by_priority'][priority_code] = {
                'label': priority_label,
                'count': queryset.filter(priority=priority_code).count()
            }
        
        return Response(stats)


class TaskCommentViewSet(viewsets.ModelViewSet):
    """
    ViewSet для управления комментариями к задачам
    """
    queryset = TaskComment.objects.all()
    serializer_class = TaskCommentSerializer
    permission_classes = [IsAuthenticated, TaskPermission]
    
    def get_queryset(self):
        """Фильтрация комментариев на основе доступных задач"""
        user = self.request.user
        # Получаем задачи, доступные пользователю
        accessible_tasks = get_filtered_queryset(user, Task.objects.all(), 'TASK')
        # Возвращаем только комментарии к доступным задачам
        return TaskComment.objects.filter(task__in=accessible_tasks).select_related('user', 'task')
