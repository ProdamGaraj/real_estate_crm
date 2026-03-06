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


# Иерархия scope (от широкого к узкому)
SCOPE_HIERARCHY = ['SYSTEM', 'COMPANY', 'DEPARTMENT', 'OWN']


def get_user_max_scope(user, resource_type):
    """
    Определяет максимальный (самый широкий) scope пользователя для VIEW на данный ресурс.
    
    Returns:
        str или None: 'SYSTEM', 'COMPANY', 'DEPARTMENT', 'OWN' или None если нет прав
    """
    if not user or not user.is_active:
        return None
    
    if user.is_superuser:
        return 'SYSTEM'
    
    try:
        profile = user.profile
        if profile.is_system_admin:
            return 'SYSTEM'
        
        for scope in SCOPE_HIERARCHY:
            if profile.has_permission_for_action('VIEW', resource_type, scope):
                return scope
        return None
    except UserProfile.DoesNotExist:
        return None


def get_filtered_queryset(user, queryset, resource_type, max_scope=None):
    """
    Фильтрация queryset на основе разрешений пользователя
    
    Args:
        user: Объект пользователя
        queryset: Исходный queryset
        resource_type: Тип ресурса (из Permission.Resource)
        max_scope: Максимально допустимый scope (ограничитель сверху).
                   Если задан, scope шире max_scope будут игнорироваться.
                   Например, если max_scope='OWN', то COMPANY и DEPARTMENT не применяются.
    
    Returns:
        Отфильтрованный queryset
    """
    if not user or not user.is_active:
        return queryset.none()
    
    # Суперпользователь видит все (но max_scope может ограничить)
    if user.is_superuser and not max_scope:
        return queryset
    
    try:
        profile = user.profile
        
        # Системный администратор видит все (но max_scope может ограничить)
        if profile.is_system_admin and not max_scope:
            return queryset
        
        # Определяем допустимые scopes с учётом max_scope
        if max_scope:
            max_scope_index = SCOPE_HIERARCHY.index(max_scope)
            allowed_scopes = set(SCOPE_HIERARCHY[max_scope_index:])
        else:
            allowed_scopes = set(SCOPE_HIERARCHY)
        
        # Для superuser/system_admin с max_scope — если SYSTEM допустим, вернуть всё
        # Иначе принудительно применяем max_scope
        is_admin = user.is_superuser or profile.is_system_admin
        if is_admin:
            if 'SYSTEM' in allowed_scopes:
                return queryset
            # Для admin с ограничительным max_scope:
            # их реальные разрешения = все, но урезаем до max_scope
            has_system_view = False  # Запрещён по max_scope
            has_company_view = 'COMPANY' in allowed_scopes
            has_department_view = 'DEPARTMENT' in allowed_scopes
            has_own_view = 'OWN' in allowed_scopes
        else:
            # Обычный пользователь: проверяем реальные разрешения с учётом allowed_scopes
            has_system_view = 'SYSTEM' in allowed_scopes and profile.has_permission_for_action('VIEW', resource_type, 'SYSTEM')
            has_company_view = 'COMPANY' in allowed_scopes and profile.has_permission_for_action('VIEW', resource_type, 'COMPANY')
            has_department_view = 'DEPARTMENT' in allowed_scopes and profile.has_permission_for_action('VIEW', resource_type, 'DEPARTMENT')
            has_own_view = 'OWN' in allowed_scopes and profile.has_permission_for_action('VIEW', resource_type, 'OWN')
        
        # Если есть разрешение SYSTEM - видит все
        if has_system_view:
            return queryset
        
        # Строим фильтр на основе разрешений
        filters = Q()
        
        # ОСОБАЯ ЛОГИКА ДЛЯ КЛИЕНТОВ: Клиент виден если:
        # 1. Клиент создан пользователем/отделом/компанией (через created_by)
        # 2. ИЛИ на него есть заявка от пользователя/отдела/компании
        if resource_type == 'CLIENT':
            if has_company_view and profile.company:
                # Клиент виден если:
                # 1. Клиент создан пользователем из этой компании
                filters |= Q(created_by__profile__company=profile.company)
                # 2. ИЛИ хотя бы одна заявка создана пользователем из этой компании
                filters |= Q(applications__created_by__profile__company=profile.company)
            
            if has_department_view and profile.department:
                # Клиент виден если создан пользователем из этого отдела
                filters |= Q(created_by__profile__department=profile.department)
                # ИЛИ хотя бы одна заявка создана пользователем из этого отдела
                filters |= Q(applications__created_by__profile__department=profile.department)
            
            if has_own_view:
                # Клиент виден если создан этим пользователем
                filters |= Q(created_by=user)
                # ИЛИ хотя бы одна заявка создана этим пользователем
                filters |= Q(applications__created_by=user)
        
        # ОСОБАЯ ЛОГИКА ДЛЯ ВСТРЕЧ: Meeting использует поля creator и executor вместо created_by
        # Встреча видна если пользователь - создатель ИЛИ исполнитель
        elif resource_type == 'MEETING':
            if has_company_view and profile.company:
                # Встреча видна если creator или executor из этой компании
                filters |= Q(creator__profile__company=profile.company)
                filters |= Q(executor__profile__company=profile.company)
            
            if has_department_view and profile.department:
                # Встреча видна если creator или executor из этого отдела
                filters |= Q(creator__profile__department=profile.department)
                filters |= Q(executor__profile__department=profile.department)
            
            if has_own_view:
                # Встреча видна если пользователь - creator или executor
                filters |= Q(creator=user)
                filters |= Q(executor=user)
        
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
                elif hasattr(queryset.model, 'creator'):
                    filters |= Q(creator=user)
                elif hasattr(queryset.model, 'user'):
                    filters |= Q(user=user)
                # Для задач: исполнитель тоже видит назначенные на него задачи
                if hasattr(queryset.model, 'assignee'):
                    filters |= Q(assignee=user)
                # Для задач: наблюдатель тоже видит задачи
                if hasattr(queryset.model, 'watchers'):
                    filters |= Q(watchers=user)
        
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
        # Для Meeting проверяем creator и executor
        if hasattr(obj, 'creator') and obj.creator == user:
            return 'OWN'
        if hasattr(obj, 'executor') and obj.executor == user:
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
            # Прямое поле company
            if hasattr(obj, 'company') and obj.company == profile.company:
                return 'COMPANY'
            # Через project.company (для Building)
            if hasattr(obj, 'project') and hasattr(obj.project, 'company'):
                if obj.project.company == profile.company:
                    return 'COMPANY'
            # Через building.project.company (для Property, Layout)
            if hasattr(obj, 'building') and hasattr(obj.building, 'project'):
                if obj.building.project.company == profile.company:
                    return 'COMPANY'
            # Через created_by
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
            # Для Meeting проверяем creator и executor
            if hasattr(obj, 'creator') and obj.creator == user:
                return True
            if hasattr(obj, 'executor') and obj.executor == user:
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
            # Прямое поле company
            if hasattr(obj, 'company') and obj.company == profile.company:
                return True
            # Через project.company (для Building, Property, Layout и т.д.)
            if hasattr(obj, 'project') and hasattr(obj.project, 'company'):
                if obj.project.company == profile.company:
                    return True
            # Через building.project.company (для Property, Layout)
            if hasattr(obj, 'building') and hasattr(obj.building, 'project'):
                if obj.building.project.company == profile.company:
                    return True
            # Через created_by
            if hasattr(obj, 'created_by') and hasattr(obj.created_by, 'profile'):
                if obj.created_by.profile.company == profile.company:
                    return True
            return False
        
        return False
        
    except (UserProfile.DoesNotExist, AttributeError):
        return False
