"""
Проверка разделения данных между компаниями.

После добавления компании в справочники все существующие записи остались
общесистемными (company = NULL): определить владельца по данным нельзя.
Общесистемная запись видна всем компаниям, но редактируется только
системным администратором.

Команда показывает, что осталось неразделённым, и умеет закрепить справочники
за компанией:

    python manage.py check_company_isolation
    python manage.py check_company_isolation --assign-to 1
    python manage.py check_company_isolation --assign-to 1 --include-business
"""

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError

from permissions.models import Company

# Справочники: раньше были общими для всей системы
REFERENCE_MODELS = [
    ('realty', 'BuildingType'),
    ('crm', 'PreciseSource'),
    ('crm', 'RejectionReason'),
    ('crm', 'ApplicationStatus'),
    ('deals', 'PurchasePurpose'),
    ('deals', 'PaymentType'),
    ('finances', 'PaymentType'),
]

# Бизнес-данные: у них компания заполняется при создании, но у старых
# записей может быть пусто
BUSINESS_MODELS = [
    ('crm', 'Client'),
    ('crm', 'Application'),
    ('crm', 'Meeting'),
    ('deals', 'Deal'),
    ('finances', 'Payment'),
    ('realty', 'Project'),
    ('realty', 'Discount'),
    ('documents', 'Template'),
]


class Command(BaseCommand):
    help = "Показывает записи без компании и при необходимости закрепляет их за одной"

    def add_arguments(self, parser):
        parser.add_argument(
            '--assign-to',
            type=int,
            help='ID компании, за которой закрепить справочники без владельца',
        )
        parser.add_argument(
            '--include-business',
            action='store_true',
            help='Вместе со справочниками закрепить и бизнес-данные без компании',
        )

    def handle(self, *args, **options):
        companies = list(Company.objects.all())
        self.stdout.write(f"Компаний в системе: {len(companies)}")
        for company in companies:
            self.stdout.write(f"  #{company.id} {company.name} ({company.code})")

        target = None
        if options['assign_to']:
            target = Company.objects.filter(pk=options['assign_to']).first()
            if target is None:
                raise CommandError(f"Компания #{options['assign_to']} не найдена")

        groups = [('Справочники', REFERENCE_MODELS)]
        if options['include_business'] or not options['assign_to']:
            groups.append(('Бизнес-данные', BUSINESS_MODELS))

        total_orphans = 0
        for title, models in groups:
            self.stdout.write(self.style.MIGRATE_HEADING(f"\n{title}"))
            assignable = title == 'Справочники' or options['include_business']

            for app_label, model_name in models:
                model = apps.get_model(app_label, model_name)
                orphans = model.objects.filter(company__isnull=True)
                count = orphans.count()
                total_orphans += count

                if count == 0:
                    self.stdout.write(f"  {app_label}.{model_name}: разделено")
                    continue

                if target and assignable:
                    orphans.update(company=target)
                    self.stdout.write(self.style.SUCCESS(
                        f"  {app_label}.{model_name}: {count} записей закреплено за «{target.name}»"
                    ))
                else:
                    self.stdout.write(self.style.WARNING(
                        f"  {app_label}.{model_name}: {count} записей без компании"
                    ))

        if total_orphans and not target:
            self.stdout.write("")
            if len(companies) == 1:
                only = companies[0]
                self.stdout.write(
                    f"Компания в системе одна — закрепить всё за ней:\n"
                    f"  python manage.py check_company_isolation --assign-to {only.id} --include-business"
                )
            else:
                self.stdout.write(
                    "Компаний несколько — владельца записей автоматически не определить.\n"
                    "Справочники без компании остаются общесистемными: они видны всем,\n"
                    "но менять их может только системный администратор.\n"
                    "Чтобы закрепить их за конкретной компанией, укажите --assign-to <ID>."
                )
        elif not total_orphans:
            self.stdout.write(self.style.SUCCESS("\nВсе записи закреплены за компаниями."))
