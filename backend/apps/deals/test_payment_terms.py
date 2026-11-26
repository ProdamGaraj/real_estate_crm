"""
Фактические условия оплаты сделки.

В карточке и в документах стояло «Рассрочка на 18 месяцев», а в графике
было два платежа: название плана ни с чем не сверялось. Карточка отдаёт
то, что действительно записано в графике, и признак расхождения с планом.
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.crm.models import Client
from apps.finances.models import BeneficiaryAccount, Payment, PaymentType
from apps.realty.models import Building, Project, Property
from permissions.models import Company

from .models import Deal

User = get_user_model()


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class PaymentTermsTests(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.company = Company.objects.create(name='Андижан', code='AND', deal_currency='UZS',
                                              supported_currencies=['UZS'])
        self.user = User.objects.create_user('manager', password='pass-for-tests')
        self.user.profile.is_system_admin = True
        self.user.profile.company = self.company
        self.user.profile.save()
        self.api = APIClient()
        self.api.force_authenticate(User.objects.get(pk=self.user.pk))

        self.project = Project.objects.create(name='ЖК', address='А', company=self.company)
        self.building = Building.objects.create(project=self.project, name='1', floors_count=9)
        self.client_a = Client.objects.create(full_name='Клиент А', company=self.company)
        self.plan = PaymentType.objects.create(name='Рассрочка на 18 месяцев', company=self.company,
                                               plan_kind=PaymentType.PlanKind.INSTALLMENT,
                                               plan_months=18, down_payment_percent=Decimal('30'))
        self.account = BeneficiaryAccount.objects.create(name='Счёт', details='-', company=self.company)
        self.units = 0

    def deal(self, price=Decimal('240000000')):
        self.units += 1
        unit = Property.objects.create(building=self.building, property_type='APARTMENT',
                                       unit_number=str(self.units), floor=1,
                                       area=Decimal('40'), price=price)
        return Deal.objects.create(company=self.company, client=self.client_a, property=unit,
                                   status=Deal.DealStatus.IN_PROGRESS, created_by=self.user,
                                   currency='UZS', initial_price=price, initial_price_per_sqm=Decimal('1'),
                                   contract_price=price, payment_plan=self.plan)

    def payment(self, deal, amount, status=Payment.PaymentStatus.PENDING, due_date=None):
        return Payment.objects.create(
            company=self.company, client=self.client_a, deal=deal, amount=Decimal(amount),
            currency='UZS', payment_type=self.plan, beneficiary_account=self.account,
            method='CASHLESS', due_date=due_date or self.today, status=status,
        )

    def terms(self, deal):
        return self.api.get(f'/api/deals/{deal.id}/').data['payment_terms']

    def test_schedule_shorter_than_plan_is_reported_as_mismatch(self):
        deal = self.deal()
        self.payment(deal, '12000000')
        self.payment(deal, '228000000', due_date=self.today + timedelta(days=7))

        terms = self.terms(deal)
        self.assertEqual(terms['scheduled_payments'], 2)
        self.assertEqual(terms['plan_months'], 18)
        self.assertEqual(terms['expected_payments'], 19)
        self.assertFalse(terms['matches_plan'])

    def test_matching_schedule_has_no_mismatch(self):
        deal = self.deal()
        for index in range(19):
            self.payment(deal, '10000000', due_date=self.today + timedelta(days=30 * index))

        terms = self.terms(deal)
        self.assertEqual(terms['scheduled_payments'], 19)
        self.assertTrue(terms['matches_plan'])

    def test_cancelled_payments_do_not_count_as_schedule(self):
        deal = self.deal()
        self.payment(deal, '12000000')
        self.payment(deal, '228000000', status=Payment.PaymentStatus.CANCELLED)

        self.assertEqual(self.terms(deal)['scheduled_payments'], 1)

    def test_deal_without_schedule_has_no_verdict(self):
        terms = self.terms(self.deal())
        self.assertEqual(terms['scheduled_payments'], 0)
        self.assertIsNone(terms['matches_plan'])


class ContractPricePerSqmTests(PaymentTermsTests):
    """
    Цена 1 м² по договору — для договора инвестиции: в нём есть и сумма,
    и цена за метр, и они обязаны сходиться. Поэтому метр считается от
    стоимости по договору, а не от цены по прайсу: после скидки они расходятся.
    """

    def test_counts_from_contract_price_not_from_price_list(self):
        deal = self.deal(price=Decimal('240000000'))
        # Договорились со скидкой: цена метра должна считаться от неё
        deal.contract_price = Decimal('228000000')
        deal.save(update_fields=['contract_price'])
        self.assertEqual(deal.contract_price_per_sqm, Decimal('5700000.00'))

    def test_rounds_to_kopecks(self):
        deal = self.deal(price=Decimal('240000000'))
        deal.contract_price = Decimal('100000000')
        deal.property.area = Decimal('27.00')
        deal.property.save(update_fields=['area'])
        deal.save(update_fields=['contract_price'])
        self.assertEqual(deal.contract_price_per_sqm, Decimal('3703703.70'))

    def test_empty_until_price_and_area_are_known(self):
        deal = self.deal()
        deal.contract_price = None
        deal.save(update_fields=['contract_price'])
        # В шаблоне договора такое поле печатается пустым, а не ошибкой
        self.assertIsNone(deal.contract_price_per_sqm)
