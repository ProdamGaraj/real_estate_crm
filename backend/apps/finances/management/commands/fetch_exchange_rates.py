"""
Загрузка курсов валют ЦБ Узбекистана.

Регламентное задание запускает команду раз в час; повторная загрузка того же
дня ничего не дублирует. Для отчётов за прошлые периоды историю можно
догрузить диапазоном:

    python manage.py fetch_exchange_rates
    python manage.py fetch_exchange_rates --date 2026-03-05
    python manage.py fetch_exchange_rates --since 2025-01-01
"""

from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.finances.currency import fetch_cbu_rates, iter_dates


class Command(BaseCommand):
    help = 'Загружает курсы валют ЦБ Узбекистана (текущие, на дату или за период)'

    def add_arguments(self, parser):
        parser.add_argument('--date', help='Дата курса, ГГГГ-ММ-ДД')
        parser.add_argument('--since', help='Загрузить историю с этой даты по сегодня, ГГГГ-ММ-ДД')

    def handle(self, *args, **options):
        try:
            if options['since']:
                start = date.fromisoformat(options['since'])
                total = 0
                for day in iter_dates(start, timezone.localdate()):
                    total += fetch_cbu_rates(day)
                self.stdout.write(f'Загружено курсов: {total} (с {start:%d.%m.%Y})')
                return
            on_date = date.fromisoformat(options['date']) if options['date'] else None
            saved = fetch_cbu_rates(on_date)
        except ValueError as error:
            raise CommandError(f'Неверная дата: {error}')
        except Exception as error:
            raise CommandError(f'ЦБ недоступен: {error}')
        self.stdout.write(f'Загружено курсов: {saved}')
