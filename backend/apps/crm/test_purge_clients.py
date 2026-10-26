"""
Команда purge_clients: удаляет клиентов со всеми их данными, но оставляет
проекты, дома и объекты и освобождает объекты удалённых сделок.
"""

import io
import os
import shutil
import tempfile
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.deals.models import Deal, DealLog
from apps.finances.models import BeneficiaryAccount, Payment, PaymentLog, PaymentType
from apps.realty.models import Building, Project, Property
from apps.tasks.models import Task
from permissions.models import Company

from .models import Application, ApplicationLog, Client, ClientFile, ClientLog, ClientPhoneNumber, Meeting, MeetingLog

User = get_user_model()


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class PurgeClientsTests(TestCase):
    def setUp(self):
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        media_settings = override_settings(MEDIA_ROOT=media)
        media_settings.enable()
        self.addCleanup(media_settings.disable)

        self.user = User.objects.create_user('manager', password='pass-for-tests')
        self.company = Company.objects.create(name='Андижан', code='AND')
        self.project = Project.objects.create(name='ЖК', address='А', company=self.company)
        self.building = Building.objects.create(project=self.project, name='1', floors_count=9)
        self.ptype = PaymentType.objects.create(name='Взнос', company=self.company)
        self.account = BeneficiaryAccount.objects.create(name='Счёт', details='-', company=self.company)

        # Тестовый клиент со всеми видами связанных данных
        self.test_client = Client.objects.create(full_name='Тестовый Клиент Отчество', company=self.company)
        ClientPhoneNumber.objects.create(client=self.test_client, phone_number='+998901112233', is_primary=True)
        ClientLog.objects.create(client=self.test_client, user=self.user, action='Создан')
        self.client_file = ClientFile.objects.create(client=self.test_client,
                                                     file=SimpleUploadedFile('passport.pdf', b'scan'))
        application = Application.objects.create(client=self.test_client, source='CALL', company=self.company)
        application.interested_projects.set([self.project])
        ApplicationLog.objects.create(application=application, user=self.user, action='Создана')
        meeting = Meeting.objects.create(client=self.test_client, application=application, company=self.company,
                                         planned_date=timezone.now() + timedelta(days=1))
        MeetingLog.objects.create(meeting=meeting, user=self.user, action='Назначена')

        self.unit_in_deal = self.unit('1', Property.PropertyStatus.IN_DEAL)
        self.unit_sold = self.unit('2', Property.PropertyStatus.SOLD)
        self.unit_reserved = self.unit('3', Property.PropertyStatus.RESERVE)
        self.test_deal = self.deal(self.test_client, self.unit_in_deal, Deal.DealStatus.IN_PROGRESS, application)
        self.test_deal.signed_document_scan.save('contract.pdf', SimpleUploadedFile('contract.pdf', b'pdf'), save=True)
        self.deal(self.test_client, self.unit_sold, Deal.DealStatus.CLOSED_WON)
        # Отменённая бронь по объекту в резерве: резерв поставлен вручную позже и должен остаться
        self.deal(self.test_client, self.unit_reserved, Deal.DealStatus.CANCELLED)
        payment = self.payment(self.test_client, self.test_deal)
        PaymentLog.objects.create(payment=payment, user=self.user, action='Создан')
        DealLog.objects.create(deal=self.test_deal, user=self.user, action='Создана')

        # Настоящий клиент: его данные трогать нельзя
        self.real_client = Client.objects.create(full_name='Настоящий Клиент', company=self.company)
        self.real_client.relatives.add(self.test_client)
        self.unit_booked = self.unit('4', Property.PropertyStatus.BOOKING)
        self.real_deal = self.deal(self.real_client, self.unit_booked, Deal.DealStatus.BOOKING)
        self.real_payment = self.payment(self.real_client, self.real_deal)

        # Задача не привязана к клиенту в базе: команда её только показывает
        self.task = Task.objects.create(title='Перезвонить: Тестовый Клиент Отчество', description='',
                                        creator=self.user, assignee=self.user, company=self.company,
                                        deadline=timezone.now() + timedelta(days=1))

    def unit(self, number, status):
        return Property.objects.create(building=self.building, property_type='APARTMENT', unit_number=number,
                                       floor=1, area=Decimal('40'), price=Decimal('100'), status=status)

    def deal(self, client, unit, status, application=None):
        return Deal.objects.create(company=self.company, client=client, property=unit, status=status,
                                   application=application, booking_end_date=timezone.now() + timedelta(days=3),
                                   initial_price=Decimal('100'), initial_price_per_sqm=Decimal('2.5'),
                                   contract_price=Decimal('100'), created_by=self.user)

    def payment(self, client, deal):
        return Payment.objects.create(company=self.company, client=client, deal=deal, amount=Decimal('100'),
                                      currency='UZS', payment_type=self.ptype, beneficiary_account=self.account,
                                      method='CASHLESS', due_date=timezone.localdate(),
                                      status=Payment.PaymentStatus.PAID, payment_date=timezone.localdate())

    def run_command(self, *args):
        out = io.StringIO()
        call_command('purge_clients', *args, stdout=out)
        return out.getvalue()

    def test_dry_run_changes_nothing_but_reports_counts(self):
        report = self.run_command(str(self.test_client.pk))
        self.assertIn('ПРОБНЫЙ ЗАПУСК', report)
        self.assertIn('Ничего не изменено', report)
        self.assertIn(': 3', report)  # три сделки клиента
        self.assertIn(f'задача №{self.task.pk}', report)
        self.assertTrue(Client.objects.filter(pk=self.test_client.pk).exists())
        self.assertEqual(Deal.objects.filter(client=self.test_client).count(), 3)
        self.unit_in_deal.refresh_from_db()
        self.assertEqual(self.unit_in_deal.status, Property.PropertyStatus.IN_DEAL)
        self.assertTrue(os.path.exists(self.client_file.file.path))

    def test_apply_deletes_everything_of_the_client_and_frees_units(self):
        scan_path = self.test_deal.signed_document_scan.path
        file_path = self.client_file.file.path
        with self.captureOnCommitCallbacks(execute=True):
            report = self.run_command(str(self.test_client.pk), '--apply')

        # Клиент и всё его — удалены, включая журналы и файлы на диске
        self.assertFalse(Client.objects.filter(pk=self.test_client.pk).exists())
        for model in (Deal, Payment, Application, Meeting, ClientPhoneNumber, ClientFile, ClientLog):
            self.assertFalse(model.objects.filter(client_id=self.test_client.pk).exists(), model.__name__)
        for model in (DealLog, PaymentLog, ApplicationLog, MeetingLog):
            self.assertFalse(model.objects.exists(), model.__name__)
        self.assertFalse(os.path.exists(scan_path))
        self.assertFalse(os.path.exists(file_path))

        # Объекты остались и снова в продаже; объект в резерве не тронут
        for unit in (self.unit_in_deal, self.unit_sold):
            unit.refresh_from_db()
            self.assertEqual(unit.status, Property.PropertyStatus.SELECTION)
        self.unit_reserved.refresh_from_db()
        self.assertEqual(self.unit_reserved.status, Property.PropertyStatus.RESERVE)
        self.assertIn('возвращены в продажу', report)
        self.assertTrue(Project.objects.filter(pk=self.project.pk).exists())
        self.assertEqual(Property.objects.filter(building=self.building).count(), 4)

        # Настоящий клиент и его сделка на месте; задача — тоже
        self.assertTrue(Deal.objects.filter(pk=self.real_deal.pk).exists())
        self.assertTrue(Payment.objects.filter(pk=self.real_payment.pk).exists())
        self.assertFalse(self.real_client.relatives.exists())
        self.unit_booked.refresh_from_db()
        self.assertEqual(self.unit_booked.status, Property.PropertyStatus.BOOKING)
        self.assertTrue(Task.objects.filter(pk=self.task.pk).exists())

    def test_unknown_client_id_stops_without_changes(self):
        with self.assertRaises(CommandError):
            self.run_command(str(self.test_client.pk), '999999', '--apply')
        self.assertTrue(Client.objects.filter(pk=self.test_client.pk).exists())
        self.assertEqual(Deal.objects.count(), 4)
