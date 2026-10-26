"""
Полное удаление клиентов (например, тестовых) и всего, что с ними связано.

Удаляется:
  - сделки клиентов — вместе с журналами сделок, применёнными скидками
    и сканами (подписанный договор, документ о расторжении);
  - платежи — по клиенту и по его сделкам, вместе с журналами платежей;
  - встречи — вместе с журналами встреч, включая созданные автоматически;
  - заявки — вместе с журналами заявок, включая мягко удалённые;
  - телефоны, файлы (и сами файлы на диске) и журнал клиента;
  - карточки клиентов.

Не удаляется: проекты, дома, объекты, планировки, скидки, шаблоны, планы продаж.
Объекты, которые держали удалённые сделки, возвращаются в «Подбор» (если их не
держит другая сделка). Дашборд, отчёты и сводные таблицы считаются из базы на
лету, поэтому сразу после удаления показывают цифры уже без этих клиентов.

    python manage.py purge_clients 23 18            # пробный запуск: что будет удалено
    python manage.py purge_clients 23 18 --apply    # удалить по-настоящему

Пробный запуск выполняет то же самое удаление внутри транзакции и откатывает её,
поэтому числа в нём совпадают с настоящим запуском. Файлы с диска удаляются
только при --apply и только после успешного сохранения изменений в базе.
"""

from collections import Counter

from django.apps import apps as django_apps
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from apps.crm.models import Application, Client, ClientFile, Meeting
from apps.deals.models import Deal
from apps.deals.occupancy import EXPECTED_PROPERTY_STATUS, OCCUPIED_STATUSES, pending_refund_deal
from apps.finances.models import Payment
from apps.realty.models import Property
from apps.tasks.models import Task


class Command(BaseCommand):
    help = ('Удаляет клиентов и все их данные: сделки, платежи, заявки, встречи, журналы, файлы. '
            'Без --apply только показывает, что будет удалено')

    def add_arguments(self, parser):
        parser.add_argument('client_ids', nargs='+', type=int, help='ID клиентов, например: 23 18')
        parser.add_argument('--apply', action='store_true',
                            help='Удалить по-настоящему (без ключа — пробный запуск)')

    def handle(self, *args, client_ids, apply, **options):
        out = self.stdout

        # Шаг 1. Находим клиентов. Если хотя бы одного ID нет — останавливаемся:
        # опечатка в номере не должна молча удалить «почти то, что нужно».
        clients = list(Client.objects.filter(pk__in=client_ids).select_related('company').order_by('id'))
        missing = sorted(set(client_ids) - {client.pk for client in clients})
        if missing:
            raise CommandError(f'Клиенты не найдены: {missing}. Ничего не удалено.')

        out.write(self.style.WARNING('УДАЛЕНИЕ' if apply else 'ПРОБНЫЙ ЗАПУСК — ничего не изменится'))
        out.write('Клиенты:')
        for client in clients:
            company = client.company.name if client.company else 'без компании'
            out.write(f'  №{client.pk} «{client.full_name}» — {company}, создан {client.created_at:%d.%m.%Y}')

        # Шаг 2. Собираем всё, что ссылается на клиентов. Платежи берём двумя путями —
        # по клиенту и по его сделкам, — чтобы не остался ни один «висящий» платёж.
        # Заявки и встречи берутся вместе с мягко удалёнными: менеджер по умолчанию их не скрывает.
        deals = Deal.objects.filter(client__in=clients)
        payments = Payment.objects.filter(Q(client__in=clients) | Q(deal__in=deals))
        meetings = Meeting.objects.filter(client__in=clients)
        applications = Application.objects.filter(client__in=clients)
        client_rows = Client.objects.filter(pk__in=[client.pk for client in clients])

        # Шаг 3. Запоминаем объекты, которые держат эти сделки: после удаления сделок
        # их статус надо пересчитать, иначе объект остался бы «Бронь» или «Продан» без сделки.
        property_ids = set(deals.values_list('property_id', flat=True))

        # Шаг 4. Запоминаем файлы на диске — сканы сделок и файлы клиентов. Удалим их только
        # после успешного сохранения в базе: откат транзакции файлы бы уже не вернул.
        files = []
        for deal in deals:
            for scan in (deal.signed_document_scan, deal.termination_document_scan):
                if scan:
                    files.append((scan.storage, scan.name))
        for client_file in ClientFile.objects.filter(client__in=clients):
            if client_file.file:
                files.append((client_file.file.storage, client_file.file.name))

        # Шаг 5. Задачи не привязаны к клиентам в базе, поэтому команда их не удаляет.
        # Показываем задачи, где имя клиента встречается в тексте, — их стоит проверить вручную.
        name_filter = Q()
        for client in clients:
            if len(client.full_name.strip()) >= 5:
                name = client.full_name.strip()
                name_filter |= Q(title__icontains=name) | Q(description__icontains=name)
        mentioned_tasks = list(Task.objects.filter(name_filter).values_list('id', 'title')) if name_filter else []

        released = []
        counts = Counter()
        with transaction.atomic():
            # Шаг 6. Удаляем в таком порядке, потому что платежи, сделки и встречи защищают
            # клиента от удаления (PROTECT). Журналы платежей, сделок, встреч и заявок, скидки
            # сделок, телефоны, файлы и журнал клиента Django удаляет каскадом вместе
            # со «своими» записями — их число тоже попадает в итог.
            for queryset in (payments, deals, meetings, applications, client_rows):
                _, per_model = queryset.delete()
                counts.update(per_model)

            # Шаг 7. Пересчитываем статусы объектов удалённых сделок — по тем же правилам,
            # что и команда check_property_statuses:
            #   - объект держит другая живая сделка → статус по этой сделке;
            #   - объект держит другая расторгнутая сделка с невозвращёнными платежами → не трогаем;
            #   - иначе занятый объект («Бронь», «Сделка в работе», «Продан») → «Подбор»;
            #   - «Подбор» и «Резерв» не трогаем: резерв ставят вручную, сделки он не касается.
            for prop in Property.objects.filter(pk__in=property_ids).select_related('building'):
                live = prop.deals.filter(status__in=EXPECTED_PROPERTY_STATUS.keys()).order_by('-id').first()
                if live:
                    target = EXPECTED_PROPERTY_STATUS[live.status]
                elif pending_refund_deal(prop):
                    continue
                elif prop.status in OCCUPIED_STATUSES:
                    target = Property.PropertyStatus.SELECTION
                else:
                    continue
                if prop.status != target:
                    released.append((prop, prop.get_status_display(), Property.PropertyStatus(target).label))
                    prop.status = target
                    prop.save(update_fields=['status', 'updated_at'])

            if apply:
                # Шаг 8а. Настоящий запуск: файлы удаляются с диска после коммита транзакции.
                transaction.on_commit(lambda: self._delete_files(files))
            else:
                # Шаг 8б. Пробный запуск: откатываем всё, что сделали выше.
                transaction.set_rollback(True)

        # Шаг 9. Итог: что удалено (или было бы удалено) по таблицам и какие объекты освобождены.
        out.write('Записи:' if apply else 'Будет удалено записей:')
        for label, number in sorted(counts.items()):
            if number:
                out.write(f'  {self._model_name(label)}: {number}')
        out.write(f'  Файлы на диске: {len(files)}')

        if released:
            out.write('Объекты возвращены в продажу:' if apply else 'Объекты будут возвращены в продажу:')
            for prop, before, after in released:
                out.write(f'  №{prop.unit_number} (id {prop.id}, дом «{prop.building.name}»): «{before}» → «{after}»')

        if mentioned_tasks:
            out.write(self.style.WARNING('Задачи с именем клиента в тексте — не удаляются, проверьте вручную:'))
            for task_id, title in mentioned_tasks:
                out.write(f'  задача №{task_id}: {title}')

        if apply:
            out.write(self.style.SUCCESS('Готово. Дашборд и отчёты уже считают без этих клиентов.'))
        else:
            out.write(self.style.WARNING('Ничего не изменено. Чтобы удалить, повторите команду с --apply'))

    # Служебные таблицы связей «многие ко многим»: у Django для них английские названия
    LINK_NAMES = {
        'deals.Deal_applied_discounts': 'Связи сделок со скидками',
        'crm.Application_interested_projects': 'Связи заявок с проектами',
        'crm.Client_relatives': 'Связи «родственники»',
    }

    @classmethod
    def _model_name(cls, label):
        """«crm.ClientLog» → «Логи клиентов»."""
        if label in cls.LINK_NAMES:
            return cls.LINK_NAMES[label]
        try:
            return str(django_apps.get_model(label)._meta.verbose_name_plural)
        except LookupError:
            return label

    def _delete_files(self, files):
        """Удаляет файлы с диска; уже отсутствующий файл — не ошибка."""
        for storage, name in files:
            try:
                storage.delete(name)
            except OSError as error:
                self.stderr.write(f'Не удалось удалить файл {name}: {error}')
