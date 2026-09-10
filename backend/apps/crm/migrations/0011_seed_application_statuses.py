"""
Наполняет справочник статусов заявок теми статусами, которые уже используются.

Справочник ApplicationStatus существовал, но заявки жили в зашитом списке
choices и со справочником никак не были связаны: добавленный статус никуда
не применялся. Чтобы связать их, справочник сначала должен содержать
действующие статусы.
"""

from django.db import migrations

# Коды и подписи повторяют Application.ApplicationStatusChoices
BASE_STATUSES = [
    ('NEW', 'Новая', '#2196f3', 10, False),
    ('IN_PROGRESS', 'В работе', '#ff9800', 20, False),
    ('JUNK', 'Нецелевая', '#9e9e9e', 30, True),
    ('REJECTED', 'Отказ', '#f44336', 40, True),
    ('CLOSED_WON', 'Успешно закрыта', '#4caf50', 50, True),
    ('CLOSED_LOST', 'Неуспешно закрыта', '#795548', 60, True),
]


def seed_statuses(apps, schema_editor):
    ApplicationStatus = apps.get_model('crm', 'ApplicationStatus')
    for code, name, color, order, is_final in BASE_STATUSES:
        ApplicationStatus.objects.get_or_create(
            code=code,
            defaults={
                'name': name,
                'color': color,
                'order': order,
                'is_active': True,
                'is_final': is_final,
            },
        )


def remove_statuses(apps, schema_editor):
    """Откат: убираем только записи, добавленные этой миграцией."""
    ApplicationStatus = apps.get_model('crm', 'ApplicationStatus')
    ApplicationStatus.objects.filter(code__in=[code for code, *_ in BASE_STATUSES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0010_application_company_client_company_meeting_company'),
    ]

    operations = [
        migrations.RunPython(seed_statuses, remove_statuses),
    ]
