"""
Serializers для системы разрешений
"""
from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Company, Department, Permission, Role, UserProfile, PermissionLog, PartnerAPIKey


class CompanySerializer(serializers.ModelSerializer):
    departments_count = serializers.SerializerMethodField()
    employees_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Company
        fields = [
            'id', 'name', 'code', 'description', 'is_active',
            'departments_count', 'employees_count',
            'created_at', 'updated_at'
        ]
    
    def get_departments_count(self, obj):
        return obj.departments.filter(is_active=True).count()
    
    def get_employees_count(self, obj):
        return obj.employees.filter(is_active=True).count()


class DepartmentSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True)
    parent_department_name = serializers.CharField(
        source='parent_department.name',
        read_only=True,
        allow_null=True
    )
    employees_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Department
        fields = [
            'id', 'company', 'company_name', 'name', 'code', 'description',
            'parent_department', 'parent_department_name',
            'employees_count', 'is_active',
            'created_at', 'updated_at'
        ]
    
    def get_employees_count(self, obj):
        return obj.employees.filter(is_active=True).count()


class PermissionSerializer(serializers.ModelSerializer):
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    resource_display = serializers.CharField(source='get_resource_display', read_only=True)
    scope_display = serializers.CharField(source='get_scope_display', read_only=True)
    
    class Meta:
        model = Permission
        fields = [
            'id', 'code', 'name', 'description',
            'action', 'action_display',
            'resource', 'resource_display',
            'scope', 'scope_display',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['code', 'name']


class RoleListSerializer(serializers.ModelSerializer):
    scope_display = serializers.CharField(source='get_scope_display', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    permissions = PermissionSerializer(many=True, read_only=True)
    permissions_count = serializers.SerializerMethodField()
    users_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Role
        fields = [
            'id', 'name', 'code', 'description',
            'scope', 'scope_display',
            'category', 'category_display',
            'permissions', 'permissions_count', 'users_count',
            'is_system', 'is_active',
            'created_at', 'updated_at'
        ]
    
    def get_permissions_count(self, obj):
        return obj.permissions.filter(is_active=True).count()
    
    def get_users_count(self, obj):
        return obj.user_profiles.filter(is_active=True).count()


class RoleDetailSerializer(serializers.ModelSerializer):
    scope_display = serializers.CharField(source='get_scope_display', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    permissions = PermissionSerializer(many=True, read_only=True)
    permission_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        write_only=True,
        queryset=Permission.objects.all(),
        source='permissions'
    )
    companies = CompanySerializer(many=True, read_only=True)
    company_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        write_only=True,
        queryset=Company.objects.all(),
        source='companies',
        required=False
    )
    created_by_name = serializers.CharField(
        source='created_by.get_full_name',
        read_only=True,
        allow_null=True
    )
    
    class Meta:
        model = Role
        fields = [
            'id', 'name', 'code', 'description',
            'scope', 'scope_display',
            'category', 'category_display',
            'permissions', 'permission_ids',
            'companies', 'company_ids',
            'is_system', 'is_active',
            'created_at', 'updated_at',
            'created_by', 'created_by_name'
        ]
        read_only_fields = ['created_at', 'updated_at', 'created_by']
    
    def validate(self, data):
        # Системные роли не могут быть изменены через API
        if self.instance and self.instance.is_system:
            raise serializers.ValidationError(
                "Системные роли не могут быть изменены"
            )
        return data


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email', 'full_name']
    
    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class UserProfileListSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    user_username = serializers.CharField(source='user.username', read_only=True)
    user_full_name = serializers.SerializerMethodField()
    company_name = serializers.CharField(source='company.name', read_only=True, allow_null=True)
    department_name = serializers.CharField(source='department.name', read_only=True, allow_null=True)
    roles = RoleListSerializer(many=True, read_only=True)
    roles_names = serializers.SerializerMethodField()
    
    class Meta:
        model = UserProfile
        fields = [
            'id', 'user', 'user_username', 'user_full_name',
            'company', 'company_name',
            'department', 'department_name',
            'roles', 'roles_names', 'position', 'phone',
            'is_system_admin', 'is_active',
            'created_at', 'updated_at'
        ]
    
    def get_user_full_name(self, obj):
        """Возвращает ФИО пользователя"""
        if obj.user:
            full_name = obj.user.get_full_name()
            if full_name:
                return full_name
            return obj.user.username
        return None
    
    def get_roles_names(self, obj):
        return [role.name for role in obj.roles.filter(is_active=True)]


class UserProfileDetailSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    company = CompanySerializer(read_only=True)
    department = DepartmentSerializer(read_only=True)
    roles = RoleListSerializer(many=True, read_only=True)
    
    company_id = serializers.PrimaryKeyRelatedField(
        queryset=Company.objects.all(),
        source='company',
        write_only=True,
        required=False,
        allow_null=True
    )
    department_id = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(),
        source='department',
        write_only=True,
        required=False,
        allow_null=True
    )
    role_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Role.objects.all(),
        source='roles',
        write_only=True,
        required=False
    )
    
    all_permissions = serializers.SerializerMethodField()
    
    class Meta:
        model = UserProfile
        fields = [
            'id', 'user', 'company', 'company_id',
            'department', 'department_id',
            'roles', 'role_ids',
            'position', 'phone', 'avatar',
            'is_system_admin', 'is_active',
            'all_permissions',
            'created_at', 'updated_at'
        ]
    
    def get_all_permissions(self, obj):
        permissions = obj.get_all_permissions()
        return PermissionSerializer(permissions, many=True).data
    
    def validate(self, data):
        # Проверяем что отдел принадлежит компании
        department = data.get('department')
        company = data.get('company')
        
        if department and company:
            if department.company != company:
                raise serializers.ValidationError(
                    "Отдел должен принадлежать выбранной компании"
                )
        
        return data


class PermissionLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(
        source='user.get_full_name',
        read_only=True,
        allow_null=True
    )
    
    class Meta:
        model = PermissionLog
        fields = [
            'id', 'user', 'user_name', 'action',
            'entity_type', 'entity_id', 'details',
            'ip_address', 'created_at'
        ]
        read_only_fields = fields


class UserPermissionCheckSerializer(serializers.Serializer):
    """
    Serializer для проверки разрешений пользователя
    """
    action = serializers.ChoiceField(choices=Permission.Action.choices)
    resource = serializers.ChoiceField(choices=Permission.Resource.choices)
    scope = serializers.ChoiceField(
        choices=Permission.Scope.choices,
        required=False
    )
    object_id = serializers.IntegerField(required=False, allow_null=True)


class BulkPermissionAssignSerializer(serializers.Serializer):
    """
    Serializer для массового назначения разрешений роли
    """
    role_id = serializers.IntegerField()
    permission_ids = serializers.ListField(
        child=serializers.IntegerField(),
        allow_empty=False
    )
    action = serializers.ChoiceField(choices=['add', 'remove', 'set'])
    
    def validate_role_id(self, value):
        try:
            role = Role.objects.get(id=value)
            if role.is_system:
                raise serializers.ValidationError(
                    "Нельзя изменять разрешения системных ролей"
                )
            return value
        except Role.DoesNotExist:
            raise serializers.ValidationError("Роль не найдена")
    
    def validate_permission_ids(self, value):
        existing_ids = Permission.objects.filter(
            id__in=value,
            is_active=True
        ).values_list('id', flat=True)
        
        invalid_ids = set(value) - set(existing_ids)
        if invalid_ids:
            raise serializers.ValidationError(
                f"Разрешения с ID {invalid_ids} не найдены или неактивны"
            )
        
        return value


class UserCreateSerializer(serializers.Serializer):
    """
    Serializer для создания нового пользователя с профилем
    """
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=8)
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    
    # Поля профиля
    company_id = serializers.IntegerField(required=False, allow_null=True)
    department_id = serializers.IntegerField(required=False, allow_null=True)
    role_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True
    )
    position = serializers.CharField(max_length=255, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    is_system_admin = serializers.BooleanField(default=False)
    is_active = serializers.BooleanField(default=True)
    
    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError(
                "Пользователь с таким именем уже существует"
            )
        return value
    
    def validate_email(self, value):
        if value and User.objects.filter(email=value).exists():
            raise serializers.ValidationError(
                "Пользователь с таким email уже существует"
            )
        return value
    
    def validate_company_id(self, value):
        if value:
            try:
                Company.objects.get(id=value, is_active=True)
            except Company.DoesNotExist:
                raise serializers.ValidationError("Компания не найдена")
        return value
    
    def validate_department_id(self, value):
        if value:
            try:
                Department.objects.get(id=value, is_active=True)
            except Department.DoesNotExist:
                raise serializers.ValidationError("Отдел не найден")
        return value
    
    def validate_role_ids(self, value):
        if value:
            existing_ids = Role.objects.filter(
                id__in=value,
                is_active=True
            ).values_list('id', flat=True)
            
            invalid_ids = set(value) - set(existing_ids)
            if invalid_ids:
                raise serializers.ValidationError(
                    f"Роли с ID {invalid_ids} не найдены или неактивны"
                )
        return value
    
    def create(self, validated_data):
        # Извлекаем данные для User
        username = validated_data['username']
        password = validated_data['password']
        email = validated_data.get('email', '')
        first_name = validated_data.get('first_name', '')
        last_name = validated_data.get('last_name', '')
        
        # Создаём пользователя
        user = User.objects.create_user(
            username=username,
            password=password,
            email=email,
            first_name=first_name,
            last_name=last_name
        )
        
        # Создаём профиль
        profile = UserProfile.objects.create(
            user=user,
            company_id=validated_data.get('company_id'),
            department_id=validated_data.get('department_id'),
            position=validated_data.get('position', ''),
            phone=validated_data.get('phone', ''),
            is_system_admin=validated_data.get('is_system_admin', False),
            is_active=validated_data.get('is_active', True)
        )
        
        # Назначаем роли
        role_ids = validated_data.get('role_ids', [])
        if role_ids:
            roles = Role.objects.filter(id__in=role_ids)
            profile.roles.set(roles)
        
        return profile


class PartnerAPIKeySerializer(serializers.ModelSerializer):
    """Сериализатор для API-ключей партнёров"""
    companies_data = CompanySerializer(source='companies', many=True, read_only=True)
    is_expired = serializers.SerializerMethodField()
    available_scopes = serializers.SerializerMethodField()
    
    class Meta:
        model = PartnerAPIKey
        fields = [
            'id', 'name', 'key', 'description', 'companies', 'companies_data',
            'allowed_scopes', 'available_scopes',
            'is_active', 'expires_at', 'allowed_ips',
            'requests_per_minute', 'requests_per_day',
            'created_at', 'last_used_at', 'is_expired'
        ]
        read_only_fields = ['key', 'created_at', 'last_used_at']
    
    def get_is_expired(self, obj):
        from django.utils import timezone
        if obj.expires_at and obj.expires_at < timezone.now():
            return True
        return False
    
    def get_available_scopes(self, obj):
        """Возвращает список всех доступных scopes с описаниями"""
        return [
            {'value': choice[0], 'label': choice[1]}
            for choice in PartnerAPIKey.AllowedScope.choices
        ]


class ChangePasswordSerializer(serializers.Serializer):
    """Сериализатор для смены пароля пользователя администратором"""
    new_password = serializers.CharField(min_length=8, write_only=True)
    confirm_password = serializers.CharField(min_length=8, write_only=True)
    
    def validate(self, data):
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError({
                'confirm_password': 'Пароли не совпадают'
            })
        return data


class PartnerAPIKeyCreateSerializer(serializers.ModelSerializer):
    """Сериализатор для создания API-ключа (без возможности указать ключ вручную)"""
    
    class Meta:
        model = PartnerAPIKey
        fields = [
            'id', 'name', 'key', 'description', 'companies', 'allowed_scopes',
            'is_active', 'expires_at', 'allowed_ips',
            'requests_per_minute', 'requests_per_day',
            'created_at'
        ]
        read_only_fields = ['key', 'created_at']


class PartnerAPIKeyUpdateSerializer(serializers.ModelSerializer):
    """Сериализатор для редактирования API-ключа"""
    
    class Meta:
        model = PartnerAPIKey
        fields = [
            'id', 'name', 'description', 'companies', 'allowed_scopes',
            'is_active', 'expires_at', 'allowed_ips',
            'requests_per_minute', 'requests_per_day'
        ]
