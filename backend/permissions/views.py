"""
Views для управления разрешениями, ролями и пользователями
"""
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from django.contrib.auth.models import User
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
from .backends import get_filtered_queryset, can_user_perform_action


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
        """Фильтруем компании на основе разрешений пользователя"""
        queryset = super().get_queryset()
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
        """Фильтруем отделы на основе разрешений пользователя"""
        queryset = super().get_queryset()
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
        """Фильтруем роли на основе разрешений пользователя"""
        queryset = super().get_queryset()
        return get_filtered_queryset(self.request.user, queryset, 'ROLE')
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
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
    
    @action(detail=False, methods=['post'])
    def create_user(self, request):
        """
        Создать нового пользователя с профилем
        """
        from .serializers import UserCreateSerializer
        
        serializer = UserCreateSerializer(data=request.data)
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
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Устанавливаем новый пароль
        user = profile.user
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        
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
        stats = {
            'total_companies': Company.objects.filter(is_active=True).count(),
            'total_departments': Department.objects.filter(is_active=True).count(),
            'total_users': UserProfile.objects.filter(is_active=True).count(),
            'total_roles': Role.objects.filter(is_active=True).count(),
            'system_roles': Role.objects.filter(is_system=True, is_active=True).count(),
            'custom_roles': Role.objects.filter(is_system=False, is_active=True).count(),
            'total_permissions': Permission.objects.filter(is_active=True).count(),
            'system_admins': UserProfile.objects.filter(
                is_system_admin=True, is_active=True
            ).count(),
        }
        
        # Распределение пользователей по ролям
        role_distribution = []
        for role in Role.objects.filter(is_active=True):
            role_distribution.append({
                'role': role.name,
                'users_count': role.user_profiles.filter(is_active=True).count()
            })
        
        stats['role_distribution'] = role_distribution
        
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
        api_key.key = secrets.token_hex(32)
        api_key.save()
        
        serializer = self.get_serializer(api_key)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        """Включить/выключить ключ"""
        api_key = self.get_object()
        api_key.is_active = not api_key.is_active
        api_key.save()
        
        serializer = self.get_serializer(api_key)
        return Response(serializer.data)

