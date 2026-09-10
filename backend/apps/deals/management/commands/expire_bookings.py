"""
Снятие броней с истёкшим сроком.

Поле `booking_end_date` заполнялось при создании сделки, но не читалось нигде:
просроченная бронь висела бессрочно, а объект оставался занятым, пока кто-то
не снимал бронь руками.

Запускать по расписанию (планировщик в docker-compose, cron):

    python manage.py expire_bookings
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.deals.models import Deal, DealLog
from apps.realty.models import Property


class Command(BaseCommand):
    help = "Отменяет брони с истёкшим сроком и освобождает объекты"

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Только показать, какие брони истекли, ничего не менять',
        )

    def handle(self, *args, **options):
        now = timezone.now()
        expired = Deal.objects.filter(
            status=Deal.DealStatus.BOOKING,
            booking_end_date__lt=now,
        ).select_related('property', 'client')

        if options['dry_run']:
            for deal in expired:
                self.stdout.write(
                    f"Сделка №{deal.id} ({deal.client}) — бронь истекла {deal.booking_end_date:%d.%m.%Y %H:%M}"
                )
            self.stdout.write(f"Всего истёкших броней: {expired.count()}")
            return

        released = 0
        for deal in expired:
            with transaction.atomic():
                # Перечитываем под блокировкой: бронь могли перевести в работу,
                # пока команда шла по списку
                locked = Deal.objects.select_for_update().get(pk=deal.pk)
                if locked.status != Deal.DealStatus.BOOKING or locked.booking_end_date >= now:
                    continue

                locked.status = Deal.DealStatus.CANCELLED
                locked.cancellation_reason = (
                    f"Срок брони истёк {locked.booking_end_date:%d.%m.%Y %H:%M}. "
                    f"Бронь снята автоматически."
                )
                locked.save(update_fields=['status', 'cancellation_reason', 'updated_at'])

                property_obj = locked.property
                if property_obj.status == Property.PropertyStatus.BOOKING:
                    property_obj.status = Property.PropertyStatus.SELECTION
                    property_obj.save(update_fields=['status', 'updated_at'])

                DealLog.objects.create(
                    deal=locked,
                    user=None,
                    action=locked.cancellation_reason,
                )
                released += 1

        self.stdout.write(self.style.SUCCESS(f"Снято броней: {released}"))
