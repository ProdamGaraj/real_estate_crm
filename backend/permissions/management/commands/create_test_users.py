"""
Management command для создания тестовых пользователей
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from permissions.models import Company, Department, Role, UserProfile, Permission


class Command(BaseCommand):
    help = 'Создает тестовых пользователей для проверки системы ролей и разрешений'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Начинаем создание тестовых данных...'))

        # Создаем компании
        company1, _ = Company.objects.get_or_create(
            code='COMPANY1',
            defaults={
                'name': 'ООО "Первая компания"',
                'is_active': True,
            }
        )
        
        company2, _ = Company.objects.get_or_create(
            code='COMPANY2',
            defaults={
                'name': 'ООО "Вторая компания"',
                'is_active': True,
            }
        )
        
        self.stdout.write(f'✓ Компании созданы: {company1.name}, {company2.name}')

        # Создаем отделы
        dept_sales1, _ = Department.objects.get_or_create(
            code='SALES1',
            company=company1,
            defaults={
                'name': 'Отдел продаж',
                'is_active': True,
            }
        )
        
        dept_marketing1, _ = Department.objects.get_or_create(
            code='MARKETING1',
            company=company1,
            defaults={
                'name': 'Отдел маркетинга',
                'is_active': True,
            }
        )
        
        dept_sales2, _ = Department.objects.get_or_create(
            code='SALES2',
            company=company2,
            defaults={
                'name': 'Отдел продаж',
                'is_active': True,
            }
        )
        
        self.stdout.write(f'✓ Отделы созданы')

        # Получаем разрешения
        all_permissions = Permission.objects.filter(is_active=True)
        
        # Группируем разрешения по ресурсам
        client_perms = all_permissions.filter(resource='CLIENT')
        deal_perms = all_permissions.filter(resource='DEAL')
        project_perms = all_permissions.filter(resource='PROJECT')
        
        # Создаем роли
        # 1. Менеджер - может управлять клиентами и сделками
        role_manager, created = Role.objects.get_or_create(
            code='MANAGER',
            defaults={
                'name': 'Менеджер',
                'description': 'Менеджер по продажам - управление клиентами и сделками',
                'scope': Role.RoleScope.OWN,
                'category': Role.RoleCategory.OPERATIONAL,
                'is_system': False,
                'is_active': True,
            }
        )
        if created:
            role_manager.permissions.set(list(client_perms) + list(deal_perms))
            role_manager.companies.add(company1, company2)
            self.stdout.write(f'✓ Создана роль: {role_manager.name}')
        
        # 2. Директор отдела - полный доступ к клиентам, сделкам и проектам
        role_director, created = Role.objects.get_or_create(
            code='DIRECTOR',
            defaults={
                'name': 'Директор отдела',
                'description': 'Директор отдела - полный доступ к клиентам, сделкам и проектам',
                'scope': Role.RoleScope.DEPARTMENT,
                'category': Role.RoleCategory.MANAGEMENT,
                'is_system': False,
                'is_active': True,
            }
        )
        if created:
            role_director.permissions.set(list(client_perms) + list(deal_perms) + list(project_perms))
            role_director.companies.add(company1, company2)
            self.stdout.write(f'✓ Создана роль: {role_director.name}')
        
        # 3. Наблюдатель - только просмотр
        view_perms = all_permissions.filter(action='VIEW')
        role_viewer, created = Role.objects.get_or_create(
            code='VIEWER',
            defaults={
                'name': 'Наблюдатель',
                'description': 'Наблюдатель - только просмотр данных',
                'scope': Role.RoleScope.COMPANY,
                'category': Role.RoleCategory.READONLY,
                'is_system': False,
                'is_active': True,
            }
        )
        if created:
            role_viewer.permissions.set(view_perms)
            role_viewer.companies.add(company1, company2)
            self.stdout.write(f'✓ Создана роль: {role_viewer.name}')

        # Создаем пользователей
        users_data = [
            {
                'username': 'manager1',
                'email': 'manager1@example.com',
                'first_name': 'Иван',
                'last_name': 'Менеджеров',
                'password': 'test123456',
                'company': company1,
                'department': dept_sales1,
                'role': role_manager,
            },
            {
                'username': 'manager2',
                'email': 'manager2@example.com',
                'first_name': 'Петр',
                'last_name': 'Продажин',
                'password': 'test123456',
                'company': company1,
                'department': dept_marketing1,
                'role': role_manager,
            },
            {
                'username': 'director1',
                'email': 'director1@example.com',
                'first_name': 'Сергей',
                'last_name': 'Директоров',
                'password': 'test123456',
                'company': company1,
                'department': dept_sales1,
                'role': role_director,
            },
            {
                'username': 'viewer1',
                'email': 'viewer1@example.com',
                'first_name': 'Ольга',
                'last_name': 'Наблюдательная',
                'password': 'test123456',
                'company': company2,
                'department': dept_sales2,
                'role': role_viewer,
            },
            {
                'username': 'manager_company2',
                'email': 'manager_c2@example.com',
                'first_name': 'Андрей',
                'last_name': 'Продавцов',
                'password': 'test123456',
                'company': company2,
                'department': dept_sales2,
                'role': role_manager,
            },
        ]

        for user_data in users_data:
            username = user_data['username']
            
            # Проверяем, существует ли пользователь
            if User.objects.filter(username=username).exists():
                self.stdout.write(self.style.WARNING(f'⚠ Пользователь {username} уже существует'))
                continue
            
            # Создаем Django User
            user = User.objects.create_user(
                username=username,
                email=user_data['email'],
                first_name=user_data['first_name'],
                last_name=user_data['last_name'],
                password=user_data['password'],
            )
            
            # Создаем UserProfile
            profile = UserProfile.objects.create(
                user=user,
                company=user_data['company'],
                department=user_data['department'],
                is_active=True,
            )
            
            # Добавляем роль
            profile.roles.add(user_data['role'])
            
            self.stdout.write(
                self.style.SUCCESS(
                    f'✓ Создан пользователь: {username} ({user_data["first_name"]} {user_data["last_name"]}) '
                    f'- Роль: {user_data["role"].name}, Компания: {user_data["company"].name}'
                )
            )

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write(self.style.SUCCESS('Тестовые данные созданы успешно!'))
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write('')
        self.stdout.write('Созданные пользователи (пароль для всех: test123456):')
        self.stdout.write('')
        self.stdout.write('1. manager1 - Менеджер (Компания 1, Отдел продаж)')
        self.stdout.write('   - Может управлять клиентами и сделками')
        self.stdout.write('')
        self.stdout.write('2. manager2 - Менеджер (Компания 1, Отдел маркетинга)')
        self.stdout.write('   - Может управлять клиентами и сделками')
        self.stdout.write('')
        self.stdout.write('3. director1 - Директор отдела (Компания 1, Отдел продаж)')
        self.stdout.write('   - Полный доступ к клиентам, сделкам и проектам')
        self.stdout.write('')
        self.stdout.write('4. viewer1 - Наблюдатель (Компания 2, Отдел продаж)')
        self.stdout.write('   - Только просмотр всех данных')
        self.stdout.write('')
        self.stdout.write('5. manager_company2 - Менеджер (Компания 2, Отдел продаж)')
        self.stdout.write('   - Может управлять клиентами и сделками')
        self.stdout.write('')
