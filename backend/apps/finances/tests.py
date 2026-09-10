from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.crm.models import Client
from apps.deals.models import Deal
from apps.finances.models import BeneficiaryAccount, Payment, PaymentType
from apps.finances.services import refresh_overdue_payments
from apps.realty.models import Building, Project, Property
from permissions.models import Company

User = get_user_model()

# В тестах не поднимаем Redis: throttling DRF ходит в кеш
LOCAL_CACHE = override_settings(
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
)


@LOCAL_CACHE
class PaymentScheduleTests(APITestCase):
    """
    График платежей пересобирается без потери отметок об оплате.
    """

    def setUp(self):
        self.user = User.objects.create_user(username='finance', password='pwd12345')
        # Профиль создаётся сигналом; делаем пользователя админом, чтобы
        # проверять бизнес-логику, а не матрицу разрешений
        profile = self.user.profile
        profile.is_system_admin = True
        profile.save()

        self.company = Company.objects.create(name='Компания', code='CO')
        self.client_obj = Client.objects.create(full_name='Иванов Иван', company=self.company)

        project = Project.objects.create(name='ЖК', address='ул. Тестовая, 1', company=self.company)
        building = Building.objects.create(project=project, name='Корпус 1', floors_count=9)
        self.property = Property.objects.create(
            building=building, property_type=Property.PropertyType.APARTMENT,
            unit_number='12', floor=3, area=Decimal('50.00'), price=Decimal('1000.00'),
        )

        self.deal = Deal.objects.create(
            client=self.client_obj, property=self.property, company=self.company,
            booking_end_date=date.today() + timedelta(days=30),
            initial_price=Decimal('1000.00'), initial_price_per_sqm=Decimal('20.00'),
            contract_price=Decimal('1000.00'),
        )

        self.payment_type = PaymentType.objects.create(name='Первоначальный взнос')
        self.account = BeneficiaryAccount.objects.create(name='Основной счёт', company=self.company)

        self.url = reverse('deal-payment-schedule-create', kwargs={'deal_pk': self.deal.pk})
        self.client.force_authenticate(user=self.user)

    def _row(self, amount, due_date, payment_id=None):
        row = {
            'amount': str(amount),
            'due_date': due_date.isoformat(),
            'payment_type_id': self.payment_type.id,
            'beneficiary_account_id': self.account.id,
            'currency': 'UZS',
            'method': 'CASHLESS',
        }
        if payment_id is not None:
            row['id'] = payment_id
        return row

    def _create_initial_schedule(self):
        response = self.client.post(self.url, [
            self._row(Decimal('400.00'), date.today() + timedelta(days=10)),
            self._row(Decimal('600.00'), date.today() + timedelta(days=40)),
        ], format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return list(self.deal.payments.order_by('due_date'))

    def test_schedule_creation_moves_deal_and_property_to_in_progress(self):
        self._create_initial_schedule()
        self.deal.refresh_from_db()
        self.property.refresh_from_db()
        self.assertEqual(self.deal.status, Deal.DealStatus.IN_PROGRESS)
        self.assertEqual(self.property.status, Property.PropertyStatus.IN_DEAL)

    def test_editing_schedule_preserves_paid_marks(self):
        first, second = self._create_initial_schedule()

        # Первый транш оплачен
        first.payment_date = date.today()
        first.status = Payment.PaymentStatus.PAID
        first.save()

        # Правим срок второго транша, первый передаём без изменений — но с id
        new_due = date.today() + timedelta(days=60)
        response = self.client.post(self.url, [
            self._row(Decimal('400.00'), first.due_date, payment_id=first.id),
            self._row(Decimal('600.00'), new_due, payment_id=second.id),
        ], format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        first.refresh_from_db()
        second.refresh_from_db()

        # Главное: отметка об оплате и дата уцелели
        self.assertEqual(first.status, Payment.PaymentStatus.PAID)
        self.assertEqual(first.payment_date, date.today())
        # Непроведённый платёж обновился
        self.assertEqual(second.due_date, new_due)
        self.assertEqual(second.status, Payment.PaymentStatus.PENDING)
        # Дублей не появилось
        self.assertEqual(self.deal.payments.count(), 2)

    def test_cannot_remove_paid_payment_from_schedule(self):
        first, second = self._create_initial_schedule()
        first.payment_date = date.today()
        first.status = Payment.PaymentStatus.PAID
        first.save()

        # Пытаемся выбросить оплаченный транш, переложив сумму на второй
        response = self.client.post(self.url, [
            self._row(Decimal('1000.00'), second.due_date, payment_id=second.id),
        ], format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('уже прошли деньги', response.data['error'])
        # Ничего не удалено и не изменено
        self.assertEqual(self.deal.payments.count(), 2)
        second.refresh_from_db()
        self.assertEqual(second.amount, Decimal('600.00'))

    def test_unpaid_payments_can_be_replaced(self):
        first, second = self._create_initial_schedule()

        # Оба транша не оплачены — график можно пересобрать целиком
        response = self.client.post(self.url, [
            self._row(Decimal('1000.00'), date.today() + timedelta(days=15)),
        ], format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(self.deal.payments.count(), 1)
        self.assertFalse(Payment.objects.filter(pk__in=[first.pk, second.pk]).exists())

    def test_duplicate_payment_id_is_rejected(self):
        """Одна и та же строка дважды не должна схлопываться в один платёж."""
        first, second = self._create_initial_schedule()
        response = self.client.post(self.url, [
            self._row(Decimal('400.00'), first.due_date, payment_id=first.id),
            self._row(Decimal('600.00'), second.due_date, payment_id=first.id),
        ], format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('дважды', response.data['error'])
        self.assertEqual(self.deal.payments.count(), 2)

    def test_schedule_sum_must_match_contract_price(self):
        response = self.client.post(self.url, [
            self._row(Decimal('400.00'), date.today() + timedelta(days=10)),
        ], format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('не совпадает', response.data['error'])

    def test_fractional_amounts_sum_exactly(self):
        """Дробные суммы не должны срываться на двоичной погрешности."""
        self.deal.contract_price = Decimal('1000.10')
        self.deal.save()
        response = self.client.post(self.url, [
            {**self._row(Decimal('0'), date.today() + timedelta(days=10)), 'amount': 333.30},
            {**self._row(Decimal('0'), date.today() + timedelta(days=20)), 'amount': 666.80},
        ], format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_schedule_locked_for_terminated_deal(self):
        self._create_initial_schedule()
        self.deal.status = Deal.DealStatus.TERMINATED
        self.deal.save()

        response = self.client.post(self.url, [
            self._row(Decimal('1000.00'), date.today() + timedelta(days=10)),
        ], format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('расторгнута', response.data['error'])

    def test_overdue_status_is_set_on_creation(self):
        """Просроченный срок даёт статус «Просрочен» сразу, а не после пересчёта."""
        response = self.client.post(self.url, [
            self._row(Decimal('1000.00'), date.today() - timedelta(days=5)),
        ], format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        payment = self.deal.payments.get()
        self.assertEqual(payment.status, Payment.PaymentStatus.OVERDUE)


@LOCAL_CACHE
class RefreshOverduePaymentsTests(APITestCase):
    """Пересчёт статуса «Просрочен»."""

    def setUp(self):
        self.company = Company.objects.create(name='Компания', code='CO')
        self.client_obj = Client.objects.create(full_name='Петров Пётр', company=self.company)
        self.payment_type = PaymentType.objects.create(name='Рассрочка')
        self.account = BeneficiaryAccount.objects.create(name='Счёт', company=self.company)

    def _payment(self, due_date, payment_status, payment_date=None):
        return Payment.objects.create(
            client=self.client_obj, company=self.company, amount=Decimal('100.00'),
            payment_type=self.payment_type, beneficiary_account=self.account,
            method=Payment.PaymentMethod.CASHLESS, due_date=due_date,
            payment_date=payment_date, status=payment_status,
        )

    def test_marks_past_due_pending_as_overdue(self):
        overdue = self._payment(date.today() - timedelta(days=1), Payment.PaymentStatus.PENDING)
        upcoming = self._payment(date.today() + timedelta(days=1), Payment.PaymentStatus.PENDING)

        updated = refresh_overdue_payments()

        self.assertEqual(updated, 1)
        overdue.refresh_from_db()
        upcoming.refresh_from_db()
        self.assertEqual(overdue.status, Payment.PaymentStatus.OVERDUE)
        self.assertEqual(upcoming.status, Payment.PaymentStatus.PENDING)

    def test_does_not_touch_paid_or_returned(self):
        paid = self._payment(
            date.today() - timedelta(days=10), Payment.PaymentStatus.PAID,
            payment_date=date.today() - timedelta(days=10),
        )
        to_return = self._payment(date.today() - timedelta(days=10), Payment.PaymentStatus.TO_BE_RETURNED)

        refresh_overdue_payments()

        paid.refresh_from_db()
        to_return.refresh_from_db()
        self.assertEqual(paid.status, Payment.PaymentStatus.PAID)
        self.assertEqual(to_return.status, Payment.PaymentStatus.TO_BE_RETURNED)
