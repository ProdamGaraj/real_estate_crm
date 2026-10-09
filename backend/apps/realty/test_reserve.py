"""
Резерв объекта: объект в резерве не бронирует и не продаёт никто. Ставит и
снимает резерв только тот, у кого есть право изменения объектов, — кнопками
в карточке объекта или загрузкой объектов из Excel.
"""

import io
from datetime import timedelta
from decimal import Decimal

import pandas as pd
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.crm.models import Client
from apps.deals.models import Deal
from apps.realty.models import Building, Project, Property
from permissions.models import Company, Department, Permission, Role, UserProfile

User = get_user_model()

SALES = ['DEAL', 'PAYMENT', 'CLIENT']
CATALOG = ['PROPERTY', 'PROJECT', 'BUILDING']


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class PropertyReserveTests(TestCase):
    def setUp(self):
        call_command('init_permissions', stdout=io.StringIO())
        self.company = Company.objects.create(name='Продажи', code='SALES', deal_currency='UZS',
                                              supported_currencies=['UZS'])
        self.dept = Department.objects.create(company=self.company, name='Отдел', code='D1')
        self.project = Project.objects.create(name='ЖК', address='А', company=self.company, price_currency='UZS')
        self.building = Building.objects.create(project=self.project, name='1', floors_count=9)
        self.unit = Property.objects.create(
            building=self.building, property_type='APARTMENT', unit_number='12', floor=3,
            area=Decimal('50.00'), price=Decimal('500000000.00'), status=Property.PropertyStatus.RESERVE,
        )
        # Менеджер: продаёт, каталог только просматривает
        self.manager = self._user('mpp', Permission.objects.filter(
            resource__in=SALES, scope__in=['OWN', 'COMPANY'],
        ) | Permission.objects.filter(resource__in=CATALOG, action='VIEW', scope='COMPANY'))
        # Руководитель: ещё и изменяет объекты — ставит и снимает резерв
        self.head = self._user('head', Permission.objects.filter(
            resource__in=SALES + CATALOG, scope__in=['OWN', 'COMPANY'],
        ))
        self.client_obj = Client.objects.create(full_name='Клиент', company=self.company, created_by=self.manager)

    def _user(self, username, permissions):
        role = Role.objects.create(name=username, code=username.upper())
        role.permissions.set(permissions)
        user = User.objects.create_user(username, password='pass-for-tests')
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.company, profile.department = self.company, self.dept
        profile.save()
        profile.roles.set([role])
        return User.objects.get(pk=user.pk)

    def api(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def book(self, user):
        return self.api(user).post('/api/deals/', {
            'client': self.client_obj.id, 'property': self.unit.id,
            'booking_end_date': (timezone.now() + timedelta(days=5)).isoformat(),
        }, format='json')

    def set_status(self, user, value):
        return self.api(user).patch(
            f'/api/projects/{self.project.id}/buildings/{self.building.id}/properties/{self.unit.id}/',
            {'status': value}, format='json',
        )

    def upload(self, user, rows):
        buffer = io.BytesIO()
        pd.DataFrame(rows).to_excel(buffer, index=False)
        file = SimpleUploadedFile('units.xlsx', buffer.getvalue(),
                                  content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        return self.api(user).post(
            f'/api/projects/{self.project.id}/buildings/{self.building.id}/upload-properties/',
            {'file': file}, format='multipart',
        )

    def test_reserved_unit_is_not_booked_by_anyone(self):
        # Ни менеджер, ни руководитель с правом изменения объектов
        for user in (self.manager, self.head):
            response = self.book(user)
            self.assertEqual(response.status_code, 400, user.username)
            self.assertIn('резерв', response.data['error'])
        self.assertFalse(Deal.objects.exists())
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, Property.PropertyStatus.RESERVE)

    def test_only_user_who_can_edit_units_removes_reserve(self):
        self.assertEqual(self.set_status(self.manager, 'SELECTION').status_code, 403)
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, Property.PropertyStatus.RESERVE)

        self.assertEqual(self.set_status(self.head, 'SELECTION').status_code, 200)
        # После снятия резерва объект продаёт любой менеджер
        response = self.book(self.manager)
        self.assertEqual(response.status_code, 201, response.data)
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, Property.PropertyStatus.BOOKING)

    def test_manager_cannot_put_unit_in_reserve(self):
        self.unit.status = Property.PropertyStatus.SELECTION
        self.unit.save()
        self.assertEqual(self.set_status(self.manager, 'RESERVE').status_code, 403)
        self.assertEqual(self.set_status(self.head, 'RESERVE').status_code, 200)

    def test_upload_without_status_keeps_reserve(self):
        # Прайс без столбца статусов раньше переводил все объекты в «Подбор»
        response = self.upload(self.head, [{
            'Номер объекта': '12', 'Этаж': 3, 'Площадь (кв.м)': 50, 'Стоимость': 520000000,
        }])
        self.assertEqual(response.status_code, 200, response.data)
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, Property.PropertyStatus.RESERVE)
        self.assertEqual(self.unit.price, Decimal('520000000.00'))

    def test_upload_changes_reserve_only_with_edit_right(self):
        uploader = self._user('loader', Permission.objects.filter(
            resource__in=CATALOG, action__in=['VIEW', 'ADD'], scope='COMPANY',
        ))
        response = self.upload(uploader, [{
            'Номер объекта': '12', 'Этаж': 3, 'Площадь (кв.м)': 50, 'Стоимость': 500000000, 'Статус': 'SELECTION',
        }, {
            'Номер объекта': '13', 'Этаж': 3, 'Площадь (кв.м)': 40, 'Стоимость': 400000000, 'Статус': 'RESERVE',
        }])
        self.assertEqual(response.status_code, 200, response.data)
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, Property.PropertyStatus.RESERVE)
        new_unit = Property.objects.get(building=self.building, unit_number='13')
        self.assertEqual(new_unit.status, Property.PropertyStatus.SELECTION)
        self.assertEqual(len(response.data['details']['errors']), 2, response.data['details']['errors'])

        # С правом изменения объектов загрузка резерв снимает
        response = self.upload(self.head, [{
            'Номер объекта': '12', 'Этаж': 3, 'Площадь (кв.м)': 50, 'Стоимость': 500000000, 'Статус': 'SELECTION',
        }])
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, Property.PropertyStatus.SELECTION)
