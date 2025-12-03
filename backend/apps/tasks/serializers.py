"""
Сериализаторы для системы управления задачами
"""
from rest_framework import serializers
from django.contrib.auth.models import User
from django.utils import timezone
from .models import Task, TaskComment, TaskLog


class UserBriefSerializer(serializers.ModelSerializer):
    """Краткая информация о пользователе"""
    full_name = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = ['id', 'username', 'full_name', 'email']
    
    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class TaskCommentSerializer(serializers.ModelSerializer):
    """Сериализатор для комментариев к задаче"""
    user = UserBriefSerializer(read_only=True)
    user_id = serializers.IntegerField(write_only=True, required=False)
    
    class Meta:
        model = TaskComment
        fields = [
            'id', 'task', 'user', 'user_id', 'text',
            'attachment', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def create(self, validated_data):
        # Автоматически устанавливаем текущего пользователя
        validated_data['user'] = self.context['request'].user
        validated_data.pop('user_id', None)
        return super().create(validated_data)


class TaskLogSerializer(serializers.ModelSerializer):
    """Сериализатор для логов задачи"""
    user = UserBriefSerializer(read_only=True)
    
    class Meta:
        model = TaskLog
        fields = [
            'id', 'task', 'user', 'action',
            'old_value', 'new_value', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class TaskSerializer(serializers.ModelSerializer):
    """Основной сериализатор для задач"""
    creator = UserBriefSerializer(read_only=True)
    assignee = UserBriefSerializer(read_only=True)
    watchers = UserBriefSerializer(many=True, read_only=True)
    
    # Write-only поля для создания/обновления
    creator_id = serializers.IntegerField(write_only=True, required=False)
    assignee_id = serializers.IntegerField(required=True, write_only=True)
    watcher_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        allow_empty=True
    )
    
    # Дополнительные поля
    is_overdue = serializers.ReadOnlyField()
    time_spent = serializers.ReadOnlyField()
    comments_count = serializers.SerializerMethodField()
    subtasks_count = serializers.SerializerMethodField()
    
    # Информация о компании и отделе
    company_name = serializers.CharField(source='company.name', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True, allow_null=True)
    
    class Meta:
        model = Task
        fields = [
            'id', 'title', 'description', 'status', 'priority',
            'creator', 'creator_id', 'assignee', 'assignee_id',
            'watchers', 'watcher_ids',
            'created_at', 'started_at', 'deadline', 'completed_at', 'completed_with_delay', 'updated_at',
            'company', 'company_name', 'department', 'department_name',
            'estimated_hours', 'actual_hours', 'tags',
            'parent_task', 'is_overdue', 'time_spent',
            'comments_count', 'subtasks_count'
        ]
        read_only_fields = ['id', 'created_at', 'started_at', 'completed_at', 'completed_with_delay', 'updated_at']
        extra_kwargs = {
            'company': {'required': False},  # Будет установлено автоматически из профиля
            'department': {'required': False},
        }
    
    def get_comments_count(self, obj):
        """Количество комментариев"""
        return obj.comments.count()
    
    def get_subtasks_count(self, obj):
        """Количество подзадач"""
        return obj.subtasks.count()
    
    def validate_deadline(self, value):
        """Проверка дедлайна"""
        from datetime import datetime, date
        # Если value это date, сравниваем с сегодняшней датой
        if isinstance(value, date) and not isinstance(value, datetime):
            if value < timezone.now().date():
                raise serializers.ValidationError("Дедлайн не может быть в прошлом")
        # Если value это datetime, сравниваем с текущим временем
        elif isinstance(value, datetime):
            if value < timezone.now():
                raise serializers.ValidationError("Дедлайн не может быть в прошлом")
        return value
    
    def validate_assignee_id(self, value):
        """Проверка существования исполнителя"""
        if not User.objects.filter(id=value).exists():
            raise serializers.ValidationError("Пользователь не найден")
        return value
    
    def validate(self, data):
        """Общая валидация"""
        # Проверка подзадачи
        if 'parent_task' in data and data['parent_task']:
            parent = data['parent_task']
            if parent.parent_task:
                raise serializers.ValidationError({
                    'parent_task': 'Нельзя создавать подзадачу для подзадачи (максимум 2 уровня)'
                })
        
        # Валидация при обновлении
        if self.instance:
            user = self.context['request'].user
            task = self.instance
            
            # Блокируем редактирование завершенных задач (если нет FORCE_EDIT)
            if task.status == 'COMPLETED':
                from permissions.backends import can_user_perform_action
                has_force_edit = can_user_perform_action(user, 'FORCE_EDIT', 'TASK', obj=task)
                
                if not has_force_edit:
                    raise serializers.ValidationError(
                        "Редактирование завершенной задачи запрещено. Необходимо специальное разрешение."
                    )
            
            # Проверка редактирования задачи в работе
            if task.status == 'IN_PROGRESS':
                from permissions.backends import can_user_perform_action
                
                # Проверяем, есть ли у пользователя специальное разрешение на редактирование задачи в работе
                has_edit_in_progress = can_user_perform_action(user, 'EDIT_IN_PROGRESS', 'TASK', obj=task)
                
                # Если пользователь - исполнитель задачи
                is_assignee = task.assignee == user
                
                if not has_edit_in_progress:
                    # Исполнитель может только уменьшать deadline
                    if is_assignee:
                        # Проверяем какие поля пытаются изменить
                        forbidden_fields = set(data.keys()) - {'deadline', 'watcher_ids', 'tags'}
                        if forbidden_fields:
                            raise serializers.ValidationError(
                                "Вы можете изменять только дедлайн, теги и наблюдателей у задачи в работе"
                            )
                        
                        # Если изменяется deadline - проверяем что он только уменьшается
                        if 'deadline' in data:
                            new_deadline = data['deadline']
                            if new_deadline > task.deadline:
                                raise serializers.ValidationError({
                                    'deadline': 'Вы можете только уменьшать срок выполнения задачи'
                                })
                    else:
                        # Не исполнитель и нет специального разрешения
                        raise serializers.ValidationError(
                            "Редактирование задачи в работе запрещено. Необходимо специальное разрешение."
                        )
            
            # Проверка возврата отменённой задачи
            if task.status == 'CANCELLED':
                from permissions.backends import can_user_perform_action
                
                # Разрешаем редактировать отмененные задачи с FORCE_EDIT или только возврат с REOPEN
                has_force_edit = can_user_perform_action(user, 'FORCE_EDIT', 'TASK', obj=task)
                
                if not has_force_edit:
                    # Разрешаем только возврат в работу, остальное редактирование запрещено
                    if 'status' in data and data['status'] != 'CANCELLED':
                        has_reopen = can_user_perform_action(user, 'REOPEN', 'TASK', obj=task)
                        if not has_reopen:
                            raise serializers.ValidationError({
                                'status': 'У вас нет прав для возврата отменённой задачи в работу'
                            })
                    else:
                        # Попытка редактировать отмененную задачу без смены статуса
                        raise serializers.ValidationError(
                            "Редактирование отмененной задачи запрещено. Используйте функцию возврата в работу или получите специальное разрешение."
                        )
                
                # При возврате задачи проверяем сроки
                if 'started_at' in data and data['started_at']:
                    if data['started_at'] < timezone.now():
                        raise serializers.ValidationError({
                            'started_at': 'Время начала задачи не может быть в прошлом'
                        })
        
        return data
    
    def create(self, validated_data):
        """Создание задачи"""
        # Извлекаем ID полей для связей
        assignee_id = validated_data.pop('assignee_id')
        watcher_ids = validated_data.pop('watcher_ids', [])
        
        # Устанавливаем создателя как текущего пользователя
        user = self.context['request'].user
        validated_data['creator'] = user
        validated_data['assignee_id'] = assignee_id
        
        # Автоматически устанавливаем company и department из профиля создателя
        if hasattr(user, 'profile'):
            if 'company' not in validated_data and user.profile.company:
                validated_data['company'] = user.profile.company
            if 'department' not in validated_data and user.profile.department:
                validated_data['department'] = user.profile.department
        
        # Создаем задачу
        task = super().create(validated_data)
        
        # Добавляем наблюдателей
        if watcher_ids:
            task.watchers.set(watcher_ids)
        
        # Создаем лог
        TaskLog.objects.create(
            task=task,
            user=user,
            action="Задача создана",
            new_value={
                'title': task.title,
                'assignee': task.assignee.username,
                'deadline': task.deadline.isoformat()
            }
        )
        
        return task
    
    def update(self, instance, validated_data):
        """Обновление задачи"""
        user = self.context['request'].user
        
        # Извлекаем ID полей
        assignee_id = validated_data.pop('assignee_id', None)
        watcher_ids = validated_data.pop('watcher_ids', None)
        
        # Сохраняем старые значения для лога
        old_values = {
            'title': instance.title,
            'description': instance.description,
            'status': instance.status,
            'priority': instance.priority,
            'assignee_id': instance.assignee_id,
            'deadline': instance.deadline.isoformat() if instance.deadline else None,
            'started_at': instance.started_at.isoformat() if instance.started_at else None,
            'tags': instance.tags,
        }
        
        # Собираем изменения
        changes = {}
        
        # Обновляем assignee если передан
        if assignee_id and instance.assignee_id != assignee_id:
            changes['assignee_id'] = {'old': instance.assignee_id, 'new': assignee_id}
            instance.assignee_id = assignee_id
        
        # Обновляем основные поля
        for attr, value in validated_data.items():
            old_val = getattr(instance, attr)
            if old_val != value:
                if hasattr(old_val, 'isoformat'):
                    old_val = old_val.isoformat()
                if hasattr(value, 'isoformat'):
                    value_str = value.isoformat()
                else:
                    value_str = value
                changes[attr] = {'old': old_val, 'new': value_str}
            setattr(instance, attr, value)
        
        instance.save()
        
        # Обновляем наблюдателей
        if watcher_ids is not None:
            old_watcher_ids = list(instance.watchers.values_list('id', flat=True))
            instance.watchers.set(watcher_ids)
            if set(old_watcher_ids) != set(watcher_ids):
                changes['watchers'] = {'old': old_watcher_ids, 'new': watcher_ids}
        
        # Создаем лог если были изменения
        if changes:
            # Формируем описание изменений
            change_descriptions = []
            field_names = {
                'title': 'Название',
                'description': 'Описание',
                'status': 'Статус',
                'priority': 'Приоритет',
                'assignee_id': 'Исполнитель',
                'deadline': 'Дедлайн',
                'started_at': 'Время начала',
                'tags': 'Теги',
                'watchers': 'Наблюдатели'
            }
            
            for field, vals in changes.items():
                field_name = field_names.get(field, field)
                change_descriptions.append(f"{field_name}")
            
            TaskLog.objects.create(
                task=instance,
                user=user,
                action=f"Задача изменена: {', '.join(change_descriptions[:3])}{'...' if len(change_descriptions) > 3 else ''}",
                old_value=old_values,
                new_value={
                    'title': instance.title,
                    'description': instance.description,
                    'status': instance.status,
                    'priority': instance.priority,
                    'assignee_id': instance.assignee_id,
                    'deadline': instance.deadline.isoformat() if instance.deadline else None,
                    'started_at': instance.started_at.isoformat() if instance.started_at else None,
                    'tags': instance.tags,
                }
            )
        
        return instance


class TaskListSerializer(serializers.ModelSerializer):
    """Упрощенный сериализатор для списков задач"""
    creator = UserBriefSerializer(read_only=True)
    assignee = UserBriefSerializer(read_only=True)
    is_overdue = serializers.ReadOnlyField()
    company_name = serializers.CharField(source='company.name', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True, allow_null=True)
    
    class Meta:
        model = Task
        fields = [
            'id', 'title', 'status', 'priority',
            'creator', 'assignee',
            'created_at', 'deadline', 'is_overdue',
            'company_name', 'department_name', 'tags'
        ]


class TaskKanbanSerializer(serializers.Serializer):
    """Сериализатор для канбан-доски"""
    status = serializers.CharField()
    tasks = TaskListSerializer(many=True)
    count = serializers.IntegerField()
