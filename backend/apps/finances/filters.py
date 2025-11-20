# real_estate_crm/backend/apps/finances/filters.py

from django_filters import rest_framework as filters
from .models import Payment

class PaymentFilter(filters.FilterSet):
    client_name = filters.CharFilter(field_name='client__full_name', lookup_expr='icontains')
    deal_id = filters.NumberFilter(field_name='deal__id')
    status = filters.ChoiceFilter(choices=Payment.PaymentStatus.choices)
    due_date_after = filters.DateFilter(field_name='due_date', lookup_expr='gte')
    due_date_before = filters.DateFilter(field_name='due_date', lookup_expr='lte')

    class Meta:
        model = Payment
        fields = ['client_name', 'deal_id', 'status', 'due_date_after', 'due_date_before']