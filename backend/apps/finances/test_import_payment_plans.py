"""
Замена графиков платежей по файлу заказчика.

Графики в базе собраны неверно; правильные планы оплаты пришли файлом,
и он объявлен источником истины. Проверяем сопоставление, пересчёт
остатка округления, сроки и то, что без --apply база не меняется.
"""

import io
import os
import tempfile
from datetime import date, timedelta
from decimal import Decimal

import openpyxl
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from apps.crm.models import Client
from apps.deals.models import Deal, DealLog
from apps.finances.models import BeneficiaryAccount, Payment
from apps.realty.models import Building, Project, Property
from permissions.models import Company

HEADER = (['Номер договора', 'Номер помещения', 'Сумма по договору']
          + [f'{i}-платеж' for i in range(1, 20)] + ['ФИО по договору'])


def workbook(rows):
    """Файл того же вида, что прислал заказчик."""
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.append(HEADER)
    for row in rows:
        sheet.append(row)
    handle, path = tempfile.mkstemp(suffix='.xlsx')
    os.close(handle)
    book.save(path)
    return path


def plan(number, unit, total, down, monthly, name='Клиент', count=18):
    """Строка файла: взнос и равные ежемесячные платежи, остаток — нулями."""
    amounts = [down] + [monthly] * count
    amounts += [0] * (19 - len(amounts))
    return [number, unit, total] + amounts + [name]


@override_settings(
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class ImportPaymentPlansTests(TestCase):

    def setUp(self):
        self.company = Company.objects.create(name='Джахон Бозор', code='JB')
        self.other = Company.objects.create(name='Другая', code='OTHER')
        project = Project.objects.create(name='ЖК', address='Ташкент', company=self.company)
        self.building = Building.objects.create(project=project, name='1', floors_count=3)
        self.account = BeneficiaryAccount.objects.create(
            name='Счёт', details='-', company=self.company)
        self.client_obj = Client.objects.create(full_name='Клиент', company=self.company)
        self.files = []

    def tearDown(self):
        for path in self.files:
            for suffix in ('', '.backup.json'):
                try:
                    os.remove(path + suffix)
                except OSError:
                    pass

    def file(self, rows):
        path = workbook(rows)
        self.files.append(path)
        return path

    def deal(self, number, unit, price, schedule=(), contract_date=None):
        prop = Property.objects.create(
            building=self.building, property_type='COMMERCIAL', unit_number=unit,
            floor=1, area=Decimal('40.00'), price=Decimal(price))
        deal = Deal.objects.create(
            company=self.company, client=self.client_obj, property=prop,
            initial_price=Decimal(price), initial_price_per_sqm=Decimal('1000000'),
            contract_number=number, contract_price=Decimal(price),
            contract_date=contract_date or date(2026, 1, 10))
        for amount, due_date, status in schedule:
            Payment.objects.create(
                deal=deal, client=self.client_obj, company=self.company,
                amount=Decimal(amount), currency='UZS', due_date=due_date,
                method=Payment.PaymentMethod.CASHLESS, beneficiary_account=self.account,
                status=status)
        return deal

    def run_import(self, path, *extra):
        out = io.StringIO()
        call_command('import_payment_plans', path, '--company', 'JB', *extra, stdout=out)
        return out.getvalue()

    def amounts(self, deal):
        return [p.amount for p in deal.payments.order_by('due_date', 'id')]

    def dates(self, deal):
        return [p.due_date for p in deal.payments.order_by('due_date', 'id')]

    # --- сопоставление ---------------------------------------------------

    def test_dry_run_changes_nothing(self):
        deal = self.deal('5', 'А-1,01', '360000000',
                         [('360000000', date(2026, 2, 1), Payment.PaymentStatus.PENDING)])
        path = self.file([plan(5, 'А-1,01', 360000000, 108000000, 14000000)])

        report = self.run_import(path)

        self.assertIn('Сделок к обновлению: 1', report)
        self.assertIn('база не изменена', report)
        self.assertEqual(self.amounts(deal), [Decimal('360000000.00')])
        self.assertFalse(os.path.exists(path + '.backup.json'))

    def test_schedule_is_replaced(self):
        deal = self.deal('5', 'А-1,01', '360000000',
                         [('360000000', date(2026, 2, 1), Payment.PaymentStatus.PENDING)])
        path = self.file([plan(5, 'А-1,01', 360000000, 108000000, 14000000)])

        self.run_import(path, '--apply')

        amounts = self.amounts(deal)
        self.assertEqual(len(amounts), 19)
        self.assertEqual(amounts[0], Decimal('108000000.00'))
        self.assertEqual(set(amounts[1:]), {Decimal('14000000.00')})
        self.assertEqual(sum(amounts), Decimal('360000000.00'))

    def test_rounding_tail_goes_to_the_last_payment(self):
        # 119 160 000 + 18 x 15 446 667 = 397 200 006, а договор на 397 200 000
        deal = self.deal('9', 'Б-1,77', '397200000',
                         [('397200000', date(2026, 3, 5), Payment.PaymentStatus.PENDING)])
        path = self.file([plan(9, 'Б-1,77', 397200000, 119160000, 15446667)])

        self.run_import(path, '--apply')

        amounts = self.amounts(deal)
        self.assertEqual(sum(amounts), Decimal('397200000.00'))
        self.assertEqual(amounts[-1], Decimal('15446661.00'))

    def test_full_payment_row_becomes_a_single_payment(self):
        # В файле стопроцентная оплата записана как платёж и восемнадцать нулей
        deal = self.deal('373', 'B-2,126', '296856000',
                         [('296856000', date(2026, 4, 1), Payment.PaymentStatus.PENDING)])
        path = self.file([[373, 'B-2,126', 296856000, 296856000] + [0] * 18 + ['Клиент']])

        self.run_import(path, '--apply')

        self.assertEqual(self.amounts(deal), [Decimal('296856000.00')])

    def test_dates_come_from_the_existing_schedule_then_continue_monthly(self):
        deal = self.deal('5', 'А-1,01', '360000000', [
            ('100000000', date(2026, 1, 31), Payment.PaymentStatus.PENDING),
            ('260000000', date(2026, 5, 20), Payment.PaymentStatus.PENDING),
        ])
        path = self.file([plan(5, 'А-1,01', 360000000, 108000000, 14000000)])

        self.run_import(path, '--apply')

        dates = self.dates(deal)
        self.assertEqual(dates[0], date(2026, 1, 31))
        self.assertEqual(dates[1], date(2026, 5, 20))
        # Дальше — помесячно от последнего известного срока
        self.assertEqual(dates[2], date(2026, 6, 20))
        self.assertEqual(dates[3], date(2026, 7, 20))
        self.assertEqual(len(dates), 19)

    def test_deal_without_payments_counts_from_the_contract_date(self):
        deal = self.deal('5', 'А-1,01', '360000000', contract_date=date(2026, 1, 31))
        path = self.file([plan(5, 'А-1,01', 360000000, 108000000, 14000000)])

        self.run_import(path, '--apply')

        dates = self.dates(deal)
        self.assertEqual(dates[0], date(2026, 1, 31))
        # Короткий месяц обрезается по последнему дню
        self.assertEqual(dates[1], date(2026, 2, 28))
        self.assertEqual(dates[2], date(2026, 3, 31))

    def test_contract_price_is_taken_from_the_file(self):
        deal = self.deal('5', 'А-1,01', '300000000',
                         [('300000000', date(2026, 2, 1), Payment.PaymentStatus.PENDING)])
        path = self.file([plan(5, 'А-1,01', 360000000, 108000000, 14000000)])

        self.run_import(path, '--apply')

        deal.refresh_from_db()
        self.assertEqual(deal.contract_price, Decimal('360000000.00'))
        self.assertEqual(sum(self.amounts(deal)), Decimal('360000000.00'))
        self.assertTrue(deal.logs.filter(action__contains='Стоимость по договору').exists())

    # --- пропуски --------------------------------------------------------

    def test_unknown_contract_number_is_skipped(self):
        path = self.file([plan(777, 'А-1,01', 360000000, 108000000, 14000000)])

        report = self.run_import(path, '--apply')

        self.assertIn('Пропущено строк: 1', report)
        self.assertIn('не найдена', report)

    def test_unit_mismatch_is_skipped(self):
        self.deal('5', 'А-1,01', '360000000',
                  [('360000000', date(2026, 2, 1), Payment.PaymentStatus.PENDING)])
        path = self.file([plan(5, 'Б-1,99', 360000000, 108000000, 14000000)])

        report = self.run_import(path, '--apply')

        self.assertIn('Пропущено строк: 1', report)
        self.assertIn('а в файле Б-1,99', report)

    def test_cyrillic_and_latin_letters_are_not_mixed_up(self):
        # В файле соседствуют дома «Б» и «B» — склеивать их нельзя
        self.deal('11', 'Б-1,166', '360000000',
                  [('360000000', date(2026, 2, 1), Payment.PaymentStatus.PENDING)])
        path = self.file([plan(11, 'B-1,166', 360000000, 108000000, 14000000)])

        report = self.run_import(path, '--apply')

        self.assertIn('Пропущено строк: 1', report)

    def test_deal_of_another_company_is_not_touched(self):
        prop = Property.objects.create(
            building=self.building, property_type='COMMERCIAL', unit_number='А-1,01',
            floor=1, area=Decimal('40.00'), price=Decimal('360000000'))
        foreign = Deal.objects.create(
            company=self.other, client=self.client_obj, property=prop,
            initial_price=Decimal('360000000'), initial_price_per_sqm=Decimal('1000000'),
            contract_number='5', contract_price=Decimal('360000000'),
            contract_date=date(2026, 1, 10))
        path = self.file([plan(5, 'А-1,01', 360000000, 108000000, 14000000)])

        report = self.run_import(path, '--apply')

        self.assertIn('Пропущено строк: 1', report)
        foreign.refresh_from_db()
        self.assertEqual(foreign.contract_price, Decimal('360000000'))

    def test_unknown_company_stops_the_command(self):
        path = self.file([plan(5, 'А-1,01', 360000000, 108000000, 14000000)])
        with self.assertRaises(CommandError):
            call_command('import_payment_plans', path, '--company', 'NOPE', stdout=io.StringIO())

    # --- проведённые платежи и возврат -----------------------------------

    def test_paid_payments_are_overwritten_and_reported(self):
        deal = self.deal('5', 'А-1,01', '360000000', [
            ('90000000', date(2026, 2, 1), Payment.PaymentStatus.PAID),
            ('270000000', date(2026, 3, 1), Payment.PaymentStatus.PENDING),
        ])
        path = self.file([plan(5, 'А-1,01', 360000000, 108000000, 14000000)])

        report = self.run_import(path, '--apply')

        self.assertIn('Затронуты платежи, по которым прошли деньги', report)
        paid = deal.payments.order_by('due_date', 'id').first()
        self.assertEqual(paid.amount, Decimal('108000000.00'))
        # Отметка об оплате сохраняется: деньги всё-таки приходили
        self.assertEqual(paid.status, Payment.PaymentStatus.PAID)

    def test_backup_holds_the_previous_schedule(self):
        deal = self.deal('5', 'А-1,01', '300000000', [
            ('100000000', date(2026, 2, 1), Payment.PaymentStatus.PAID),
            ('200000000', date(2026, 3, 1), Payment.PaymentStatus.PENDING),
        ])
        path = self.file([plan(5, 'А-1,01', 360000000, 108000000, 14000000)])

        self.run_import(path, '--apply')

        import json
        with io.open(path + '.backup.json', encoding='utf-8') as stream:
            dump = json.load(stream)
        saved = dump['deals'][0]
        self.assertEqual(saved['deal_id'], deal.id)
        self.assertEqual(saved['contract_price'], '300000000.00')
        self.assertEqual([p['amount'] for p in saved['payments']],
                         ['100000000.00', '200000000.00'])
        self.assertEqual(saved['payments'][0]['status'], Payment.PaymentStatus.PAID)

    def test_extra_rows_are_removed_and_logged(self):
        deal = self.deal('373', 'B-2,126', '296856000', [
            ('100000000', date(2026, 2, 1), Payment.PaymentStatus.PENDING),
            ('196856000', date(2026, 3, 1), Payment.PaymentStatus.PENDING),
        ])
        path = self.file([[373, 'B-2,126', 296856000, 296856000] + [0] * 18 + ['Клиент']])

        self.run_import(path, '--apply')

        self.assertEqual(deal.payments.count(), 1)
        self.assertTrue(DealLog.objects.filter(
            deal=deal, action__contains='График платежей заменён').exists())

    def test_overdue_status_follows_the_new_due_date(self):
        past = date.today() - timedelta(days=30)
        deal = self.deal('5', 'А-1,01', '360000000',
                         [('360000000', past, Payment.PaymentStatus.PENDING)])
        path = self.file([plan(5, 'А-1,01', 360000000, 108000000, 14000000)])

        self.run_import(path, '--apply')

        first = deal.payments.order_by('due_date', 'id').first()
        self.assertEqual(first.status, Payment.PaymentStatus.OVERDUE)

    def test_limit_processes_only_the_first_rows(self):
        self.deal('5', 'А-1,01', '360000000',
                  [('360000000', date(2026, 2, 1), Payment.PaymentStatus.PENDING)])
        self.deal('6', 'А-1,02', '360000000',
                  [('360000000', date(2026, 2, 1), Payment.PaymentStatus.PENDING)])
        path = self.file([
            plan(5, 'А-1,01', 360000000, 108000000, 14000000),
            plan(6, 'А-1,02', 360000000, 108000000, 14000000),
        ])

        report = self.run_import(path, '--limit', '1')

        self.assertIn('Строк в файле: 1', report)
        self.assertIn('Сделок к обновлению: 1', report)
