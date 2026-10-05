"""
Мультивалютность: курсы, пересчёт цены при брони, график в валюте сделки,
приведение отчётов к валюте сделок компании.

Сеть в тестах отключена: загрузка курсов ЦБ подменяется, все курсы
заводятся в базе явно.
"""

import io
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.crm.models import Client
from apps.deals.models import Deal
from apps.finances.currency import Converter, RateUnavailable, convert, cross_rate, get_rate, money
from apps.finances.models import BeneficiaryAccount, ExchangeRate, InstallmentPlan, Payment, PaymentType
from apps.realty.models import Building, Project, Property
from permissions.models import Company, Department, Permission, Role, UserProfile

User = get_user_model()

NO_NETWORK = mock.patch('apps.finances.currency.fetch_cbu_rates', side_effect=OSError('нет сети'))
LOCAL_CACHE = override_settings(
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
)


def cbu(currency, day, rate):
    return ExchangeRate.objects.create(currency=currency, date=day, rate=Decimal(rate),
                                       source=ExchangeRate.Source.CBU)


@NO_NETWORK
class RateLookupTests(TestCase):
    def setUp(self):
        self.a = Company.objects.create(name='А', code='A')
        self.b = Company.objects.create(name='Б', code='B')
        self.day = date(2026, 10, 1)
        cbu('USD', self.day, '12000')

    def test_latest_rate_not_after_date_is_used(self, _):
        cbu('USD', self.day + timedelta(days=2), '12100')
        self.assertEqual(get_rate('USD', self.day + timedelta(days=1), fetch=False), Decimal('12000'))
        self.assertEqual(get_rate('USD', self.day + timedelta(days=5), fetch=False), Decimal('12100'))

    def test_manual_rate_overrides_cbu_only_inside_its_company(self, _):
        ExchangeRate.objects.create(currency='USD', date=self.day, rate=Decimal('12500'),
                                    source=ExchangeRate.Source.MANUAL, company=self.a)
        self.assertEqual(get_rate('USD', self.day, self.a, fetch=False), Decimal('12500'))
        # Ручной курс компании А не влияет на расчёты компании Б
        self.assertEqual(get_rate('USD', self.day, self.b, fetch=False), Decimal('12000'))

    def test_conversion_goes_through_sum(self, _):
        cbu('EUR', self.day, '13200')
        self.assertEqual(convert(Decimal('1000'), 'USD', 'UZS', self.day), Decimal('12000000.00'))
        self.assertEqual(convert(Decimal('12000000'), 'UZS', 'USD', self.day), Decimal('1000.00'))
        self.assertEqual(cross_rate('EUR', 'USD', self.day), Decimal('1.10000000'))

    def test_large_sum_amount_converts_without_rate_rounding(self, _):
        # С кросс-курсом, округлённым до 8 знаков, выходило 127 410,00 —
        # минус 72 цента на договоре в полтора миллиарда сумов
        ExchangeRate.objects.filter(currency='USD').update(rate=Decimal('11772.95'))
        self.assertEqual(convert(Decimal('1500000000'), 'UZS', 'USD', self.day), Decimal('127410.72'))

    def test_missing_rate_is_reported(self, _):
        with self.assertRaises(RateUnavailable):
            get_rate('RUB', self.day)
        to_uzs = Converter('UZS')
        self.assertEqual(to_uzs.total([(Decimal('10'), 'RUB', self.day), (Decimal('5'), 'UZS', self.day)]),
                         Decimal('5.00'))
        self.assertEqual(to_uzs.missing, {'RUB'})


@NO_NETWORK
@LOCAL_CACHE
class MultiCurrencyDealTests(TestCase):
    """Прайс в USD, сделки компании — в UZS; график вводится в долларах."""

    def setUp(self):
        call_command('init_permissions', stdout=io.StringIO())
        self.today = timezone.localdate()
        cbu('USD', self.today, '12000')

        self.company = Company.objects.create(name='Продажи', code='SALES', deal_currency='UZS',
                                              supported_currencies=['UZS', 'USD'])
        dept = Department.objects.create(company=self.company, name='Отдел', code='D1')
        role = Role.objects.create(name='Менеджер', code='SALES_MANAGER')
        role.permissions.set(Permission.objects.filter(
            resource__in=['DEAL', 'PAYMENT', 'CLIENT', 'PROPERTY', 'PROJECT', 'BUILDING'],
            scope__in=['OWN', 'COMPANY'],
        ))
        self.user = User.objects.create_user('mpp', password='pass-for-tests')
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.company, profile.department = self.company, dept
        profile.save()
        profile.roles.set([role])
        self.user = User.objects.get(pk=self.user.pk)
        self.api = APIClient()
        self.api.force_authenticate(self.user)

        project = Project.objects.create(name='ЖК', address='А', company=self.company, price_currency='USD')
        building = Building.objects.create(project=project, name='1', floors_count=9)
        self.property = Property.objects.create(
            building=building, property_type='APARTMENT', unit_number='12', floor=3,
            area=Decimal('50.00'), price=Decimal('21000.00'),
        )
        self.client_obj = Client.objects.create(full_name='Клиент', company=self.company, created_by=self.user)
        self.ptype = PaymentType.objects.create(name='Рассрочка', company=self.company)
        self.account = BeneficiaryAccount.objects.create(name='Счёт', details='-', company=self.company)

    def book(self):
        response = self.api.post('/api/deals/', {
            'client': self.client_obj.id, 'property': self.property.id,
            'booking_end_date': (timezone.now() + timedelta(days=5)).isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return Deal.objects.get(pk=response.data['id'])

    def row(self, amount, currency, days=30, **extra):
        return {'amount': str(amount), 'currency': currency,
                'due_date': (self.today + timedelta(days=days)).isoformat(),
                'payment_type_id': self.ptype.id, 'beneficiary_account_id': self.account.id,
                'method': 'CASHLESS', **extra}

    def test_booking_converts_catalog_price_to_deal_currency(self, _):
        deal = self.book()
        self.assertEqual(deal.currency, 'UZS')
        self.assertEqual(deal.initial_price, Decimal('252000000.00'))
        self.assertEqual(deal.catalog_price, Decimal('21000.00'))
        self.assertEqual(deal.catalog_currency, 'USD')
        self.assertEqual(deal.catalog_rate, Decimal('12000'))

    def test_booking_without_rate_is_refused(self, _):
        ExchangeRate.objects.all().delete()
        response = self.api.post('/api/deals/', {
            'client': self.client_obj.id, 'property': self.property.id,
            'booking_end_date': (timezone.now() + timedelta(days=5)).isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Нет курса USD', response.data['error'])

    def test_schedule_entered_in_usd_is_stored_in_uzs(self, _):
        deal = self.book()
        deal.contract_price = Decimal('252000000.00')
        deal.save()
        response = self.api.post(f'/api/deals/{deal.id}/payment-schedule/', [
            self.row('7000', 'USD', 10), self.row('7000', 'USD', 40), self.row('84000000', 'UZS', 70),
        ], format='json')
        self.assertEqual(response.status_code, 201, response.data)
        payments = list(deal.payments.order_by('due_date'))
        self.assertEqual({p.currency for p in payments}, {'UZS'})
        self.assertEqual(payments[0].amount, Decimal('84000000.00'))
        self.assertEqual((payments[0].entered_amount, payments[0].entered_currency),
                         (Decimal('7000.00'), 'USD'))
        # Строка, введённая сразу в сумах, исходного ввода не хранит
        self.assertIsNone(payments[2].entered_amount)

    def test_rounding_tail_goes_to_last_converted_row(self, _):
        ExchangeRate.objects.filter(currency='USD').update(rate=Decimal('11772.95'))
        deal = self.book()
        # 3 × 2831,45 USD по курсу 11 772,95 — это 100 003 557,83 сума целиком,
        # а построчный пересчёт с округлением даёт на копейку больше
        deal.contract_price = Decimal('100003557.83')
        deal.save()
        response = self.api.post(f'/api/deals/{deal.id}/payment-schedule/', [
            self.row('2831.45', 'USD', 10), self.row('2831.45', 'USD', 40), self.row('2831.45', 'USD', 70),
        ], format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(sum(p.amount for p in deal.payments.all()), Decimal('100003557.83'))

    def test_usd_cent_step_does_not_block_sum_contract(self, _):
        ExchangeRate.objects.filter(currency='USD').update(rate=Decimal('11772.95'))
        deal = self.book()
        # 252 000 000 сумов — это 21 405,0004… доллара: центами точно не набрать.
        # 21 405,00 USD дают 251 999 994,75 сума, расхождение меньше цента
        deal.contract_price = Decimal('252000000.00')
        deal.save()
        response = self.api.post(f'/api/deals/{deal.id}/payment-schedule/', [
            self.row('21405.00', 'USD'),
        ], format='json')
        self.assertEqual(response.status_code, 201, response.data)
        payment = deal.payments.get()
        self.assertEqual(payment.amount, Decimal('252000000.00'))
        self.assertEqual(payment.entered_amount, Decimal('21405.00'))

    def test_usd_gap_larger_than_a_cent_is_rejected(self, _):
        deal = self.book()
        deal.contract_price = Decimal('252000000.00')
        deal.save()
        response = self.api.post(f'/api/deals/{deal.id}/payment-schedule/', [
            self.row('20999.98', 'USD'),
        ], format='json')
        self.assertEqual(response.status_code, 400)

    def test_unchanged_rows_keep_entered_amount_on_edit(self, _):
        deal = self.book()
        deal.contract_price = Decimal('252000000.00')
        deal.save()
        self.api.post(f'/api/deals/{deal.id}/payment-schedule/', [
            self.row('7000', 'USD', 10), self.row('14000', 'USD', 40),
        ], format='json')
        first, second = deal.payments.order_by('due_date')
        # Правка: первая строка как есть (уже в сумах), у второй меняется срок
        response = self.api.post(f'/api/deals/{deal.id}/payment-schedule/', [
            self.row(first.amount, 'UZS', 10, id=first.id),
            self.row(second.amount, 'UZS', 50, id=second.id),
        ], format='json')
        self.assertEqual(response.status_code, 201, response.data)
        first.refresh_from_db()
        self.assertEqual((first.entered_amount, first.entered_currency), (Decimal('7000.00'), 'USD'))

    def test_currency_outside_supported_is_rejected(self, _):
        deal = self.book()
        deal.contract_price = Decimal('252000000.00')
        deal.save()
        response = self.api.post(f'/api/deals/{deal.id}/payment-schedule/', [
            self.row('252000000', 'EUR'),
        ], format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('не входит в поддерживаемые', response.data['error'])

    def test_deal_currency_cannot_be_changed_by_client(self, _):
        deal = self.book()
        self.api.patch(f'/api/deals/{deal.id}/', {'currency': 'USD'}, format='json')
        deal.refresh_from_db()
        self.assertEqual(deal.currency, 'UZS')

    def test_settings_require_exchange_rate_right(self, _):
        response = self.api.get('/api/finances/currency-settings/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['deal_currency'], 'UZS')
        response = self.api.patch('/api/finances/currency-settings/', {'deal_currency': 'USD'}, format='json')
        self.assertEqual(response.status_code, 403)

        role = self.user.profile.roles.first()
        role.permissions.add(*Permission.objects.filter(resource='EXCHANGE_RATE', action='EDIT', scope='COMPANY'))
        response = self.api.patch('/api/finances/currency-settings/',
                                  {'deal_currency': 'USD', 'supported_currencies': ['EUR']}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.company.refresh_from_db()
        self.assertEqual(self.company.deal_currency, 'USD')
        # Валюта сделок всегда входит в поддерживаемые
        self.assertEqual(self.company.supported_currencies, ['USD', 'EUR'])

    def test_manual_rate_belongs_to_company(self, _):
        role = self.user.profile.roles.first()
        role.permissions.add(*Permission.objects.filter(resource='EXCHANGE_RATE', action='ADD', scope='COMPANY'))
        response = self.api.post('/api/finances/exchange-rates/', {
            'currency': 'USD', 'date': self.today.isoformat(), 'rate': '12345.67'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        record = ExchangeRate.objects.get(pk=response.data['id'])
        self.assertEqual(record.company, self.company)
        self.assertEqual(get_rate('USD', self.today, self.company, fetch=False), Decimal('12345.67'))

    def test_dashboard_sales_are_converted_to_deal_currency(self, _):
        role = self.user.profile.roles.first()
        role.permissions.add(*Permission.objects.filter(resource='DASHBOARD', action='VIEW', scope='COMPANY'))
        # Старая сделка в долларах и новая в сумах, обе закрыты в этом месяце
        for price, currency in ((Decimal('1000'), 'USD'), (Decimal('5000000'), 'UZS')):
            Deal.objects.create(
                company=self.company, client=self.client_obj, property=self.property, created_by=self.user,
                booking_end_date=timezone.now(), initial_price=price, initial_price_per_sqm=Decimal('1'),
                contract_price=price, currency=currency, status=Deal.DealStatus.CLOSED_WON,
                closed_at=timezone.now(), contract_date=self.today,
            )
        response = self.api.get('/api/dashboard/analytics/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['kpi']['currency'], 'UZS')
        self.assertEqual(Decimal(response.data['kpi']['monthlySales']), Decimal('17000000.00'))


class LegacyDealsMixin:
    """Компания с прайсом в долларах и сделки, созданные до мультивалютности."""

    def setUp(self):
        self.today = timezone.localdate()
        cbu('USD', self.today, '12000')
        self.company = Company.objects.create(name='Андижан', code='AND', deal_currency='UZS')
        self.user = User.objects.create_user('mgr', password='pass-for-tests')
        project = Project.objects.create(name='ЖК', address='А', company=self.company, price_currency='USD')
        building = Building.objects.create(project=project, name='1', floors_count=9)
        self.property = Property.objects.create(building=building, property_type='APARTMENT', unit_number='1',
                                                floor=1, area=Decimal('50'), price=Decimal('21000'))
        self.client_obj = Client.objects.create(full_name='Клиент', company=self.company, created_by=self.user)
        self.ptype = PaymentType.objects.create(name='Рассрочка', company=self.company)
        self.account = BeneficiaryAccount.objects.create(name='Счёт', details='-', company=self.company)

    def legacy_deal(self, price='21000', payments=('7000', '7000', '7000'), **extra):
        deal = Deal.objects.create(
            company=self.company, client=self.client_obj, property=self.property, created_by=self.user,
            booking_end_date=timezone.now(), initial_price=Decimal(price), initial_price_per_sqm=Decimal('420'),
            contract_price=Decimal(price), currency='UZS', status=Deal.DealStatus.IN_PROGRESS, **extra,
        )
        for index, amount in enumerate(payments):
            Payment.objects.create(
                company=self.company, deal=deal, client=self.client_obj, amount=Decimal(amount), currency='UZS',
                payment_type=self.ptype, method='CASHLESS', beneficiary_account=self.account,
                due_date=self.today + timedelta(days=30 * (index + 1)),
                status=Payment.PaymentStatus.PAID if index == 0 else Payment.PaymentStatus.PENDING,
            )
        return deal

    def run_command(self, *args):
        out = io.StringIO()
        call_command('convert_deals_currency', '--company', str(self.company.id), '--assume-from', 'USD',
                     *args, stdout=out)
        return out.getvalue()


@NO_NETWORK
class ConvertDealsCurrencyTests(LegacyDealsMixin, TestCase):
    """Старые сделки: суммы в долларах с пометкой «сум» пересчитываются в сумы."""

    def test_legacy_deal_and_payments_are_converted_with_originals_kept(self, _):
        deal = self.legacy_deal()
        self.run_command('--apply')
        deal.refresh_from_db()
        self.assertEqual((deal.currency, deal.contract_price, deal.initial_price),
                         ('UZS', Decimal('252000000.00'), Decimal('252000000.00')))
        self.assertEqual((deal.catalog_price, deal.catalog_currency), (Decimal('21000.00'), 'USD'))
        paid = deal.payments.get(status=Payment.PaymentStatus.PAID)
        self.assertEqual((paid.amount, paid.currency, paid.entered_amount, paid.entered_currency),
                         (Decimal('84000000.00'), 'UZS', Decimal('7000.00'), 'USD'))
        self.assertTrue(deal.logs.filter(action__startswith='Сделка пересчитана из USD в UZS').exists())

    def test_dry_run_changes_nothing(self, _):
        deal = self.legacy_deal()
        output = self.run_command()
        deal.refresh_from_db()
        self.assertEqual((deal.currency, deal.contract_price), ('UZS', Decimal('21000.00')))
        self.assertIn('Пробный запуск', output)

    def test_second_run_does_not_convert_twice(self, _):
        deal = self.legacy_deal()
        self.run_command('--apply')
        self.run_command('--apply')
        deal.refresh_from_db()
        self.assertEqual(deal.contract_price, Decimal('252000000.00'))

    def test_rounding_tail_goes_to_last_unpaid_payment(self, _):
        ExchangeRate.objects.filter(currency='USD').update(rate=Decimal('11772.95'))
        deal = self.legacy_deal(price='10000.01', payments=('3333.33', '3333.34', '3333.34'))
        self.run_command('--apply')
        deal.refresh_from_db()
        self.assertEqual(sum(p.amount for p in deal.payments.all()), deal.contract_price)
        # Оплаченный платёж пересчитан ровно по курсу, хвост — на последнем неоплаченном
        paid = deal.payments.get(status=Payment.PaymentStatus.PAID)
        self.assertEqual(paid.amount, money(Decimal('3333.33') * Decimal('11772.95')))

    def test_deal_booked_from_usd_price_list_is_left_alone(self, _):
        # Сделка, созданная после того, как у проекта указали валюту прайса: уже в сумах
        deal = self.legacy_deal(price='252000000', payments=(), catalog_price=Decimal('21000'),
                                catalog_currency='USD', catalog_rate=Decimal('12000'))
        self.run_command('--apply')
        deal.refresh_from_db()
        self.assertEqual(deal.contract_price, Decimal('252000000.00'))

    def test_deal_with_sum_sized_amounts_is_skipped(self, _):
        deal = self.legacy_deal(price='252000000', payments=('252000000',))
        output = self.run_command('--apply')
        deal.refresh_from_db()
        self.assertEqual(deal.contract_price, Decimal('252000000.00'))
        self.assertIn('похоже, уже в UZS', output)


@LOCAL_CACHE
class InstallmentPlanApiTests(TestCase):
    """Условия рассрочки: читает вся компания, меняет тот, кто ведёт скидки."""

    def setUp(self):
        call_command('init_permissions', stdout=io.StringIO())
        self.company = Company.objects.create(name='А', code='A')
        self.other = Company.objects.create(name='Б', code='B')
        dept = Department.objects.create(company=self.company, name='Отдел', code='D1')
        self.role = Role.objects.create(name='Менеджер', code='SALES_MANAGER')
        self.role.permissions.set(Permission.objects.filter(resource='DISCOUNT', action='VIEW', scope='COMPANY'))
        user = User.objects.create_user('mgr', password='pass-for-tests')
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.company, profile.department = self.company, dept
        profile.save()
        profile.roles.set([self.role])
        self.api = APIClient()
        self.api.force_authenticate(User.objects.get(pk=user.pk))
        InstallmentPlan.objects.create(company=self.company, months=12, discount_percent=5, down_payment_percent=30)
        InstallmentPlan.objects.create(company=self.company, months=36, discount_percent=0, down_payment_percent=30,
                                       is_active=False)
        InstallmentPlan.objects.create(company=self.other, months=6, discount_percent=7)

    def grant(self, *actions):
        self.role.permissions.add(*Permission.objects.filter(resource='DISCOUNT', action__in=actions, scope='COMPANY'))

    def test_company_sees_only_its_active_terms(self):
        response = self.api.get('/api/finances/installment-plans/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['months'] for row in response.data], [12])
        response = self.api.get('/api/finances/installment-plans/?all=1')
        self.assertEqual([row['months'] for row in response.data], [12, 36])

    def test_changes_require_discount_rights(self):
        response = self.api.post('/api/finances/installment-plans/', {'months': 24, 'discount_percent': '3'},
                                 format='json')
        self.assertEqual(response.status_code, 403)
        self.grant('ADD', 'EDIT', 'DELETE')
        response = self.api.post('/api/finances/installment-plans/',
                                 {'months': 24, 'discount_percent': '3', 'down_payment_percent': '20'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(InstallmentPlan.objects.get(pk=response.data['id']).company, self.company)

    def test_duplicate_term_and_bad_values_are_rejected(self):
        self.grant('ADD')
        response = self.api.post('/api/finances/installment-plans/', {'months': 12}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('months', response.data)
        response = self.api.post('/api/finances/installment-plans/',
                                 {'months': 6, 'down_payment_percent': '100'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_other_company_term_cannot_be_changed(self):
        self.grant('EDIT', 'DELETE')
        foreign = InstallmentPlan.objects.get(company=self.other)
        self.assertEqual(self.api.patch(f'/api/finances/installment-plans/{foreign.id}/',
                                        {'discount_percent': '50'}, format='json').status_code, 404)
        self.assertEqual(self.api.delete(f'/api/finances/installment-plans/{foreign.id}/').status_code, 404)


@LOCAL_CACHE
class CbuFetchBackoffTests(TestCase):
    """Недоступный ЦБ не должен тормозить каждую бронь и каждый экран."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.day = timezone.localdate()

    def test_failed_fetch_is_not_retried_immediately(self):
        with mock.patch('apps.finances.currency.fetch_cbu_rates', side_effect=OSError('нет сети')) as fetch:
            for _ in range(3):
                with self.assertRaises(RateUnavailable):
                    get_rate('USD', self.day)
            self.assertEqual(fetch.call_count, 1)

    def test_rates_screen_tries_cbu_once_per_request(self):
        company = Company.objects.create(name='А', code='A', supported_currencies=['UZS', 'USD', 'EUR', 'RUB'])
        user = User.objects.create_user('viewer', password='pass-for-tests')
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.company = company
        profile.save()
        api = APIClient()
        api.force_authenticate(User.objects.get(pk=user.pk))
        with mock.patch('apps.finances.currency.fetch_cbu_rates', return_value=0) as fetch:
            response = api.get('/api/finances/exchange-rates/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(fetch.call_count, 1)
        self.assertIsNone(response.data['rates']['EUR']['rate'])


@NO_NETWORK
class RelabelGuardTests(LegacyDealsMixin, TestCase):
    """Смена пометки валюты не трогает сделки, суммы которых уже пересчитаны."""

    def relabel(self):
        call_command('relabel_currency', '--company', str(self.company.id), '--deals', 'USD', '--apply',
                     stdout=io.StringIO())

    def test_legacy_deal_and_its_payments_are_relabelled(self, _):
        deal = self.legacy_deal()
        self.relabel()
        deal.refresh_from_db()
        self.assertEqual(deal.currency, 'USD')
        self.assertEqual({p.currency for p in deal.payments.all()}, {'USD'})

    def test_converted_deal_keeps_its_label(self, _):
        deal = self.legacy_deal()
        self.run_command('--apply')
        self.relabel()
        deal.refresh_from_db()
        self.assertEqual((deal.currency, deal.contract_price), ('UZS', Decimal('252000000.00')))
        self.assertEqual({p.currency for p in deal.payments.all()}, {'UZS'})

    def test_deal_booked_from_usd_price_list_keeps_its_label(self, _):
        deal = self.legacy_deal(price='252000000', payments=(), catalog_price=Decimal('21000'),
                                catalog_currency='USD', catalog_rate=Decimal('12000'))
        self.relabel()
        deal.refresh_from_db()
        self.assertEqual(deal.currency, 'UZS')
