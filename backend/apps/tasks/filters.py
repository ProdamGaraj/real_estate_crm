"""
Фильтры для задач
"""
import django_filters
from django.db import models
from .models import Task


class TaskFilter(django_filters.FilterSet):
    """
    Фильтр для задач с поддержкой фильтрации по датам
    """
    # Фильтрация по статусу (множественный выбор)
    status = django_filters.MultipleChoiceFilter(
        choices=Task.TaskStatus.choices,
        lookup_expr='in'
    )
    
    # Фильтрация по приоритету (множественный выбор)
    priority = django_filters.MultipleChoiceFilter(
        choices=Task.TaskPriority.choices,
        lookup_expr='in'
    )
    
    # Фильтрация по создателю
    creator = django_filters.NumberFilter(field_name='creator__id')
    creator_username = django_filters.CharFilter(
        field_name='creator__username',
        lookup_expr='icontains'
    )
    
    # Фильтрация по исполнителю
    assignee = django_filters.NumberFilter(field_name='assignee__id')
    assignee_username = django_filters.CharFilter(
        field_name='assignee__username',
        lookup_expr='icontains'
    )
    
    # Фильтрация по компании и отделу
    company = django_filters.NumberFilter(field_name='company__id')
    department = django_filters.NumberFilter(field_name='department__id')
    
    # Фильтрация по тегам
    tags = django_filters.CharFilter(lookup_expr='icontains')
    
    # Фильтрация по дате создания
    created_at_from = django_filters.DateTimeFilter(
        field_name='created_at',
        lookup_expr='gte',
        label='Создано с'
    )
    created_at_to = django_filters.DateTimeFilter(
        field_name='created_at',
        lookup_expr='lte',
        label='Создано по'
    )
    
    # Фильтрация по дедлайну
    deadline_from = django_filters.DateTimeFilter(
        field_name='deadline',
        lookup_expr='gte',
        label='Дедлайн с'
    )
    deadline_to = django_filters.DateTimeFilter(
        field_name='deadline',
        lookup_expr='lte',
        label='Дедлайн по'
    )
    
    # Фильтрация по дате начала
    started_at_from = django_filters.DateTimeFilter(
        field_name='started_at',
        lookup_expr='gte',
        label='Начата с'
    )
    started_at_to = django_filters.DateTimeFilter(
        field_name='started_at',
        lookup_expr='lte',
        label='Начата по'
    )
    
    # Фильтрация по дате завершения
    completed_at_from = django_filters.DateTimeFilter(
        field_name='completed_at',
        lookup_expr='gte',
        label='Завершена с'
    )
    completed_at_to = django_filters.DateTimeFilter(
        field_name='completed_at',
        lookup_expr='lte',
        label='Завершена по'
    )
    
    # Поиск по названию и описанию
    search = django_filters.CharFilter(method='filter_search', label='Поиск')
    
    # Фильтр только для просроченных задач
    is_overdue = django_filters.BooleanFilter(
        method='filter_overdue',
        label='Просроченные'
    )
    
    # Фильтр по родительской задаче
    parent_task = django_filters.NumberFilter(field_name='parent_task__id')
    has_parent = django_filters.BooleanFilter(
        method='filter_has_parent',
        label='Имеет родительскую задачу'
    )
    
    class Meta:
        model = Task
        fields = [
            'status', 'priority', 'creator', 'assignee',
            'company', 'department', 'tags', 'parent_task'
        ]
    
    def filter_search(self, queryset, name, value):
        """Поиск по названию и описанию"""
        return queryset.filter(
            models.Q(title__icontains=value) |
            models.Q(description__icontains=value)
        )
    
    def filter_overdue(self, queryset, name, value):
        """Фильтр просроченных задач"""
        from django.utils import timezone
        from django.db.models import Q
        
        if value:
            # Просроченные: дедлайн прошел и статус не завершен/отменен
            return queryset.filter(
                deadline__lt=timezone.now()
            ).exclude(
                Q(status=Task.TaskStatus.COMPLETED) |
                Q(status=Task.TaskStatus.CANCELLED)
            )
        return queryset
    
    def filter_has_parent(self, queryset, name, value):
        """Фильтр задач с родительской задачей"""
        if value:
            return queryset.filter(parent_task__isnull=False)
        else:
            return queryset.filter(parent_task__isnull=True)
