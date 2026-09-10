"""
Автозакрытие давно просроченных встреч.

Встреча в статусе «Новая» с прошедшей плановой датой не обрабатывалась ничем:
она висела в списках и в отчёте по просрочке неограниченно долго. Команда
закрывает такие встречи как несостоявшиеся, оставляя след в журнале.

Запускается планировщиком (см. docker-compose.yml):

    python manage.py close_stale_meetings --days 7
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta

from apps.crm.models import Meeting, MeetingLog


class Command(BaseCommand):
    help = "Закрывает встречи, просроченные более чем на N дней"

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=7,
            help='Через сколько дней после плановой даты закрывать встречу (по умолчанию 7)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Только показать список, ничего не менять',
        )

    def handle(self, *args, **options):
        threshold = timezone.now() - timedelta(days=options['days'])
        stale = Meeting.objects.filter(
            status=Meeting.MeetingStatus.NEW,
            planned_date__lt=threshold,
        ).select_related('client')

        if options['dry_run']:
            for meeting in stale:
                self.stdout.write(
                    f"Встреча №{meeting.id} с {meeting.client} "
                    f"на {meeting.planned_date:%d.%m.%Y %H:%M} — просрочена"
                )
            self.stdout.write(f"Всего к закрытию: {stale.count()}")
            return

        closed = 0
        for meeting in stale:
            meeting.status = Meeting.MeetingStatus.CANCELLED
            if not meeting.result_comment:
                meeting.result_comment = (
                    f"Встреча не состоялась: закрыта автоматически через "
                    f"{options['days']} дн. после плановой даты."
                )
            meeting.save(update_fields=['status', 'result_comment', 'updated_at'])
            MeetingLog.objects.create(
                meeting=meeting,
                user=None,
                action=meeting.result_comment,
            )
            closed += 1

        self.stdout.write(self.style.SUCCESS(f"Закрыто просроченных встреч: {closed}"))
