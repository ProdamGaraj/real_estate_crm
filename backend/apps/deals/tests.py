"""
Бронь и её отмена.

Менеджеры жаловались, что «не могут снять бронь»: кнопка «Отменить /
Расторгнуть» была у всех, кто видит сделку, а сервер отменял только сделки в
пределах права «Изменение» — и окно показывало «Request failed with status
code 403». Теперь сделка сообщает, может ли пользователь её менять, а
расхождения статусов объектов со сделками находит и исправляет команда
check_property_statuses.
"""

import io
import os
import shutil
import tempfile
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.crm.models import Client
from apps.finances.models import BeneficiaryAccount, Payment, PaymentType
from apps.realty.models import Building, Project, Property
from permissions.models import Company, Department, Permission, Role, UserProfile

from .models import Deal, DealLog

User = get_user_model()


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class BookingCancellationTests(TestCase):
    def setUp(self):
        call_command('init_permissions', stdout=io.StringIO())
        self.company = Company.objects.create(name='Продажи', code='SALES', deal_currency='UZS',
                                              supported_currencies=['UZS'])
        self.dept = Department.objects.create(company=self.company, name='Отдел', code='D1')
        project = Project.objects.create(name='ЖК', address='А', company=self.company, price_currency='UZS')
        self.building = Building.objects.create(project=project, name='1', floors_count=9)
        # Как типовой «Менеджер»: свои сделки меняет, сделки отдела только видит
        manager_rights = (
            Permission.objects.filter(resource__in=['DEAL', 'CLIENT', 'PAYMENT'], scope='OWN')
            | Permission.objects.filter(resource='DEAL', action='VIEW', scope='DEPARTMENT')
            | Permission.objects.filter(resource__in=['PROPERTY', 'PROJECT', 'BUILDING'], action='VIEW', scope='COMPANY')
        )
        self.anna = self._user('anna', manager_rights)
        self.boris = self._user('boris', manager_rights)
        self.client_obj = Client.objects.create(full_name='Клиент', company=self.company, created_by=self.anna)

    def _user(self, username, permissions):
        role, _ = Role.objects.get_or_create(name='Менеджер продаж', code='SALES_MANAGER')
        role.permissions.set(permissions)
        user = User.objects.create_user(username, password='pass-for-tests')
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.company, profile.department = self.company, self.dept
        profile.save()
        profile.roles.set([role])
        return User.objects.get(pk=user.pk)

    def api(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def unit(self, number='12', status=Property.PropertyStatus.SELECTION):
        return Property.objects.create(building=self.building, property_type='APARTMENT', unit_number=number,
                                       floor=3, area=Decimal('50'), price=Decimal('500000000'), status=status)

    def book(self, user, unit):
        response = self.api(user).post('/api/deals/', {
            'client': self.client_obj.id, 'property': unit.id,
            'booking_end_date': (timezone.now() + timedelta(days=5)).isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['id']

    def cancel(self, user, deal_id):
        return self.api(user).post(f'/api/deals/{deal_id}/cancel/', {'cancellation_reason': 'Клиент передумал'},
                                   format='multipart')

    def test_author_cancels_own_booking(self):
        unit = self.unit()
        deal_id = self.book(self.anna, unit)
        self.assertTrue(self.api(self.anna).get(f'/api/deals/{deal_id}/').data['can_edit'])
        response = self.cancel(self.anna, deal_id)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Deal.objects.get(pk=deal_id).status, Deal.DealStatus.CANCELLED)
        unit.refresh_from_db()
        self.assertEqual(unit.status, Property.PropertyStatus.SELECTION)

    def test_colleague_sees_booking_read_only_and_gets_clear_refusal(self):
        deal_id = self.book(self.anna, self.unit())
        response = self.api(self.boris).get(f'/api/deals/{deal_id}/')
        self.assertEqual(response.status_code, 200)
        # Карточка открывается, но менять и отменять её нельзя — страница покажет это сразу
        self.assertFalse(response.data['can_edit'])
        refusal = self.cancel(self.boris, deal_id)
        self.assertEqual(refusal.status_code, 403)
        self.assertIn('нет доступа', refusal.data['error'])
        self.assertEqual(Deal.objects.get(pk=deal_id).status, Deal.DealStatus.BOOKING)

    def test_cancellation_without_reason_is_explained(self):
        deal_id = self.book(self.anna, self.unit())
        response = self.api(self.anna).post(f'/api/deals/{deal_id}/cancel/', {}, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertIn('причину', response.data['error'])


class CheckPropertyStatusesTests(TestCase):
    """Объект «Бронь» без живой сделки не снять из интерфейса — команда находит и исправляет такие."""

    def setUp(self):
        self.company = Company.objects.create(name='К', code='K')
        project = Project.objects.create(name='ЖК', address='А', company=self.company)
        self.building = Building.objects.create(project=project, name='1', floors_count=9)
        self.user = User.objects.create_user('admin', password='pass-for-tests')
        self.client_obj = Client.objects.create(full_name='Клиент', company=self.company)

    def unit(self, number, status):
        return Property.objects.create(building=self.building, property_type='APARTMENT', unit_number=number,
                                       floor=1, area=Decimal('40'), price=Decimal('100'), status=status)

    def deal(self, unit, status):
        return Deal.objects.create(company=self.company, client=self.client_obj, property=unit, status=status,
                                   booking_end_date=timezone.now() + timedelta(days=3),
                                   initial_price=Decimal('100'), initial_price_per_sqm=Decimal('2.5'),
                                   created_by=self.user)

    def run_command(self, *args):
        out = io.StringIO()
        call_command('check_property_statuses', *args, stdout=out)
        return out.getvalue()

    def test_reports_then_fixes_mismatches(self):
        orphan = self.unit('1', Property.PropertyStatus.BOOKING)          # бронь без сделки
        self.deal(orphan, Deal.DealStatus.CANCELLED)
        lagging = self.unit('2', Property.PropertyStatus.SELECTION)       # сделка в работе, объект в подборе
        self.deal(lagging, Deal.DealStatus.IN_PROGRESS)
        refund = self.unit('3', Property.PropertyStatus.IN_DEAL)          # ждёт возврата — так и должно быть
        terminated = self.deal(refund, Deal.DealStatus.TERMINATED)
        ptype = PaymentType.objects.create(name='Взнос', company=self.company)
        account = BeneficiaryAccount.objects.create(name='Счёт', details='-', company=self.company)
        Payment.objects.create(deal=terminated, client=self.client_obj, company=self.company, amount=Decimal('10'),
                               currency='UZS', payment_type=ptype, beneficiary_account=account,
                               due_date=timezone.localdate(), status=Payment.PaymentStatus.TO_BE_RETURNED)
        fine = self.unit('4', Property.PropertyStatus.BOOKING)
        self.deal(fine, Deal.DealStatus.BOOKING)

        report = self.run_command()
        self.assertIn('Найдено расхождений: 2', report)
        self.assertIn('ждёт возврата платежей', report)
        orphan.refresh_from_db()
        self.assertEqual(orphan.status, Property.PropertyStatus.BOOKING)  # без --apply ничего не меняется

        self.run_command('--apply')
        for prop, expected in ((orphan, 'SELECTION'), (lagging, 'IN_DEAL'), (refund, 'IN_DEAL'), (fine, 'BOOKING')):
            prop.refresh_from_db()
            self.assertEqual(prop.status, expected, prop.unit_number)
        self.assertIn('Расхождений нет', self.run_command())

    def test_unit_card_names_deal_waiting_for_refund(self):
        from apps.realty.serializers import PropertyListSerializer
        prop = self.unit('5', Property.PropertyStatus.IN_DEAL)
        terminated = self.deal(prop, Deal.DealStatus.TERMINATED)
        ptype = PaymentType.objects.create(name='Взнос', company=self.company)
        account = BeneficiaryAccount.objects.create(name='Счёт', details='-', company=self.company)
        Payment.objects.create(deal=terminated, client=self.client_obj, company=self.company, amount=Decimal('10'),
                               currency='UZS', payment_type=ptype, beneficiary_account=account,
                               due_date=timezone.localdate(), status=Payment.PaymentStatus.TO_BE_RETURNED)
        data = PropertyListSerializer(prop).data
        self.assertIsNone(data['active_deal_id'])
        self.assertEqual(data['pending_refund_deal_id'], terminated.id)


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class DealContractNumberSearchTests(TestCase):
    """Поиск сделки по номеру договора в списке «Сделки» — по части номера и только среди доступных."""

    def setUp(self):
        call_command('init_permissions', stdout=io.StringIO())
        self.company = Company.objects.create(name='Продажи', code='SALES')
        self.other = Company.objects.create(name='Соседи', code='OTHER')
        dept = Department.objects.create(company=self.company, name='Отдел', code='D1')
        role, _ = Role.objects.get_or_create(name='Руководитель продаж', code='SALES_HEAD')
        role.permissions.set(Permission.objects.filter(resource='DEAL', action='VIEW', scope='COMPANY'))
        self.user = User.objects.create_user('head', password='pass-for-tests')
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.company, profile.department = self.company, dept
        profile.save()
        profile.roles.set([role])
        self.api = APIClient()
        self.api.force_authenticate(User.objects.get(pk=self.user.pk))

    def deal(self, company, contract_number, unit_number):
        project = Project.objects.create(name=f'ЖК {unit_number}', address='А', company=company)
        building = Building.objects.create(project=project, name='1', floors_count=9)
        unit = Property.objects.create(building=building, property_type='APARTMENT', unit_number=unit_number,
                                       floor=1, area=Decimal('40'), price=Decimal('100'),
                                       status=Property.PropertyStatus.IN_DEAL)
        client = Client.objects.create(full_name='Клиент', company=company)
        return Deal.objects.create(company=company, client=client, property=unit,
                                   status=Deal.DealStatus.IN_PROGRESS, contract_number=contract_number,
                                   booking_end_date=timezone.now() + timedelta(days=3),
                                   initial_price=Decimal('100'), initial_price_per_sqm=Decimal('2.5'),
                                   created_by=self.user)

    def search(self, text):
        response = self.api.get('/api/deals/', {'contract_number': text})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_finds_by_part_of_number_ignoring_case(self):
        wanted = self.deal(self.company, 'DV-015/2026', '1')
        self.deal(self.company, 'DV-200/2026', '2')
        found = self.search('dv-015')
        self.assertEqual([row['id'] for row in found], [wanted.id])
        # Номер виден в строке списка — по нему сотрудник узнаёт найденную сделку
        self.assertEqual(found[0]['contract_number'], 'DV-015/2026')
        self.assertEqual([row['id'] for row in self.search('015')], [wanted.id])

    def test_does_not_find_deal_of_another_company(self):
        self.deal(self.other, 'DV-015/2026', '3')
        self.assertEqual(self.search('DV-015'), [])


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class DealPassportRequirementTests(TestCase):
    """
    Паспортные данные клиента идут в договор: без них бронь не переходит
    в работу (первый график платежей), а сделка не закрывается (даты подписания).
    """

    def setUp(self):
        user = User.objects.create_user('admin', password='pass-for-tests')
        profile = user.profile
        profile.is_system_admin = True
        profile.save()
        self.user = User.objects.get(pk=user.pk)
        self.company = Company.objects.create(name='К', code='K')
        # Серия и номер есть, остального нет — как у большинства клиентов, заведённых из заявки
        self.client_obj = Client.objects.create(full_name='Иванов Иван', company=self.company,
                                                passport_series='AA', passport_number='1234567')
        project = Project.objects.create(name='ЖК', address='А', company=self.company)
        building = Building.objects.create(project=project, name='1', floors_count=9)
        unit = Property.objects.create(building=building, property_type='APARTMENT', unit_number='7', floor=2,
                                       area=Decimal('50'), price=Decimal('1000'),
                                       status=Property.PropertyStatus.BOOKING)
        self.deal = Deal.objects.create(company=self.company, client=self.client_obj, property=unit,
                                        booking_end_date=timezone.now() + timedelta(days=5),
                                        initial_price=Decimal('1000'), initial_price_per_sqm=Decimal('20'),
                                        contract_price=Decimal('1000'), created_by=self.user)
        self.ptype = PaymentType.objects.create(name='Взнос', company=self.company)
        self.account = BeneficiaryAccount.objects.create(name='Счёт', details='-', company=self.company)
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def fill_passport(self):
        Client.objects.filter(pk=self.client_obj.pk).update(
            passport_issued_by='ИИБ Андижан', passport_issued_date=date(2020, 1, 15), pinfl='12345678901234')

    def card(self):
        return self.api.get(f'/api/deals/{self.deal.id}/').data

    def save_schedule(self):
        return self.api.post(f'/api/deals/{self.deal.id}/payment-schedule/', [{
            'amount': '1000.00', 'due_date': (timezone.localdate() + timedelta(days=10)).isoformat(),
            'payment_type_id': self.ptype.id, 'beneficiary_account_id': self.account.id,
            'currency': 'UZS', 'method': 'CASHLESS',
        }], format='json')

    def sign(self, **dates):
        return self.api.patch(f'/api/deals/{self.deal.id}/', dates, format='json')

    def test_card_lists_missing_passport_fields(self):
        self.assertEqual(self.card()['client_missing_passport_fields'],
                         ['passport_issued_by', 'passport_issued_date', 'pinfl'])

    def test_booking_does_not_go_to_work_without_passport(self):
        response = self.save_schedule()
        self.assertEqual(response.status_code, 400)
        self.assertIn('Кем выдан паспорт', response.data['error'])
        self.assertIn('ПИНФЛ', response.data['error'])
        self.assertNotIn('Серия паспорта', response.data['error'])
        self.deal.refresh_from_db()
        self.assertEqual(self.deal.status, Deal.DealStatus.BOOKING)
        self.assertFalse(self.deal.payments.exists())

    def test_booking_goes_to_work_with_passport(self):
        self.fill_passport()
        self.assertEqual(self.save_schedule().status_code, 201)
        self.deal.refresh_from_db()
        self.assertEqual(self.deal.status, Deal.DealStatus.IN_PROGRESS)
        self.assertEqual(self.card()['client_missing_passport_fields'], [])

    def test_deal_in_work_without_passport_is_editable_but_does_not_close(self):
        # Сделка ушла в работу до того, как паспорт стал обязательным
        Deal.objects.filter(pk=self.deal.pk).update(status=Deal.DealStatus.IN_PROGRESS)
        self.assertEqual(self.save_schedule().status_code, 201)
        today = timezone.localdate().isoformat()
        # Одна дата подписания сделку не закрывает — её сохранить можно
        self.assertEqual(self.sign(client_signature_date=today).status_code, 200)

        response = self.sign(company_signature_date=today)
        self.assertEqual(response.status_code, 400)
        self.assertIn('закрыть сделку', str(response.data))
        self.deal.refresh_from_db()
        self.assertEqual(self.deal.status, Deal.DealStatus.IN_PROGRESS)
        self.assertIsNone(self.deal.company_signature_date)

        self.fill_passport()
        self.assertEqual(self.sign(company_signature_date=today).status_code, 200)
        self.deal.refresh_from_db()
        self.assertEqual(self.deal.status, Deal.DealStatus.CLOSED_WON)


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class DealScanTests(TestCase):
    """
    Скан подписанного договора и документ о расторжении можно заменить и
    у закрытой или расторгнутой сделки: меняется только файл, прежний
    остаётся на диске, замена записывается в журнал сделки.
    """

    def setUp(self):
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        media_settings = override_settings(MEDIA_ROOT=media)
        media_settings.enable()
        self.addCleanup(media_settings.disable)

        call_command('init_permissions', stdout=io.StringIO())
        self.company = Company.objects.create(name='К', code='K')
        admin = User.objects.create_user('admin', password='pass-for-tests')
        admin.profile.is_system_admin = True
        admin.profile.save()
        self.admin = User.objects.get(pk=admin.pk)
        # Видит сделки компании, но менять их не может
        role, _ = Role.objects.get_or_create(name='Наблюдатель', code='VIEWER_TEST')
        role.permissions.set(Permission.objects.filter(resource='DEAL', action='VIEW', scope='COMPANY'))
        viewer = User.objects.create_user('viewer', password='pass-for-tests')
        viewer.profile.company = self.company
        viewer.profile.save()
        viewer.profile.roles.set([role])
        self.viewer = User.objects.get(pk=viewer.pk)

        project = Project.objects.create(name='ЖК', address='А', company=self.company)
        self.building = Building.objects.create(project=project, name='1', floors_count=9)
        self.client_obj = Client.objects.create(full_name='Иванов Иван', company=self.company)

    def deal(self, status, number='1'):
        unit = Property.objects.create(building=self.building, property_type='APARTMENT', unit_number=number,
                                       floor=1, area=Decimal('40'), price=Decimal('100'),
                                       status=Property.PropertyStatus.SOLD)
        return Deal.objects.create(company=self.company, client=self.client_obj, property=unit, status=status,
                                   booking_end_date=timezone.now() + timedelta(days=3),
                                   initial_price=Decimal('100'), initial_price_per_sqm=Decimal('2.5'),
                                   contract_price=Decimal('100'), created_by=self.admin)

    def upload(self, deal, kind, name='new.pdf', user=None):
        api = APIClient()
        api.force_authenticate(user or self.admin)
        data = {'file': SimpleUploadedFile(name, b'%PDF-1.4 scan', content_type='application/pdf')} if name else {}
        return api.post(f'/api/deals/{deal.id}/scans/{kind}/', data, format='multipart')

    def test_replaces_signed_scan_of_closed_deal(self):
        deal = self.deal(Deal.DealStatus.CLOSED_WON)
        deal.signed_document_scan.save('old.pdf', SimpleUploadedFile('old.pdf', b'old'), save=True)
        old_path = deal.signed_document_scan.path

        response = self.upload(deal, 'signed')
        self.assertEqual(response.status_code, 200, response.data)
        deal.refresh_from_db()
        self.assertTrue(deal.signed_document_scan.name.endswith('new.pdf'))
        self.assertEqual(deal.status, Deal.DealStatus.CLOSED_WON)
        # Прежний файл не удалён — если заменили не тот, его можно вернуть
        self.assertTrue(os.path.exists(old_path))
        self.assertTrue(DealLog.objects.filter(
            deal=deal, action='Заменён скан подписанного документа: «old.pdf» → «new.pdf».').exists())

    def test_uploads_scan_to_closed_deal_without_one(self):
        deal = self.deal(Deal.DealStatus.CLOSED_WON)
        self.assertEqual(self.upload(deal, 'signed').status_code, 200)
        self.assertTrue(DealLog.objects.filter(
            deal=deal, action='Загружен скан подписанного документа: «new.pdf».').exists())

    def test_termination_document_changes_only_for_terminated_deal(self):
        terminated = self.deal(Deal.DealStatus.TERMINATED, '1')
        terminated.termination_document_scan.save('act.pdf', SimpleUploadedFile('act.pdf', b'act'), save=True)
        self.assertEqual(self.upload(terminated, 'termination', 'act-signed.pdf').status_code, 200)
        terminated.refresh_from_db()
        self.assertTrue(terminated.termination_document_scan.name.endswith('act-signed.pdf'))

        closed = self.deal(Deal.DealStatus.CLOSED_WON, '2')
        response = self.upload(closed, 'termination')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Расторгнута', response.data['error'])

    def test_booking_has_no_contract_scan_yet(self):
        response = self.upload(self.deal(Deal.DealStatus.BOOKING), 'signed')
        self.assertEqual(response.status_code, 400)
        self.assertIn('В работе', response.data['error'])

    def test_user_without_edit_rights_is_refused(self):
        deal = self.deal(Deal.DealStatus.CLOSED_WON)
        response = self.upload(deal, 'signed', user=self.viewer)
        self.assertEqual(response.status_code, 403)
        deal.refresh_from_db()
        self.assertFalse(deal.signed_document_scan)

    def test_file_is_required(self):
        response = self.upload(self.deal(Deal.DealStatus.CLOSED_WON), 'signed', name=None)
        self.assertEqual(response.status_code, 400)
        self.assertIn('файл', response.data['error'])


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class SummaryExcelExportTests(TestCase):
    """
    Выгрузки сводных таблиц в Excel. Параметр назывался format, его DRF забирал
    себе для выбора рендерера, и ?format=excel отвечал 404 — файл не скачивался.
    """

    URLS = ('/api/deals/summary/', '/api/applications/summary/',
            '/api/meetings/summary/', '/api/finances/summary/')

    def setUp(self):
        user = User.objects.create_user('admin', password='pass-for-tests')
        user.profile.is_system_admin = True
        user.profile.save()
        self.api = APIClient()
        self.api.force_authenticate(User.objects.get(pk=user.pk))

    def test_every_summary_downloads_as_xlsx(self):
        for url in self.URLS:
            with self.subTest(url=url):
                response = self.api.get(url, {'export': 'excel'})
                self.assertEqual(response.status_code, 200, url)
                self.assertIn('spreadsheetml', response['Content-Type'])
                self.assertTrue(response.content.startswith(b'PK'))  # xlsx — это zip

    def test_deal_summary_export_keeps_filters(self):
        response = self.api.get('/api/deals/summary/', {
            'export': 'excel', 'group_by': 'project',
            'created_at_after': '2026-10-01', 'created_at_before': '2026-10-31',
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('deal_summary_project.xlsx', response['Content-Disposition'])


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class DealSummaryByStatusTests(TestCase):
    """
    Сводная таблица сделок раскладывает сделки группы по статусам. Раньше была
    одна колонка «Всего сделок» вместе с отменёнными и расторгнутыми, и число
    выглядело завышенным. «Итого» считается без отменённых.
    """

    def setUp(self):
        admin = User.objects.create_user('admin', password='pass-for-tests')
        admin.profile.is_system_admin = True
        admin.profile.save()
        self.api = APIClient()
        self.api.force_authenticate(User.objects.get(pk=admin.pk))
        self.manager = User.objects.create_user('mpp_1', password='pass-for-tests',
                                                first_name='Xojimurod', last_name='Ortiqov')
        self.company = Company.objects.create(name='К', code='K')
        project = Project.objects.create(name='ЖК', address='А', company=self.company)
        self.building = Building.objects.create(project=project, name='1', floors_count=9)
        self.client_obj = Client.objects.create(full_name='Клиент', company=self.company)
        statuses = ([Deal.DealStatus.BOOKING] * 2 + [Deal.DealStatus.CLOSED_WON] * 3
                    + [Deal.DealStatus.TERMINATED] * 4 + [Deal.DealStatus.CANCELLED] * 5)
        for number, deal_status in enumerate(statuses):
            unit = Property.objects.create(building=self.building, property_type='APARTMENT',
                                           unit_number=str(number), floor=1, area=Decimal('40'), price=Decimal('1'))
            Deal.objects.create(company=self.company, client=self.client_obj, property=unit, status=deal_status,
                                created_by=self.manager, booking_end_date=timezone.now() + timedelta(days=3),
                                initial_price=Decimal('1'), initial_price_per_sqm=Decimal('1'))

    def test_manager_row_is_split_by_status_and_total_skips_cancelled(self):
        rows = self.api.get('/api/deals/summary/', {'group_by': 'created_by'}).data['summary']
        self.assertEqual(rows, [{
            'group': 'Xojimurod Ortiqov', 'booking': 2, 'in_progress': 0, 'closed_won': 3,
            'terminated': 4, 'cancelled': 5, 'total': 9,
        }])

    def test_excel_has_status_columns_in_interface_language(self):
        import pandas as pd
        response = self.api.get('/api/deals/summary/', {'group_by': 'status', 'export': 'excel', 'lang': 'ru'})
        self.assertEqual(response.status_code, 200)
        table = pd.read_excel(io.BytesIO(response.content))
        self.assertEqual(list(table.columns), ['Статус', 'Бронь', 'В работе', 'Успешно закрыта', 'Расторгнута',
                                               'Отменена', 'Итого (без отменённых)'])
        cancelled = table[table['Статус'] == 'Отменена'].iloc[0]
        self.assertEqual((cancelled['Отменена'], cancelled['Итого (без отменённых)']), (5, 0))
