"""
Две цены объекта: `price` и `pending_price`.

Загрузка прайса раньше пропускала занятые объекты целиком, и новые цены
по ним в базе не хранились вообще — 24.11.2026 626 объектов пришлось
обновлять серверным скриптом, а проданные не обновляли вовсе. После
отказа по договору объект уходил в продажу по цене до повышения, и
заметить это по логам было нельзя.

Теперь загрузка пишет цену всем, а в `price` она переносится в тот
момент, когда объект перестаёт быть занятым.
"""

import io
from decimal import Decimal

import pandas as pd
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.realty.models import Building, Project, Property, PropertyLog
from apps.realty.services import apply_pending_price, property_is_free, release_property
from permissions.models import Company

User = get_user_model()


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class PendingPriceUploadTests(TestCase):
    def setUp(self):
        user = User.objects.create_user('admin', password='pass-for-tests')
        user.profile.is_system_admin = True
        user.profile.save()
        self.user = User.objects.get(pk=user.pk)
        self.company = Company.objects.create(name='К', code='K')
        self.project = Project.objects.create(name='ЖК', address='А', company=self.company,
                                              price_currency='USD')
        self.building = Building.objects.create(project=self.project, name='26', floors_count=3)
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def unit(self, number, price, status=Property.PropertyStatus.SELECTION):
        return Property.objects.create(building=self.building, property_type='APARTMENT',
                                       unit_number=number, floor=1, area=Decimal('27.00'),
                                       price=Decimal(price), status=status)

    def upload(self, rows):
        buffer = io.BytesIO()
        pd.DataFrame(rows).to_excel(buffer, index=False)
        file = SimpleUploadedFile(
            'units.xlsx', buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        return self.api.post(
            f'/api/projects/{self.project.id}/buildings/{self.building.id}/upload-properties/',
            {'file': file}, format='multipart')

    @staticmethod
    def row(number, price, area='27.00'):
        return {'Номер объекта': number, 'Этаж': 1, 'Площадь (кв.м)': area, 'Стоимость': price,
                'Тип объекта': 'APARTMENT'}

    def test_free_unit_gets_the_new_price_at_once(self):
        free = self.unit('А-1,01', '40500.00')
        response = self.upload([self.row('А-1,01', 46575.00)])
        self.assertEqual(response.status_code, 200, response.data)

        free.refresh_from_db()
        self.assertEqual(free.price, Decimal('46575.00'))
        self.assertIsNone(free.pending_price)
        self.assertEqual(response.data['details']['price_applied'], 1)

    def test_occupied_unit_keeps_its_price_but_remembers_the_new_one(self):
        sold = self.unit('А-1,02', '21000.00', Property.PropertyStatus.SOLD)
        in_deal = self.unit('А-1,03', '24000.00', Property.PropertyStatus.IN_DEAL)

        response = self.upload([self.row('А-1,02', 24150.00), self.row('А-1,03', 27600.00)])
        self.assertEqual(response.status_code, 200, response.data)

        sold.refresh_from_db()
        in_deal.refresh_from_db()
        # Цена договора не трогается…
        self.assertEqual(sold.price, Decimal('21000.00'))
        self.assertEqual(in_deal.price, Decimal('24000.00'))
        # …но новая цена теперь в базе есть, и это главное
        self.assertEqual(sold.pending_price, Decimal('24150.00'))
        self.assertEqual(in_deal.pending_price, Decimal('27600.00'))
        self.assertEqual(response.data['details']['price_deferred'], 2)

    def test_occupied_unit_area_is_not_touched_by_upload(self):
        sold = self.unit('А-1,04', '21000.00', Property.PropertyStatus.SOLD)
        self.upload([self.row('А-1,04', 24150.00, area='14.10')])
        sold.refresh_from_db()
        # Площадь и прочие поля у занятого объекта меняет только человек:
        # по ним уже зафиксированы условия договора
        self.assertEqual(sold.area, Decimal('27.00'))

    def test_release_applies_the_pending_price_and_logs_it(self):
        sold = self.unit('А-1,05', '21000.00', Property.PropertyStatus.SOLD)
        self.upload([self.row('А-1,05', 24150.00)])
        sold.refresh_from_db()

        self.assertFalse(property_is_free(sold) is False and sold.pending_price is None)
        release_property(sold, self.user, 'сделка расторгнута')

        sold.refresh_from_db()
        self.assertEqual(sold.status, Property.PropertyStatus.SELECTION)
        self.assertEqual(sold.price, Decimal('24150.00'))
        self.assertIsNone(sold.pending_price)
        self.assertTrue(PropertyLog.objects.filter(
            property=sold, action__contains='Цена из прайса применена: 21000.00 → 24150.00').exists())

    def test_second_price_before_the_first_is_applied_is_visible_in_the_log(self):
        sold = self.unit('А-1,06', '21000.00', Property.PropertyStatus.SOLD)
        self.upload([self.row('А-1,06', 24150.00)])
        self.upload([self.row('А-1,06', 25000.00)])

        sold.refresh_from_db()
        self.assertEqual(sold.pending_price, Decimal('25000.00'))
        # Одно поле ожидающей цены молча перезаписывается — в журнале
        # остаётся, что первая цена не успела примениться
        self.assertTrue(PropertyLog.objects.filter(
            property=sold, action__contains='Ожидающая цена изменена: 24150.00 → 25000.00').exists())

    def test_reserved_unit_is_free_enough_for_a_new_price(self):
        reserved = self.unit('А-1,07', '21000.00', Property.PropertyStatus.RESERVE)
        self.upload([self.row('А-1,07', 24150.00)])
        reserved.refresh_from_db()
        # Резерв ставят вручную, ни клиента, ни договора за ним нет
        self.assertEqual(reserved.price, Decimal('24150.00'))
        self.assertEqual(reserved.status, Property.PropertyStatus.RESERVE)

    def test_same_price_changes_nothing_and_writes_no_log(self):
        free = self.unit('А-1,08', '40500.00')
        self.upload([self.row('А-1,08', 40500.00)])
        free.refresh_from_db()
        self.assertIsNone(free.pending_price)
        self.assertFalse(PropertyLog.objects.filter(property=free).exists())

    def test_apply_pending_price_without_pending_does_nothing(self):
        free = self.unit('А-1,09', '40500.00')
        self.assertFalse(apply_pending_price(free, self.user))
        free.refresh_from_db()
        self.assertEqual(free.price, Decimal('40500.00'))


class FillPendingPricesCommandTests(TestCase):
    """Разовая заливка цен из файла прайса: без --apply ничего не меняет."""

    def setUp(self):
        self.company = Company.objects.create(name='К', code='K')
        project = Project.objects.create(name='ЖК', address='А', company=self.company,
                                         price_currency='USD')
        self.building = Building.objects.create(project=project, name='26', floors_count=3)
        self.sold = Property.objects.create(building=self.building, property_type='APARTMENT',
                                            unit_number='А-1,02', floor=1, area=Decimal('27'),
                                            price=Decimal('21000.00'),
                                            status=Property.PropertyStatus.SOLD)
        self.source = self._source([
            {'num': 'А-1,02', 'price': 24150.0},
            {'num': 'А-9,99', 'price': 1000.0},
        ])

    def _source(self, rows):
        import json
        import tempfile

        handle = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8')
        json.dump(rows, handle, ensure_ascii=False)
        handle.close()
        self.addCleanup(lambda: __import__('os').unlink(handle.name))
        return handle.name

    def run_command(self, *args):
        out = io.StringIO()
        call_command('fill_pending_prices', '--building', str(self.building.pk),
                     '--source', self.source, *args, stdout=out)
        return out.getvalue()

    def test_dry_run_reports_and_changes_nothing(self):
        report = self.run_command()
        self.assertIn('к записи:                  1', report)
        self.assertIn('номеров нет в доме:        1', report)
        self.assertIn('Ничего не записано', report)
        self.sold.refresh_from_db()
        self.assertIsNone(self.sold.pending_price)

    def test_apply_writes_only_pending_price(self):
        self.run_command('--apply')
        self.sold.refresh_from_db()
        self.assertEqual(self.sold.pending_price, Decimal('24150.00'))
        self.assertEqual(self.sold.price, Decimal('21000.00'))
