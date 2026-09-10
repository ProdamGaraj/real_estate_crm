"""
Выдача права «Просмотр настроек» ролям, которые ведут настройки.

Раздел «Настройки» теперь открывается только правом VIEW на ресурс SETTINGS.
Раньше он открывался любым правом на настроечный справочник, поэтому в ролях
администраторов это право могло быть не отмечено — и после обновления они
потеряли бы доступ к разделу.

Команда находит роли, которые распоряжаются административными ресурсами
(компании, отделы, роли, пользователи, API-ключи), и выдаёт им VIEW_SETTINGS
с областью действия самой роли.

Сначала показывает, что собирается сделать:

    python manage.py grant_settings_access
    python manage.py grant_settings_access --apply
    python manage.py grant_settings_access --role COMPANY_ADMIN --apply
"""

from django.core.management.base import BaseCommand, CommandError

from permissions.models import Permission, Role

# Ресурсы, управление которыми означает «это администратор системы или компании».
# Типы платежей и счета сюда намеренно не входят: право на них выдают
# и менеджерам — ради графика платежей, а не ради настроек.
ADMIN_RESOURCES = ['COMPANY', 'DEPARTMENT', 'ROLE', 'USER', 'PARTNER_API_KEY']
MANAGE_ACTIONS = ['ADD', 'EDIT', 'DELETE']


class Command(BaseCommand):
    help = "Выдаёт роли право «Просмотр настроек», если она ведёт настройки"

    def add_arguments(self, parser):
        parser.add_argument('--role', help='Код конкретной роли')
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Выдать права. Без флага команда только показывает список',
        )

    def handle(self, *args, **options):
        roles = Role.objects.filter(is_active=True)
        if options['role']:
            roles = roles.filter(code=options['role'])
            if not roles.exists():
                raise CommandError(f"Роль «{options['role']}» не найдена")

        planned = []
        for role in roles:
            if role.permissions.filter(action='VIEW', resource='SETTINGS').exists():
                continue

            manages_admin_resources = role.permissions.filter(
                resource__in=ADMIN_RESOURCES,
                action__in=MANAGE_ACTIONS,
            ).exists()
            # Роль, названную явно, обрабатываем даже без этого признака
            if not manages_admin_resources and not options['role']:
                continue

            scope = role.scope if role.scope in dict(Permission.Scope.choices) else 'COMPANY'
            permission = Permission.objects.filter(
                action='VIEW', resource='SETTINGS', scope=scope
            ).first()
            if permission is None:
                self.stdout.write(self.style.WARNING(
                    f'  {role.code}: нет разрешения VIEW_SETTINGS_{scope} — '
                    f'сначала выполните init_permissions'
                ))
                continue
            planned.append((role, permission))

        if not planned:
            self.stdout.write(self.style.SUCCESS(
                'Ролей для выдачи нет: у всех подходящих право уже есть.'
            ))
            return

        self.stdout.write(self.style.MIGRATE_HEADING(
            'Роли, которым будет выдано право «Просмотр настроек»:'
        ))
        for role, permission in planned:
            self.stdout.write(f'  {role.code} — {role.name}  →  {permission.code}')

        if not options['apply']:
            self.stdout.write(
                '\nЭто предварительный просмотр. Чтобы выдать права, '
                'повторите команду с флагом --apply'
            )
            return

        for role, permission in planned:
            role.permissions.add(permission)
        self.stdout.write(self.style.SUCCESS(f'\nВыдано ролям: {len(planned)}'))
