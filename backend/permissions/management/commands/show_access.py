"""
Отчёт о фактическом доступе пользователя.

Отвечает на вопрос «почему он это видит»: показывает флаги учётной записи,
роли и — по каждому ресурсу раздела «Настройки» — какое именно право
открывает вкладку и из какой роли оно пришло.

    python manage.py show_access ivanov
    python manage.py show_access ivanov --all-resources
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from permissions.models import Permission, UserProfile

# Ресурсы вкладок раздела «Настройки» — в том же порядке, что и на экране
SETTINGS_RESOURCES = [
    ('COMPANY', 'Компании'),
    ('DEPARTMENT', 'Отделы'),
    ('ROLE', 'Роли'),
    ('USER', 'Пользователи'),
    ('APPLICATION_STATUS', 'Заявки: статусы'),
    ('BUILDING_TYPE', 'Недвижимость: типы домов'),
    ('PAYMENT_TYPE', 'Финансы: типы платежей'),
    ('BENEFICIARY_ACCOUNT', 'Финансы: счета получателей'),
    ('TEMPLATE', 'Шаблоны документов'),
    ('PARTNER_API_KEY', 'API-ключи партнёров'),
]

ACTIONS = ['VIEW', 'ADD', 'EDIT', 'DELETE']


class Command(BaseCommand):
    help = "Показывает, какие права есть у пользователя и откуда они взялись"

    def add_arguments(self, parser):
        parser.add_argument('username', help='Имя пользователя (логин)')
        parser.add_argument(
            '--all-resources',
            action='store_true',
            help='Показать все ресурсы, а не только раздел «Настройки»',
        )

    def handle(self, *args, **options):
        User = get_user_model()
        user = User.objects.filter(username=options['username']).first()
        if user is None:
            raise CommandError(f"Пользователь «{options['username']}» не найден")

        try:
            profile = user.profile
        except UserProfile.DoesNotExist:
            profile = None

        self._print_account(user, profile)

        if user.is_superuser or (profile and profile.is_system_admin):
            self.stdout.write(self.style.WARNING(
                '\nЭта учётная запись обходит проверку прав: ей доступно всё, '
                'включая раздел «Настройки» целиком.\n'
                'Роли и разрешения при этом не проверяются — если доступ нужно '
                'ограничить, снимите соответствующий флаг.'
            ))
            return

        if profile is None:
            self.stdout.write(self.style.ERROR('\nУ пользователя нет профиля — доступа нет.'))
            return

        self._print_roles(profile)
        self._print_settings_access(profile, options['all_resources'])

    # --- части отчёта ---

    def _print_account(self, user, profile):
        self.stdout.write(self.style.MIGRATE_HEADING('Учётная запись'))
        self.stdout.write(f'  логин:                  {user.username}')
        self.stdout.write(f'  активен:                {"да" if user.is_active else "НЕТ"}')
        self.stdout.write(
            f'  суперпользователь:      {self.style.WARNING("ДА") if user.is_superuser else "нет"}'
        )
        if profile is None:
            return
        self.stdout.write(
            f'  системный админ:        '
            f'{self.style.WARNING("ДА") if profile.is_system_admin else "нет"}'
        )
        self.stdout.write(f'  профиль активен:        {"да" if profile.is_active else "НЕТ"}')
        self.stdout.write(f'  профиль удалён:         {"ДА" if profile.is_deleted else "нет"}')
        self.stdout.write(f'  компания:               {profile.company or "—"}')
        self.stdout.write(f'  отдел:                  {profile.department or "—"}')

    def _print_roles(self, profile):
        roles = profile.roles.all()
        applicable = set(profile._get_applicable_roles().values_list('id', flat=True))

        self.stdout.write(self.style.MIGRATE_HEADING('\nРоли'))
        if not roles:
            self.stdout.write('  ролей нет')
            return

        for role in roles:
            marks = []
            if not role.is_active:
                marks.append('неактивна')
            if role.id not in applicable:
                marks.append('не применяется к компании пользователя')
            suffix = f'  [{", ".join(marks)}]' if marks else ''
            companies = ', '.join(c.name for c in role.companies.all()) or 'все компании'
            self.stdout.write(
                f'  {role.code} — {role.name} '
                f'(область {role.scope}, разрешений: {role.permissions.count()}, '
                f'компании: {companies}){suffix}'
            )

    def _print_settings_access(self, profile, all_resources):
        if all_resources:
            resources = [(code, label) for code, label in Permission.Resource.choices]
        else:
            resources = SETTINGS_RESOURCES

        # Разрешения по применимым ролям — ровно то, что учитывает система
        granted = Permission.objects.filter(
            roles__in=profile._get_applicable_roles(),
            is_active=True,
        ).values_list('action', 'resource', 'scope', 'roles__code').distinct()

        by_resource = {}
        for action, resource, scope, role_code in granted:
            by_resource.setdefault(resource, []).append((action, scope, role_code))

        section_open = profile.has_permission_for_action('VIEW', 'SETTINGS')
        self.stdout.write(self.style.MIGRATE_HEADING('\nРаздел «Настройки»'))
        if section_open:
            self.stdout.write(self.style.SUCCESS('  доступ к разделу: ЕСТЬ (право «Просмотр» на ресурс «Настройки»)'))
        else:
            self.stdout.write('  доступ к разделу: нет — раздел и все вкладки скрыты')

        self.stdout.write(self.style.MIGRATE_HEADING(
            '\nПрава по ресурсам' + ('' if all_resources else ' раздела «Настройки»')
        ))
        for code, label in resources:
            entries = [e for e in by_resource.get(code, []) if e[0] in ACTIONS]
            if not entries:
                self.stdout.write(f'  {label:32} —')
                continue

            actions = sorted({e[0] for e in entries}, key=ACTIONS.index)
            roles = sorted({e[2] for e in entries if e[2]})
            visible = section_open and bool(actions)
            mark = self.style.SUCCESS('вкладка видна') if visible else 'вкладка скрыта'
            self.stdout.write(
                f'  {label:32} {", ".join(actions):24} '
                f'из ролей: {", ".join(roles)}   {mark}'
            )

        if not section_open and any(by_resource.get(code) for code, _ in resources):
            self.stdout.write(
                '\nПрава на справочники есть, но раздел закрыт — так и задумано: '
                'эти права нужны формам (список компаний в заявке, типы платежей '
                'в графике), а не настройкам.'
            )
