"""
Админ-панель для задач
"""
from django.contrib import admin
from .models import Task, TaskComment, TaskLog


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'title', 'status', 'priority', 'creator',
        'assignee', 'deadline', 'is_overdue', 'created_at'
    ]
    list_filter = ['status', 'priority', 'company', 'department', 'created_at']
    search_fields = ['title', 'description', 'tags']
    readonly_fields = ['created_at', 'updated_at', 'started_at', 'completed_at']
    autocomplete_fields = ['creator', 'assignee', 'company', 'department', 'parent_task']
    filter_horizontal = ['watchers']
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('title', 'description', 'status', 'priority', 'tags')
        }),
        ('Участники', {
            'fields': ('creator', 'assignee', 'watchers')
        }),
        ('Временные рамки', {
            'fields': ('created_at', 'started_at', 'deadline', 'completed_at', 'updated_at')
        }),
        ('Организация', {
            'fields': ('company', 'department')
        }),
        ('Дополнительно', {
            'fields': ('estimated_hours', 'actual_hours', 'parent_task'),
            'classes': ('collapse',)
        }),
    )


@admin.register(TaskComment)
class TaskCommentAdmin(admin.ModelAdmin):
    list_display = ['id', 'task', 'user', 'created_at']
    list_filter = ['created_at']
    search_fields = ['text', 'task__title']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(TaskLog)
class TaskLogAdmin(admin.ModelAdmin):
    list_display = ['id', 'task', 'user', 'action', 'created_at']
    list_filter = ['created_at']
    search_fields = ['action', 'task__title']
    readonly_fields = ['created_at']
