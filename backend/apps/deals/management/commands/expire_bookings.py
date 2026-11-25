"""
Снятие броней с истёкшим сроком и продвижение очереди.

Запускать по расписанию (планировщик в docker-compose, cron):

    python manage.py expire_bookings --dry-run   # только показать
    python manage.py expire_bookings             # снять и продвинуть очередь

Это единственный автомат системы, который работает без присмотра, поэтому
он ничего не решает сам: весь порядок на границе двух броней живёт в
`apps.deals.booking.resettle_property` — закрыть предыдущую, снять её
неоплаченный долг, перенести ожидающую цену, активировать следующую,
записать ей даты и зафиксировать цену.

Брони, оформленные в сделку (`CONVERTED`), исключены: срок у них уже не
при чём, объект держит сделка.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.deals.booking import finish_booking, projected_schedule
from apps.deals.models import Booking
from apps.realty.models import Property


class Command(BaseCommand):
    help = "Снимает брони с истёкшим сроком, снимает долги по ним и продвигает очередь"

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Только показать, какие брони истекли и что произойдёт с очередью',
        )

    def handle(self, *args, **options):
        now = timezone.now()
        expired = Booking.objects.filter(
            status=Booking.BookingStatus.ACTIVE,
            end_date__lt=now,
        ).select_related('property__building__project', 'client').order_by('end_date', 'id')

        if options['dry_run']:
            self._preview(expired, now)
            return

        released = 0
        activated = 0
        for booking in expired:
            with transaction.atomic():
                # Объект под блокировкой на весь переход: иначе менеджер
                # оформит сделку по брони, которую команда прямо сейчас снимает
                prop = Property.objects.select_for_update().select_related(
                    'building__project'
                ).get(pk=booking.property_id)
                # Перечитываем бронь под той же блокировкой: её могли
                # продлить или оформить в сделку, пока команда шла по списку
                locked = Booking.objects.select_for_update().get(pk=booking.pk)
                if locked.status != Booking.BookingStatus.ACTIVE:
                    continue
                if not locked.end_date or locked.end_date >= now:
                    continue

                locked.property = prop
                reason = (f"Срок брони истёк {locked.end_date:%d.%m.%Y %H:%M}. "
                          f"Бронь снята автоматически.")
                finish_booking(locked, status=Booking.BookingStatus.EXPIRED,
                               reason=reason, actor=None)
                released += 1
                if Booking.objects.filter(property=prop,
                                          status=Booking.BookingStatus.ACTIVE).exists():
                    activated += 1

        self.stdout.write(self.style.SUCCESS(
            f"Снято броней: {released}, активировано следующих из очереди: {activated}"
        ))

    def _preview(self, expired, now):
        """Показывает, что будет снято и кто встанет на место каждой брони."""
        total = 0
        for booking in expired:
            total += 1
            prop = booking.property
            self.stdout.write(
                f"Бронь №{booking.id} ({booking.client}) по объекту {prop} — "
                f"срок истёк {booking.end_date:%d.%m.%Y %H:%M}"
            )
            unpaid = booking.payments.filter(status__in=('PENDING', 'OVERDUE'))
            for payment in unpaid:
                self.stdout.write(
                    f"    долг по взносу {payment.amount} {payment.currency} "
                    f"({payment.get_status_display()}) будет снят"
                )
            schedule = projected_schedule(prop, now=now)
            following = Booking.objects.filter(
                property=prop, status=Booking.BookingStatus.PENDING_QUEUE
            ).order_by('created_at', 'id').first()
            if following is None:
                price = (f", цена поднимется до {prop.pending_price}"
                         if prop.pending_price is not None else "")
                self.stdout.write(f"    очередь пуста — объект в «Подбор»{price}")
            else:
                dates = schedule.get(following.id) or {}
                end = dates.get('end_date')
                price = (f", цена брони — {prop.pending_price}"
                         if prop.pending_price is not None else f", цена брони — {prop.price}")
                self.stdout.write(
                    f"    активируется бронь №{following.id} ({following.client}) "
                    f"на {following.duration_days} дн."
                    + (f" до {end:%d.%m.%Y %H:%M}" if end else "")
                    + price
                )
        self.stdout.write(f"Всего истёкших броней: {total}")
