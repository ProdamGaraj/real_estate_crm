# -*- coding: utf-8 -*-
"""
Переносит действующие брони из сделок в модель `Booking`.

Переносятся **только** сделки в статусе «Бронь». Они чистые: ни одного
платежа, ни одного договора, ни одной скидки, по одному объекту на бронь.
После переноса запись сделки удаляется — иначе одна и та же бронь жила бы
дважды (как бронь и как сделка в воронке), а занятость объекта определяли
бы две записи сразу.

Закрытую историю не трогаем. Отменённые сделки без договора и без платежей
неотличимы от истёкших броней: ни одна не содержит признака авто-снятия,
так что даже планировщик не помогает. Их разбор — ручная работа без
выигрыша: никто не бронирует заново запись прошлого года. Воронка и отчёты
за прошлые периоды остаются теми же.

Цены. 24.11.2026 новый прайс записали прямо в `price`, в том числе у
забронированных объектов. По новой модели в `price` должна лежать цена,
по которой объект забронирован, а новая — в `pending_price`: она применится,
когда объект освободится. Поэтому там, где цена объекта разошлась с
`catalog_price` сделки (это цена на момент брони), значения расставляются
правильно. Денег это не затрагивает: сделки хранят свои снимки цены.
"""

from django.db import migrations


def move_bookings(apps, schema_editor):
    Deal = apps.get_model('deals', 'Deal')
    DealLog = apps.get_model('deals', 'DealLog')
    Booking = apps.get_model('deals', 'Booking')
    BookingLog = apps.get_model('deals', 'BookingLog')
    Property = apps.get_model('realty', 'Property')

    deals = list(
        Deal.objects.filter(status='BOOKING').select_related('property__building__project')
    )
    if not deals:
        return

    moved_logs = 0
    price_fixed = 0
    for deal in deals:
        prop = deal.property
        # Срок брони в днях: раньше хранилась дата окончания, и срок
        # восстанавливается из неё. Меньше суток считаем одними сутками
        duration = 1
        if deal.booking_end_date and deal.booking_start_date:
            duration = max(1, (deal.booking_end_date - deal.booking_start_date).days)

        catalog_price = deal.catalog_price
        booking = Booking.objects.create(
            company_id=deal.company_id,
            client_id=deal.client_id,
            property_id=deal.property_id,
            application_id=deal.application_id,
            deal=None,
            status='ACTIVE',
            duration_days=min(duration, 65535),
            start_date=deal.booking_start_date,
            end_date=deal.booking_end_date,
            price=catalog_price if catalog_price is not None else prop.price,
            currency=(deal.catalog_currency or prop.building.project.price_currency or ''),
            contract_number=None,
            contract_date=None,
            cancellation_reason=None,
            created_by_id=deal.created_by_id,
        )
        # `created_at` с auto_now_add при создании перезаписывается, а очередь
        # броней строго FIFO именно по нему: порядок должен остаться прежним
        Booking.objects.filter(pk=booking.pk).update(created_at=deal.created_at)

        logs = [
            BookingLog(
                booking=booking,
                user_id=log.user_id,
                action=f"(перенесено из сделки №{deal.id}) {log.action}",
            )
            for log in DealLog.objects.filter(deal=deal).order_by('created_at')
        ]
        logs.append(BookingLog(
            booking=booking,
            user_id=None,
            action=(
                f"Бронь перенесена из сделки №{deal.id} при разделении брони и сделки. "
                f"Срок {booking.duration_days} дн., цена {booking.price} {booking.currency}. "
                f"Договора брони и взноса у перенесённых броней нет — таких понятий "
                f"до разделения не существовало."
            ),
        ))
        BookingLog.objects.bulk_create(logs)
        moved_logs += len(logs)

        # Цена объекта: в `price` — цена на момент брони, в `pending_price` —
        # новая из прайса. Применится, когда объект освободится
        if catalog_price is not None and prop.price != catalog_price:
            Property.objects.filter(pk=prop.pk).update(
                pending_price=prop.price,
                pending_price_set_at=deal.created_at,
                price=catalog_price,
            )
            price_fixed += 1

        deal.delete()

    print(f"\n  перенесено броней: {len(deals)}, записей журнала: {moved_logs}, "
          f"цен объектов исправлено: {price_fixed}")


def move_back(apps, schema_editor):
    """
    Обратный перенос: брони снова становятся сделками в статусе «Бронь».

    Нужен, чтобы миграцию можно было откатить на тестовой базе. Переносятся
    только брони, не ставшие сделкой: оформленные в сделку уже ею и описаны.
    """
    Deal = apps.get_model('deals', 'Deal')
    DealLog = apps.get_model('deals', 'DealLog')
    Booking = apps.get_model('deals', 'Booking')
    BookingLog = apps.get_model('deals', 'BookingLog')

    bookings = list(
        Booking.objects.filter(status__in=('ACTIVE', 'PENDING_QUEUE'), deal__isnull=True)
        .select_related('property__building__project')
    )
    for booking in bookings:
        prop = booking.property
        area = prop.area or 1
        price = booking.price if booking.price is not None else prop.price
        deal = Deal.objects.create(
            company_id=booking.company_id,
            client_id=booking.client_id,
            property_id=booking.property_id,
            application_id=booking.application_id,
            status='BOOKING',
            booking_end_date=booking.end_date,
            currency=booking.currency or 'UZS',
            initial_price=price,
            initial_price_per_sqm=round(price / area, 2),
            catalog_price=booking.price,
            catalog_currency=booking.currency or '',
            created_by_id=booking.created_by_id,
        )
        Deal.objects.filter(pk=deal.pk).update(
            created_at=booking.created_at, booking_start_date=booking.start_date,
        )
        DealLog.objects.bulk_create([
            DealLog(deal=deal, user_id=log.user_id,
                    action=f"(возвращено из брони №{booking.id}) {log.action}")
            for log in BookingLog.objects.filter(booking=booking).order_by('created_at')
        ])
        booking.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('deals', '0011_booking_bookinglog_and_more'),
    ]

    operations = [
        migrations.RunPython(move_bookings, move_back),
    ]
