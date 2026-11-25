"""
Права на график платежей и правка графика в любом статусе сделки.

Бухгалтер правит график, но условия сделки не меняет. Проверялось при этом
только право на сделку (`EDIT DEAL`), поэтому бухгалтер с полным правом на
платежи был заблокирован: «У вас нет доступа к этой сделке».

Второе: правку графика отменённой и расторгнутой сделки запрещали совсем,
а по таким договорам идут возвраты и перерасчёты — исправить ошибку в
графике было нельзя. Теперь можно, но с обязательной причиной в журнале.
"""

import io
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.crm.models import Client
from apps.deals.models import Deal, DealLog
from apps.finances.models import BeneficiaryAccount, Payment, PaymentType
from apps.realty.models import Building, Project, Property
from permissions.models import Company, Permission, Role, UserProfile

User = get_user_model()

PASSPORT = dict(passport_series='AA', passport_number='1234567', passport_issued_by='ИИБ',
                passport_issued_date=date(2020, 1, 15), pinfl='12345678901234')


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class ScheduleAccessTests(TestCase):
    def setUp(self):
        call_command('init_permissions', stdout=io.StringIO())
        self.company = Company.objects.create(name='Продажи', code='SALES', deal_currency='UZS',
                                              supported_currencies=['UZS'])
        project = Project.objects.create(name='ЖК', address='А', company=self.company, price_currency='UZS')
        building = Building.objects.create(project=project, name='1', floors_count=9)
        self.unit = Property.objects.create(building=building, property_type='APARTMENT',
                                            unit_number='12', floor=3, area=Decimal('50'),
                                            price=Decimal('1000'),
                                            status=Property.PropertyStatus.IN_DEAL)
        self.manager = self._user('mpp', Permission.objects.filter(resource='DEAL', scope='COMPANY'))
        # Бухгалтер: полные права на платежи, по сделкам — только просмотр
        self.accountant = self._user(
            'buh',
            Permission.objects.filter(resource='PAYMENT', scope='COMPANY')
            | Permission.objects.filter(resource='DEAL', action='VIEW', scope='COMPANY'),
        )
        # Наблюдатель: только просмотр и того и другого
        self.viewer = self._user('viewer', Permission.objects.filter(
            resource__in=['DEAL', 'PAYMENT'], action='VIEW', scope='COMPANY'))

        self.client_obj = Client.objects.create(full_name='Иванов Иван', company=self.company,
                                                 created_by=self.manager, **PASSPORT)
        self.deal = Deal.objects.create(company=self.company, client=self.client_obj, property=self.unit,
                                        status=Deal.DealStatus.IN_PROGRESS, currency='UZS',
                                        initial_price=Decimal('1000'), initial_price_per_sqm=Decimal('20'),
                                        contract_price=Decimal('1000'), created_by=self.manager)
        self.ptype = PaymentType.objects.create(name='Взнос', company=self.company)
        self.account = BeneficiaryAccount.objects.create(name='Счёт', details='-', company=self.company)
        self.url = f'/api/deals/{self.deal.id}/payment-schedule/'

    def _user(self, username, permissions):
        # Код с суффиксом: типовые роли из init_permissions занимают
        # простые коды вроде VIEWER
        role = Role.objects.create(name=username, code=f'{username.upper()}_TEST')
        role.permissions.set(permissions)
        user = User.objects.create_user(username, password='pass-for-tests')
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.company = self.company
        profile.save()
        profile.roles.set([role])
        return User.objects.get(pk=user.pk)

    def api(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def rows(self, amount='1000.00', days=10):
        return [{
            'amount': amount, 'due_date': (timezone.localdate() + timedelta(days=days)).isoformat(),
            'payment_type_id': self.ptype.id, 'beneficiary_account_id': self.account.id,
            'currency': 'UZS', 'method': 'CASHLESS',
        }]

    def save(self, user, payload=None, **kwargs):
        return self.api(user).post(self.url, payload if payload is not None else self.rows(),
                                   format='json', **kwargs)

    def test_accountant_saves_schedule_without_deal_rights(self):
        response = self.save(self.accountant)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.deal.payments.count(), 1)

    def test_manager_saves_schedule_without_payment_rights(self):
        response = self.save(self.manager)
        self.assertEqual(response.status_code, 201, response.data)

    def test_viewer_is_refused(self):
        response = self.save(self.viewer)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.deal.payments.exists())

    def test_cancelled_deal_schedule_needs_a_reason(self):
        Deal.objects.filter(pk=self.deal.pk).update(status=Deal.DealStatus.CANCELLED)

        refusal = self.save(self.accountant)
        self.assertEqual(refusal.status_code, 400)
        self.assertIn('укажите причину', refusal.data['error'])

        response = self.save(self.accountant, {
            'payments': self.rows(), 'reason': 'Перерасчёт после возврата',
        })
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(DealLog.objects.filter(
            deal=self.deal, action__contains='Перерасчёт после возврата').exists())

    def test_terminated_deal_schedule_is_editable_with_reason(self):
        Deal.objects.filter(pk=self.deal.pk).update(status=Deal.DealStatus.TERMINATED)
        response = self.save(self.accountant, {
            'payments': self.rows(), 'reason': 'Уточнили сумму возврата',
        })
        self.assertEqual(response.status_code, 201, response.data)

    def test_paid_rows_stay_protected_in_a_cancelled_deal(self):
        paid = Payment.objects.create(
            company=self.company, deal=self.deal, client=self.client_obj, amount=Decimal('1000'),
            currency='UZS', payment_type=self.ptype, beneficiary_account=self.account,
            method='CASHLESS', due_date=timezone.localdate(), payment_date=timezone.localdate(),
            status=Payment.PaymentStatus.PAID,
        )
        Deal.objects.filter(pk=self.deal.pk).update(status=Deal.DealStatus.CANCELLED)

        # Проведённую строку из графика не убрать даже с причиной
        response = self.save(self.accountant, {'payments': self.rows(), 'reason': 'правка'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('уже прошли деньги', response.data['error'])
        paid.refresh_from_db()
        self.assertEqual(paid.status, Payment.PaymentStatus.PAID)
