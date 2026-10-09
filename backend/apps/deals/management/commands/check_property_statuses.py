"""
Сверка статусов объектов со сделками.

Статус объекта ведёт процесс сделки: бронь → «Бронь», сохранённый график →
«Сделка в работе», подписание → «Сделка проведена», отмена → «Подбор». Если
запись правили в обход (админка, старые данные, сбой до перехода на
транзакции), объект может остаться «Бронь» без живой сделки: в карточке нет
ни кнопки брони, ни перехода в сделку, и снять бронь нельзя.

Команда показывает расхождения, а с ключом --apply исправляет их:

    python manage.py check_property_statuses            # только показать
    python manage.py check_property_statuses --apply    # исправить

Объект расторгнутой сделки, по которой не вернули платежи, намеренно остаётся
занятым — он только показывается в отчёте.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.deals.models import DealLog
from apps.deals.occupancy import EXPECTED_PROPERTY_STATUS as EXPECTED
from apps.deals.occupancy import OCCUPIED_STATUSES as OCCUPIED
from apps.deals.occupancy import pending_refund_deal
from apps.realty.models import Property


class Command(BaseCommand):
    help = 'Сверяет статусы объектов с их сделками и при --apply исправляет расхождения'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Исправить найденные расхождения')

    def handle(self, *args, **options):
        apply = options['apply']
        fixed = 0
        problems = 0
        properties = Property.objects.select_related('building__project').order_by('building_id', 'unit_number')
        for prop in properties:
            active = list(prop.deals.filter(status__in=EXPECTED.keys()).order_by('id'))
            label = f'{prop.building.project.name} / {prop.building.name} / №{prop.unit_number} (id {prop.id})'

            if len(active) > 1:
                problems += 1
                ids = ', '.join(f'№{d.id} ({d.get_status_display()})' for d in active)
                self.stdout.write(self.style.ERROR(
                    f'{label}: несколько живых сделок — {ids}. Разберите вручную: лишнюю отмените.'
                ))
                continue

            if active:
                deal = active[0]
                expected = EXPECTED[deal.status]
                if prop.status != expected:
                    problems += 1
                    self.stdout.write(
                        f'{label}: статус «{prop.get_status_display()}», а сделка №{deal.id} '
                        f'«{deal.get_status_display()}» — должен быть «{Property.PropertyStatus(expected).label}»'
                    )
                    if apply:
                        self._set(prop, expected, deal, f'Статус объекта приведён к сделке: '
                                                        f'«{Property.PropertyStatus(expected).label}».')
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
                self.stdout.write(
                    f'{label}: статус «{prop.get_status_display()}», а живой сделки нет — '
                    f'должен быть «Подбор»'
                )
                if apply:
                    last = prop.deals.order_by('-id').first()
                    self._set(prop, Property.PropertyStatus.SELECTION, last,
                              'Объект освобождён: у него не было живой сделки.')
                    fixed += 1

        if apply:
            self.stdout.write(self.style.SUCCESS(f'Найдено расхождений: {problems}, исправлено: {fixed}'))
        else:
            self.stdout.write(self.style.WARNING(
                f'Найдено расхождений: {problems}. Ничего не изменено — для исправления запустите с --apply'
            ) if problems else self.style.SUCCESS('Расхождений нет'))

    @staticmethod
    def _set(prop, status, deal, note):
        with transaction.atomic():
            prop.status = status
            prop.save(update_fields=['status', 'updated_at'])
            if deal is not None:
                DealLog.objects.create(deal=deal, user=None, action=note)
