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
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.crm.models import Client
from apps.finances.models import BeneficiaryAccount, Payment, PaymentType
from apps.realty.models import Building, Project, Property
from permissions.models import Company, Department, Permission, Role, UserProfile

from .models import Deal

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
