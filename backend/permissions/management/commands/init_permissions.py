"""
Management команда для инициализации базовых разрешений и ролей
Использование: python manage.py init_permissions
"""
from django.core.management.base import BaseCommand
from permissions.models import Permission, Role


class Command(BaseCommand):
    help = 'Инициализирует базовые разрешения и роли в системе'

    def handle(self, *args, **options):
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
        
        actions = ['VIEW', 'ADD', 'EDIT', 'DELETE']
        scopes = ['OWN', 'DEPARTMENT', 'COMPANY', 'SYSTEM']
        resources = [
            'CLIENT', 'APPLICATION', 'MEETING',
            'PROJECT', 'BUILDING', 'PROPERTY', 'LAYOUT', 'DISCOUNT',
            'DEAL',
            'PAYMENT', 'PAYMENT_TYPE', 'BENEFICIARY_ACCOUNT',
            'TEMPLATE',
            'REPORT', 'PLAN',
            'USER', 'ROLE', 'PERMISSION', 'COMPANY', 'DEPARTMENT',
            'DASHBOARD', 'SETTINGS'
        ]
        
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
                'level': Role.RoleLevel.SYSTEM_ADMIN,
                'is_system': True
            }
        )
        
        if created:
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
                'level': Role.RoleLevel.COMPANY_ADMIN,
                'is_system': True
            }
        )
        
        if created:
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
                'level': Role.RoleLevel.DEPARTMENT_MANAGER,
                'is_system': True
            }
        )
        
        if created:
            # Все разрешения уровня DEPARTMENT и OWN для основных ресурсов
            main_resources = [
                'CLIENT', 'APPLICATION', 'MEETING',
                'DEAL', 'PAYMENT'
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
                'level': Role.RoleLevel.MANAGER,
                'is_system': True
            }
        )
        
        if created:
            # Полный доступ к своим клиентам, заявкам, встречам, сделкам
            own_resources = ['CLIENT', 'APPLICATION', 'MEETING', 'DEAL', 'PAYMENT']
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
                'level': Role.RoleLevel.VIEWER,
                'is_system': True
            }
        )
        
        if created:
            # Только VIEW разрешения уровня COMPANY для основных ресурсов
            main_resources = [
                'CLIENT', 'APPLICATION', 'MEETING',
                'PROJECT', 'BUILDING', 'PROPERTY',
                'DEAL', 'PAYMENT',
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
