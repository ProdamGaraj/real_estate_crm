"""
Пересчёт статуса «Просрочен» по всем платежам системы.

Запускать по расписанию (cron, планировщик Docker-хоста) раз в сутки после полуночи:

    python manage.py refresh_overdue_payments

Без этой команды статусы обновляются только когда кто-то открывает раздел
«Финансы» или дашборд — то есть цифры зависят от активности пользователей.
"""

from django.core.management.base import BaseCommand

from apps.finances.services import refresh_overdue_payments


class Command(BaseCommand):
    help = "Переводит неоплаченные платежи с истёкшим сроком в статус «Просрочен»"

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Только показать количество платежей, ничего не менять',
        )

    def handle(self, *args, **options):
        if options['dry_run']:
            from django.utils import timezone
            from apps.finances.models import Payment

            count = Payment.objects.filter(
                due_date__lt=timezone.now().date(),
                status=Payment.PaymentStatus.PENDING,
            ).count()
            self.stdout.write(f"Будет переведено в «Просрочен»: {count}")
            return

        updated = refresh_overdue_payments()
        self.stdout.write(self.style.SUCCESS(f"Переведено в «Просрочен»: {updated}"))
