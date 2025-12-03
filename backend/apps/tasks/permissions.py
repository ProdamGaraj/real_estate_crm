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
        
        # Определяем требуемое действие
        if view.action in ['list', 'retrieve', 'kanban', 'calendar', 'my_tasks', 'created_by_me']:
            action = 'VIEW'
        elif view.action == 'create':
            action = 'ADD'
        elif view.action in ['update', 'partial_update', 'start', 'complete', 'cancel']:
            action = 'EDIT'
        elif view.action == 'destroy':
            action = 'DELETE'
        else:
            action = 'VIEW'
        
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
        
        # Определяем требуемое действие
        if view.action in ['retrieve']:
            action = 'VIEW'
        elif view.action in ['update', 'partial_update', 'start', 'complete', 'cancel']:
            action = 'EDIT'
        elif view.action == 'destroy':
            action = 'DELETE'
        else:
            return False
        
        # Проверяем разрешение с учетом объекта
        return can_user_perform_action(request.user, action, 'TASK', obj=obj)
