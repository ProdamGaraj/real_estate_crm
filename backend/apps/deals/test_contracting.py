"""
Контрактация в отчётах план-факт и на дашборде: сделки «В работе» считаются
наравне с успешно закрытыми. Раньше учитывались только закрытые, и менеджеры
с оформленными, но не подписанными договорами в цифрах не появлялись.
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

from .contracting import contracted_deals
from .models import Deal

User = get_user_model()


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class ContractingTests(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.month_start = self.today.replace(day=1)
        self.company = Company.objects.create(name='Андижан', code='AND', deal_currency='UZS',
                                              supported_currencies=['UZS'])
        admin = User.objects.create_user('admin', password='pass-for-tests')
        admin.profile.is_system_admin = True
        admin.profile.company = self.company
        admin.profile.save()
        self.api = APIClient()
        self.api.force_authenticate(User.objects.get(pk=admin.pk))

        # Новый менеджер: договоры оформлены, подписи ещё не внесены
        self.newbie = User.objects.create_user('mpp_3', password='pass-for-tests', first_name='Hojiakbar')
        self.newbie.profile.company = self.company
        self.newbie.profile.save()
        self.project = Project.objects.create(name='ЖК', address='А', company=self.company)
        self.building = Building.objects.create(project=self.project, name='1', floors_count=9)
        self.client_a = Client.objects.create(full_name='Клиент А', company=self.company)
        self.client_b = Client.objects.create(full_name='Клиент Б', company=self.company)
        self.units = 0

    def deal(self, status, price, client=None, contract_date=None, closed_at=None):
        self.units += 1
        unit = Property.objects.create(building=self.building, property_type='APARTMENT',
                                       unit_number=str(self.units), floor=1, area=Decimal('40'), price=price)
        return Deal.objects.create(company=self.company, client=client or self.client_a, property=unit,
                                   status=status, created_by=self.newbie, currency='UZS',
                                   booking_end_date=timezone.now() + timedelta(days=3),
                                   initial_price=price, initial_price_per_sqm=Decimal('1'),
                                   contract_price=price, contract_date=contract_date, closed_at=closed_at)

    def report_params(self):
        return {'year': self.today.year, 'period_type': 'month', 'period_value': self.today.month}

    def test_in_progress_and_closed_deals_count_others_do_not(self):
        in_progress = self.deal(Deal.DealStatus.IN_PROGRESS, Decimal('100'), contract_date=self.today)
        closed = self.deal(Deal.DealStatus.CLOSED_WON, Decimal('200'), contract_date=self.today)
        # Без даты договора — по дате закрытия, а если нет и её — по дате брони
        closed_no_date = self.deal(Deal.DealStatus.CLOSED_WON, Decimal('300'), closed_at=timezone.now())
        in_progress_no_date = self.deal(Deal.DealStatus.IN_PROGRESS, Decimal('400'))
        for status in (Deal.DealStatus.BOOKING, Deal.DealStatus.CANCELLED, Deal.DealStatus.TERMINATED):
            self.deal(status, Decimal('999'), contract_date=self.today)
        # Договор прошлого месяца в этот месяц не попадает
        self.deal(Deal.DealStatus.IN_PROGRESS, Decimal('999'), contract_date=self.month_start - timedelta(days=1))

        found = contracted_deals(Deal.objects.all(), self.month_start, self.today)
        self.assertEqual(set(found.values_list('id', flat=True)),
                         {in_progress.id, closed.id, closed_no_date.id, in_progress_no_date.id})

    def test_employee_report_shows_manager_with_deals_in_progress(self):
        self.deal(Deal.DealStatus.IN_PROGRESS, Decimal('180838500'), contract_date=self.today)
        self.deal(Deal.DealStatus.IN_PROGRESS, Decimal('301397500'), contract_date=self.today)
        rows = self.api.get('/api/reports/employee-plan-fact/', self.report_params()).data
        row = next(r for r in rows if r['employee_id'] == self.newbie.id)
        self.assertEqual(row['contracting_units']['fact'], 2)
        self.assertEqual(Decimal(row['contracting_money']['fact']), Decimal('482236000'))

    def test_project_report_counts_deals_in_progress(self):
        self.deal(Deal.DealStatus.IN_PROGRESS, Decimal('100'), contract_date=self.today)
        self.deal(Deal.DealStatus.CLOSED_WON, Decimal('200'), contract_date=self.today)
        rows = self.api.get('/api/reports/plan-fact/', self.report_params()).data
        row = next(r for r in rows if r['project_id'] == self.project.id)
        self.assertEqual(row['contracting_units']['fact'], 2)
        self.assertEqual(Decimal(row['contracting_money']['fact']), Decimal('300'))

    def test_dashboard_contracting_receipts_and_clients_in_progress(self):
        first = self.deal(Deal.DealStatus.IN_PROGRESS, Decimal('100'), contract_date=self.today)
        self.deal(Deal.DealStatus.IN_PROGRESS, Decimal('200'), contract_date=self.today)       # тот же клиент А
        self.deal(Deal.DealStatus.IN_PROGRESS, Decimal('300'), client=self.client_b, contract_date=self.today)
        self.deal(Deal.DealStatus.CLOSED_WON, Decimal('400'), contract_date=self.today)
        ptype = PaymentType.objects.create(name='Взнос', company=self.company)
        account = BeneficiaryAccount.objects.create(name='Счёт', details='-', company=self.company)
        for amount, status, paid_on in ((Decimal('50'), Payment.PaymentStatus.PAID, self.today),
                                        (Decimal('70'), Payment.PaymentStatus.PENDING, None),
                                        (Decimal('90'), Payment.PaymentStatus.PAID, self.month_start - timedelta(days=1))):
            Payment.objects.create(company=self.company, client=self.client_a, deal=first, amount=amount,
                                   currency='UZS', payment_type=ptype, beneficiary_account=account,
                                   method='CASHLESS', due_date=self.today, status=status, payment_date=paid_on)

        kpi = self.api.get('/api/dashboard/analytics/').data
        top = kpi['topManagers']
        kpi = kpi['kpi']
        self.assertEqual(kpi['clientsInProgress'], 2)                        # клиенты А и Б
        self.assertEqual(Decimal(kpi['monthlyContracting']), Decimal('1000'))  # 100 + 200 + 300 + 400
        self.assertEqual(Decimal(kpi['monthlyReceipts']), Decimal('50'))     # только оплаченное в этом месяце
        self.assertNotIn('monthlySales', kpi)
        self.assertEqual(top[0]['first_name'], 'Hojiakbar')
