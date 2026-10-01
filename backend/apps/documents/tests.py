"""
Формирование договора по шаблону.

Метка {{client.phone_number}} описана в справке по меткам и в инструкциях,
но телефон клиента давно хранится отдельной таблицей — метка подставляла
пустоту. Тест закрепляет, что в договор попадает основной номер клиента.
"""

import io
import shutil
import tempfile
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from docx import Document
from rest_framework.test import APIClient

from apps.crm.models import Client, ClientPhoneNumber
from apps.deals.models import Deal
from apps.realty.models import Building, Project, Property
from permissions.models import Company, UserProfile

from .models import Template

User = get_user_model()
MEDIA_ROOT = tempfile.mkdtemp(prefix='crm-test-media-')


def docx_bytes(text):
    doc = Document()
    doc.add_paragraph(text)
    stream = io.BytesIO()
    doc.save(stream)
    return stream.getvalue()


def docx_text(content):
    return '\n'.join(p.text for p in Document(io.BytesIO(content)).paragraphs)


@override_settings(
    MEDIA_ROOT=MEDIA_ROOT,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class GenerateDocumentPhoneTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.company = Company.objects.create(name='Компания', code='DOCS')
        self.user = User.objects.create_superuser('admin', 'admin@example.com', 'pass-for-tests')
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.company = self.company
        profile.is_system_admin = True
        profile.save()
        self.api = APIClient()
        self.api.force_authenticate(self.user)

        project = Project.objects.create(name='ЖК Тест', address='Ташкент', company=self.company)
        building = Building.objects.create(project=project, name='1', floors_count=9)
        prop = Property.objects.create(
            building=building, property_type='APARTMENT', unit_number='12', floor=3,
            area=Decimal('50.00'), price=Decimal('500000000'),
        )
        self.client_obj = Client.objects.create(full_name='Иванов Иван', company=self.company)
        self.deal = Deal.objects.create(
            company=self.company, client=self.client_obj, property=prop,
            booking_end_date=timezone.now() + timedelta(days=7),
            initial_price=Decimal('500000000'), initial_price_per_sqm=Decimal('10000000'),
            contract_number='Д-1', contract_date=timezone.now().date(), created_by=self.user,
        )
        self.template = Template.objects.create(
            name='Договор', company=self.company,
            file=SimpleUploadedFile('contract.docx', docx_bytes('Телефон: {{client.phone_number}}')),
        )
        self.url = f'/api/deals/{self.deal.id}/generate-document/{self.template.id}/'

    def generate(self):
        response = self.api.get(self.url)
        self.assertEqual(response.status_code, 200, getattr(response, 'data', None))
        return docx_text(response.content)

    def test_primary_phone_is_substituted(self):
        ClientPhoneNumber.objects.create(client=self.client_obj, phone_number='90 111 22 33')
        ClientPhoneNumber.objects.create(client=self.client_obj, phone_number='+998 93 444 55 66', is_primary=True)
        self.assertIn('Телефон: +998934445566', self.generate())

    def test_first_phone_when_none_is_primary(self):
        ClientPhoneNumber.objects.create(client=self.client_obj, phone_number='90 111 22 33')
        ClientPhoneNumber.objects.create(client=self.client_obj, phone_number='93 444 55 66')
        self.assertIn('Телефон: +998901112233', self.generate())

    def test_client_without_phone_gets_empty_value(self):
        self.assertIn('Телефон: ', self.generate())
