"""
Исправление валюты у уже заведённых данных компании — без пересчёта сумм.

До мультивалютности сделки создавались в сумах по умолчанию, а цены
каталога не имели валюты. Если прайс был в долларах, то и суммы сделок
и платежей записаны в долларах, хотя помечены как сумы. Команда меняет
только пометку валюты, числа остаются прежними.

Сделки, суммы которых уже получены пересчётом (цена при брони пересчитана
из прайса в другой валюте или сделка пересчитана командой
convert_deals_currency), и сделки с платежами, введёнными в другой валюте,
не трогаются: их пометка валюты верна, и смена пометки испортила бы суммы.

По умолчанию — пробный запуск: показывает, что будет изменено.

    python manage.py relabel_currency --company 5 --deals USD --projects USD
    python manage.py relabel_currency --company 5 --deals USD --projects USD --apply
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import F, Q

from apps.deals.models import Deal
from apps.finances.currency import CURRENCY_CODES
from apps.finances.models import Payment
from apps.realty.models import Project
from permissions.models import Company


class Command(BaseCommand):
    help = 'Меняет пометку валюты у сделок, платежей и прайса компании без пересчёта сумм'

    def add_arguments(self, parser):
        parser.add_argument('--company', type=int, required=True, help='ID компании')
        parser.add_argument('--deals', help='Валюта сделок и их платежей, например USD')
        parser.add_argument('--projects', help='Валюта прайса проектов компании, например USD')
        parser.add_argument('--apply', action='store_true', help='Применить (без ключа — пробный запуск)')

    def handle(self, *args, **options):
        company = Company.objects.filter(pk=options['company']).first()
        if company is None:
            raise CommandError('Компания не найдена.')
        for key in ('deals', 'projects'):
            if options[key] and options[key].upper() not in CURRENCY_CODES:
                raise CommandError(f'Неизвестная валюта: {options[key]}')

        deals = Deal.objects.filter(company=company)
        payments = Payment.objects.filter(deal__company=company)
        projects = Project.objects.filter(company=company)

        self.stdout.write(f'Компания: {company.name}')
        if options['deals']:
            target = options['deals'].upper()
            # Пометка валюты у таких сделок верна: суммы получены пересчётом
            converted = (Q(catalog_rate__isnull=False) & ~Q(catalog_currency='')
                         & ~Q(catalog_currency=F('currency')))
            entered = Q(payments__entered_currency__gt='')
            protected = deals.filter(converted | entered).distinct()
            # Список id фиксируем сразу: после смены валюты сделок условие
            # «валюта не равна целевой» уже не нашло бы их платежи
            changed_ids = list(deals.exclude(currency=target).exclude(pk__in=protected.values('pk'))
                               .values_list('pk', flat=True))
            changed_deals = Deal.objects.filter(pk__in=changed_ids)
            changed_payments = payments.filter(deal_id__in=changed_ids).exclude(currency=target)
            self.stdout.write(f'  сделок к изменению: {changed_deals.count()} из {deals.count()} → {target}')
            self.stdout.write(f'  платежей к изменению: {changed_payments.count()} из {payments.count()} → {target}')
            if protected.exists():
                self.stdout.write(self.style.WARNING(
                    f'  пропущено сделок с пересчитанными суммами: {protected.count()}'))
        if options['projects']:
            target_p = options['projects'].upper()
            changed_projects = projects.exclude(price_currency=target_p)
            self.stdout.write(f'  проектов к изменению: {changed_projects.count()} из {projects.count()} → {target_p}')

        if not options['apply']:
            self.stdout.write(self.style.WARNING('Пробный запуск: ничего не изменено. Добавьте --apply.'))
            return

        with transaction.atomic():
            if options['deals']:
                changed_deals.update(currency=target)
                changed_payments.update(currency=target)
            if options['projects']:
                changed_projects.update(price_currency=target_p)
        self.stdout.write(self.style.SUCCESS('Готово.'))
