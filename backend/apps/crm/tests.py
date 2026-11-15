"""
Регистрация клиента: компания карточки и отсутствие автовстречи.

Раньше при создании клиента система заводила завершённую встречу
«Системой» с плановой датой, равной моменту создания. Такие записи
копились сотнями, искажали счётчики и отчёт по встречам, поэтому
автосоздание убрано.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from permissions.models import Company, UserProfile

from .models import Client, Meeting

User = get_user_model()


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class ClientRegistrationTests(TestCase):
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

    def test_client_created_in_user_company(self):
        response = self.api.post('/api/clients/', {'full_name': 'Петров Пётр'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)

        client = Client.objects.get(pk=response.data['id'])
        self.assertEqual(client.company, self.company)

    def test_registration_does_not_create_meeting(self):
        """Регистрация карточки — не встреча: автовстреча больше не заводится."""
        response = self.api.post('/api/clients/', {'full_name': 'Сидоров Сидор'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)

        client = Client.objects.get(pk=response.data['id'])
        self.assertFalse(Meeting.objects.filter(client=client).exists())
