"""
Метрики план-факт: прогноз и проценты.

В отчёте по сотрудникам в столбце «% прогноз» стояли значения вида
«245,45 (0 %)»: прогноз по договорам считался дробным, а процент без
загруженного плана показывался нулём, как будто план не выполнен.
Договоры считаются штуками, а процент без плана не определён.
"""

from datetime import date
from decimal import Decimal

from django.test import TestCase

from .views import calculate_metrics


class MetricsTests(TestCase):
    # Период с запасом, чтобы «сегодня» всегда было внутри него
    START = date(date.today().year, 1, 1)
    END = date(date.today().year, 12, 31)

    def test_units_forecast_is_whole(self):
        metrics = calculate_metrics(0, 90, self.START, self.END, whole_units=True)
        self.assertIsInstance(metrics['forecast'], int)

    def test_percentages_are_undefined_without_plan(self):
        metrics = calculate_metrics(0, 90, self.START, self.END, whole_units=True)
        self.assertIsNone(metrics['percentage'])
        self.assertIsNone(metrics['forecast_percentage'])

    def test_percentages_are_calculated_with_plan(self):
        metrics = calculate_metrics(Decimal('200'), Decimal('100'), self.START, self.END)
        self.assertEqual(metrics['percentage'], Decimal('50.00'))
        self.assertGreater(metrics['forecast_percentage'], Decimal('0'))

    def test_money_forecast_keeps_kopecks(self):
        metrics = calculate_metrics(Decimal('100'), Decimal('10.55'), self.START, self.END)
        self.assertIsInstance(metrics['forecast'], Decimal)
