"""
Permissions для задач - интеграция с системой разрешений
"""
from rest_framework import permissions
from permissions.backends import can_user_perform_action


class TaskPermission(permissions.BasePermission):
    """
    Проверка разрешений для задач с использованием системы разрешений
    """
    
    def has_permission(self, request, view):
        """
        Проверка разрешений на уровне списка
        """
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Полный маппинг действий к типам разрешений
        ACTION_MAP = {
            # VIEW-действия
            'list': 'VIEW',
            'retrieve': 'VIEW',
            'kanban': 'VIEW',
            'calendar': 'VIEW',
            'my_tasks': 'VIEW',
            'created_by_me': 'VIEW',
            'logs': 'VIEW',
            'stats': 'VIEW',
            'overdue': 'VIEW',
            'subtasks': 'VIEW',
            'comments': 'VIEW',
            # ADD-действия
            'create': 'ADD',
            'add_comment': 'ADD',
            # EDIT-действия
            'update': 'EDIT',
            'partial_update': 'EDIT',
            'start': 'EDIT',
            'complete': 'EDIT',
            'cancel': 'EDIT',
            'reopen': 'EDIT',
            # DELETE-действия
            'destroy': 'DELETE',
            'delete_log': 'DELETE',
        }
        
        action = ACTION_MAP.get(view.action)
        if action is None:
            # Неизвестное действие — отклоняем
            return False
        
        # Проверяем наличие разрешения для работы с задачами
        return can_user_perform_action(request.user, action, 'TASK')
    
    def has_object_permission(self, request, view, obj):
        """
        Проверка разрешений на уровне объекта
        """
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Системный администратор имеет полный доступ
        if hasattr(request.user, 'profile') and request.user.profile.is_system_admin:
            return True
        
        # Полный маппинг действий
        ACTION_MAP = {
            'retrieve': 'VIEW',
            'update': 'EDIT',
            'partial_update': 'EDIT',
            'start': 'EDIT',
            'complete': 'EDIT',
            'cancel': 'EDIT',
            'reopen': 'EDIT',
            'add_comment': 'ADD',
            'destroy': 'DELETE',
            'delete_log': 'DELETE',
        }
        
        action = ACTION_MAP.get(view.action)
        if action is None:
            return False
        
        # Проверяем разрешение с учетом объекта
        return can_user_perform_action(request.user, action, 'TASK', obj=obj)
