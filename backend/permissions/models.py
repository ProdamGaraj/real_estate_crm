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
        except Exception:
            return self.name or self.code
    
    @property
    def scope_display(self):
        """Человекочитаемое название области действия"""
        try:
            return self.get_scope_display()
        except Exception:
            return self.scope
    
    @property
    def category_display(self):
        """Человекочитаемое название категории"""
        try:
            return self.get_category_display()
        except Exception:
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
    is_deleted = models.BooleanField(default=False, verbose_name="Удалён")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата обновления")

    class Meta:
        verbose_name = "Профиль пользователя"
        verbose_name_plural = "Профили пользователей"
        ordering = ['user__username']

    def __str__(self):
        return f"Профиль {self.user.get_full_name() or self.user.username}"

    def _get_applicable_roles(self):
        """
        Получает роли пользователя, применимые к его компании.
        Роль применима если: companies пусто (system-wide) или companies содержит компанию пользователя.
        """
        from django.db.models import Q
        roles = self.roles.filter(is_active=True)
        if self.company:
            roles = roles.filter(
                Q(companies__isnull=True) | Q(companies=self.company)
            ).distinct()
        return roles

    def has_permission(self, permission_code):
        """
        Проверка наличия разрешения у пользователя
        """
        # Системный администратор имеет все разрешения
        if self.is_system_admin:
            return True
        
        # Проверяем разрешения через применимые роли
        return self._get_applicable_roles().filter(
            permissions__code=permission_code,
            permissions__is_active=True,
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
            return self._get_applicable_roles().filter(
                permissions__action=action,
                permissions__resource=resource,
                permissions__is_active=True,
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
            roles__in=self._get_applicable_roles(),
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
            # Получаем отдел и все его подотделы рекурсивно (макс. 10 уровней)
            MAX_DEPTH = 10
            department_ids = {self.department.id}
            current_level_ids = {self.department.id}
            
            for _ in range(MAX_DEPTH):
                child_ids = set(
                    Department.objects.filter(
                        parent_department_id__in=current_level_ids,
                        is_active=True
                    ).values_list('id', flat=True)
                )
                new_ids = child_ids - department_ids
                if not new_ids:
                    break
                department_ids |= new_ids
                current_level_ids = new_ids
            
            return Department.objects.filter(id__in=department_ids)
        
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
    API-ключи для партнёров, имеющих доступ к публичному API.
    
    Безопасность хранения:
    - key_hash: SHA-256 хеш ключа для быстрого поиска в БД (индексирован)
    - key_encrypted: Fernet-зашифрованный оригинальный ключ (для отображения в админке)
    - Оригинальный ключ в открытом виде НЕ хранится в БД
    """
    
    # Доступные действия для API-ключа
    class AllowedScope(models.TextChoices):
        VIEW_PROJECTS = 'VIEW_PROJECTS', 'Просмотр проектов'
        VIEW_BUILDINGS = 'VIEW_BUILDINGS', 'Просмотр зданий'
        VIEW_LAYOUTS = 'VIEW_LAYOUTS', 'Просмотр планировок'
        CREATE_APPLICATION = 'CREATE_APPLICATION', 'Создание заявок'
    
    name = models.CharField(max_length=255, verbose_name="Название партнёра")
    
    # SHA-256 хеш ключа для поиска (64 hex символа)
    key_hash = models.CharField(
        max_length=64, unique=True, verbose_name="Хеш API ключа",
        db_index=True, editable=False
    )
    # Fernet-зашифрованный оригинальный ключ (для отображения на сайте)
    key_encrypted = models.TextField(
        verbose_name="Зашифрованный API ключ",
        editable=False
    )
    
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
    
    def set_key(self, plaintext_key):
        """
        Устанавливает API-ключ: сохраняет хеш и зашифрованную версию.
        Вызывается при создании и перегенерации ключа.
        """
        from .crypto import hash_api_key, encrypt_api_key
        self.key_hash = hash_api_key(plaintext_key)
        self.key_encrypted = encrypt_api_key(plaintext_key)
    
    def get_key_display(self):
        """
        Возвращает расшифрованный оригинальный ключ для отображения.
        """
        from .crypto import decrypt_api_key
        try:
            return decrypt_api_key(self.key_encrypted)
        except ValueError:
            return '<ошибка дешифровки>'
    
    def save(self, *args, **kwargs):
        is_new = not self.pk
        # Генерируем ключ при первом создании, если хеш не задан
        if not self.key_hash:
            import secrets
            plaintext_key = secrets.token_hex(32)
            self.set_key(plaintext_key)
        # Если scopes пустой и это новая запись, устанавливаем дефолтные
        if is_new and not self.allowed_scopes:
            self.allowed_scopes = ['VIEW_PROJECTS', 'VIEW_BUILDINGS']
        super().save(*args, **kwargs)
    
    @staticmethod
    def find_by_key(plaintext_key):
        """
        Ищет API-ключ по plaintext значению через HMAC-хеш.
        Для обратной совместимости делает fallback на legacy SHA-256 хеш
        и автоматически мигрирует найденный ключ на HMAC.
        """
        from .crypto import hash_api_key, _hash_api_key_legacy
        
        # Сначала ищем по HMAC-хешу
        key_hash = hash_api_key(plaintext_key)
        try:
            return PartnerAPIKey.objects.prefetch_related('companies').get(key_hash=key_hash)
        except PartnerAPIKey.DoesNotExist:
            pass
        
        # Fallback: ищем по legacy SHA-256 хешу
        legacy_hash = _hash_api_key_legacy(plaintext_key)
        try:
            api_key = PartnerAPIKey.objects.prefetch_related('companies').get(key_hash=legacy_hash)
            # Автоматически мигрируем на HMAC-хеш
            api_key.key_hash = key_hash
            api_key.save(update_fields=['key_hash'])
            return api_key
        except PartnerAPIKey.DoesNotExist:
            return None
    
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
        """Проверяет, разрешён ли IP-адрес (поддержка CIDR нотации)"""
        if not self.allowed_ips:
            return True
        import ipaddress as ipaddr_mod
        try:
            client_ip = ipaddr_mod.ip_address(ip_address.strip())
        except ValueError:
            return False
        allowed = [ip.strip() for ip in self.allowed_ips.split(',') if ip.strip()]
        for entry in allowed:
            try:
                if '/' in entry:
                    # CIDR нотация: 192.168.1.0/24
                    if client_ip in ipaddr_mod.ip_network(entry, strict=False):
                        return True
                else:
                    if client_ip == ipaddr_mod.ip_address(entry):
                        return True
            except ValueError:
                continue
        return False
    
    def check_rate_limit(self, client_ip):
        """
        Проверяет rate limit для данного API-ключа.
        Использует Django cache для хранения счётчиков.
        
        Returns:
            tuple: (allowed: bool, retry_after: int or None)
        """
        from django.core.cache import cache
        from django.utils import timezone
        import time
        
        key_id = self.pk
        
        # Используем атомарный cache.incr с try/except для TOCTOU safety
        minute_key = f'crm:api_rate_minute:{key_id}'
        day_key = f'crm:api_rate_day:{key_id}'
        
        # Проверяем и инкрементируем атомарно
        try:
            minute_count = cache.incr(minute_key)
        except ValueError:
            # Ключ не существует — создаём с начальным значением
            cache.set(minute_key, 1, timeout=60)
            minute_count = 1
        
        if minute_count > self.requests_per_minute:
            return False, 60
        
        try:
            day_count = cache.incr(day_key)
        except ValueError:
            cache.set(day_key, 1, timeout=86400)
            day_count = 1
        
        if day_count > self.requests_per_day:
            return False, 3600
        
        return True, None
    
    def update_last_used(self):
        """Обновляет время последнего использования"""
        from django.utils import timezone
        self.last_used_at = timezone.now()
        self.save(update_fields=['last_used_at'])
