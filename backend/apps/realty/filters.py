from django_filters import rest_framework as filters
from django.db.models import Q
from .models import Project, Building

class ProjectFilter(filters.FilterSet):
    """
    Фильтр для поиска по проектам.
    Ищет по частичному совпадению в названии или адресе.
    """
    search = filters.CharFilter(method='filter_search')

    class Meta:
        model = Project
        fields = ['search']

    def filter_search(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(
            Q(name__icontains=value) | Q(address__icontains=value)
        )

class BuildingFilter(filters.FilterSet):
    """
    Фильтр для поиска по домам.
    Ищет по частичному совпадению в названии.
    """
    search = filters.CharFilter(field_name='name', lookup_expr='icontains')

    class Meta:
        model = Building
        fields = ['search']