"""
Изоляция компаний при регистрации клиента.

При создании клиента система заводит завершённую встречу. Раньше она
сохранялась без компании и выпадала из выборок по компании.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from permissions.models import Company, UserProfile

from .models import Client, Meeting

User = get_user_model()


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class AutoMeetingCompanyTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name='Компания', code='CRM')
        self.user = User.objects.create_superuser('manager', 'manager@example.com', 'pass-for-tests')
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.company = self.company
        profile.is_system_admin = True
        profile.save()
        # Профиль, созданный сигналом, закэширован на объекте пользователя
        # ещё без компании — берём пользователя из БД заново
        self.user = User.objects.get(pk=self.user.pk)
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def test_auto_meeting_belongs_to_client_company(self):
        response = self.api.post('/api/clients/', {'full_name': 'Петров Пётр'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)

        client = Client.objects.get(pk=response.data['id'])
        self.assertEqual(client.company, self.company)

        meeting = Meeting.objects.get(client=client, is_auto_created=True)
        self.assertEqual(meeting.company, self.company)
