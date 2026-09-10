"""
Поиск объектов с одинаковым номером в пределах одного дома.

Прежнее ограничение уникальности включало этаж и подъезд, поэтому в доме
могли появиться две квартиры с номером «12». Команда показывает такие пары,
чтобы их разобрали до миграции 0013, которая делает номер уникальным.

    python manage.py find_duplicate_units
    python manage.py find_duplicate_units --building 4
"""

from django.core.management.base import BaseCommand
from django.db.models import Count

from apps.realty.models import Property


class Command(BaseCommand):
    help = "Показывает объекты с повторяющимся номером внутри дома"

    def add_arguments(self, parser):
        parser.add_argument('--building', type=int, help='Ограничить одним домом')

    def handle(self, *args, **options):
        queryset = Property.objects.all()
        if options['building']:
            queryset = queryset.filter(building_id=options['building'])

        duplicates = (
            queryset.values('building_id', 'unit_number')
            .annotate(n=Count('id'))
            .filter(n__gt=1)
            .order_by('building_id', 'unit_number')
        )

        if not duplicates:
            self.stdout.write(self.style.SUCCESS('Повторов не найдено.'))
            return

        for row in duplicates:
            items = Property.objects.filter(
                building_id=row['building_id'], unit_number=row['unit_number']
            ).select_related('building__project').order_by('id')
            first = items[0]
            self.stdout.write(
                self.style.WARNING(
                    f"\n{first.building.project.name} / {first.building.name} — "
                    f"номер «{row['unit_number']}»: {row['n']} объекта"
                )
            )
            for item in items:
                deals = item.deals.count()
                self.stdout.write(
                    f"  id={item.id}  этаж {item.floor}  подъезд {item.entrance or '—'}  "
                    f"{item.area} м²  {item.price}  статус {item.get_status_display()}  "
                    f"сделок: {deals}"
                )

        self.stdout.write(
            f"\nВсего повторов: {duplicates.count()}. "
            f"Переименуйте или удалите лишние записи, затем примените миграции."
        )
