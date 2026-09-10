"""
Views для управления разрешениями, ролями и пользователями
"""
import logging

from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters

from .models import Company, Department, Permission, Role, UserProfile, PermissionLog, PartnerAPIKey
from .serializers import (
    CompanySerializer, DepartmentSerializer,
    PermissionSerializer, RoleListSerializer, RoleDetailSerializer,
    UserProfileListSerializer, UserProfileDetailSerializer,
    PermissionLogSerializer, UserPermissionCheckSerializer,
    BulkPermissionAssignSerializer, PartnerAPIKeySerializer, 
    PartnerAPIKeyCreateSerializer, PartnerAPIKeyUpdateSerializer,
    ChangePasswordSerializer
)
from .permissions import (
    IsSystemAdmin, IsCompanyAdmin, IsDepartmentManager,
    CompanyPermission, DepartmentPermission, RolePermission,
    UserPermission, PartnerAPIKeyPermission
)
from .token_serializers import revoke_refresh_tokens
from .backends import get_filtered_queryset, can_user_perform_action

logger = logging.getLogger(__name__)


def _is_request_user_system_admin(request):
    """Helper: проверяет является ли текущий пользователь системным админом"""
    if request.user.is_superuser:
        return True
    try:
        return request.user.profile.is_system_admin
    except Exception:
        return False


class CompanyViewSet(viewsets.ModelViewSet):
    """
    ViewSet для управления компаниями
    """
    queryset = Company.objects.all()
    serializer_class = CompanySerializer
    permission_classes = [IsAuthenticated, CompanyPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']
    
    def get_queryset(self):
        """Фильтруем компании на основе разрешений пользователя, аннотируем количества"""
        from django.db.models import Count, Q
        queryset = super().get_queryset().annotate(
            _departments_count=Count(
                'departments',
                filter=Q(departments__is_active=True)
            ),
            _employees_count=Count(
                'employees',
                filter=Q(employees__is_active=True)
            ),
        )
        return get_filtered_queryset(self.request.user, queryset, 'COMPANY')
    
    @action(detail=False, methods=['get'])
    def accessible(self, request):
        """
        Получить список компаний, доступных для назначения в роли
        На основе scope текущего пользователя
        """
        try:
            profile = request.user.profile
            companies = profile.get_accessible_companies()
            serializer = self.get_serializer(companies, many=True)
            return Response(serializer.data)
        except UserProfile.DoesNotExist:
            return Response(
                {'error': 'Профиль пользователя не найден'},
                status=status.HTTP_404_NOT_FOUND
            )


class DepartmentViewSet(viewsets.ModelViewSet):
    """
    ViewSet для управления отделами
    """
    queryset = Department.objects.select_related('company', 'parent_department').all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated, DepartmentPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['company', 'parent_department', 'is_active']
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'created_at']
    ordering = ['company', 'name']
    
    def get_queryset(self):
        """Фильтруем отделы на основе разрешений пользователя, аннотируем количества"""
        from django.db.models import Count, Q
        queryset = super().get_queryset().annotate(
            _employees_count=Count(
                'employees',
                filter=Q(employees__is_active=True)
            ),
        )
        return get_filtered_queryset(self.request.user, queryset, 'DEPARTMENT')
    
    @action(detail=False, methods=['get'])
    def accessible(self, request):
        """
        Получить список отделов, доступных для назначения в роли
        На основе scope текущего пользователя
        """
        try:
            profile = request.user.profile
            departments = profile.get_accessible_departments()
            serializer = self.get_serializer(departments, many=True)
            return Response(serializer.data)
        except UserProfile.DoesNotExist:
            return Response(
                {'error': 'Профиль пользователя не найден'},
                status=status.HTTP_404_NOT_FOUND
            )


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet для просмотра разрешений (только чтение)
    """
    queryset = Permission.objects.all()
    serializer_class = PermissionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['action', 'resource', 'scope', 'is_active']
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['resource', 'action', 'scope']
    ordering = ['resource', 'action', 'scope']
    
    @action(detail=False, methods=['get'])
    def grouped_by_resource(self, request):
        """
        Группировка разрешений по ресурсам для удобного отображения
        """
        resources = {}
        
        for resource_code, resource_name in Permission.Resource.choices:
            permissions = self.get_queryset().filter(resource=resource_code)
            resources[resource_code] = {
                'name': resource_name,
                'permissions': PermissionSerializer(permissions, many=True).data
            }
        
        return Response(resources)


class RoleViewSet(viewsets.ModelViewSet):
    """
    ViewSet для управления ролями
    """
    queryset = Role.objects.prefetch_related('permissions', 'companies').all()
    permission_classes = [IsAuthenticated, RolePermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['scope', 'category', 'is_system', 'is_active']
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['name', 'scope', 'category', 'created_at']
    ordering = ['scope', 'category', 'name']
    
    def get_serializer_class(self):
        if self.action in ['list']:
            return RoleListSerializer
        return RoleDetailSerializer
    
    def get_queryset(self):
        """Фильтруем роли на основе разрешений пользователя, аннотируем количество пользователей"""
        from django.db.models import Count, Q
        queryset = super().get_queryset().annotate(
            _users_count=Count(
                'user_profiles',
                filter=Q(user_profiles__is_active=True)
            )
        )
        # Роль — справочник, а не объект «своей» компании: фильтрация по автору
        # прятала базовые роли, созданные системным администратором.
        user = self.request.user
        if user.is_superuser:
            return queryset
        profile = getattr(user, 'profile', None)
        if profile is None or not profile.is_active or profile.is_deleted:
            return queryset.none()
        if profile.is_system_admin or profile.has_permission_for_action('VIEW', 'ROLE', 'SYSTEM'):
            return queryset
        if profile.company:
            # Видны роли своей компании и роли, действующие во всей системе
            return queryset.filter(
                Q(companies__isnull=True) | Q(companies=profile.company)
            ).distinct()
        return queryset.none()
    
    def _validate_permission_scope(self, request, permission_ids):
        """
        Проверяет что пользователь не назначает разрешения выше своего максимального scope.
        Системные администраторы могут назначать любые разрешения.
        """
        if _is_request_user_system_admin(request):
            return  # sysadmin может всё
        
        from .backends import get_user_max_scope, SCOPE_HIERARCHY
        
        if not permission_ids:
            return
        
        # Получаем разрешения, которые пытаются назначить
        perms_to_assign = Permission.objects.filter(id__in=permission_ids)
        
        for perm in perms_to_assign:
            user_max = get_user_max_scope(request.user, perm.resource)
            if not user_max:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied(
                    f'У вас нет доступа к ресурсу {perm.resource}'
                )
            
            user_idx = SCOPE_HIERARCHY.index(user_max) if user_max in SCOPE_HIERARCHY else len(SCOPE_HIERARCHY)
            perm_idx = SCOPE_HIERARCHY.index(perm.scope) if perm.scope in SCOPE_HIERARCHY else len(SCOPE_HIERARCHY)
            
            if perm_idx < user_idx:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied(
                    f'Нельзя назначить разрешение {perm.code} — его scope ({perm.scope}) '
                    f'выше вашего максимального scope ({user_max}) для ресурса {perm.resource}'
                )
    
    def _validate_role_scope(self, request, role_scope):
        """
        Проверяет что пользователь не создаёт роль с scope выше своего максимального.
        Системные администраторы могут создавать роли с любым scope.
        """
        if _is_request_user_system_admin(request):
            return
        
        from .backends import SCOPE_HIERARCHY
        
        if not role_scope:
            return
        
        # Определяем максимальный scope пользователя (по любому ресурсу)
        try:
            profile = request.user.profile
            user_max_scope = None
            for scope in SCOPE_HIERARCHY:
                if profile.roles.filter(
                    scope=scope,
                    is_active=True
                ).exists():
                    user_max_scope = scope
                    break
            
            if not user_max_scope:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('У вас нет активных ролей для создания других ролей')
            
            user_idx = SCOPE_HIERARCHY.index(user_max_scope)
            role_idx = SCOPE_HIERARCHY.index(role_scope) if role_scope in SCOPE_HIERARCHY else len(SCOPE_HIERARCHY)
            
            if role_idx < user_idx:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied(
                    f'Нельзя создать роль с scope {role_scope} — '
                    f'ваш максимальный scope: {user_max_scope}'
                )
        except UserProfile.DoesNotExist:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Профиль пользователя не найден')
    
    def _validate_role_companies(self, request, company_ids):
        """
        Роль без списка компаний применяется во всех компаниях сразу.
        Создавать такие роли и привязывать роль к чужой компании может
        только системный администратор.
        """
        if _is_request_user_system_admin(request):
            return

        from rest_framework.exceptions import PermissionDenied
        from .serializers import accessible_company_ids

        allowed = accessible_company_ids(request)
        if not company_ids:
            raise PermissionDenied(
                'Укажите компании, в которых действует роль: '
                'роль без компаний применяется во всей системе.'
            )
        if allowed is not None:
            denied = {int(cid) for cid in company_ids} - set(allowed)
            if denied:
                raise PermissionDenied(
                    f'Компании {sorted(denied)} недоступны — нельзя создать в них роль.'
                )

    def perform_create(self, serializer):
        # Проверяем scope-эскалацию при назначении разрешений
        permission_ids = self.request.data.get('permission_ids', [])
        self._validate_permission_scope(self.request, permission_ids)
        # Проверяем scope самой роли
        role_scope = self.request.data.get('scope')
        self._validate_role_scope(self.request, role_scope)
        self._validate_role_companies(self.request, self.request.data.get('company_ids', []))
        serializer.save(created_by=self.request.user)
    
    def perform_update(self, serializer):
        """Защита от scope-эскалации при обновлении роли"""
        # Системные роли неизменны. Проверка стояла только в assign_permissions,
        # поэтому обычный PATCH позволял переписать их состав разрешений.
        if serializer.instance.is_system and not _is_request_user_system_admin(self.request):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Системные роли не могут быть изменены')

        permission_ids = self.request.data.get('permission_ids', [])
        self._validate_permission_scope(self.request, permission_ids)
        # Проверяем scope самой роли
        role_scope = self.request.data.get('scope')
        if role_scope:
            self._validate_role_scope(self.request, role_scope)
        serializer.save()

    def perform_destroy(self, instance):
        """
        Системную роль удалить нельзя — на ней держатся базовые доступы.

        Роль, назначенную сотрудникам, удаляем только по явному подтверждению:
        вместе с ней люди молча теряли доступы и узнавали об этом, когда
        раздел пропадал из меню.
        """
        if instance.is_system and not _is_request_user_system_admin(self.request):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Системные роли не могут быть удалены')

        holders = instance.user_profiles.filter(is_active=True, is_deleted=False)
        confirmed = str(self.request.query_params.get('confirm', '')).lower() == 'true'
        if holders.exists() and not confirmed:
            from rest_framework.exceptions import ValidationError as DRFValidationError

            names = ", ".join(
                profile.user.get_full_name() or profile.user.username
                for profile in holders[:5]
            )
            more = holders.count() - 5
            if more > 0:
                names += f" и ещё {more}"
            raise DRFValidationError({
                'detail': (
                    f'Роль назначена сотрудникам ({holders.count()}): {names}. '
                    f'После удаления они потеряют её права. '
                    f'Повторите запрос с параметром confirm=true, если это осознанно.'
                ),
                'users_count': holders.count(),
            })

        instance.delete()
    
    @action(detail=True, methods=['post'])
    def assign_permissions(self, request, pk=None):
        """
        Массовое назначение разрешений роли
        """
        role = self.get_object()
        
        if role.is_system:
            return Response(
                {'error': 'Системные роли не могут быть изменены'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = BulkPermissionAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        permission_ids = serializer.validated_data['permission_ids']
        action_type = serializer.validated_data['action']
        
        # Проверяем scope-эскалацию при назначении разрешений
        if action_type in ('add', 'set'):
            self._validate_permission_scope(request, permission_ids)
        
        permissions = Permission.objects.filter(id__in=permission_ids)
        
        if action_type == 'add':
            role.permissions.add(*permissions)
        elif action_type == 'remove':
            role.permissions.remove(*permissions)
        elif action_type == 'set':
            role.permissions.set(permissions)
        
        # Логируем изменение
        PermissionLog.objects.create(
            user=request.user,
            action=f'PERMISSIONS_{action_type.upper()}',
            entity_type='Role',
            entity_id=role.id,
            details={
                'permission_ids': permission_ids,
                'action': action_type
            },
            ip_address=request.META.get('REMOTE_ADDR')
        )
        
        return Response({
            'success': True,
            'message': f'Разрешения успешно {action_type}',
            'permissions_count': role.permissions.count()
        })
    
    @action(detail=True, methods=['get'])
    def users(self, request, pk=None):
        """
        Получить пользователей с данной ролью
        """
        role = self.get_object()
        profiles = role.user_profiles.filter(is_active=True)
        serializer = UserProfileListSerializer(profiles, many=True)
        return Response(serializer.data)


class UserProfileViewSet(viewsets.ModelViewSet):
    """
    ViewSet для управления профилями пользователей
    """
    queryset = UserProfile.objects.select_related(
        'user', 'company', 'department'
    ).prefetch_related('roles').all()
    permission_classes = [IsAuthenticated, UserPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['company', 'department', 'is_system_admin', 'is_active']
    search_fields = ['user__username', 'user__first_name', 'user__last_name', 'position']
    ordering_fields = ['user__username', 'created_at']
    ordering = ['user__username']
    
    def get_serializer_class(self):
        if self.action in ['list']:
            return UserProfileListSerializer
        return UserProfileDetailSerializer
    
    def get_queryset(self):
        """Фильтруем профили на основе разрешений пользователя, скрываем удалённых"""
        queryset = super().get_queryset().filter(is_deleted=False)
        return get_filtered_queryset(self.request.user, queryset, 'USER')
    
    def _validate_role_assignment(self, request, role_ids):
        """
        Проверяет что пользователь не назначает роли с scope выше своего.
        Предотвращает эскалацию привилегий через назначение ролей.
        """
        if not role_ids:
            return
        
        if _is_request_user_system_admin(request):
            return
        
        from .backends import SCOPE_HIERARCHY
        
        try:
            profile = request.user.profile
            # Определяем максимальный scope текущего пользователя
            user_max_scope = None
            for scope in SCOPE_HIERARCHY:
                if profile.roles.filter(scope=scope, is_active=True).exists():
                    user_max_scope = scope
                    break
            
            if not user_max_scope:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('У вас нет активных ролей для назначения ролей другим пользователям')
            
            user_idx = SCOPE_HIERARCHY.index(user_max_scope)
            
            # Проверяем каждую назначаемую роль
            roles_to_assign = Role.objects.filter(id__in=role_ids, is_active=True)
            for role in roles_to_assign:
                role_idx = SCOPE_HIERARCHY.index(role.scope) if role.scope in SCOPE_HIERARCHY else len(SCOPE_HIERARCHY)
                if role_idx < user_idx:
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied(
                        f'Нельзя назначить роль "{role.name}" (scope: {role.scope}) — '
                        f'ваш максимальный scope: {user_max_scope}'
                    )
        except UserProfile.DoesNotExist:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Профиль пользователя не найден')
    
    def perform_update(self, serializer):
        """Защита от эскалации привилегий при обновлении профиля"""
        request = self.request
        is_admin = _is_request_user_system_admin(request)
        
        # Только system admin может изменять поле is_system_admin (и назначать, и снимать)
        if 'is_system_admin' in request.data and not is_admin:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                'Только системный администратор может изменять флаг системного администратора'
            )
        
        # Валидация scope назначаемых ролей
        role_ids = request.data.get('role_ids', [])
        self._validate_role_assignment(request, role_ids)
        
        serializer.save()
    
    @action(detail=False, methods=['post'])
    def create_user(self, request):
        """
        Создать нового пользователя с профилем
        """
        from .serializers import UserCreateSerializer
        
        # Защита от эскалации привилегий: только sysadmin может создавать других sysadminов
        if request.data.get('is_system_admin') and not _is_request_user_system_admin(request):
            return Response(
                {'error': 'Только системный администратор может создавать других системных администраторов'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Валидация scope назначаемых ролей
        role_ids = request.data.get('role_ids', [])
        self._validate_role_assignment(request, role_ids)
        
        # Контекст обязателен: по нему проверяется доступ к выбранной компании
        serializer = UserCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        profile = serializer.save()
        
        # Логируем создание пользователя
        PermissionLog.objects.create(
            user=request.user,
            action='USER_CREATE',
            entity_type='UserProfile',
            entity_id=profile.id,
            details={
                'username': profile.user.username,
                'company_id': profile.company_id,
                'department_id': profile.department_id,
                'roles': list(profile.roles.values_list('id', flat=True))
            },
            ip_address=request.META.get('REMOTE_ADDR')
        )
        
        # Возвращаем созданный профиль
        return Response(
            UserProfileDetailSerializer(profile).data,
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=True, methods=['get'])
    def permissions(self, request, pk=None):
        """
        Получить все разрешения пользователя
        """
        profile = self.get_object()
        permissions = profile.get_all_permissions()
        serializer = PermissionSerializer(permissions, many=True)
        return Response({
            'user': profile.user.get_full_name() or profile.user.username,
            'is_system_admin': profile.is_system_admin,
            'permissions': serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def check_permission(self, request, pk=None):
        """
        Проверить наличие конкретного разрешения у пользователя
        """
        profile = self.get_object()
        serializer = UserPermissionCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        action = serializer.validated_data['action']
        resource = serializer.validated_data['resource']
        scope = serializer.validated_data.get('scope')
        
        if scope:
            has_permission = profile.has_permission_for_action(action, resource, scope)
        else:
            # Проверяем наличие разрешения на любом уровне
            has_permission = can_user_perform_action(
                profile.user, action, resource
            )
        
        return Response({
            'has_permission': has_permission,
            'action': action,
            'resource': resource,
            'scope': scope
        })
    
    @action(detail=True, methods=['post'])
    def change_password(self, request, pk=None):
        """
        Смена пароля пользователя администратором
        """
        profile = self.get_object()
        
        # Нельзя менять пароль sysadminу, если сам не sysadmin
        if profile.is_system_admin and not _is_request_user_system_admin(request):
            return Response(
                {'error': 'Только системный администратор может менять пароль другим системным администраторам'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Валидация пароля через Django validators (AUTH_PASSWORD_VALIDATORS)
        user = profile.user
        new_password = serializer.validated_data['new_password']
        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as e:
            return Response(
                {'error': e.messages},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Устанавливаем новый пароль
        user.set_password(new_password)
        user.save()

        # Отзываем ранее выданные refresh-токены: без этого смена пароля
        # не выбивала того, кто уже вошёл со старым
        revoke_refresh_tokens(user)
        
        # Логируем изменение пароля
        PermissionLog.objects.create(
            user=request.user,
            action='PASSWORD_CHANGE',
            entity_type='UserProfile',
            entity_id=profile.id,
            details={
                'username': user.username,
                'changed_by': request.user.username
            },
            ip_address=request.META.get('REMOTE_ADDR')
        )
        
        return Response({
            'success': True,
            'message': f'Пароль пользователя {user.username} успешно изменён'
        })

    @action(detail=True, methods=['post'])
    def ban(self, request, pk=None):
        """
        Заблокировать пользователя (деактивировать User + UserProfile)
        """
        profile = self.get_object()
        
        # Нельзя забанить самого себя
        if profile.user == request.user:
            return Response(
                {'error': 'Нельзя заблокировать самого себя'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Нельзя забанить системного админа (если ты сам не системный админ)
        if profile.is_system_admin and not _is_request_user_system_admin(request):
            return Response(
                {'error': 'Только системный администратор может блокировать других системных администраторов'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Деактивируем и User, и UserProfile
        profile.is_active = False
        profile.save(update_fields=['is_active', 'updated_at'])
        profile.user.is_active = False
        profile.user.save(update_fields=['is_active'])
        
        # Логируем
        PermissionLog.objects.create(
            user=request.user,
            action='USER_BAN',
            entity_type='UserProfile',
            entity_id=profile.id,
            details={
                'username': profile.user.username,
                'banned_by': request.user.username
            },
            ip_address=request.META.get('REMOTE_ADDR')
        )
        
        return Response({
            'success': True,
            'message': f'Пользователь {profile.user.username} заблокирован'
        })

    @action(detail=True, methods=['post'])
    def unban(self, request, pk=None):
        """
        Разблокировать пользователя (активировать User + UserProfile)
        """
        profile = self.get_object()
        
        # Нельзя разбанить системного админа (если ты сам не системный админ)
        if profile.is_system_admin and not _is_request_user_system_admin(request):
            return Response(
                {'error': 'Только системный администратор может разблокировать других системных администраторов'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Активируем и User, и UserProfile
        profile.is_active = True
        profile.save(update_fields=['is_active', 'updated_at'])
        profile.user.is_active = True
        profile.user.save(update_fields=['is_active'])
        
        # Логируем
        PermissionLog.objects.create(
            user=request.user,
            action='USER_UNBAN',
            entity_type='UserProfile',
            entity_id=profile.id,
            details={
                'username': profile.user.username,
                'unbanned_by': request.user.username
            },
            ip_address=request.META.get('REMOTE_ADDR')
        )
        
        return Response({
            'success': True,
            'message': f'Пользователь {profile.user.username} разблокирован'
        })

    @action(detail=True, methods=['post'])
    def soft_delete(self, request, pk=None):
        """
        Мягкое удаление пользователя (скрытие из списков + деактивация)
        """
        profile = self.get_object()
        
        # Нельзя удалить самого себя
        if profile.user == request.user:
            return Response(
                {'error': 'Нельзя удалить самого себя'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Нельзя удалить системного админа (если ты сам не системный админ)
        if profile.is_system_admin and not _is_request_user_system_admin(request):
            return Response(
                {'error': 'Только системный администратор может удалять других системных администраторов'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Мягкое удаление: деактивация + флаг is_deleted
        profile.is_active = False
        profile.is_deleted = True
        profile.save(update_fields=['is_active', 'is_deleted', 'updated_at'])
        profile.user.is_active = False
        profile.user.save(update_fields=['is_active'])
        
        # Логируем
        PermissionLog.objects.create(
            user=request.user,
            action='USER_DELETE',
            entity_type='UserProfile',
            entity_id=profile.id,
            details={
                'username': profile.user.username,
                'deleted_by': request.user.username
            },
            ip_address=request.META.get('REMOTE_ADDR')
        )
        
        return Response({
            'success': True,
            'message': f'Пользователь {profile.user.username} удалён'
        })

    def perform_destroy(self, instance):
        """Переопределяем DELETE — используем soft delete вместо hard delete"""
        if instance.user == self.request.user:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('Нельзя удалить самого себя')
        
        if instance.is_system_admin and not _is_request_user_system_admin(self.request):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Только системный администратор может удалять других системных администраторов')
        
        instance.is_active = False
        instance.is_deleted = True
        instance.save(update_fields=['is_active', 'is_deleted', 'updated_at'])
        instance.user.is_active = False
        instance.user.save(update_fields=['is_active'])
        
        PermissionLog.objects.create(
            user=self.request.user,
            action='USER_DELETE',
            entity_type='UserProfile',
            entity_id=instance.id,
            details={
                'username': instance.user.username,
                'deleted_by': self.request.user.username
            },
            ip_address=self.request.META.get('REMOTE_ADDR')
        )


class CurrentUserProfileView(APIView):
    """
    Получение профиля текущего пользователя
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        try:
            profile = request.user.profile
            serializer = UserProfileDetailSerializer(profile)
            return Response(serializer.data)
        except UserProfile.DoesNotExist:
            return Response(
                {'error': 'Профиль пользователя не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    def patch(self, request):
        """
        Обновление собственного профиля (ограниченные поля)
        """
        try:
            profile = request.user.profile
            
            # Пользователь может обновить только свои данные, но не роли
            allowed_fields = ['position', 'phone', 'avatar']
            data = {k: v for k, v in request.data.items() if k in allowed_fields}
            
            serializer = UserProfileDetailSerializer(
                profile, data=data, partial=True
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            
            return Response(serializer.data)
        except UserProfile.DoesNotExist:
            return Response(
                {'error': 'Профиль пользователя не найден'},
                status=status.HTTP_404_NOT_FOUND
            )


class PermissionLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet для просмотра логов изменений разрешений (только чтение)
    """
    queryset = PermissionLog.objects.select_related('user').all()
    serializer_class = PermissionLogSerializer
    permission_classes = [IsAuthenticated, IsSystemAdmin]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['user', 'entity_type', 'entity_id']
    ordering_fields = ['created_at']
    ordering = ['-created_at']


class PermissionStatsView(APIView):
    """
    Статистика по разрешениям и ролям
    """
    permission_classes = [IsAuthenticated, IsCompanyAdmin]
    
    def get(self, request):
        user = request.user
        profile = getattr(user, 'profile', None)
        is_system_admin = profile and profile.is_system_admin
        
        # Определяем доступные компании и отделы
        if is_system_admin:
            companies_qs = Company.objects.filter(is_active=True)
            departments_qs = Department.objects.filter(is_active=True)
            users_qs = UserProfile.objects.filter(is_active=True)
            roles_qs = Role.objects.filter(is_active=True)
        elif profile:
            companies_qs = profile.get_accessible_companies()
            departments_qs = profile.get_accessible_departments()
            company_ids = companies_qs.values_list('id', flat=True)
            users_qs = UserProfile.objects.filter(
                is_active=True, company_id__in=company_ids
            )
            roles_qs = Role.objects.filter(
                is_active=True,
                companies__in=company_ids
            ).distinct()
        else:
            companies_qs = Company.objects.none()
            departments_qs = Department.objects.none()
            users_qs = UserProfile.objects.none()
            roles_qs = Role.objects.none()
        
        stats = {
            'total_companies': companies_qs.count(),
            'total_departments': departments_qs.count(),
            'total_users': users_qs.count(),
            'total_roles': roles_qs.count(),
            'system_roles': roles_qs.filter(is_system=True).count(),
            'custom_roles': roles_qs.filter(is_system=False).count(),
            'total_permissions': Permission.objects.filter(is_active=True).count(),
            'system_admins': users_qs.filter(is_system_admin=True).count(),
        }
        
        # Распределение пользователей по ролям (с учётом scope)
        from django.db.models import Count, Q
        role_distribution = list(
            roles_qs
            .annotate(
                users_count=Count(
                    'user_profiles',
                    filter=Q(user_profiles__is_active=True)
                )
            )
            .values('name', 'users_count')
        )
        stats['role_distribution'] = [
            {'role': r['name'], 'users_count': r['users_count']}
            for r in role_distribution
        ]
        
        return Response(stats)


class PartnerAPIKeyViewSet(viewsets.ModelViewSet):
    """
    ViewSet для управления API-ключами партнёров.
    Требует разрешение PARTNER_API_KEY.
    """
    queryset = PartnerAPIKey.objects.all()
    permission_classes = [IsAuthenticated, PartnerAPIKeyPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['companies', 'is_active']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at', 'last_used_at']
    ordering = ['-created_at']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return PartnerAPIKeyCreateSerializer
        if self.action in ['update', 'partial_update']:
            return PartnerAPIKeyUpdateSerializer
        return PartnerAPIKeySerializer
    
    def get_queryset(self):
        """Фильтруем ключи на основе компании пользователя"""
        user = self.request.user
        queryset = super().get_queryset().prefetch_related('companies')
        
        # Системный админ видит все ключи
        if hasattr(user, 'profile') and user.profile.is_system_admin:
            return queryset
        
        # Админ компании видит только ключи, связанные с его компанией
        if hasattr(user, 'profile') and user.profile.company:
            return queryset.filter(companies=user.profile.company)
        
        return queryset.none()
    
    @action(detail=True, methods=['post'])
    def regenerate(self, request, pk=None):
        """Перегенерировать API-ключ"""
        import secrets
        api_key = self.get_object()
        plaintext_key = secrets.token_hex(32)
        api_key.set_key(plaintext_key)
        api_key.save()
        
        # Возвращаем данные с plaintext ключом (единственный раз!)
        serializer = self.get_serializer(api_key)
        data = serializer.data
        data['key'] = plaintext_key
        data['warning'] = 'Сохраните ключ! Он больше не будет показан целиком.'
        return Response(data)
    
    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        """Включить/выключить ключ"""
        api_key = self.get_object()
        api_key.is_active = not api_key.is_active
        api_key.save()
        
        serializer = self.get_serializer(api_key)
        return Response(serializer.data)

