# -*- coding: utf-8 -*-
"""
Убирает у сделки поля и статус брони: бронь теперь отдельная сущность.

Идёт строго после переноса данных (0012): до него поля `booking_start_date`
и `booking_end_date` ещё нужны, чтобы восстановить срок брони.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('deals', '0012_move_bookings_to_booking'),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name='deal',
            name='deals_deal_booking_78a970_idx',
        ),
        migrations.RemoveField(
            model_name='deal',
            name='booking_end_date',
        ),
        migrations.RemoveField(
            model_name='deal',
            name='booking_start_date',
        ),
        migrations.AlterField(
            model_name='deal',
            name='status',
            field=models.CharField(
                choices=[('IN_PROGRESS', 'В работе'), ('CLOSED_WON', 'Успешно закрыта'),
                         ('CANCELLED', 'Отменена'), ('TERMINATED', 'Расторгнута')],
                default='IN_PROGRESS', max_length=20, verbose_name='Статус сделки'),
        ),
    ]
