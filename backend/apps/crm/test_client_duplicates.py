"""
Проверка клиента на дубликаты.

Один человек заводился дважды: «Кодиров Кобилжон Кахрамон» был в базе
под ID 247 и 252 с одним и тем же телефоном +998901497778. Совпадение
по телефону, ПИНФЛ или паспорту останавливает сохранение и называет
существующую карточку; осознанное создание подтверждается флагом.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from permissions.models import Company

from .models import Client, ClientPhoneNumber

User = get_user_model()


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class ClientDuplicateTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name='Андижан', code='AND')
        self.other_company = Company.objects.create(name='Ташкент', code='TAS')
        self.user = User.objects.create_user('manager', password='pass-for-tests')
        self.user.profile.is_system_admin = True
        self.user.profile.company = self.company
        self.user.profile.save()
        self.api = APIClient()
        self.api.force_authenticate(User.objects.get(pk=self.user.pk))

        self.existing = Client.objects.create(
            full_name='Кодиров Кобилжон Кахрамон', company=self.company,
            pinfl='12345678901234', passport_series='AA', passport_number='1234567',
        )
        ClientPhoneNumber.objects.create(client=self.existing, phone_number='+998901497778',
                                         is_primary=True)

    def create(self, **payload):
        return self.api.post('/api/clients/', payload, format='json')

    def test_same_phone_is_rejected_with_existing_card(self):
        response = self.create(full_name='Кодиров Кобилжон', phone_number='90 149 77 78')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('duplicate_client', response.data)
        self.assertIn(str(self.existing.pk), str(response.data['duplicate_client']))
        self.assertEqual(Client.objects.filter(company=self.company).count(), 1)

    def test_same_pinfl_is_rejected(self):
        response = self.create(full_name='Другое имя', pinfl='12345678901234')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('duplicate_client', response.data)

    def test_same_passport_is_rejected(self):
        response = self.create(full_name='Другое имя', passport_series='aa',
                               passport_number='1234567')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('duplicate_client', response.data)

    def test_confirmation_allows_creating_a_namesake(self):
        response = self.create(full_name='Кодиров Кобилжон', phone_number='+998901497778',
                               confirm_duplicate=True)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Client.objects.filter(company=self.company).count(), 2)

    def test_duplicate_in_another_company_is_not_a_duplicate(self):
        self.user.profile.company = self.other_company
        self.user.profile.save()
        response = self.create(full_name='Кодиров Кобилжон', phone_number='+998901497778')
        self.assertEqual(response.status_code, 201, response.data)

    def test_editing_existing_client_is_not_blocked_by_itself(self):
        response = self.api.patch(f'/api/clients/{self.existing.pk}/',
                                  {'comment': 'Перезвонить'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def test_editing_client_into_an_existing_pinfl_is_rejected(self):
        other = Client.objects.create(full_name='Иванов Иван', company=self.company)
        response = self.api.patch(f'/api/clients/{other.pk}/',
                                  {'pinfl': '12345678901234'}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('duplicate_client', response.data)

    def test_client_log_shows_employee_name(self):
        self.user.first_name = 'Шохиста'
        self.user.last_name = 'Каримова'
        self.user.save(update_fields=['first_name', 'last_name'])
        self.api.patch(f'/api/clients/{self.existing.pk}/', {'comment': 'Перезвонить'}, format='json')

        card = self.api.get(f'/api/clients/{self.existing.pk}/').data
        latest = card['logs'][0]
        self.assertEqual(latest['user'], 'Шохиста Каримова')
        # В журнале должно быть видно, какое поле и на что изменилось
        self.assertIn('Перезвонить', latest['action'])
