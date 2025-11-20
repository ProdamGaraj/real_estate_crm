"""
Backend для проверки разрешений с учетом иерархии и области видимости
"""
from django.db.models import Q
from .models import UserProfile, Permission


class PermissionBackend:
    """
    Кастомный backend для проверки разрешений
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        """
        Этот backend не используется для аутентификации.
        Возвращаем None, чтобы Django использовал другие backends.
        """
        return None

    def get_user(self, user_id):
        """
        Получение пользователя по ID (требуется для backend'а)
        """
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None

    def has_perm(self, user_obj, perm, obj=None):
        """
        Проверка разрешения пользователя
        
        Args:
            user_obj: Объект пользователя
            perm: Код разрешения (например: 'VIEW_CLIENT_OWN')
            obj: Объект для проверки (опционально)
        
        Returns:
            bool: True если разрешение есть
        """
        if not user_obj or not user_obj.is_active:
            return False
        
        # Суперпользователь имеет все разрешения
        if user_obj.is_superuser:
            return True
        
        # Проверяем через профиль
        try:
            profile = user_obj.profile
            
            # Системный администратор имеет все разрешения
            if profile.is_system_admin:
                return True
            
            # Проверяем наличие разрешения
            return profile.has_permission(perm)
        except UserProfile.DoesNotExist:
            return False

    def get_user_permissions(self, user_obj):
        """
        Получить все разрешения пользователя
        """
        if not user_obj or not user_obj.is_active:
            return set()
        
        if user_obj.is_superuser:
            return set(Permission.objects.filter(is_active=True).values_list('code', flat=True))
        
        try:
            profile = user_obj.profile
            if profile.is_system_admin:
                return set(Permission.objects.filter(is_active=True).values_list('code', flat=True))
            
            return set(profile.get_all_permissions().values_list('code', flat=True))
        except UserProfile.DoesNotExist:
            return set()


def get_filtered_queryset(user, queryset, resource_type):
    """
    Фильтрация queryset на основе разрешений пользователя
    
    Args:
        user: Объект пользователя
        queryset: Исходный queryset
        resource_type: Тип ресурса (из Permission.Resource)
    
    Returns:
        Отфильтрованный queryset
    """
    if not user or not user.is_active:
        return queryset.none()
    
    # Суперпользователь видит все
    if user.is_superuser:
        return queryset
    
    try:
        profile = user.profile
        
        # Системный администратор видит все
        if profile.is_system_admin:
            return queryset
        
        # Проверяем разрешения VIEW для данного ресурса
        has_system_view = profile.has_permission_for_action('VIEW', resource_type, 'SYSTEM')
        has_company_view = profile.has_permission_for_action('VIEW', resource_type, 'COMPANY')
        has_department_view = profile.has_permission_for_action('VIEW', resource_type, 'DEPARTMENT')
        has_own_view = profile.has_permission_for_action('VIEW', resource_type, 'OWN')
        
        # Если есть разрешение SYSTEM - видит все
        if has_system_view:
            return queryset
        
        # Строим фильтр на основе разрешений
        filters = Q()
        
        # ОСОБАЯ ЛОГИКА ДЛЯ КЛИЕНТОВ: Клиент виден только если на него есть заявка от компании
        if resource_type == 'CLIENT':
            if has_company_view and profile.company:
                # Клиент виден если:
                # 1. Хотя бы одна заявка создана пользователем из этой компании
                filters |= Q(applications__created_by__profile__company=profile.company)
            
            if has_department_view and profile.department:
                # Клиент виден если хотя бы одна заявка создана пользователем из этого отдела
                filters |= Q(applications__created_by__profile__department=profile.department)
            
            if has_own_view:
                # Клиент виден если хотя бы одна заявка создана этим пользователем
                filters |= Q(applications__created_by=user)
        
        # СТАНДАРТНАЯ ЛОГИКА ДЛЯ ОСТАЛЬНЫХ РЕСУРСОВ
        else:
            # Разрешение COMPANY - видит объекты своей компании
            if has_company_view and profile.company:
                # Проверяем наличие поля company у модели
                if hasattr(queryset.model, 'company'):
                    filters |= Q(company=profile.company)
                # Проверяем через created_by
                elif hasattr(queryset.model, 'created_by'):
                    filters |= Q(created_by__profile__company=profile.company)
            
            # Разрешение DEPARTMENT - видит объекты своего отдела
            if has_department_view and profile.department:
                # Проверяем наличие поля department у модели
                if hasattr(queryset.model, 'department'):
                    filters |= Q(department=profile.department)
                # Проверяем через created_by
                elif hasattr(queryset.model, 'created_by'):
                    filters |= Q(created_by__profile__department=profile.department)
            
            # Разрешение OWN - видит только свои объекты
            if has_own_view:
                if hasattr(queryset.model, 'created_by'):
                    filters |= Q(created_by=user)
                elif hasattr(queryset.model, 'user'):
                    filters |= Q(user=user)
        
        # Если нет ни одного разрешения - возвращаем пустой queryset
        if not filters:
            return queryset.none()
        
        return queryset.filter(filters).distinct()
        
    except UserProfile.DoesNotExist:
        return queryset.none()


def can_user_perform_action(user, action, resource_type, obj=None, scope=None):
    """
    Проверка возможности выполнения действия над ресурсом
    
    Args:
        user: Объект пользователя
        action: Действие (VIEW, ADD, EDIT, DELETE)
        resource_type: Тип ресурса
        obj: Конкретный объект (опционально)
        scope: Область видимости (опционально, определяется автоматически)
    
    Returns:
        bool: True если действие разрешено
    """
    if not user or not user.is_active:
        return False
    
    if user.is_superuser:
        return True
    
    try:
        profile = user.profile
        
        if profile.is_system_admin:
            return True
        
        # Если передан объект, определяем нужную область видимости
        if obj and scope is None:
            scope = _determine_scope(user, obj)
        
        # Проверяем разрешения в порядке убывания области видимости
        scopes_to_check = ['SYSTEM', 'COMPANY', 'DEPARTMENT', 'OWN']
        
        if scope:
            # Проверяем только нужную область и выше
            scope_index = scopes_to_check.index(scope)
            scopes_to_check = scopes_to_check[:scope_index + 1]
        
        for check_scope in scopes_to_check:
            if profile.has_permission_for_action(action, resource_type, check_scope):
                # Если есть разрешение на этом уровне, проверяем применимость
                if obj and check_scope != 'SYSTEM':
                    if not _is_object_in_scope(user, obj, check_scope):
                        continue
                return True
        
        return False
        
    except UserProfile.DoesNotExist:
        return False


def _determine_scope(user, obj):
    """
    Определение области видимости объекта относительно пользователя
    """
    try:
        profile = user.profile
        
        # Проверяем принадлежность объекта пользователю
        if hasattr(obj, 'created_by') and obj.created_by == user:
            return 'OWN'
        if hasattr(obj, 'user') and obj.user == user:
            return 'OWN'
        
        # Проверяем принадлежность отделу
        if profile.department:
            if hasattr(obj, 'department') and obj.department == profile.department:
                return 'DEPARTMENT'
            if hasattr(obj, 'created_by') and hasattr(obj.created_by, 'profile'):
                if obj.created_by.profile.department == profile.department:
                    return 'DEPARTMENT'
        
        # Проверяем принадлежность компании
        if profile.company:
            if hasattr(obj, 'company') and obj.company == profile.company:
                return 'COMPANY'
            if hasattr(obj, 'created_by') and hasattr(obj.created_by, 'profile'):
                if obj.created_by.profile.company == profile.company:
                    return 'COMPANY'
        
        # По умолчанию - системный уровень
        return 'SYSTEM'
        
    except (UserProfile.DoesNotExist, AttributeError):
        return 'SYSTEM'


def _is_object_in_scope(user, obj, scope):
    """
    Проверка принадлежности объекта к указанной области видимости
    """
    try:
        profile = user.profile
        
        if scope == 'OWN':
            if hasattr(obj, 'created_by') and obj.created_by == user:
                return True
            if hasattr(obj, 'user') and obj.user == user:
                return True
            return False
        
        if scope == 'DEPARTMENT' and profile.department:
            if hasattr(obj, 'department') and obj.department == profile.department:
                return True
            if hasattr(obj, 'created_by') and hasattr(obj.created_by, 'profile'):
                if obj.created_by.profile.department == profile.department:
                    return True
            return False
        
        if scope == 'COMPANY' and profile.company:
            if hasattr(obj, 'company') and obj.company == profile.company:
                return True
            if hasattr(obj, 'created_by') and hasattr(obj.created_by, 'profile'):
                if obj.created_by.profile.company == profile.company:
                    return True
            return False
        
        return False
        
    except (UserProfile.DoesNotExist, AttributeError):
        return False
