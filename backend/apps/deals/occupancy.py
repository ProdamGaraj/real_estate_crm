"""
Занятость объекта: что держит объект — бронь, сделка или возврат денег.

Статус объекта определяют две сущности, и приоритет между ними один:
**живая сделка перекрывает бронь**. Пока по объекту идёт сделка, очередь
броней стоит, а объект показывается «Сделка в работе» или «Продан», даже
если в очереди есть брони.
"""

from apps.finances.models import Payment
from apps.realty.models import Property

from .models import Booking, Deal

# Статус объекта при живой сделке
EXPECTED_PROPERTY_STATUS = {
    Deal.DealStatus.IN_PROGRESS: Property.PropertyStatus.IN_DEAL,
    Deal.DealStatus.CLOSED_WON: Property.PropertyStatus.SOLD,
}
# Сделки, которые держат объект занятым
LIVE_DEAL_STATUSES = tuple(EXPECTED_PROPERTY_STATUS.keys())
OCCUPIED_STATUSES = (Property.PropertyStatus.BOOKING, Property.PropertyStatus.IN_DEAL,
                     Property.PropertyStatus.SOLD)


def live_deal(property_obj):
    """Сделка, которая держит объект: «В работе» или «Успешно закрыта»."""
    return (Deal.objects.filter(property=property_obj, status__in=LIVE_DEAL_STATUSES)
            .order_by('-id').first())


def active_booking(property_obj):
    """Действующая бронь объекта. Их не может быть больше одной."""
    return (Booking.objects.filter(property=property_obj, status=Booking.BookingStatus.ACTIVE)
            .order_by('-id').first())


def booking_queue(property_obj):
    """Очередь броней объекта, строго FIFO по дате создания."""
    return (Booking.objects.filter(property=property_obj, status=Booking.BookingStatus.PENDING_QUEUE)
            .order_by('created_at', 'id'))


def pending_refund_deal(property_obj):
    """Расторгнутая сделка с невозвращёнными платежами, которая держит объект занятым."""
    return (Deal.objects.filter(property=property_obj, status=Deal.DealStatus.TERMINATED,
                                payments__status=Payment.PaymentStatus.TO_BE_RETURNED)
            .order_by('-id').first())


def expected_property_status(property_obj):
    """
    Какой статус должен быть у объекта по его броням и сделкам.

    ``None`` — объект ничем не занят: статус определяет сотрудник
    («Подбор» или «Резерв»), и трогать его автоматика не должна.
    """
    deal = live_deal(property_obj)
    if deal is not None:
        return EXPECTED_PROPERTY_STATUS[deal.status]
    if active_booking(property_obj) is not None:
        return Property.PropertyStatus.BOOKING
    return None


def property_holder(property_obj):
    """
    Кто держит объект: ``('deal', Deal)``, ``('booking', Booking)``,
    ``('refund', Deal)`` или ``(None, None)``.

    Нужен там, где надо объяснить пользователю, почему объект занят.
    """
    deal = live_deal(property_obj)
    if deal is not None:
        return 'deal', deal
    booking = active_booking(property_obj)
    if booking is not None:
        return 'booking', booking
    refund = pending_refund_deal(property_obj)
    if refund is not None:
        return 'refund', refund
    return None, None
