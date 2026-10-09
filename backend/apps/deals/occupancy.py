"""
Занятость объекта сделками: какой статус объекта соответствует живой сделке
и какая расторгнутая сделка держит объект до возврата платежей.
"""

from apps.finances.models import Payment
from apps.realty.models import Property

from .models import Deal

# Статус объекта при живой сделке
EXPECTED_PROPERTY_STATUS = {
    Deal.DealStatus.BOOKING: Property.PropertyStatus.BOOKING,
    Deal.DealStatus.IN_PROGRESS: Property.PropertyStatus.IN_DEAL,
    Deal.DealStatus.CLOSED_WON: Property.PropertyStatus.SOLD,
}
OCCUPIED_STATUSES = (Property.PropertyStatus.BOOKING, Property.PropertyStatus.IN_DEAL, Property.PropertyStatus.SOLD)


def pending_refund_deal(property_obj):
    """Расторгнутая сделка с невозвращёнными платежами, которая держит объект занятым."""
    return (Deal.objects.filter(property=property_obj, status=Deal.DealStatus.TERMINATED,
                                payments__status=Payment.PaymentStatus.TO_BE_RETURNED)
            .order_by('-id').first())
