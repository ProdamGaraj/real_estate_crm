# dieforglory/ai_crm/ai_crm-297f05ecec9a7a368e6ea96ef53d61a3abc0291f/real_estate_crm/backend/apps/deals/filters.py
from django_filters import rest_framework as filters
from .models import Deal

class DealFilter(filters.FilterSet):
    client_name = filters.CharFilter(field_name='client__full_name', lookup_expr='icontains')
    property_id = filters.NumberFilter(field_name='property__id')
    created_by_id = filters.NumberFilter(field_name='created_by__id')
    status = filters.ChoiceFilter(choices=Deal.DealStatus.choices)
    contract_date_after = filters.DateFilter(field_name='contract_date', lookup_expr='gte')
    contract_date_before = filters.DateFilter(field_name='contract_date', lookup_expr='lte')

    class Meta:
        model = Deal
        fields = [
            'client_name',
            'property_id',
            'created_by_id',
            'status',
            'contract_date_after',
            'contract_date_before'
        ]