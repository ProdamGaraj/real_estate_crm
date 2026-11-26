"""
Почему пользователь не видит шаблон договора.

Печать договора ограничена компанией: шаблон своей компании и общий
(без компании) доступны, шаблон чужой компании — нет. Администратор видит
в настройках все шаблоны сразу, поэтому по экрану не понять, что шаблон
заведён в служебной компании и менеджерам недоступен.

    python manage.py check_templates ivanov
    python manage.py check_templates ivanov --deal 412
    python manage.py check_templates --list
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from apps.deals.models import Booking, Deal
from apps.documents.models import Template
from apps.documents.views import printable_templates, templates_for_property
from permissions.backends import can_user_perform_action
from permissions.models import UserProfile


class Command(BaseCommand):
    help = "Показывает, какие шаблоны договоров доступны пользователю и почему"

    def add_arguments(self, parser):
        parser.add_argument('username', nargs='?', help='Имя пользователя (логин)')
        parser.add_argument('--deal', type=int, help='Проверить список шаблонов этой сделки')
        parser.add_argument('--booking', type=int, help='Проверить список шаблонов этой брони')
        parser.add_argument('--list', action='store_true',
                            help='Только перечислить шаблоны и их компании')

    def handle(self, *args, **options):
        if options['list'] or not options['username']:
            self._print_templates()
            if not options['username']:
                return

        user = get_user_model().objects.filter(username=options['username']).first()
        if user is None:
            raise CommandError(f"Пользователь «{options['username']}» не найден")

        profile = UserProfile.objects.filter(user=user).first()
        company = profile.company if profile else None
        self.stdout.write(
            f"\nПользователь: {user.username} "
            f"(компания: {company.name if company else '— не указана'}; "
            f"администратор: {'да' if user.is_superuser or (profile and profile.is_system_admin) else 'нет'})"
        )
        if profile is None:
            self.stdout.write(self.style.ERROR(
                '  У пользователя нет профиля — доступа не будет ни к чему.'))
            return
        if not profile.is_active or profile.is_deleted:
            self.stdout.write(self.style.ERROR(
                '  Профиль отключён или удалён — доступа не будет ни к чему.'))
            return

        available = set(printable_templates(user).values_list('pk', flat=True))
        self.stdout.write('\nДоступность шаблонов для печати:')
        for template in Template.objects.select_related('company').order_by('name'):
            owner = template.company.name if template.company_id else 'общесистемный'
            if template.pk in available:
                self.stdout.write(self.style.SUCCESS(
                    f'  + {template.name} [{template.get_kind_display()}] — {owner}'))
            else:
                self.stdout.write(self.style.ERROR(
                    f'  - {template.name} [{template.get_kind_display()}] — {owner}: '
                    f'шаблон другой компании, печатать нельзя'))

        if options['deal']:
            self._check_deal(user, options['deal'])
        if options['booking']:
            self._check_booking(user, options['booking'])

        if not options['deal'] and not options['booking']:
            self.stdout.write(
                '\nПодсказка: добавьте --deal <id>, чтобы увидеть список шаблонов '
                'в конкретной сделке — там шаблоны ещё фильтруются по проекту, '
                'дому и типу недвижимости.'
            )

    def _print_templates(self):
        self.stdout.write('Шаблоны в системе:')
        for template in Template.objects.select_related('company').order_by('name'):
            owner = template.company.name if template.company_id else 'общесистемный (виден всем)'
            self.stdout.write(f'  {template.pk}: {template.name} '
                              f'[{template.get_kind_display()}] — {owner}')

    def _check_deal(self, user, deal_id):
        deal = Deal.objects.select_related('property__building__project').filter(pk=deal_id).first()
        if deal is None:
            self.stdout.write(self.style.ERROR(f'\nСделка {deal_id} не найдена.'))
            return

        self.stdout.write(f'\nСделка {deal_id} ({deal.contract_number or "без номера"}):')
        if not can_user_perform_action(user, 'VIEW', 'DEAL', obj=deal):
            self.stdout.write(self.style.ERROR(
                '  Нет доступа к самой сделке — договор не напечатать. '
                'Проверьте права на сделки: python manage.py show_access '
                f'{user.username} --all-resources'))
            return

        rows = templates_for_property(user, deal.property, Template.Kind.DEAL)
        self._print_property_result(rows, deal.property, Template.Kind.DEAL)

    def _check_booking(self, user, booking_id):
        booking = Booking.objects.select_related('property__building__project').filter(
            pk=booking_id).first()
        if booking is None:
            self.stdout.write(self.style.ERROR(f'\nБронь {booking_id} не найдена.'))
            return

        self.stdout.write(f'\nБронь {booking_id} ({booking.get_status_display()}):')
        if not can_user_perform_action(user, 'VIEW', 'BOOKING', obj=booking):
            self.stdout.write(self.style.ERROR('  Нет доступа к самой брони.'))
            return
        if booking.status in Booking.DEAD_STATUSES:
            self.stdout.write(self.style.WARNING(
                '  Бронь снята — документы по ней не формируются.'))
            return

        rows = templates_for_property(user, booking.property, Template.Kind.BOOKING)
        self._print_property_result(rows, booking.property, Template.Kind.BOOKING)

    def _print_property_result(self, rows, prop, kind):
        names = list(rows.values_list('name', flat=True))
        if names:
            for name in names:
                self.stdout.write(self.style.SUCCESS(f'  + {name}'))
            return

        self.stdout.write(self.style.ERROR('  Список шаблонов пуст. Причины по шаблонам:'))
        building = prop.building
        for template in Template.objects.select_related('company').prefetch_related(
                'applies_to_projects', 'applies_to_buildings').order_by('name'):
            reasons = []
            if template.kind != kind:
                reasons.append(f'это {template.get_kind_display().lower()}')
            projects = list(template.applies_to_projects.all())
            if projects and building.project not in projects:
                reasons.append('ограничен другими проектами')
            buildings = list(template.applies_to_buildings.all())
            if buildings and building not in buildings:
                reasons.append('ограничен другими домами')
            types = template.applies_to_property_types or []
            if types and prop.property_type not in types:
                reasons.append(f'ограничен типами {", ".join(types)}')
            if not reasons:
                reasons.append('шаблон другой компании')
            self.stdout.write(f'    - {template.name}: {"; ".join(reasons)}')
