# real_estate_crm/backend/apps/finances/filters.py

from django_filters import rest_framework as filters
from .models import Payment

class PaymentFilter(filters.FilterSet):
    client_name = filters.CharFilter(field_name='client__full_name', lookup_expr='icontains')
    deal_id = filters.NumberFilter(field_name='deal__id')
    status = filters.ChoiceFilter(choices=Payment.PaymentStatus.choices)
    due_date_after = filters.DateFilter(field_name='due_date', lookup_expr='gte')
    due_date_before = filters.DateFilter(field_name='due_date', lookup_expr='lte')
    # Фактическая оплата — вторая дата платежа. По ней собирают отчёт
    # о поступлениях: сводная таблица это умела, а список платежей нет.
    payment_date_after = filters.DateFilter(field_name='payment_date', lookup_expr='gte')
    payment_date_before = filters.DateFilter(field_name='payment_date', lookup_expr='lte')

    class Meta:
        model = Payment
        fields = [
            'client_name', 'deal_id', 'status',
            'due_date_after', 'due_date_before',
            'payment_date_after', 'payment_date_before',
        ]