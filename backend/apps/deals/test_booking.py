"""
Брони: очередь, переходы, цена, взнос и конвертация в сделку.

Ошибки в этой части живут не в модели, а в автомате переходов, который
крутится ночью без присмотра: пропустить бронь с живой сделкой, снять
долг, перенести цену, активировать следующую, зафиксировать её цену,
пересчитать хвост, отменить очередь при завершении сделки. Поэтому ниже
табличные тесты именно на переходы: событие → статусы брони, очереди,
объекта и платежей.
"""

import io
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.crm.models import Client
from apps.finances.models import BeneficiaryAccount, Payment
from apps.finances.services import exclude_dead_deals, refresh_overdue_payments
from apps.realty.models import Building, Project, Property, PropertyLog
from permissions.models import Company

from .booking import projected_schedule, queue_position
from .models import Booking, BookingLog, Deal

User = get_user_model()

PASSPORT = dict(passport_series='AA', passport_number='1234567', passport_issued_by='ИИБ',
                passport_issued_date=date(2020, 1, 15), pinfl='12345678901234')


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class BookingBase(TestCase):
    """Общая обстановка: компания с взносом за бронь, дом, объект, клиенты."""

    def setUp(self):
        call_command('init_permissions', stdout=io.StringIO())
        user = User.objects.create_user('admin', password='pass-for-tests')
        user.profile.is_system_admin = True
        user.profile.save()
        self.user = User.objects.get(pk=user.pk)

        self.company = Company.objects.create(name='Продажи', code='SALES', deal_currency='UZS',
                                              supported_currencies=['UZS', 'USD'],
                                              min_booking_days=3)
        self.account = BeneficiaryAccount.objects.create(name='Счёт', details='-', company=self.company)
        self.company.booking_fee_amount = Decimal('1000000.00')
        self.company.booking_fee_account = self.account
        self.company.save()
        self.user.profile.company = self.company
        self.user.profile.save()

        # Прайс проекта в долларах, а взнос платят в сумах: валюта цены брони
        # и валюта взноса — разные, и это нормально
        self.project = Project.objects.create(name='Jahon bozori', address='А', company=self.company,
                                              price_currency='USD')
        self.building = Building.objects.create(project=self.project, name='26', floors_count=3)
        self.unit = self.make_unit('А-1,10', Decimal('40500.00'))

        self.first = Client.objects.create(full_name='Первый Клиент', company=self.company,
                                           created_by=self.user, **PASSPORT)
        self.second = Client.objects.create(full_name='Второй Клиент', company=self.company,
                                            created_by=self.user, **PASSPORT)
        self.third = Client.objects.create(full_name='Третий Клиент', company=self.company,
                                           created_by=self.user, **PASSPORT)

        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def make_unit(self, number, price, status=Property.PropertyStatus.SELECTION):
        return Property.objects.create(building=self.building, property_type='APARTMENT',
                                       unit_number=number, floor=1, area=Decimal('27.00'),
                                       price=price, status=status)

    def book(self, client, days=5, unit=None, expect=201):
        response = self.api.post('/api/bookings/', {
            'client': client.id, 'property': (unit or self.unit).id, 'duration_days': days,
        }, format='json')
        self.assertEqual(response.status_code, expect, response.data)
        return response.data

    def booking_of(self, client):
        return Booking.objects.get(client=client, property=self.unit)

    def make_deal(self, booking, expect=201):
        response = self.api.post('/api/deals/', {
            'client': booking.client_id, 'property': booking.property_id, 'booking': booking.id,
        }, format='json')
        self.assertEqual(response.status_code, expect, response.data)
        return response.data

    def expire_now(self, booking):
        """Переводит срок брони в прошлое и запускает ночной прогон."""
        Booking.objects.filter(pk=booking.pk).update(end_date=timezone.now() - timedelta(minutes=1))
        call_command('expire_bookings', stdout=io.StringIO())

    def states(self):
        """Снимок состояния: статусы броней по клиентам и статус объекта."""
        self.unit.refresh_from_db()
        return {
            **{booking.client.full_name.split()[0]: booking.status
               for booking in Booking.objects.filter(property=self.unit).select_related('client')},
            'объект': self.unit.status,
        }


class BookingCreationTests(BookingBase):
    def test_booking_on_free_unit_is_active_at_once(self):
        data = self.book(self.first, days=5)
        booking = self.booking_of(self.first)
        self.assertEqual(booking.status, Booking.BookingStatus.ACTIVE)
        # Даты пишутся при активации, срок задан в днях
        self.assertIsNotNone(booking.start_date)
        self.assertEqual((booking.end_date - booking.start_date).days, 5)
        # Цена фиксируется в валюте прайса проекта
        self.assertEqual(booking.price, Decimal('40500.00'))
        self.assertEqual(booking.currency, 'USD')
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, Property.PropertyStatus.BOOKING)
        self.assertEqual(data['queue_position'], 0)

    def test_fee_payment_is_a_real_debt_in_company_currency(self):
        self.book(self.first)
        booking = self.booking_of(self.first)
        fee = booking.payments.get()
        # Взнос платят в валюте сделок компании, хотя прайс проекта в долларах
        self.assertEqual((fee.amount, fee.currency), (Decimal('1000000.00'), 'UZS'))
        self.assertEqual(fee.status, Payment.PaymentStatus.PENDING)
        self.assertEqual(fee.due_date, booking.start_date.date())
        self.assertEqual(fee.client_id, self.first.id)
        self.assertIsNone(fee.deal_id)
        # Долг виден в витринах ожидаемых денег
        self.assertTrue(exclude_dead_deals(Payment.objects.all()).filter(pk=fee.pk).exists())

    def test_second_booking_goes_to_queue_without_dates_and_price(self):
        self.book(self.first, days=5)
        data = self.book(self.second, days=7)
        queued = self.booking_of(self.second)
        self.assertEqual(queued.status, Booking.BookingStatus.PENDING_QUEUE)
        self.assertIsNone(queued.start_date)
        self.assertIsNone(queued.price)
        # Платной бронью становится только активная
        self.assertFalse(queued.payments.exists())
        self.assertEqual(data['queue_position'], 1)
        # Объект остаётся за первой бронью
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, Property.PropertyStatus.BOOKING)

    def test_queue_dates_are_projected_not_stored(self):
        self.book(self.first, days=5)
        self.book(self.second, days=7)
        self.book(self.third, days=4)
        active = self.booking_of(self.first)
        schedule = projected_schedule(self.unit)

        self.assertFalse(schedule[active.id]['projected'])
        second, third = self.booking_of(self.second), self.booking_of(self.third)
        # Конец предыдущей брони — начало следующей
        self.assertEqual(schedule[second.id]['start_date'], active.end_date)
        self.assertEqual(schedule[second.id]['end_date'], active.end_date + timedelta(days=7))
        self.assertEqual(schedule[third.id]['start_date'], schedule[second.id]['end_date'])
        self.assertEqual(schedule[third.id]['end_date'],
                         schedule[second.id]['end_date'] + timedelta(days=4))
        self.assertTrue(schedule[second.id]['projected'])
        # В базе этих дат нет
        self.assertIsNone(second.start_date)
        self.assertEqual((queue_position(second), queue_position(third)), (1, 2))

    def test_duration_shorter_than_company_minimum_is_refused(self):
        response = self.api.post('/api/bookings/', {
            'client': self.first.id, 'property': self.unit.id, 'duration_days': 1,
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Минимальный срок брони — 3', response.data['error'])
        self.assertFalse(Booking.objects.exists())

    def test_reserved_and_sold_units_cannot_be_booked(self):
        reserved = self.make_unit('Б-1,01', Decimal('100'), Property.PropertyStatus.RESERVE)
        response = self.api.post('/api/bookings/', {
            'client': self.first.id, 'property': reserved.id, 'duration_days': 5,
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('резерв', response.data['error'])

        sold = self.make_unit('Б-1,02', Decimal('100'), Property.PropertyStatus.SOLD)
        response = self.api.post('/api/bookings/', {
            'client': self.first.id, 'property': sold.id, 'duration_days': 5,
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('продан', response.data['error'])

    def test_booking_needs_no_passport(self):
        bare = Client.objects.create(full_name='Без Паспорта', company=self.company,
                                      created_by=self.user)
        self.book(bare, days=4)
        self.assertEqual(self.booking_of(bare).status, Booking.BookingStatus.ACTIVE)


class BookingTransitionTests(BookingBase):
    """Табличные тесты переходов: событие → статусы брони, очереди, объекта."""

    def test_expired_booking_releases_unit_when_queue_is_empty(self):
        self.book(self.first, days=5)
        booking = self.booking_of(self.first)
        fee = booking.payments.get()

        self.expire_now(booking)

        booking.refresh_from_db()
        fee.refresh_from_db()
        self.assertEqual(booking.status, Booking.BookingStatus.EXPIRED)
        # Долг снимается: иначе неоплаченный взнос мёртвой брони навсегда
        # остался бы «К оплате» — тот же баг, что закрыли для мёртвых сделок
        self.assertEqual(fee.status, Payment.PaymentStatus.CANCELLED)
        self.assertEqual(self.states()['объект'], Property.PropertyStatus.SELECTION)

    def test_dead_booking_fee_is_out_of_expected_money(self):
        self.book(self.first, days=5)
        booking = self.booking_of(self.first)
        fee = booking.payments.get()
        Payment.objects.filter(pk=fee.pk).update(
            due_date=timezone.localdate() - timedelta(days=10), status=Payment.PaymentStatus.PENDING
        )
        Booking.objects.filter(pk=booking.pk).update(status=Booking.BookingStatus.EXPIRED)

        # Просрочка мёртвой брони не считается и в витрины не попадает
        self.assertEqual(refresh_overdue_payments(), 0)
        self.assertFalse(exclude_dead_deals(Payment.objects.all()).filter(pk=fee.pk).exists())

    def test_expired_booking_hands_unit_to_the_next_in_queue(self):
        self.book(self.first, days=5)
        self.book(self.second, days=7)
        first = self.booking_of(self.first)

        self.expire_now(first)

        self.assertEqual(self.states(), {
            'Первый': Booking.BookingStatus.EXPIRED,
            'Второй': Booking.BookingStatus.ACTIVE,
            'объект': Property.PropertyStatus.BOOKING,
        })
        second = self.booking_of(self.second)
        self.assertIsNotNone(second.start_date)
        self.assertEqual((second.end_date - second.start_date).days, 7)
        # Своя цена и свой взнос появляются именно при активации
        self.assertEqual(second.price, Decimal('40500.00'))
        self.assertEqual(second.payments.count(), 1)

    def test_price_rises_between_two_bookings(self):
        """Повышение прайса доходит до следующей брони, а не до текущей."""
        self.book(self.first, days=5)
        self.book(self.second, days=7)
        # Прайс поднялся, пока объект занят: цена уходит в ожидающую
        self.unit.refresh_from_db()
        self.unit.pending_price = Decimal('46575.00')
        self.unit.pending_price_set_at = timezone.now()
        self.unit.save(update_fields=['pending_price', 'pending_price_set_at'])

        first = self.booking_of(self.first)
        self.assertEqual(first.price, Decimal('40500.00'))  # у текущей брони цена не меняется

        self.expire_now(first)

        self.unit.refresh_from_db()
        # Цена применена в момент между двумя бронями
        self.assertEqual(self.unit.price, Decimal('46575.00'))
        self.assertIsNone(self.unit.pending_price)
        self.assertEqual(self.booking_of(self.second).price, Decimal('46575.00'))
        self.assertTrue(PropertyLog.objects.filter(property=self.unit,
                                                   action__contains='46575').exists())

    def test_manual_cancellation_advances_the_queue(self):
        self.book(self.first, days=5)
        self.book(self.second, days=7)
        first = self.booking_of(self.first)

        response = self.api.post(f'/api/bookings/{first.id}/cancel/',
                                 {'cancellation_reason': 'Клиент передумал'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        self.assertEqual(self.states(), {
            'Первый': Booking.BookingStatus.CANCELLED,
            'Второй': Booking.BookingStatus.ACTIVE,
            'объект': Property.PropertyStatus.BOOKING,
        })
        first.refresh_from_db()
        self.assertIn('Клиент передумал', first.cancellation_reason)
        self.assertEqual(first.payments.get().status, Payment.PaymentStatus.CANCELLED)

    def test_cancellation_without_reason_is_refused(self):
        self.book(self.first)
        first = self.booking_of(self.first)
        response = self.api.post(f'/api/bookings/{first.id}/cancel/', {}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('причину', response.data['error'])

    def test_extension_is_free_and_moves_the_queue_tail(self):
        self.book(self.first, days=5)
        self.book(self.second, days=7)
        first, second = self.booking_of(self.first), self.booking_of(self.second)
        before = projected_schedule(self.unit)[second.id]['start_date']

        response = self.api.post(f'/api/bookings/{first.id}/extend/',
                                 {'duration_days': 9}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        first.refresh_from_db()
        self.assertEqual(first.duration_days, 9)
        self.assertEqual((first.end_date - first.start_date).days, 9)
        # Продление бесплатное: второго взноса не появилось
        self.assertEqual(first.payments.count(), 1)
        # Хвост очереди пересчитался сам — дат в базе нет
        after = projected_schedule(self.unit)[second.id]['start_date']
        self.assertEqual((after - before).days, 4)

    def test_expired_booking_cannot_be_extended(self):
        self.book(self.first, days=5)
        booking = self.booking_of(self.first)
        Booking.objects.filter(pk=booking.pk).update(end_date=timezone.now() - timedelta(hours=1))
        response = self.api.post(f'/api/bookings/{booking.id}/extend/',
                                 {'duration_days': 9}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('истёк', response.data['error'])

    def test_queue_booking_can_be_extended_too(self):
        self.book(self.first, days=5)
        self.book(self.second, days=7)
        second = self.booking_of(self.second)
        response = self.api.post(f'/api/bookings/{second.id}/extend/',
                                 {'duration_days': 10}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        second.refresh_from_db()
        self.assertEqual(second.duration_days, 10)
        self.assertIsNone(second.end_date)  # даты у брони в очереди по-прежнему нет


class BookingToDealTests(BookingBase):
    def test_deal_from_booking_keeps_the_booked_price(self):
        self.book(self.first, days=5)
        booking = self.booking_of(self.first)
        # Прайс поднялся, пока бронь действовала: с клиентом договорились
        # о цене на момент брони
        Property.objects.filter(pk=self.unit.pk).update(price=Decimal('46575.00'))

        deal_data = self.make_deal(booking)
        deal = Deal.objects.get(pk=deal_data['id'])

        self.assertEqual(deal.status, Deal.DealStatus.IN_PROGRESS)
        self.assertEqual(deal.catalog_price, Decimal('40500.00'))
        self.assertEqual(deal.catalog_currency, 'USD')
        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.BookingStatus.CONVERTED)
        self.assertEqual(booking.deal_id, deal.id)
        self.assertEqual(self.states()['объект'], Property.PropertyStatus.IN_DEAL)

    def test_fee_joins_the_deal_schedule_and_keeps_its_origin(self):
        self.book(self.first, days=5)
        booking = self.booking_of(self.first)
        fee = booking.payments.get()

        deal_data = self.make_deal(booking)
        fee.refresh_from_db()

        # Оба поля заполнены: бронь — происхождение, сделка — график
        self.assertEqual(fee.booking_id, booking.id)
        self.assertEqual(fee.deal_id, deal_data['id'])
        self.assertTrue(any(row['is_booking_fee'] for row in deal_data['payments']))

    def test_converted_booking_is_not_touched_by_the_nightly_job(self):
        self.book(self.first, days=5)
        booking = self.booking_of(self.first)
        self.make_deal(booking)

        self.expire_now(booking)

        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.BookingStatus.CONVERTED)
        self.assertEqual(self.states()['объект'], Property.PropertyStatus.IN_DEAL)

    def test_converted_booking_cannot_be_cancelled_by_hand(self):
        self.book(self.first, days=5)
        booking = self.booking_of(self.first)
        self.make_deal(booking)
        response = self.api.post(f'/api/bookings/{booking.id}/cancel/',
                                 {'cancellation_reason': 'передумали'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('оформлена в сделку', response.data['error'])

    def test_queue_waits_behind_a_deal_without_projected_dates(self):
        self.book(self.first, days=5)
        self.book(self.second, days=7)
        self.make_deal(self.booking_of(self.first))

        schedule = projected_schedule(self.unit)
        second = self.booking_of(self.second)
        # Когда сделка разрешится, неизвестно — дат у очереди нет
        self.assertEqual(schedule[second.id], {'start_date': None, 'end_date': None,
                                               'projected': True})

    def test_cancelled_deal_cancels_booking_and_advances_queue(self):
        self.book(self.first, days=5)
        self.book(self.second, days=7)
        booking = self.booking_of(self.first)
        deal_data = self.make_deal(booking)
        # Новый прайс пришёл, пока шла сделка
        Property.objects.filter(pk=self.unit.pk).update(
            pending_price=Decimal('46575.00'), pending_price_set_at=timezone.now()
        )

        response = self.api.post(f'/api/deals/{deal_data["id"]}/cancel/',
                                 {'cancellation_reason': 'Клиент отказался'}, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)

        self.assertEqual(self.states(), {
            'Первый': Booking.BookingStatus.CANCELLED,
            'Второй': Booking.BookingStatus.ACTIVE,
            'объект': Property.PropertyStatus.BOOKING,
        })
        # Объект пошёл дальше по новой цене — это и обещано заказчику
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.price, Decimal('46575.00'))
        self.assertEqual(self.booking_of(self.second).price, Decimal('46575.00'))

    def test_cancelled_deal_releases_unit_with_new_price_when_queue_is_empty(self):
        self.book(self.first, days=5)
        deal_data = self.make_deal(self.booking_of(self.first))
        Property.objects.filter(pk=self.unit.pk).update(
            pending_price=Decimal('46575.00'), pending_price_set_at=timezone.now()
        )

        self.api.post(f'/api/deals/{deal_data["id"]}/cancel/',
                      {'cancellation_reason': 'отказ'}, format='multipart')

        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, Property.PropertyStatus.SELECTION)
        self.assertEqual(self.unit.price, Decimal('46575.00'))
        self.assertIsNone(self.unit.pending_price)

    def test_closed_deal_cancels_the_rest_of_the_queue(self):
        self.book(self.first, days=5)
        self.book(self.second, days=7)
        self.book(self.third, days=4)
        deal_data = self.make_deal(self.booking_of(self.first))
        deal = Deal.objects.get(pk=deal_data['id'])
        Deal.objects.filter(pk=deal.pk).update(contract_price=Decimal('40500.00'))

        today = timezone.localdate().isoformat()
        response = self.api.patch(f'/api/deals/{deal.id}/', {
            'client_signature_date': today, 'company_signature_date': today,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        deal.refresh_from_db()
        self.assertEqual(deal.status, Deal.DealStatus.CLOSED_WON)
        self.assertEqual(self.states(), {
            'Первый': Booking.BookingStatus.CONVERTED,
            'Второй': Booking.BookingStatus.CANCELLED,
            'Третий': Booking.BookingStatus.CANCELLED,
            'объект': Property.PropertyStatus.SOLD,
        })
        self.assertTrue(BookingLog.objects.filter(
            booking=self.booking_of(self.second), action__contains='другая бронь стала сделкой'
        ).exists())

    def test_deal_without_booking_needs_a_free_unit(self):
        self.book(self.first, days=5)
        # Объект забронирован — сделку мимо брони не оформить
        response = self.api.post('/api/deals/', {
            'client': self.second.id, 'property': self.unit.id,
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('забронирован', response.data['error'])

    def test_deal_by_someone_elses_booking_is_refused(self):
        self.book(self.first, days=5)
        booking = self.booking_of(self.first)
        response = self.api.post('/api/deals/', {
            'client': self.second.id, 'property': self.unit.id, 'booking': booking.id,
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('другого клиента', response.data['error'])

    def test_deal_by_expired_booking_is_refused(self):
        self.book(self.first, days=5)
        booking = self.booking_of(self.first)
        Booking.objects.filter(pk=booking.pk).update(end_date=timezone.now() - timedelta(hours=1))
        booking.refresh_from_db()
        response = self.api.post('/api/deals/', {
            'client': self.first.id, 'property': self.unit.id, 'booking': booking.id,
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Срок брони истёк', response.data['error'])


class BookingQueueApiTests(BookingBase):
    def test_property_queue_shows_dates_and_hides_other_managers_clients(self):
        self.book(self.first, days=5)
        self.book(self.second, days=7)
        response = self.api.get(f'/api/properties/{self.unit.id}/booking-queue/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['property_status'], Property.PropertyStatus.BOOKING)
        positions = [(row['position'], row['status'], row['projected']) for row in response.data['queue']]
        self.assertEqual(positions, [
            (0, Booking.BookingStatus.ACTIVE, False),
            (1, Booking.BookingStatus.PENDING_QUEUE, True),
        ])
        # Системный администратор видит всех клиентов очереди
        self.assertEqual(response.data['queue'][1]['client'], 'Второй Клиент')

    def test_summary_counts_live_and_overdue_bookings(self):
        self.book(self.first, days=5)
        self.book(self.second, days=7)
        Booking.objects.filter(client=self.first).update(end_date=timezone.now() - timedelta(hours=1))
        widgets = self.api.get('/api/bookings/summary/').data['widgets']
        self.assertEqual((widgets['active_count'], widgets['queued_count'], widgets['overdue_count']),
                         (1, 1, 1))

    def test_dry_run_of_the_nightly_job_changes_nothing(self):
        self.book(self.first, days=5)
        self.book(self.second, days=7)
        booking = self.booking_of(self.first)
        Booking.objects.filter(pk=booking.pk).update(end_date=timezone.now() - timedelta(minutes=1))

        out = io.StringIO()
        call_command('expire_bookings', '--dry-run', stdout=out)
        report = out.getvalue()

        self.assertIn(f'Бронь №{booking.id}', report)
        self.assertIn('активируется бронь', report)
        self.assertIn('долг по взносу', report)
        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.BookingStatus.ACTIVE)
        self.assertEqual(self.booking_of(self.second).status, Booking.BookingStatus.PENDING_QUEUE)


class BookingSettingsApiTests(BookingBase):
    """Настройки брони компании: взнос, счёт, минимальный срок."""

    def test_settings_show_current_values_and_accounts(self):
        data = self.api.get('/api/bookings/settings/').data
        self.assertEqual(data['booking_fee_amount'], '1000000.00')
        self.assertEqual(data['booking_fee_account'], self.account.id)
        self.assertEqual(data['min_booking_days'], 3)
        self.assertEqual(data['booking_fee_currency'], 'UZS')
        self.assertIn(self.account.id, [row['id'] for row in data['accounts']])

    def test_fee_without_account_is_refused(self):
        response = self.api.patch('/api/bookings/settings/', {
            'booking_fee_amount': '500000', 'booking_fee_account': None,
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('счёт для взноса', response.data['error'])

    def test_zero_fee_makes_booking_free(self):
        response = self.api.patch('/api/bookings/settings/', {
            'booking_fee_amount': '0', 'booking_fee_account': None, 'min_booking_days': 1,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        self.book(self.first, days=1)
        booking = self.booking_of(self.first)
        self.assertEqual(booking.status, Booking.BookingStatus.ACTIVE)
        self.assertFalse(booking.payments.exists())

    def test_minimum_days_cannot_be_zero(self):
        response = self.api.patch('/api/bookings/settings/', {'min_booking_days': 0}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('не меньше одного дня', response.data['error'])
