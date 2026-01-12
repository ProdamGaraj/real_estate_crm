"""
Продвинутая система ролей и разрешений с иерархической структурой организации
"""
from django.db import models
from django.conf import settings
from django.contrib.auth.models import User


class Company(models.Model):
    """
    Компания - верхний уровень организационной иерархии
    """
    name = models.CharField(max_length=255, unique=True, verbose_name="Название компании")
    code = models.CharField(max_length=50, unique=True, verbose_name="Код компании")
    description = models.TextField(blank=True, verbose_name="Описание")
    is_active = models.BooleanField(default=True, verbose_name="Активна")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата обновления")

    class Meta:
        verbose_name = "Компания"
        verbose_name_plural = "Компании"
        ordering = ['name']

    def __str__(self):
        return self.name


class Department(models.Model):
    """
    Отдел - средний уровень организационной иерархии
    """
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name='departments',
        verbose_name="Компания"
    )
    name = models.CharField(max_length=255, verbose_name="Название отдела")
    code = models.CharField(max_length=50, verbose_name="Код отдела")
    description = models.TextField(blank=True, verbose_name="Описание")
    parent_department = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sub_departments',
        verbose_name="Родительский отдел"
    )
    is_active = models.BooleanField(default=True, verbose_name="Активен")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата обновления")

    class Meta:
        verbose_name = "Отдел"
        verbose_name_plural = "Отделы"
        unique_together = ('company', 'code')
        ordering = ['company', 'name']

    def __str__(self):
        return f"{self.company.name} - {self.name}"


class Permission(models.Model):
    """
    Детализированное разрешение с указанием действия, ресурса и области видимости
    """
    
    class Action(models.TextChoices):
        VIEW = 'VIEW', 'Просмотр'
        ADD = 'ADD', 'Добавление'
        EDIT = 'EDIT', 'Редактирование'
        DELETE = 'DELETE', 'Удаление'
        EXPORT = 'EXPORT', 'Экспорт'
        IMPORT = 'IMPORT', 'Импорт'
        APPROVE = 'APPROVE', 'Утверждение'
        ASSIGN = 'ASSIGN', 'Назначение'
        EDIT_IN_PROGRESS = 'EDIT_IN_PROGRESS', 'Редактирование задачи в работе'
        REOPEN = 'REOPEN', 'Возврат отменённой задачи'
        FORCE_EDIT = 'FORCE_EDIT', 'Принудительное редактирование (завершенные/отмененные задачи)'
        DELETE_LOG = 'DELETE_LOG', 'Удаление логов'

    class Resource(models.TextChoices):
        # CRM модуль
        CLIENT = 'CLIENT', 'Клиенты'
        APPLICATION = 'APPLICATION', 'Заявки'
        APPLICATION_STATUS = 'APPLICATION_STATUS', 'Статусы заявок'
        MEETING = 'MEETING', 'Встречи'
        # Realty модуль
        PROJECT = 'PROJECT', 'Проекты'
        BUILDING = 'BUILDING', 'Дома'
        BUILDING_TYPE = 'BUILDING_TYPE', 'Типы домов'
        PROPERTY = 'PROPERTY', 'Объекты недвижимости'
        LAYOUT = 'LAYOUT', 'Планировки'
        DISCOUNT = 'DISCOUNT', 'Скидки'
        # Deals модуль
        DEAL = 'DEAL', 'Сделки'
        # Finances модуль
        PAYMENT = 'PAYMENT', 'Платежи'
        PAYMENT_TYPE = 'PAYMENT_TYPE', 'Типы платежей'
        BENEFICIARY_ACCOUNT = 'BENEFICIARY_ACCOUNT', 'Счета получателей'
        # Documents модуль
        TEMPLATE = 'TEMPLATE', 'Шаблоны документов'
        # Reports модуль
        REPORT = 'REPORT', 'Отчеты'
        PLAN = 'PLAN', 'Планы продаж'
        # Tasks модуль
        TASK = 'TASK', 'Задачи'
        TASK_LOG = 'TASK_LOG', 'Логи задач'
        # Permissions модуль
        USER = 'USER', 'Пользователи'
        ROLE = 'ROLE', 'Роли'
        PERMISSION = 'PERMISSION', 'Разрешения'
        COMPANY = 'COMPANY', 'Компании'
        DEPARTMENT = 'DEPARTMENT', 'Отделы'
        PARTNER_API_KEY = 'PARTNER_API_KEY', 'API-ключи партнёров'
        # Системные
        DASHBOARD = 'DASHBOARD', 'Дашборд'
        SETTINGS = 'SETTINGS', 'Настройки'

    class Scope(models.TextChoices):
        """
        Область видимости определяет границы доступа к объектам
        """
        OWN = 'OWN', 'Только свои объекты'
        DEPARTMENT = 'DEPARTMENT', 'Объекты своего отдела'
        COMPANY = 'COMPANY', 'Объекты своей компании'
        SYSTEM = 'SYSTEM', 'Все объекты системы'

    # Основные поля разрешения
    code = models.CharField(
        max_length=100,
        unique=True,
        verbose_name="Код разрешения",
        help_text="Формат: ACTION_RESOURCE_SCOPE (например: VIEW_CLIENT_OWN)"
    )
    name = models.CharField(max_length=255, verbose_name="Название разрешения")
    description = models.TextField(blank=True, verbose_name="Описание")
    
    # Компоненты разрешения
    action = models.CharField(
        max_length=20,
        choices=Action.choices,
        verbose_name="Действие"
    )
    resource = models.CharField(
        max_length=50,
        choices=Resource.choices,
        verbose_name="Ресурс"
    )
    scope = models.CharField(
        max_length=20,
        choices=Scope.choices,
        verbose_name="Область видимости"
    )
    
    # Метаданные
    is_active = models.BooleanField(default=True, verbose_name="Активно")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата обновления")

    class Meta:
        verbose_name = "Разрешение"
        verbose_name_plural = "Разрешения"
        ordering = ['resource', 'action', 'scope']
        indexes = [
            models.Index(fields=['action', 'resource', 'scope']),
            models.Index(fields=['code']),
        ]

    def __str__(self):
        return f"{self.get_action_display()} - {self.get_resource_display()} ({self.get_scope_display()})"

    def save(self, *args, **kwargs):
        """
        Автоматически генерируем код разрешения при сохранении
        """
        if not self.code:
            self.code = f"{self.action}_{self.resource}_{self.scope}"
        if not self.name:
            self.name = f"{self.get_action_display()} {self.get_resource_display()} - {self.get_scope_display()}"
        super().save(*args, **kwargs)


class Role(models.Model):
    """
    Роль - набор разрешений с определенной областью действия
    """
    
    class RoleCategory(models.TextChoices):
        """
        Категория роли (для группировки в UI)
        """
        ADMINISTRATIVE = 'ADMINISTRATIVE', 'Административная'
        MANAGEMENT = 'MANAGEMENT', 'Управленческая'
        OPERATIONAL = 'OPERATIONAL', 'Операционная'
        READONLY = 'READONLY', 'Только просмотр'
        CUSTOM = 'CUSTOM', 'Пользовательская'

    class RoleScope(models.TextChoices):
        """
        Область действия роли (реальная иерархия доступа)
        """
        SYSTEM = 'SYSTEM', 'Вся система'
        COMPANY = 'COMPANY', 'Компания'
        DEPARTMENT = 'DEPARTMENT', 'Отдел'
        OWN = 'OWN', 'Только свои данные'

    name = models.CharField(max_length=255, verbose_name="Название роли")
    code = models.CharField(max_length=100, unique=True, verbose_name="Код роли")
    description = models.TextField(blank=True, verbose_name="Описание")
    
    # Категория для группировки в интерфейсе
    category = models.CharField(
        max_length=30,
        choices=RoleCategory.choices,
        default=RoleCategory.CUSTOM,
        verbose_name="Категория роли",
        help_text="Группировка роли в интерфейсе пользователя"
    )
    
    # Область действия (реальная иерархия)
    scope = models.CharField(
        max_length=30,
        choices=RoleScope.choices,
        default=RoleScope.OWN,
        verbose_name="Область действия",
        help_text="Определяет уровень доступа: система, компания, отдел или личные данные"
    )
    
    # Связи
    permissions = models.ManyToManyField(
        Permission,
        related_name='roles',
        verbose_name="Разрешения",
        blank=True
    )
    
    # Ограничения по компаниям (для системных ролей может быть пусто)
    companies = models.ManyToManyField(
        Company,
        related_name='roles',
        verbose_name="Компании",
        blank=True,
        help_text="Оставьте пустым для системных ролей"
    )
    
    # Метаданные
    is_system = models.BooleanField(
        default=False,
        verbose_name="Системная роль",
        help_text="Системные роли не могут быть изменены пользователями"
    )
    is_active = models.BooleanField(default=True, verbose_name="Активна")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата обновления")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_roles',
        verbose_name="Кем создана"
    )

    class Meta:
        verbose_name = "Роль"
        verbose_name_plural = "Роли"
        ordering = ['scope', 'category', 'name']

    def __str__(self):
        try:
            return f"{self.name} ({self.get_scope_display()})"
        except:
            return self.name or self.code
    
    @property
    def scope_display(self):
        """Человекочитаемое название области действия"""
        try:
            return self.get_scope_display()
        except:
            return self.scope
    
    @property
    def category_display(self):
        """Человекочитаемое название категории"""
        try:
            return self.get_category_display()
        except:
            return self.category


class UserProfile(models.Model):
    """
    Расширенный профиль пользователя с привязкой к организационной структуре
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile',
        verbose_name="Пользователь"
    )
    
    # Организационная принадлежность
    company = models.ForeignKey(
        Company,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employees',
        verbose_name="Компания"
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employees',
        verbose_name="Отдел"
    )
    
    # Роли пользователя
    roles = models.ManyToManyField(
        Role,
        related_name='user_profiles',
        verbose_name="Роли",
        blank=True
    )
    
    # Дополнительная информация
    position = models.CharField(max_length=255, blank=True, verbose_name="Должность")
    phone = models.CharField(max_length=20, blank=True, verbose_name="Телефон")
    avatar = models.ImageField(
        upload_to='avatars/',
        blank=True,
        null=True,
        verbose_name="Аватар"
    )
    
    # Системный администратор имеет доступ ко всему
    is_system_admin = models.BooleanField(
        default=False,
        verbose_name="Системный администратор"
    )
    
    # Метаданные
    is_active = models.BooleanField(default=True, verbose_name="Активен")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата обновления")

    class Meta:
        verbose_name = "Профиль пользователя"
        verbose_name_plural = "Профили пользователей"
        ordering = ['user__username']

    def __str__(self):
        return f"Профиль {self.user.get_full_name() or self.user.username}"

    def has_permission(self, permission_code):
        """
        Проверка наличия разрешения у пользователя
        """
        # Системный администратор имеет все разрешения
        if self.is_system_admin:
            return True
        
        # Проверяем разрешения через роли
        return self.roles.filter(
            permissions__code=permission_code,
            permissions__is_active=True,
            is_active=True
        ).exists()

    def has_permission_for_action(self, action, resource, scope=None):
        """
        Проверка наличия разрешения для конкретного действия над ресурсом
        
        Args:
            action: Действие (VIEW, ADD, EDIT, DELETE)
            resource: Ресурс (CLIENT, DEAL, и т.д.)
            scope: Область действия (SYSTEM, COMPANY, DEPARTMENT, OWN) или None
                   Если None - проверяет наличие разрешения с любым scope
        
        Returns:
            bool: True если разрешение есть
        """
        # Системный администратор имеет все разрешения
        if self.is_system_admin:
            return True
        
        # Если scope не указан, проверяем наличие разрешения с любым scope
        if scope is None:
            return self.roles.filter(
                permissions__action=action,
                permissions__resource=resource,
                permissions__is_active=True,
                is_active=True
            ).exists()
        
        # Если scope указан, проверяем конкретное разрешение
        permission_code = f"{action}_{resource}_{scope}"
        return self.has_permission(permission_code)

    def get_all_permissions(self):
        """
        Получение всех разрешений пользователя
        """
        if self.is_system_admin:
            return Permission.objects.filter(is_active=True)
        
        return Permission.objects.filter(
            roles__in=self.roles.filter(is_active=True),
            is_active=True
        ).distinct()

    def get_accessible_companies(self):
        """
        Получение компаний, к которым пользователь имеет доступ
        """
        if self.is_system_admin:
            return Company.objects.filter(is_active=True)
        
        # Если у пользователя роль с областью SYSTEM, он видит все компании
        if self.roles.filter(scope=Role.RoleScope.SYSTEM, is_active=True).exists():
            return Company.objects.filter(is_active=True)
        
        # Иначе только свою компанию
        if self.company:
            return Company.objects.filter(id=self.company.id, is_active=True)
        
        return Company.objects.none()

    def get_accessible_departments(self):
        """
        Получение отделов, к которым пользователь имеет доступ
        """
        if self.is_system_admin:
            return Department.objects.filter(is_active=True)
        
        # Роли с областью COMPANY видят все отделы своей компании
        if self.company and self.roles.filter(
            scope=Role.RoleScope.COMPANY,
            is_active=True
        ).exists():
            return Department.objects.filter(company=self.company, is_active=True)
        
        # Роли с областью DEPARTMENT видят свой отдел и подотделы
        if self.department and self.roles.filter(
            scope=Role.RoleScope.DEPARTMENT,
            is_active=True
        ).exists():
            # Получаем отдел и все его подотделы рекурсивно
            departments = [self.department]
            sub_departments = Department.objects.filter(
                parent_department=self.department,
                is_active=True
            )
            departments.extend(list(sub_departments))
            return Department.objects.filter(id__in=[d.id for d in departments])
        
        # Обычные пользователи видят только свой отдел
        if self.department:
            return Department.objects.filter(id=self.department.id, is_active=True)
        
        return Department.objects.none()


class PermissionLog(models.Model):
    """
    Лог изменений разрешений и ролей для аудита
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        verbose_name="Пользователь"
    )
    action = models.CharField(max_length=50, verbose_name="Действие")
    entity_type = models.CharField(
        max_length=50,
        verbose_name="Тип сущности",
        help_text="Permission, Role, UserProfile"
    )
    entity_id = models.IntegerField(verbose_name="ID сущности")
    details = models.JSONField(verbose_name="Детали изменения")
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name="IP адрес")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")

    class Meta:
        verbose_name = "Лог разрешений"
        verbose_name_plural = "Логи разрешений"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['entity_type', 'entity_id']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"{self.action} - {self.entity_type} #{self.entity_id}"


class PartnerAPIKey(models.Model):
    """
    API-ключи для партнёров, имеющих доступ к публичному API
    """
    import secrets
    
    # Доступные действия для API-ключа
    class AllowedScope(models.TextChoices):
        VIEW_PROJECTS = 'VIEW_PROJECTS', 'Просмотр проектов'
        VIEW_BUILDINGS = 'VIEW_BUILDINGS', 'Просмотр зданий'
        VIEW_LAYOUTS = 'VIEW_LAYOUTS', 'Просмотр планировок'
        CREATE_APPLICATION = 'CREATE_APPLICATION', 'Создание заявок'
    
    name = models.CharField(max_length=255, verbose_name="Название партнёра")
    key = models.CharField(max_length=64, unique=True, verbose_name="API ключ", db_index=True)
    description = models.TextField(blank=True, verbose_name="Описание")
    companies = models.ManyToManyField(
        Company,
        related_name='partner_api_keys',
        verbose_name="Компании",
        help_text="Компании, к данным которых будет доступ",
        blank=True
    )
    
    # Разрешённые действия (scopes)
    allowed_scopes = models.JSONField(
        default=list,
        verbose_name="Разрешённые действия",
        help_text="Список разрешённых действий: VIEW_PROJECTS, VIEW_BUILDINGS, VIEW_LAYOUTS, CREATE_APPLICATION"
    )
    
    is_active = models.BooleanField(default=True, verbose_name="Активен")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    last_used_at = models.DateTimeField(null=True, blank=True, verbose_name="Последнее использование")
    expires_at = models.DateTimeField(null=True, blank=True, verbose_name="Срок действия")
    
    # Ограничения по IP (опционально)
    allowed_ips = models.TextField(
        blank=True, 
        verbose_name="Разрешённые IP",
        help_text="Список IP-адресов через запятую. Пустое поле = без ограничений"
    )
    
    # Ограничения по запросам (rate limiting)
    requests_per_minute = models.PositiveIntegerField(
        default=60, 
        verbose_name="Запросов в минуту"
    )
    requests_per_day = models.PositiveIntegerField(
        default=10000, 
        verbose_name="Запросов в день"
    )

    class Meta:
        verbose_name = "API ключ партнёра"
        verbose_name_plural = "API ключи партнёров"
        ordering = ['-created_at']

    def __str__(self):
        companies_count = self.companies.count()
        if companies_count == 0:
            return f"{self.name} (нет доступа)"
        elif companies_count == 1:
            return f"{self.name} ({self.companies.first().name})"
        else:
            return f"{self.name} ({companies_count} компаний)"
    
    def save(self, *args, **kwargs):
        if not self.key:
            import secrets
            self.key = secrets.token_hex(32)
        # Если scopes пустой, по умолчанию даём только просмотр
        if not self.allowed_scopes:
            self.allowed_scopes = ['VIEW_PROJECTS', 'VIEW_BUILDINGS']
        super().save(*args, **kwargs)
    
    def is_valid(self):
        """Проверяет, валиден ли ключ"""
        from django.utils import timezone
        if not self.is_active:
            return False
        if self.expires_at and self.expires_at < timezone.now():
            return False
        return True
    
    def has_scope(self, scope: str) -> bool:
        """Проверяет, есть ли у ключа указанный scope"""
        return scope in (self.allowed_scopes or [])
    
    def is_ip_allowed(self, ip_address):
        """Проверяет, разрешён ли IP-адрес"""
        if not self.allowed_ips:
            return True
        allowed = [ip.strip() for ip in self.allowed_ips.split(',') if ip.strip()]
        return ip_address in allowed
    
    def update_last_used(self):
        """Обновляет время последнего использования"""
        from django.utils import timezone
        self.last_used_at = timezone.now()
        self.save(update_fields=['last_used_at'])
