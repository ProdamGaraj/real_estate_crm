from django_filters import rest_framework as filters
from .models import Client
from django.contrib.auth.models import User
from .models import Client, Application, Meeting  # Убедитесь, что Application импортирована
from apps.realty.models import Project


class ClientFilter(filters.FilterSet):
    # Фильтр по имени (по частичному совпадению без учета регистра)
    full_name = filters.CharFilter(field_name='full_name', lookup_expr='icontains')

    # Фильтр по номеру телефона (ищет в связанной модели)
    phone_number = filters.CharFilter(method='filter_phone_number')

    def filter_phone_number(self, queryset, name, value):
        """
        Ищет по любому написанию номера.

        Пользователь набирает «90 123 45 67», а в базе лежит «+998901234567» —
        поиск подстрокой их не сопоставлял. Сравниваем по цифрам.
        """
        from django.db.models import Q

        from .phones import phone_search_variants

        variants = phone_search_variants(value)
        if not variants:
            return queryset

        condition = Q()
        for variant in variants:
            condition |= Q(phone_numbers__phone_number__icontains=variant)
        return queryset.filter(condition).distinct()

    # Фильтр по email
    email = filters.CharFilter(field_name='email', lookup_expr='icontains')

    # Фильтр по статусу (точное совпадение)
    status = filters.ChoiceFilter(choices=Client.ClientStatus.choices)

    # Фильтр по ИНН и ПИНФЛ
    inn = filters.CharFilter(field_name='inn', lookup_expr='icontains')
    pinfl = filters.CharFilter(field_name='pinfl', lookup_expr='icontains')

    # Фильтр по дате создания "от"
    created_at_after = filters.DateFilter(field_name='created_at', lookup_expr='date__gte')

    # Фильтр по дате создания "до"
    created_at_before = filters.DateFilter(field_name='created_at', lookup_expr='date__lte')

    # Фильтр по ответственному менеджеру
    created_by = filters.ModelChoiceFilter(
        queryset=User.objects.all(),
        field_name='created_by',
        to_field_name='id'  # Фильтруем по ID пользователя
    )

    class Meta:
        model = Client
        # Указываем все поля, по которым можно будет фильтровать
        fields = [
            'full_name',
            'phone_number',
            'email',
            'status',
            'inn',
            'pinfl',
            'created_at_after',
            'created_at_before',
            'created_by'
        ]


# Фильтры для заявок
class ApplicationFilter(filters.FilterSet):
    # Фильтр по статусу
    status = filters.ChoiceFilter(choices=Application.ApplicationStatusChoices.choices)

    # Фильтр по источнику
    source = filters.ChoiceFilter(choices=Application.ApplicationSource.choices)

    # Фильтр по ID клиента
    client_id = filters.NumberFilter(field_name='client__id')

    # Фильтр по интересующему проекту (по ID)
    interested_projects = filters.ModelChoiceFilter(
        queryset=Project.objects.all(),
        field_name='interested_projects',
        to_field_name='id'
    )

    # Фильтр по дате создания "от"
    created_at_after = filters.DateFilter(field_name='created_at', lookup_expr='date__gte')

    # Фильтр по дате создания "до"
    created_at_before = filters.DateFilter(field_name='created_at', lookup_expr='date__lte')

    updated_at_before = filters.DateFilter(field_name='updated_at', lookup_expr='date__lte')

    class Meta:
        model = Application
        fields = [
            'status',
            'source',
            'client_id',
            'interested_projects',
            'created_at_after',
            'created_at_before',
            'updated_at_before',
        ]


class MeetingFilter(filters.FilterSet):
    client_name = filters.CharFilter(field_name='client__full_name', lookup_expr='icontains')
    executor_id = filters.NumberFilter(field_name='executor__id')
    status = filters.ChoiceFilter(choices=Meeting.MeetingStatus.choices)
    planned_date_after = filters.DateFilter(field_name='planned_date', lookup_expr='date__gte')
    planned_date_before = filters.DateFilter(field_name='planned_date', lookup_expr='date__lte')

    class Meta:
        model = Meeting
        fields = ['client_name', 'executor_id', 'status', 'planned_date_after', 'planned_date_before']