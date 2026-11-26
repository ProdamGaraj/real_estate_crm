"""
Формирование договора по шаблону.

Метка {{client.phone_number}} описана в справке по меткам и в инструкциях,
но телефон клиента давно хранится отдельной таблицей — метка подставляла
пустоту. Тест закрепляет, что в договор попадает основной номер клиента.
"""

import io
import shutil
import tempfile
from datetime import timedelta
from decimal import Decimal
from urllib.parse import unquote

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from docx import Document
from rest_framework.test import APIClient

from apps.crm.models import Client, ClientPhoneNumber
from apps.deals.models import Deal
from apps.realty.models import Building, Project, Property
from permissions.models import Company, UserProfile

from .models import Template

User = get_user_model()
MEDIA_ROOT = tempfile.mkdtemp(prefix='crm-test-media-')


def docx_bytes(text):
    doc = Document()
    doc.add_paragraph(text)
    stream = io.BytesIO()
    doc.save(stream)
    return stream.getvalue()


def docx_text(content):
    return '\n'.join(p.text for p in Document(io.BytesIO(content)).paragraphs)


@override_settings(
    MEDIA_ROOT=MEDIA_ROOT,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class GenerateDocumentBase(TestCase):
    """Сделка и шаблон для проверок формирования договора."""

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.company = Company.objects.create(name='Компания', code='DOCS')
        self.user = User.objects.create_superuser('admin', 'admin@example.com', 'pass-for-tests')
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.company = self.company
        profile.is_system_admin = True
        profile.save()
        self.api = APIClient()
        self.api.force_authenticate(self.user)

        project = Project.objects.create(name='ЖК Тест', address='Ташкент', company=self.company)
        building = Building.objects.create(project=project, name='1', floors_count=9)
        prop = Property.objects.create(
            building=building, property_type='APARTMENT', unit_number='12', floor=3,
            area=Decimal('50.00'), price=Decimal('500000000'),
        )
        self.client_obj = Client.objects.create(full_name='Иванов Иван', company=self.company)
        self.deal = Deal.objects.create(
            company=self.company, client=self.client_obj, property=prop,
            initial_price=Decimal('500000000'), initial_price_per_sqm=Decimal('10000000'),
            contract_number='Д-1', contract_date=timezone.now().date(), created_by=self.user,
        )
        self.template = Template.objects.create(
            name='Договор', company=self.company,
            file=SimpleUploadedFile('contract.docx', docx_bytes('Телефон: {{client.phone_number}}')),
        )
        self.url = f'/api/deals/{self.deal.id}/generate-document/{self.template.id}/'

    def generate(self):
        response = self.api.get(self.url)
        self.assertEqual(response.status_code, 200, getattr(response, 'data', None))
        return docx_text(response.content)


class GenerateDocumentPhoneTests(GenerateDocumentBase):
    def test_primary_phone_is_substituted(self):
        ClientPhoneNumber.objects.create(client=self.client_obj, phone_number='90 111 22 33')
        ClientPhoneNumber.objects.create(client=self.client_obj, phone_number='+998 93 444 55 66', is_primary=True)
        self.assertIn('Телефон: +998934445566', self.generate())

    def test_first_phone_when_none_is_primary(self):
        ClientPhoneNumber.objects.create(client=self.client_obj, phone_number='90 111 22 33')
        ClientPhoneNumber.objects.create(client=self.client_obj, phone_number='93 444 55 66')
        self.assertIn('Телефон: +998901112233', self.generate())

    def test_client_without_phone_gets_empty_value(self):
        self.assertIn('Телефон: ', self.generate())


class AmountWordsTests(TestCase):
    """Сумма прописью, разряды и даты для меток договора."""

    def test_russian_numbers_agree_in_gender_and_case(self):
        from .formatting import number_words_ru
        self.assertEqual(number_words_ru(0), 'ноль')
        self.assertEqual(number_words_ru(21000), 'двадцать одна тысяча')
        self.assertEqual(number_words_ru(22000), 'двадцать две тысячи')
        self.assertEqual(number_words_ru(111000), 'сто одиннадцать тысяч')
        self.assertEqual(number_words_ru(2500001), 'два миллиона пятьсот тысяч один')
        self.assertEqual(
            number_words_ru(247231950),
            'двести сорок семь миллионов двести тридцать одна тысяча девятьсот пятьдесят',
        )

    def test_currency_forms(self):
        from .formatting import amount_words
        self.assertEqual(amount_words('140583150.54'),
                         'сто сорок миллионов пятьсот восемьдесят три тысячи сто пятьдесят сумов 54 тийина')
        self.assertEqual(amount_words(1, 'USD'), 'один доллар США')
        self.assertEqual(amount_words('21000.01', 'USD'), 'двадцать одна тысяча долларов США 01 цент')
        self.assertEqual(amount_words(None), '')

    def test_uzbek(self):
        from .formatting import amount_words_uz
        self.assertEqual(amount_words_uz('1250000'), "bir million ikki yuz ellik ming so'm")
        self.assertEqual(amount_words_uz(12840, 'USD'), "o'n ikki ming sakkiz yuz qirq AQSH dollari")

    def test_money_and_dates(self):
        from datetime import date
        from .formatting import NBSP, date_short, date_text, money
        self.assertEqual(money(Decimal('247231950.00')), f'247{NBSP}231{NBSP}950')
        self.assertEqual(money('140583150.54'), f'140{NBSP}583{NBSP}150,54')
        from .formatting import number
        self.assertEqual(number(Decimal('48.00')), '48')
        self.assertEqual(number(Decimal('120.50')), '120,5')
        self.assertEqual(date_short(date(2026, 10, 9)), '09.10.2026')
        self.assertEqual(date_text(date(2026, 10, 9)), '9 октября 2026 г.')


class GenerateDocumentFiltersTests(GenerateDocumentBase):
    """Фильтры и график в шаблоне; опечатка в метке — понятная ошибка, а не 500."""

    def use_template(self, text):
        self.template.file = SimpleUploadedFile('contract2.docx', docx_bytes(text))
        self.template.save()

    def test_price_in_words_and_dates(self):
        self.deal.contract_price = Decimal('247231950.00')
        self.deal.contract_date = timezone.datetime(2026, 10, 9).date()
        self.deal.save()
        self.use_template('{{ deal.contract_price|money }} ({{ deal.contract_price|amount_words }}), '
                          '{{ deal.contract_date|date }}, {{ deal.contract_date|date_text }}')
        text = self.generate().replace(' ', ' ')
        self.assertIn('247 231 950 (двести сорок семь миллионов двести тридцать одна тысяча '
                      'девятьсот пятьдесят сумов), 09.10.2026, 9 октября 2026 г.', text)

    def test_payment_schedule_loop(self):
        from apps.finances.models import BeneficiaryAccount, Payment, PaymentType
        ptype = PaymentType.objects.create(name='Рассрочка', company=self.company)
        account = BeneficiaryAccount.objects.create(name='Счёт', details='-', company=self.company)
        for days, amount in ((30, '1000000'), (0, '2000000')):
            Payment.objects.create(deal=self.deal, client=self.client_obj, company=self.company,
                                   amount=Decimal(amount), currency='UZS', payment_type=ptype,
                                   beneficiary_account=account,
                                   due_date=timezone.localdate() + timedelta(days=days))
        self.use_template('{% for p in payments %}{{ p.amount|money }};{% endfor %}')
        # По сроку: сначала платёж «сегодня», потом через месяц
        self.assertIn('2 000 000;1 000 000;', self.generate())

    def test_empty_field_is_blank_not_none(self):
        self.deal.contract_number = None
        self.deal.save()
        self.use_template('Договор №[{{ deal.contract_number }}], выдан [{{ client.passport_issued_date|date }}]')
        self.assertIn('Договор №[], выдан []', self.generate())

    def test_broken_tag_returns_readable_error(self):
        self.use_template('{{ deal.contract_price|no_such_filter }}')
        response = self.api.get(self.url)
        self.assertEqual(response.status_code, 400)
        self.assertIn('Ошибка в метках шаблона', response.data['error'])

    def test_payment_schedule_table(self):
        # Как в шпаргалке: строка с {%tr for %}, строка платежа, строка {%tr endfor %}
        from apps.finances.models import BeneficiaryAccount, Payment, PaymentType
        ptype = PaymentType.objects.create(name='Первый взнос', company=self.company)
        account = BeneficiaryAccount.objects.create(name='Счёт', details='-', company=self.company)
        for days, amount in ((0, '3000000'), (30, '1500000.50')):
            Payment.objects.create(deal=self.deal, client=self.client_obj, company=self.company,
                                   amount=Decimal(amount), currency='UZS', payment_type=ptype,
                                   beneficiary_account=account,
                                   due_date=timezone.localdate() + timedelta(days=days))
        doc = Document()
        table = doc.add_table(rows=3, cols=3)
        table.cell(0, 0).text = '{%tr for p in payments %}'
        table.cell(1, 0).text = '{{ loop.index }}'
        table.cell(1, 1).text = '{{ p.amount|money }}'
        table.cell(1, 2).text = '{{ p.payment_type.name }}'
        table.cell(2, 0).text = '{%tr endfor %}'
        stream = io.BytesIO()
        doc.save(stream)
        self.template.file = SimpleUploadedFile('table.docx', stream.getvalue())
        self.template.save()

        response = self.api.get(self.url)
        self.assertEqual(response.status_code, 200, getattr(response, 'data', None))
        rows = [[cell.text for cell in row.cells] for row in Document(io.BytesIO(response.content)).tables[0].rows]
        self.assertEqual(rows, [
            ['1', '3 000 000', 'Первый взнос'],
            ['2', '1 500 000,50', 'Первый взнос'],
        ])

    def test_uzbek_cyrillic_phones_and_first_payment(self):
        # Шаблон закалата: сумма прописью кириллицей, оба телефона, закалат — первый платёж
        from apps.finances.models import BeneficiaryAccount, Payment, PaymentType
        ClientPhoneNumber.objects.create(client=self.client_obj, phone_number='93 971 88 11')
        ClientPhoneNumber.objects.create(client=self.client_obj, phone_number='90 111 22 33', is_primary=True)
        ptype = PaymentType.objects.create(name='Закалат', company=self.company)
        account = BeneficiaryAccount.objects.create(name='Счёт', details='-', company=self.company)
        for days, amount in ((10, '94000000'), (0, '6000000')):
            Payment.objects.create(deal=self.deal, client=self.client_obj, company=self.company,
                                   amount=Decimal(amount), currency='UZS', payment_type=ptype,
                                   beneficiary_account=account,
                                   due_date=timezone.localdate() + timedelta(days=days))
        self.deal.contract_price = Decimal('100000000')
        self.deal.save()
        self.use_template('{{ deal.contract_price|money }} ({{ deal.contract_price|words_uz_cyr }}) сўм; '
                          '{{ first_payment.amount|money }} ({{ first_payment.amount|words_uz_cyr }}) сўм; '
                          'Тел: {{ client.all_phones }}')
        text = self.generate().replace(' ', ' ')
        self.assertIn('100 000 000 (юз миллион) сўм; 6 000 000 (олти миллион) сўм; '
                      'Тел: +998901112233 / +998939718811', text)


class GenerateBookingDocumentTests(GenerateDocumentBase):
    """
    Договор брони — свой документ со своими метками: срок в днях, даты
    брони, цена на момент брони и взнос. Шаблоны сделки и брони не
    смешиваются: иначе в брони печатался договор долевого участия.
    """

    def setUp(self):
        super().setUp()
        from apps.deals.models import Booking
        from apps.finances.models import BeneficiaryAccount, Payment

        self.company.booking_fee_amount = Decimal('1000000')
        self.account = BeneficiaryAccount.objects.create(name='Счёт', details='-', company=self.company)
        self.company.booking_fee_account = self.account
        self.company.min_booking_days = 1
        self.company.save()

        self.booking = Booking.objects.create(
            company=self.company, client=self.client_obj, property=self.deal.property,
            status=Booking.BookingStatus.ACTIVE, duration_days=5,
            start_date=timezone.now(), end_date=timezone.now() + timedelta(days=5),
            price=Decimal('40500.00'), currency='USD', contract_number='Б-1',
            contract_date=timezone.localdate(), created_by=self.user,
        )
        self.fee = Payment.objects.create(
            company=self.company, booking=self.booking, client=self.client_obj,
            amount=Decimal('1000000'), currency='UZS', beneficiary_account=self.account,
            method='CASHLESS', due_date=timezone.localdate(),
        )
        self.booking_template = Template.objects.create(
            name='Договор брони', company=self.company, kind=Template.Kind.BOOKING,
            file=SimpleUploadedFile('booking.docx', docx_bytes(
                'Бронь №{{ booking.contract_number }} на {{ booking.duration_days }} дн., '
                'цена {{ booking.price|money }} {{ booking.currency }}, '
                'взнос {{ fee.amount|money }} ({{ fee.amount|amount_words }})'
            )),
        )

    def booking_url(self, template=None):
        template = template or self.booking_template
        return f'/api/bookings/{self.booking.id}/generate-document/{template.id}/'

    def test_booking_contract_prints_term_price_and_fee(self):
        response = self.api.get(self.booking_url())
        self.assertEqual(response.status_code, 200, getattr(response, 'data', None))
        text = docx_text(response.content).replace(' ', ' ')
        self.assertIn('Бронь №Б-1 на 5 дн., цена 40 500 USD, '
                      'взнос 1 000 000 (один миллион сумов)', text)

    def test_available_templates_are_split_by_kind(self):
        booking_list = self.api.get(f'/api/bookings/{self.booking.id}/available-templates/').data
        self.assertEqual([row['id'] for row in booking_list], [self.booking_template.id])
        deal_list = self.api.get(f'/api/deals/{self.deal.id}/available-templates/').data
        self.assertEqual([row['id'] for row in deal_list], [self.template.id])

    def test_deal_template_is_not_printed_for_a_booking(self):
        response = self.api.get(self.booking_url(self.template))
        self.assertEqual(response.status_code, 404)

    def test_booking_template_is_not_printed_for_a_deal(self):
        response = self.api.get(
            f'/api/deals/{self.deal.id}/generate-document/{self.booking_template.id}/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('договор брони', response.data['error'])

    def test_cancelled_booking_prints_nothing(self):
        from apps.deals.models import Booking

        Booking.objects.filter(pk=self.booking.pk).update(status=Booking.BookingStatus.CANCELLED)
        response = self.api.get(self.booking_url())
        self.assertEqual(response.status_code, 400)
        self.assertIn('документы по ней больше не формируются', response.data['error'])


@override_settings(
    MEDIA_ROOT=MEDIA_ROOT,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class ProtectedMediaDownloadTests(TestCase):
    """
    Скачивание файла шаблона.

    Имена файлов у нас кириллические. В продакшене файл отдаёт nginx по
    заголовку X-Accel-Redirect, а Django не-ASCII заголовок кодирует в
    MIME-вид (=?utf-8?b?..) — nginx такой URI не разбирает и отвечает 404.
    Поэтому путь в заголовке обязан быть percent-encoded.
    """

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.company = Company.objects.create(name='Компания', code='MEDIA')
        self.template = Template.objects.create(
            name='Договор инвестиции', company=self.company,
            file=SimpleUploadedFile(
                'Шаблон-Договор-инвестиции-YANGI-JAHON.docx',
                docx_bytes('{{client.full_name}}'),
            ),
        )

    def media_url(self):
        from real_estate_project.media_access import build_media_url

        return build_media_url(self.template.file)

    def test_link_from_api_is_signed(self):
        self.assertIn('token=', self.media_url())

    @override_settings(MEDIA_USE_ACCEL_REDIRECT=True)
    def test_accel_redirect_path_is_percent_encoded(self):
        response = self.client.get(self.media_url())

        self.assertEqual(response.status_code, 200)
        location = response['X-Accel-Redirect']
        # Заголовок ушёл как есть, без MIME-обёртки
        self.assertNotIn('=?utf-8?', location)
        location.encode('ascii')
        self.assertTrue(location.startswith('/protected-media/templates/'))
        # nginx распакует %XX обратно в имя файла на диске
        self.assertEqual(unquote(location), '/protected-media/' + self.template.file.name)
        self.assertEqual(
            response['Content-Type'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )

    @override_settings(MEDIA_USE_ACCEL_REDIRECT=False)
    def test_file_is_served_directly_without_nginx(self):
        response = self.client.get(self.media_url())

        self.assertEqual(response.status_code, 200)
        self.assertTrue(b''.join(response.streaming_content).startswith(b'PK'))

    @override_settings(MEDIA_USE_ACCEL_REDIRECT=True)
    def test_without_token_file_is_not_given_away(self):
        response = self.client.get(self.template.file.url)

        self.assertEqual(response.status_code, 403)


@override_settings(
    MEDIA_ROOT=MEDIA_ROOT,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class ManagerPrintsContractTests(TestCase):
    """
    Менеджер печатает договор по своей сделке.

    Право TEMPLATE управляет справочником шаблонов в настройках: менеджеру
    шаблоны заводит администратор, своих у менеджера нет. Пока печать
    фильтровалась по области этого права, менеджер с типовой ролью получал
    403, а с правом TEMPLATE/OWN — пустой список и 404 «Шаблон не найден
    или недоступен» на кнопке «Сформировать».
    """

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        from django.core.management import call_command
        from permissions.models import Department, Permission, Role

        call_command('init_permissions', stdout=io.StringIO())
        self.company = Company.objects.create(name='Продажи', code='PRINT')
        self.foreign = Company.objects.create(name='Служебная', code='PRINTSYS')
        department = Department.objects.create(company=self.company, name='Отдел', code='PD1')

        # Типовая роль менеджера: прав на шаблоны в ней нет вовсе
        self.role = Role.objects.create(name='Менеджер', code='PRINT_MANAGER')
        self.role.permissions.set(Role.objects.get(code='MANAGER').permissions.all())
        self.permission_model = Permission

        self.user = User.objects.create_user('manager-print', password='pass-for-tests')
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.company, profile.department = self.company, department
        profile.save()
        profile.roles.set([self.role])
        self.user = User.objects.get(pk=self.user.pk)
        self.api = APIClient()
        self.api.force_authenticate(self.user)

        project = Project.objects.create(name='ЖК', address='Ташкент', company=self.company)
        building = Building.objects.create(project=project, name='1', floors_count=9)
        prop = Property.objects.create(
            building=building, property_type='APARTMENT', unit_number='1', floor=1,
            area=Decimal('50.00'), price=Decimal('100000000'),
        )
        client = Client.objects.create(
            full_name='Клиент', company=self.company, created_by=self.user)
        self.deal = Deal.objects.create(
            company=self.company, client=client, property=prop,
            initial_price=Decimal('100000000'), initial_price_per_sqm=Decimal('2000000'),
            contract_number='Д-1', contract_date=timezone.now().date(), created_by=self.user,
        )
        self.template = Template.objects.create(
            name='Инвестиционный договор', company=self.company, created_by=None,
            file=SimpleUploadedFile('tpl.docx', docx_bytes('{{client.full_name}}')),
        )

    def add_template_permission(self, scope):
        self.role.permissions.add(self.permission_model.objects.get(
            action='VIEW', resource='TEMPLATE', scope=scope))

    def list_url(self):
        return f'/api/deals/{self.deal.id}/available-templates/'

    def generate_url(self, template=None):
        template = template or self.template
        return f'/api/deals/{self.deal.id}/generate-document/{template.id}/'

    def test_typical_manager_role_prints_without_template_rights(self):
        response = self.api.get(self.list_url())
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['id'] for row in response.data], [self.template.id])

        document = self.api.get(self.generate_url())
        self.assertEqual(document.status_code, 200)
        self.assertIn('Клиент', docx_text(document.content))

    def test_template_right_with_own_scope_does_not_hide_the_template(self):
        # Самый частый перекос настройки: менеджеру дали VIEW TEMPLATE/OWN,
        # своих шаблонов у него нет — и список оказывался пустым
        self.add_template_permission('OWN')

        self.assertEqual([row['id'] for row in self.api.get(self.list_url()).data],
                         [self.template.id])
        self.assertEqual(self.api.get(self.generate_url()).status_code, 200)

    def test_template_of_another_company_stays_hidden(self):
        foreign = Template.objects.create(
            name='Чужой договор', company=self.foreign,
            file=SimpleUploadedFile('foreign.docx', docx_bytes('x')),
        )

        self.assertNotIn(foreign.id, [row['id'] for row in self.api.get(self.list_url()).data])
        self.assertEqual(self.api.get(self.generate_url(foreign)).status_code, 404)

    def test_system_wide_template_is_printable(self):
        shared = Template.objects.create(
            name='Общий договор', company=None,
            file=SimpleUploadedFile('shared.docx', docx_bytes('{{client.full_name}}')),
        )

        self.assertIn(shared.id, [row['id'] for row in self.api.get(self.list_url()).data])
        self.assertEqual(self.api.get(self.generate_url(shared)).status_code, 200)

    def test_deal_of_another_manager_is_still_refused(self):
        # Печать перестала требовать прав на шаблоны, но доступ к сделке
        # по-прежнему обязателен
        other = User.objects.create_user('manager-other', password='pass-for-tests')
        other_profile, _ = UserProfile.objects.get_or_create(user=other)
        other_profile.company = self.company
        other_profile.save()
        other_profile.roles.set([self.role])
        self.api.force_authenticate(User.objects.get(pk=other.pk))

        self.assertEqual(self.api.get(self.generate_url()).status_code, 403)

    def test_manager_still_cannot_manage_the_reference_book(self):
        self.assertEqual(self.api.get('/api/templates/').status_code, 403)
        self.assertEqual(
            self.api.delete(f'/api/templates/{self.template.id}/').status_code, 403)

    def test_diagnostic_command_explains_access(self):
        from django.core.management import call_command

        Template.objects.create(
            name='Чужой договор', company=self.foreign,
            file=SimpleUploadedFile('foreign2.docx', docx_bytes('x')),
        )
        out = io.StringIO()
        call_command('check_templates', 'manager-print', '--deal', str(self.deal.id), stdout=out)
        report = out.getvalue()

        self.assertIn('Инвестиционный договор', report)
        self.assertIn('шаблон другой компании', report)
        self.assertIn('Продажи', report)

    def test_system_scope_right_still_opens_other_companies(self):
        # У роли «Администратор компании» право на шаблоны выдано с областью
        # «Вся система»: по ней видны шаблоны всех компаний. Фильтрация
        # только по компании отобрала бы этот доступ
        foreign = Template.objects.create(
            name='Шаблон другой компании', company=self.foreign,
            file=SimpleUploadedFile('sys.docx', docx_bytes('{{client.full_name}}')),
        )
        self.add_template_permission('SYSTEM')

        self.assertIn(foreign.id, [row['id'] for row in self.api.get(self.list_url()).data])
        self.assertEqual(self.api.get(self.generate_url(foreign)).status_code, 200)


@override_settings(
    MEDIA_ROOT=MEDIA_ROOT,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class EditTemplateTests(TestCase):
    """
    Правка заведённого шаблона.

    Шаблон можно было только создать и удалить. Если при создании по ошибке
    выбрали тип недвижимости или дом, шаблон переставал показываться в
    сделках, и исправить это было нечем — в карточке сделки оставалось
    «Для этой сделки нет подходящих шаблонов».
    """

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.company = Company.objects.create(name='Продажи', code='EDIT')
        self.other = Company.objects.create(name='Вторая', code='EDIT2')
        self.user = User.objects.create_superuser('admin-edit', 'a@e.com', 'pass-for-tests')
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.company = self.company
        profile.is_system_admin = True
        profile.save()
        self.api = APIClient()
        self.api.force_authenticate(self.user)

        project = Project.objects.create(name='ЖК', address='Ташкент', company=self.company)
        self.building = Building.objects.create(project=project, name='1', floors_count=9)
        other_building = Building.objects.create(project=project, name='2', floors_count=9)
        self.prop = Property.objects.create(
            building=self.building, property_type='COMMERCIAL', unit_number='1', floor=1,
            area=Decimal('50.00'), price=Decimal('100000000'),
        )
        client = Client.objects.create(full_name='Клиент', company=self.company)
        self.deal = Deal.objects.create(
            company=self.company, client=client, property=self.prop,
            initial_price=Decimal('100000000'), initial_price_per_sqm=Decimal('2000000'),
            contract_number='Д-1', contract_date=timezone.now().date(), created_by=self.user,
        )
        # Шаблон, спрятанный неверной областью применения: чужой дом и
        # тип недвижимости, которого у объекта нет
        self.template = Template.objects.create(
            name='Инвестиционный договор', company=self.company,
            file=SimpleUploadedFile('tpl.docx', docx_bytes('{{client.full_name}}')),
            applies_to_property_types=['APARTMENT'],
        )
        self.template.applies_to_buildings.set([other_building])

    def available(self):
        return [row['id'] for row in
                self.api.get(f'/api/deals/{self.deal.id}/available-templates/').data]

    def test_wrong_scope_hides_the_template(self):
        self.assertEqual(self.available(), [])

    def test_clearing_the_scope_brings_the_template_back(self):
        response = self.api.patch(
            f'/api/templates/{self.template.id}/',
            {
                'name': 'Инвестиционный договор',
                'kind': 'DEAL',
                'applies_to_projects': [],
                'applies_to_buildings': [],
                'applies_to_property_types': [],
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.template.refresh_from_db()
        self.assertEqual(list(self.template.applies_to_buildings.all()), [])
        self.assertEqual(self.template.applies_to_property_types, [])
        self.assertEqual(self.available(), [self.template.id])

    def test_scope_can_be_narrowed_to_the_right_building(self):
        response = self.api.patch(
            f'/api/templates/{self.template.id}/',
            {
                'applies_to_buildings': [self.building.id],
                'applies_to_property_types': ['COMMERCIAL'],
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.available(), [self.template.id])

    def test_kind_can_be_corrected(self):
        response = self.api.patch(
            f'/api/templates/{self.template.id}/', {'kind': 'BOOKING'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.template.refresh_from_db()
        self.assertEqual(self.template.kind, Template.Kind.BOOKING)

    def test_admin_moves_the_template_between_companies(self):
        moved = self.api.patch(
            f'/api/templates/{self.template.id}/', {'company': self.other.id}, format='json')
        self.assertEqual(moved.status_code, 200)
        self.template.refresh_from_db()
        self.assertEqual(self.template.company, self.other)

        shared = self.api.patch(
            f'/api/templates/{self.template.id}/', {'company': None}, format='json')
        self.assertEqual(shared.status_code, 200)
        self.template.refresh_from_db()
        self.assertIsNone(self.template.company)
        self.assertIsNone(shared.data['company_name'])

    def test_file_can_be_replaced_without_touching_the_scope(self):
        self.template.applies_to_property_types = []
        self.template.save()
        self.template.applies_to_buildings.set([self.building])

        response = self.api.patch(
            f'/api/templates/{self.template.id}/',
            {'file': SimpleUploadedFile('new.docx', docx_bytes('{{deal.contract_number}}'))},
            format='multipart',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.template.refresh_from_db()
        self.assertIn('new', self.template.file.name)
        self.assertEqual(list(self.template.applies_to_buildings.all()), [self.building])
