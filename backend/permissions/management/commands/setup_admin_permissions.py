"""
Management команда для настройки полных прав администратора
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from permissions.models import Company, Department, UserProfile, Role


class Command(BaseCommand):
    help = 'Настройка полных прав для администратора'

    def add_arguments(self, parser):
        parser.add_argument(
            '--username',
            type=str,
            default='admin',
            help='Username пользователя (по умолчанию: admin)'
        )

    def handle(self, *args, **options):
        username = options['username']

        try:
            # Найти пользователя
            user = User.objects.get(username=username)
            self.stdout.write(f'✓ Найден пользователь: {user.username}')
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'✗ Пользователь {username} не найден'))
            self.stdout.write('Создайте пользователя командой: python manage.py createsuperuser')
            return

        # Получить или создать компанию
        company, created = Company.objects.get_or_create(
            code='SYSTEM',
            defaults={
                'name': 'Системная компания',
                'description': 'Компания для системных администраторов',
                'is_active': True
            }
        )
        if created:
            self.stdout.write(f'✓ Создана компания: {company.name}')
        else:
            self.stdout.write(f'✓ Найдена компания: {company.name}')

        # Получить или создать отдел
        department, created = Department.objects.get_or_create(
            company=company,
            code='ADMIN',
            defaults={
                'name': 'Администрация',
                'description': 'Системные администраторы',
                'is_active': True
            }
        )
        if created:
            self.stdout.write(f'✓ Создан отдел: {department.name}')
        else:
            self.stdout.write(f'✓ Найден отдел: {department.name}')

        # Полный доступ даёт признак системного администратора. Типовую роль
        # SYSTEM_ADMIN назначаем, если она есть: в системе со своими ролями её
        # может не быть (init_permissions не создаёт её без --with-roles)
        system_admin_role = Role.objects.filter(code='SYSTEM_ADMIN').first()
        if system_admin_role:
            self.stdout.write(f'✓ Найдена роль: {system_admin_role.name}')
        else:
            self.stdout.write('  Роли SYSTEM_ADMIN нет — достаточно признака системного администратора')

        # Получить или создать профиль пользователя
        profile, created = UserProfile.objects.get_or_create(
            user=user,
            defaults={
                'company': company,
                'department': department,
                'position': 'Системный администратор',
                'is_system_admin': True,
                'is_active': True
            }
        )

        if not created:
            # Обновить существующий профиль
            profile.company = company
            profile.department = department
            profile.is_system_admin = True
            profile.is_active = True
            profile.save()
            self.stdout.write(f'✓ Обновлен профиль пользователя')
        else:
            self.stdout.write(f'✓ Создан профиль пользователя')

        # Назначить роль системного администратора
        if system_admin_role is None:
            pass
        elif system_admin_role not in profile.roles.all():
            profile.roles.add(system_admin_role)
            self.stdout.write(f'✓ Назначена роль: {system_admin_role.name}')
        else:
            self.stdout.write(f'✓ Роль уже назначена: {system_admin_role.name}')

        # Вывести итоговую информацию
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write(self.style.SUCCESS('✅ Настройка завершена успешно!'))
        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write('')
        self.stdout.write(f'Пользователь: {user.username}')
        self.stdout.write(f'Email: {user.email or "не указан"}')
        self.stdout.write(f'Компания: {company.name}')
        self.stdout.write(f'Отдел: {department.name}')
        self.stdout.write(f'Роль: {system_admin_role.name if system_admin_role else "—"}')
        self.stdout.write(f'Разрешений: {profile.get_all_permissions().count()}')
        self.stdout.write(f'Системный администратор: {"Да" if profile.is_system_admin else "Нет"}')
        self.stdout.write('')
        self.stdout.write('Пользователь теперь имеет полный доступ ко всем ресурсам системы!')
        self.stdout.write('')
