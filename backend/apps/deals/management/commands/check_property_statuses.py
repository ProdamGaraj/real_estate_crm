"""
Сверка статусов объектов с бронями и сделками.

Статус объекта ведёт процесс: действующая бронь → «Бронь», сделка →
«Сделка в работе», подписание → «Сделка проведена», снятие брони и отмена
сделки → «Подбор». Если запись правили в обход (админка, старые данные,
сбой до перехода на транзакции), объект может остаться «Бронь» без брони:
в карточке нет ни кнопки брони, ни перехода в сделку, и снять бронь нельзя.

Команда показывает расхождения, а с ключом --apply исправляет их:

    python manage.py check_property_statuses            # только показать
    python manage.py check_property_statuses --apply    # исправить

Объект расторгнутой сделки, по которой не вернули платежи, намеренно
остаётся занятым — он только показывается в отчёте.

Приоритет при расхождении один и тот же везде: живая сделка перекрывает
бронь.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.deals.booking import resettle_property
from apps.deals.models import DealLog
from apps.deals.occupancy import (
    EXPECTED_PROPERTY_STATUS as EXPECTED, LIVE_DEAL_STATUSES, OCCUPIED_STATUSES as OCCUPIED,
    active_booking, booking_queue, pending_refund_deal,
)
from apps.realty.models import Property


class Command(BaseCommand):
    help = 'Сверяет статусы объектов с их бронями и сделками и при --apply исправляет расхождения'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Исправить найденные расхождения')

    def handle(self, *args, **options):
        apply = options['apply']
        fixed = 0
        problems = 0
        properties = Property.objects.select_related('building__project').order_by('building_id',
                                                                                   'unit_number')
        for prop in properties:
            live = list(prop.deals.filter(status__in=LIVE_DEAL_STATUSES).order_by('id'))
            label = f'{prop.building.project.name} / {prop.building.name} / №{prop.unit_number} (id {prop.id})'

            if len(live) > 1:
                problems += 1
                ids = ', '.join(f'№{d.id} ({d.get_status_display()})' for d in live)
                self.stdout.write(self.style.ERROR(
                    f'{label}: несколько живых сделок — {ids}. Разберите вручную: лишнюю отмените.'
                ))
                continue

            booking = active_booking(prop)
            if live and booking is not None:
                # Живая сделка перекрывает бронь, но действующая бронь рядом
                # с ней — всегда ошибка: бронь сделки должна быть CONVERTED
                problems += 1
                self.stdout.write(self.style.ERROR(
                    f'{label}: сделка №{live[0].id} и действующая бронь №{booking.id} '
                    f'одновременно. Разберите вручную.'
                ))
                continue

            if live:
                deal = live[0]
                expected = EXPECTED[deal.status]
                if prop.status != expected:
                    problems += 1
                    self.stdout.write(
                        f'{label}: статус «{prop.get_status_display()}», а сделка №{deal.id} '
                        f'«{deal.get_status_display()}» — должен быть «{Property.PropertyStatus(expected).label}»'
                    )
                    if apply:
                        self._resettle(prop, deal)
                        fixed += 1
                continue

            if booking is not None:
                if prop.status != Property.PropertyStatus.BOOKING:
                    problems += 1
                    self.stdout.write(
                        f'{label}: статус «{prop.get_status_display()}», а бронь №{booking.id} '
                        f'действует — должен быть «Бронь»'
                    )
                    if apply:
                        self._resettle(prop, None)
                        fixed += 1
                continue

            if prop.status in OCCUPIED:
                holder = pending_refund_deal(prop)
                if holder:
                    self.stdout.write(
                        f'{label}: «{prop.get_status_display()}» — ждёт возврата платежей по '
                        f'расторгнутой сделке №{holder.id}, так и должно быть'
                    )
                    continue
                problems += 1
                waiting = booking_queue(prop).count()
                tail = (f' — в очереди {waiting} брон. , будет активирована первая'
                        if waiting else ' — должен быть «Подбор»')
                self.stdout.write(
                    f'{label}: статус «{prop.get_status_display()}», а живой брони и сделки '
                    f'нет{tail}'
                )
                if apply:
                    self._resettle(prop, prop.deals.order_by('-id').first())
                    fixed += 1
                continue

            # Объект свободен. Непримененная цена из прайса — тоже расхождение:
            # свободный объект должен продаваться по новой цене
            if prop.pending_price is not None and not booking_queue(prop).exists():
                problems += 1
                self.stdout.write(
                    f'{label}: объект свободен, но цена из прайса не применена: '
                    f'{prop.price} → {prop.pending_price}'
                )
                if apply:
                    self._resettle(prop, None)
                    fixed += 1

        if apply:
            self.stdout.write(self.style.SUCCESS(f'Найдено расхождений: {problems}, исправлено: {fixed}'))
        else:
            self.stdout.write(self.style.WARNING(
                f'Найдено расхождений: {problems}. Ничего не изменено — для исправления запустите с --apply'
            ) if problems else self.style.SUCCESS('Расхождений нет'))

    @staticmethod
    def _resettle(prop, deal):
        """Пересчитывает занятость одной функцией — той же, что в рабочем коде."""
        with transaction.atomic():
            locked = Property.objects.select_for_update().select_related('building__project').get(
                pk=prop.pk
            )
            following = resettle_property(locked, actor=None,
                                          reason='сверка статусов объектов')
            if deal is not None:
                DealLog.objects.create(
                    deal=deal, user=None,
                    action=('Статус объекта приведён к занятости командой сверки.'
                            + (f' Активирована бронь №{following.id}.' if following else '')),
                )
