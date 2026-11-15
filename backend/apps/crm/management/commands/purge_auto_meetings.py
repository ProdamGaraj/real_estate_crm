"""
Убирает встречи, заведённые системой при регистрации клиента.

До 11.2026 создание карточки клиента заводило «встречу» со статусом
«Встреча состоялась», постановщиком «Система» и плановой датой, равной
моменту создания. Автосоздание убрано, но в базе такие записи остались:
они раздувают счётчик встреч и мешают работать со списком.

Удаление мягкое — запись остаётся в базе и видна с ?include_deleted=true.
Встречи, которым менеджер вписал результат, не трогаются: там уже есть
работа с клиентом.

Запуск без ключей только показывает, что будет сделано:

    python manage.py purge_auto_meetings
    python manage.py purge_auto_meetings --apply
"""

from django.core.management.base import BaseCommand

from apps.crm.models import Meeting, MeetingLog


class Command(BaseCommand):
    help = "Мягко удаляет автовстречи, созданные при регистрации клиентов"

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help='Записать изменения (без ключа — только отчёт)')
        parser.add_argument('--company', type=int, default=None,
                            help='Только встречи этой компании')

    def handle(self, *args, **options):
        meetings = Meeting.objects.filter(
            is_auto_created=True,
            is_deleted=False,
            result_comment='',
        ).select_related('client')
        if options['company']:
            meetings = meetings.filter(company_id=options['company'])

        total = meetings.count()
        if not total:
            self.stdout.write(self.style.SUCCESS("Автовстреч к удалению нет."))
            return

        for meeting in meetings[:20]:
            self.stdout.write(
                f"Встреча №{meeting.id} с {meeting.client.full_name} "
                f"от {meeting.planned_date:%d.%m.%Y %H:%M}"
            )
        if total > 20:
            self.stdout.write(f"… и ещё {total - 20}")

        if not options['apply']:
            self.stdout.write(self.style.SUCCESS(
                f"Будет удалено (мягко): {total}. Запустите с --apply."
            ))
            return

        # Список, а не queryset: мягкое удаление меняет поле, по которому
        # queryset отбирает записи
        for meeting in list(meetings):
            meeting.soft_delete()
            MeetingLog.objects.create(
                meeting=meeting,
                user=None,
                action="Автовстреча при регистрации клиента удалена: такие записи больше не создаются.",
            )
        self.stdout.write(self.style.SUCCESS(f"Удалено (мягко): {total}."))
