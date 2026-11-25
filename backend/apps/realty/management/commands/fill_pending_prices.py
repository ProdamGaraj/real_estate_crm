# -*- coding: utf-8 -*-
"""
Разовая заливка `pending_price` из файла прайса.

Зачем. Поле `pending_price` появилось пустым, а новые цены проданных
объектов и объектов в сделке в базе **не хранятся вообще**: 24.11.2026
обновляли только свободные и забронированные, проданные намеренно не
трогали. Без этой заливки первый же отказ по договору вернёт объект
в продажу по цене до повышения — то есть именно то, против чего и
давалось обещание заказчику.

Запуск (сначала всегда без --apply):

    python manage.py fill_pending_prices --building 26 --source Input/out/master.json
    python manage.py fill_pending_prices --building 26 --source Input/out/master.json --apply

Формат файла — список записей с полями ``num`` (номер объекта) и ``price``
(цена в валюте прайса проекта): так выгружен `Input/out/master.json`.

Команда ничего не меняет у свободных объектов, чья цена уже совпадает
с файлом, и не трогает `price` ни у кого: только `pending_price`. Для
свободных объектов перенос в `price` делает тот же код, что и при
загрузке прайса, — с ключом --apply-free.
"""

import json
from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.realty.models import Building, Property
from apps.realty.services import apply_pending_prices_bulk, set_pending_price


class Command(BaseCommand):
    help = 'Разовая заливка ожидающих цен из файла прайса (без --apply только показывает)'

    def add_arguments(self, parser):
        parser.add_argument('--building', type=int, required=True, help='ID дома')
        parser.add_argument('--source', required=True, help='Путь к JSON с полями num и price')
        parser.add_argument('--apply', action='store_true', help='Записать (без ключа — только показать)')
        parser.add_argument('--apply-free', action='store_true',
                            help='Свободным объектам сразу перенести цену в price')

    def handle(self, *args, building, source, apply, apply_free, **options):
        try:
            rows = json.load(open(source, encoding='utf-8'))
        except (OSError, ValueError) as error:
            raise CommandError(f'Не удалось прочитать {source}: {error}')
        if not isinstance(rows, list):
            raise CommandError('Ожидается список записей с полями num и price.')

        try:
            house = Building.objects.select_related('project').get(pk=building)
        except Building.DoesNotExist:
            raise CommandError(f'Дом {building} не найден.')

        objects = {prop.unit_number: prop for prop in Property.objects.filter(building=house)}
        self.stdout.write(
            f'Дом: {house.project.name} / {house.name} (id {house.pk}), '
            f'валюта прайса {house.project.price_currency}, объектов в доме {len(objects)}'
        )
        self.stdout.write('Режим: ЗАПИСЬ' if apply else 'Режим: проверка без записи')

        # Сверка до записи: любое расхождение в номерах показываем целиком,
        # чтобы не записать цены «почти тем» объектам
        planned, unknown, no_price, unchanged = [], [], [], []
        for row in rows:
            number = str(row.get('num') or '').strip()
            raw_price = row.get('price')
            if not number:
                continue
            prop = objects.get(number)
            if prop is None:
                unknown.append(number)
                continue
            if raw_price in (None, '', 0):
                no_price.append(number)
                continue
            try:
                price = Decimal(str(raw_price)).quantize(Decimal('0.01'))
            except (InvalidOperation, ValueError):
                no_price.append(number)
                continue
            if prop.price == price and prop.pending_price is None:
                unchanged.append(number)
                continue
            planned.append((prop, price))

        missing_in_file = sorted(set(objects) - {str(r.get('num') or '').strip() for r in rows})

        self.stdout.write('')
        self.stdout.write('=== сверка ===')
        self.stdout.write(f'  к записи:                  {len(planned)}')
        self.stdout.write(f'  цена совпадает:            {len(unchanged)}')
        self.stdout.write(f'  без цены в файле:          {len(no_price)}')
        self.stdout.write(f'  номеров нет в доме:        {len(unknown)}')
        self.stdout.write(f'  объектов дома нет в файле: {len(missing_in_file)}')
        if unknown:
            self.stdout.write(self.style.WARNING(f'  ! нет в доме: {", ".join(sorted(unknown)[:20])}'))
        if missing_in_file:
            self.stdout.write(self.style.WARNING(
                f'  ! нет в файле: {", ".join(missing_in_file[:20])}'
            ))

        occupied = [(prop, price) for prop, price in planned
                    if prop.status in ('BOOKING', 'IN_DEAL', 'SOLD')]
        self.stdout.write('')
        self.stdout.write('=== что будет записано ===')
        for prop, price in planned[:40]:
            self.stdout.write(
                f'  {prop.unit_number:<12} {prop.status:<10} цена {prop.price:>14} '
                f'→ ожидающая {price}'
            )
        if len(planned) > 40:
            self.stdout.write(f'  … и ещё {len(planned) - 40}')
        self.stdout.write(f'  из них занятых (цена применится при освобождении): {len(occupied)}')

        if not apply:
            self.stdout.write(self.style.WARNING(
                'Ничего не записано. Для записи повторите команду с --apply'
            ))
            return

        written = 0
        with transaction.atomic():
            for prop, price in planned:
                if set_pending_price(prop, price, None,
                                     note='Разовая заливка цен из прайса.'):
                    written += 1
            applied = 0
            if apply_free:
                applied = apply_pending_prices_bulk(
                    Property.objects.filter(building=house), None,
                    reason='разовая заливка цен из прайса',
                )
        self.stdout.write(self.style.SUCCESS(
            f'Записано ожидающих цен: {written}'
            + (f', применено свободным объектам: {applied}' if apply_free else '')
        ))
