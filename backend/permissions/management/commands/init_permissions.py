"""
Management команда для инициализации базовых разрешений и ролей
Использование: python manage.py init_permissions
"""
from django.core.management.base import BaseCommand
from permissions.models import Permission, Role


class Command(BaseCommand):
    help = 'Инициализирует базовые разрешения и роли в системе'

    def add_arguments(self, parser):
        parser.add_argument(
            '--sync-roles',
            action='store_true',
            help=(
                'Пересобрать наборы разрешений у существующих системных ролей. '
                'Нужно после появления новых ресурсов: без этого права на них '
                'не попадут в уже созданные роли. Ручные правки состава '
                'системных ролей при этом теряются.'
            ),
        )

    def handle(self, *args, **options):
        self.sync_roles = options.get('sync_roles', False)
        self.stdout.write(self.style.SUCCESS('Начинаем инициализацию разрешений и ролей...'))
        
        # Создаем все возможные разрешения
        self.create_permissions()
        
        # Создаем базовые роли
        self.create_roles()
        
        self.stdout.write(self.style.SUCCESS('✅ Инициализация завершена успешно!'))

    def create_permissions(self):
        """
        Создание всех разрешений для каждого ресурса
        """
        self.stdout.write('Создание разрешений...')
        
        # Базовые действия для каждого ресурса. Расширенные (возврат задачи,
        # принудительное редактирование и прочие) заводятся отдельно для задач.
        actions = ['VIEW', 'ADD', 'EDIT', 'DELETE']
        scopes = ['OWN', 'DEPARTMENT', 'COMPANY', 'SYSTEM']
        # Список берём из модели: раньше он дублировался здесь вручную и отстал —
        # для APPLICATION_STATUS, BUILDING_TYPE, PARTNER_API_KEY и TASK_LOG
        # разрешения не создавались вовсе, поэтому выдать их роли было нельзя,
        # а соответствующие вкладки настроек видел только системный администратор.
        resources = list(Permission.Resource.values)
        
        created_count = 0
        
        for resource in resources:
            for action in actions:
                for scope in scopes:
                    code = f"{action}_{resource}_{scope}"
                    
                    permission, created = Permission.objects.get_or_create(
                        code=code,
                        defaults={
                            'action': action,
                            'resource': resource,
                            'scope': scope,
                            'is_active': True
                        }
                    )
                    
                    if created:
                        created_count += 1
                        self.stdout.write(f'  ✓ Создано разрешение: {permission.name}')
        
        self.stdout.write(self.style.SUCCESS(f'Создано {created_count} новых разрешений'))

    def create_roles(self):
        """
        Создание базовых ролей с предустановленными разрешениями
        """
        self.stdout.write('\nСоздание ролей...')
        
        # 1. Системный администратор - все разрешения SYSTEM уровня
        self.create_system_admin_role()
        
        # 2. Администратор компании - все разрешения COMPANY уровня
        self.create_company_admin_role()
        
        # 3. Руководитель отдела - DEPARTMENT уровень для большинства ресурсов
        self.create_department_manager_role()
        
        # 4. Менеджер - работает с клиентами, заявками, сделками (OWN и DEPARTMENT VIEW)
        self.create_manager_role()
        
        # 5. Наблюдатель - только VIEW разрешения
        self.create_viewer_role()

    def create_system_admin_role(self):
        """Системный администратор - полный доступ"""
        role, created = Role.objects.get_or_create(
            code='SYSTEM_ADMIN',
            defaults={
                'name': 'Системный администратор',
                'description': 'Полный доступ ко всей системе',
                'scope': Role.RoleScope.SYSTEM,
                'category': Role.RoleCategory.ADMINISTRATIVE,
                'is_system': True
            }
        )
        
        # При --sync-roles состав прав обновляется и у существующей роли
        if created or self.sync_roles:
            # Все разрешения уровня SYSTEM
            permissions = Permission.objects.filter(scope='SYSTEM')
            role.permissions.set(permissions)
            self.stdout.write(self.style.SUCCESS(
                f'  ✓ Создана роль: {role.name} ({role.permissions.count()} разрешений)'
            ))

    def create_company_admin_role(self):
        """Администратор компании - управление компанией"""
        role, created = Role.objects.get_or_create(
            code='COMPANY_ADMIN',
            defaults={
                'name': 'Администратор компании',
                'description': 'Управление всеми ресурсами компании',
                'scope': Role.RoleScope.COMPANY,
                'category': Role.RoleCategory.ADMINISTRATIVE,
                'is_system': True
            }
        )
        
        # При --sync-roles состав прав обновляется и у существующей роли
        if created or self.sync_roles:
            # Все разрешения уровня COMPANY + VIEW SYSTEM для некоторых справочников
            permissions = Permission.objects.filter(
                scope__in=['COMPANY', 'DEPARTMENT', 'OWN']
            )
            
            # Добавляем просмотр системных справочников
            system_view_resources = ['PAYMENT_TYPE', 'BENEFICIARY_ACCOUNT', 'TEMPLATE']
            system_view_perms = Permission.objects.filter(
                action='VIEW',
                resource__in=system_view_resources,
                scope='SYSTEM'
            )
            
            role.permissions.set(list(permissions) + list(system_view_perms))
            self.stdout.write(self.style.SUCCESS(
                f'  ✓ Создана роль: {role.name} ({role.permissions.count()} разрешений)'
            ))

    def create_department_manager_role(self):
        """Руководитель отдела - управление отделом"""
        role, created = Role.objects.get_or_create(
            code='DEPARTMENT_MANAGER',
            defaults={
                'name': 'Руководитель отдела',
                'description': 'Управление ресурсами отдела',
                'scope': Role.RoleScope.DEPARTMENT,
                'category': Role.RoleCategory.MANAGEMENT,
                'is_system': True
            }
        )
        
        # При --sync-roles состав прав обновляется и у существующей роли
        if created or self.sync_roles:
            # Все разрешения уровня DEPARTMENT и OWN для основных ресурсов
            main_resources = [
                'CLIENT', 'APPLICATION', 'MEETING',
                'DEAL', 'PAYMENT', 'TASK'
            ]
            
            permissions = Permission.objects.filter(
                resource__in=main_resources,
                scope__in=['DEPARTMENT', 'OWN']
            )
            
            # VIEW для проектов и объектов недвижимости уровня COMPANY
            view_permissions = Permission.objects.filter(
                action='VIEW',
                resource__in=['PROJECT', 'BUILDING', 'PROPERTY', 'DISCOUNT'],
                scope__in=['COMPANY', 'DEPARTMENT']
            )
            
            # VIEW для дашборда и отчетов
            dashboard_perms = Permission.objects.filter(
                action='VIEW',
                resource__in=['DASHBOARD', 'REPORT'],
                scope__in=['DEPARTMENT', 'COMPANY']
            )
            
            role.permissions.set(
                list(permissions) + list(view_permissions) + list(dashboard_perms)
            )
            self.stdout.write(self.style.SUCCESS(
                f'  ✓ Создана роль: {role.name} ({role.permissions.count()} разрешений)'
            ))

    def create_manager_role(self):
        """Менеджер - работа с клиентами и сделками"""
        role, created = Role.objects.get_or_create(
            code='MANAGER',
            defaults={
                'name': 'Менеджер',
                'description': 'Работа с клиентами, заявками и сделками',
                'scope': Role.RoleScope.OWN,
                'category': Role.RoleCategory.OPERATIONAL,
                'is_system': True
            }
        )
        
        # При --sync-roles состав прав обновляется и у существующей роли
        if created or self.sync_roles:
            # Полный доступ к своим клиентам, заявкам, встречам, сделкам, задачам
            own_resources = ['CLIENT', 'APPLICATION', 'MEETING', 'DEAL', 'PAYMENT', 'TASK']
            own_permissions = Permission.objects.filter(
                resource__in=own_resources,
                scope='OWN'
            )
            
            # VIEW для ресурсов отдела
            dept_view_permissions = Permission.objects.filter(
                action='VIEW',
                resource__in=own_resources,
                scope='DEPARTMENT'
            )
            
            # VIEW для недвижимости и скидок компании
            realty_view = Permission.objects.filter(
                action='VIEW',
                resource__in=['PROJECT', 'BUILDING', 'PROPERTY', 'LAYOUT', 'DISCOUNT'],
                scope__in=['COMPANY', 'DEPARTMENT']
            )
            
            # VIEW дашборда
            dashboard_perms = Permission.objects.filter(
                action='VIEW',
                resource='DASHBOARD',
                scope='OWN'
            )
            
            role.permissions.set(
                list(own_permissions) + 
                list(dept_view_permissions) + 
                list(realty_view) + 
                list(dashboard_perms)
            )
            self.stdout.write(self.style.SUCCESS(
                f'  ✓ Создана роль: {role.name} ({role.permissions.count()} разрешений)'
            ))

    def create_viewer_role(self):
        """Наблюдатель - только просмотр"""
        role, created = Role.objects.get_or_create(
            code='VIEWER',
            defaults={
                'name': 'Наблюдатель',
                'description': 'Только просмотр данных компании',
                'scope': Role.RoleScope.COMPANY,
                'category': Role.RoleCategory.READONLY,
                'is_system': True
            }
        )
        
        # При --sync-roles состав прав обновляется и у существующей роли
        if created or self.sync_roles:
            # Только VIEW разрешения уровня COMPANY для основных ресурсов
            main_resources = [
                'CLIENT', 'APPLICATION', 'MEETING',
                'PROJECT', 'BUILDING', 'PROPERTY',
                'DEAL', 'PAYMENT', 'TASK',
                'DASHBOARD', 'REPORT'
            ]
            
            permissions = Permission.objects.filter(
                action='VIEW',
                resource__in=main_resources,
                scope__in=['COMPANY', 'DEPARTMENT', 'OWN']
            )
            
            role.permissions.set(permissions)
            self.stdout.write(self.style.SUCCESS(
                f'  ✓ Создана роль: {role.name} ({role.permissions.count()} разрешений)'
            ))
