"""
Компания у встреч, созданных без неё.

Встреча, которую система заводит при регистрации клиента, сохранялась без
компании: она выпадала из выборок по компании и нарушала изоляцию данных.
Код исправлен; миграция дозаполняет уже созданные записи компанией клиента.
"""

from django.db import migrations
from django.db.models import OuterRef, Subquery


def fill_company(apps, schema_editor):
    Meeting = apps.get_model('crm', 'Meeting')
    Client = apps.get_model('crm', 'Client')
    client_company = Client.objects.filter(pk=OuterRef('client_id')).values('company_id')[:1]
    Meeting.objects.filter(company__isnull=True, client__company__isnull=False).update(
        company_id=Subquery(client_company)
    )


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0015_phone_index'),
    ]

    operations = [
        migrations.RunPython(fill_company, migrations.RunPython.noop),
    ]
