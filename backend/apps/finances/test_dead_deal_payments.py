"""
Платежи недействующих сделок: отмена и просрочка.

Заказчик видел расторгнутый договор (сделка №643), у которого неоплаченная
часть оставалась «Просрочен», а остаток — «К оплате»: суммы продолжали
попадать в просрочку на дашборде и в витрины «Финансов». По расторгнутому
или отменённому договору денег не ждут — такие строки графика получают
статус «Отменён» и из ожидаемых сумм выпадают.
"""

import shutil
import tempfile
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.crm.models import Client
from apps.deals.models import Deal
from apps.realty.models import Building, Project, Property
from permissions.models import Company

from .models import BeneficiaryAccount, Payment, PaymentType
from .services import refresh_overdue_payments

User = get_user_model()


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class DeadDealPaymentTests(TestCase):
    def setUp(self):
        # Скан расторжения не должен попадать в рабочий media-каталог
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        media_settings = override_settings(MEDIA_ROOT=media)
        media_settings.enable()
        self.addCleanup(media_settings.disable)

        self.today = timezone.localdate()
        self.company = Company.objects.create(name='Андижан', code='AND', deal_currency='UZS',
                                              supported_currencies=['UZS'])
        self.user = User.objects.create_user('manager', password='pass-for-tests',
                                             first_name='Шохиста', last_name='Каримова')
        self.user.profile.is_system_admin = True
        self.user.profile.company = self.company
        self.user.profile.save()
        self.api = APIClient()
        self.api.force_authenticate(User.objects.get(pk=self.user.pk))

        self.project = Project.objects.create(name='ЖК', address='А', company=self.company)
        self.building = Building.objects.create(project=self.project, name='1', floors_count=9)
        self.client_a = Client.objects.create(
            full_name='Кодиров Кобилжон', company=self.company,
            passport_series='AA', passport_number='1234567', passport_issued_by='ОВД',
            passport_issued_date=self.today, pinfl='12345678901234',
        )
        self.payment_type = PaymentType.objects.create(name='Взнос', company=self.company)
        self.account = BeneficiaryAccount.objects.create(name='Счёт', details='-', company=self.company)
        self.units = 0

    def deal(self, status=Deal.DealStatus.IN_PROGRESS, price=Decimal('240000000')):
        self.units += 1
        unit = Property.objects.create(building=self.building, property_type='APARTMENT',
                                       unit_number=str(self.units), floor=1,
                                       area=Decimal('40'), price=price,
                                       status=Property.PropertyStatus.IN_DEAL)
        return Deal.objects.create(company=self.company, client=self.client_a, property=unit,
                                   status=status, created_by=self.user, currency='UZS',
                                   initial_price=price, initial_price_per_sqm=Decimal('1'),
                                   contract_price=price, contract_date=self.today,
                                   client_signature_date=self.today)

    def payment(self, deal, amount, status, due_date=None, payment_date=None):
        return Payment.objects.create(
            company=self.company, client=self.client_a, deal=deal, amount=Decimal(amount),
            currency='UZS', payment_type=self.payment_type, beneficiary_account=self.account,
            method='CASHLESS', due_date=due_date or self.today, status=status,
            payment_date=payment_date, responsible_employee=self.user,
        )

    def terminate(self, deal):
        # Представление принимает multipart: при расторжении загружают скан
        return self.api.post(f'/api/deals/{deal.id}/cancel/', {
            'termination_document_scan': SimpleUploadedFile('doc.pdf', b'%PDF-1.4 scan'),
            'termination_date': self.today.isoformat(),
        }, format='multipart')

    def test_termination_cancels_unpaid_and_keeps_paid_for_refund(self):
        deal = self.deal()
        paid = self.payment(deal, '12000000', Payment.PaymentStatus.PAID, payment_date=self.today)
        overdue = self.payment(deal, '28000000', Payment.PaymentStatus.OVERDUE,
                               due_date=self.today - timedelta(days=10))
        pending = self.payment(deal, '200000000', Payment.PaymentStatus.PENDING,
                               due_date=self.today + timedelta(days=30))

        response = self.terminate(deal)
        self.assertEqual(response.status_code, 200, response.data)

        paid.refresh_from_db(), overdue.refresh_from_db(), pending.refresh_from_db()
        self.assertEqual(paid.status, Payment.PaymentStatus.TO_BE_RETURNED)
        self.assertEqual(overdue.status, Payment.PaymentStatus.CANCELLED)
        self.assertEqual(pending.status, Payment.PaymentStatus.CANCELLED)

    def test_cancelled_deal_cancels_its_schedule(self):
        deal = self.deal(status=Deal.DealStatus.IN_PROGRESS)
        deal.client_signature_date = None
        deal.save(update_fields=['client_signature_date'])
        pending = self.payment(deal, '5000000', Payment.PaymentStatus.PENDING)

        response = self.api.post(f'/api/deals/{deal.id}/cancel/',
                                 {'cancellation_reason': 'Клиент отказался'}, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)
        pending.refresh_from_db()
        self.assertEqual(pending.status, Payment.PaymentStatus.CANCELLED)

    def test_overdue_refresh_skips_payments_of_dead_deals(self):
        dead = self.deal(status=Deal.DealStatus.TERMINATED)
        live = self.deal()
        on_dead = self.payment(dead, '1000', Payment.PaymentStatus.PENDING,
                               due_date=self.today - timedelta(days=5))
        on_live = self.payment(live, '2000', Payment.PaymentStatus.PENDING,
                               due_date=self.today - timedelta(days=5))

        refresh_overdue_payments()

        on_dead.refresh_from_db(), on_live.refresh_from_db()
        self.assertEqual(on_dead.status, Payment.PaymentStatus.PENDING)
        self.assertEqual(on_live.status, Payment.PaymentStatus.OVERDUE)

    def test_dashboard_and_finance_summary_ignore_dead_deal_overdue(self):
        dead = self.deal(status=Deal.DealStatus.TERMINATED)
        live = self.deal()
        # Строка, оставшаяся «Просрочен» со времён, когда расторжение
        # не отменяло неоплаченные платежи
        self.payment(dead, '64000000000', Payment.PaymentStatus.OVERDUE,
                     due_date=self.today - timedelta(days=30))
        self.payment(live, '12000000', Payment.PaymentStatus.OVERDUE,
                     due_date=self.today - timedelta(days=3))

        kpi = self.api.get('/api/dashboard/analytics/').data['kpi']
        self.assertEqual(Decimal(kpi['overduePayments']), Decimal('12000000'))

        widgets = self.api.get('/api/finances/summary/').data['widgets']
        self.assertEqual(Decimal(widgets['in_base']['overdue_sum']), Decimal('12000000'))
        self.assertEqual([row['currency'] for row in widgets['by_currency']], ['UZS'])
        self.assertEqual(Decimal(widgets['by_currency'][0]['overdue_sum']), Decimal('12000000'))

    def test_management_command_cancels_leftover_payments(self):
        dead = self.deal(status=Deal.DealStatus.TERMINATED)
        leftover = self.payment(dead, '228000000', Payment.PaymentStatus.PENDING)

        call_command('cancel_dead_deal_payments')
        leftover.refresh_from_db()
        self.assertEqual(leftover.status, Payment.PaymentStatus.PENDING, 'без --apply ничего не меняется')

        call_command('cancel_dead_deal_payments', '--apply')
        leftover.refresh_from_db()
        self.assertEqual(leftover.status, Payment.PaymentStatus.CANCELLED)
        self.assertTrue(leftover.logs.exists())

    def test_payment_list_shows_employee_name_not_login(self):
        deal = self.deal()
        self.payment(deal, '1000', Payment.PaymentStatus.PENDING)

        rows = self.api.get('/api/finances/payments/').data
        self.assertEqual(rows[0]['responsible_employee'], 'Шохиста Каримова')
