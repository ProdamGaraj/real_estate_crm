"""
Контракт API-ключей партнёров.

Ключ в открытом виде сервер отдаёт ровно один раз — в ответе на создание и
на перегенерацию. В списке приходит только замаскированный `key_masked`.
Тесты закрепляют это: интерфейс однажды ждал в списке поле `key`, не получал
его и падал на всей странице настроек.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Company, PartnerAPIKey, UserProfile

User = get_user_model()

LIST_URL = '/api/permissions/partner-api-keys/'


# Кэш прав и счётчики запросов ходят в Redis: в тестах его нет
@override_settings(
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
)
class PartnerAPIKeyContractTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name='Тестовая компания')
        self.user = User.objects.create_superuser(
            username='root', email='root@example.com', password='pass-for-tests'
        )
        # Профиль заводится сигналом при создании пользователя — дополняем его
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.company = self.company
        profile.is_system_admin = True
        profile.save()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _create_key(self, name='Партнёр'):
        return self.client.post(
            LIST_URL,
            {
                'name': name,
                'description': '',
                'companies': [self.company.id],
                'allowed_scopes': ['VIEW_PROJECTS'],
            },
            format='json',
        )

    def test_create_returns_plaintext_key_once(self):
        response = self._create_key()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIn('key', response.data)
        self.assertTrue(response.data['key'])

    def test_list_returns_masked_key_and_never_plaintext(self):
        self._create_key()

        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, 200)

        rows = response.data if isinstance(response.data, list) else response.data['results']
        self.assertEqual(len(rows), 1)

        row = rows[0]
        # Поле, на которое рассчитывает таблица настроек
        self.assertIn('key_masked', row)
        self.assertTrue(row['key_masked'])
        self.assertTrue(row['key_masked'].endswith('***'))
        # Открытого ключа в списке быть не должно
        self.assertNotIn('key', row)

    def test_regenerate_returns_new_plaintext_key(self):
        created = self._create_key()
        key_id = created.data['id']
        first_key = created.data['key']

        response = self.client.post(f'{LIST_URL}{key_id}/regenerate/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('key', response.data)
        self.assertNotEqual(response.data['key'], first_key)

        # Старый ключ больше не находится, новый — находится
        self.assertIsNone(PartnerAPIKey.find_by_key(first_key))
        self.assertEqual(
            PartnerAPIKey.find_by_key(response.data['key']).id, key_id
        )
