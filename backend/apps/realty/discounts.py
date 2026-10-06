"""
Скидки, которые можно применить к объекту сегодня.

Одна выборка для сделки («Применить скидки») и для калькулятора рассрочки
в карточке объекта, чтобы условия не расходились.
"""

from django.db.models import Q
from django.utils import timezone

from .models import Discount


def available_discounts(user, property_obj):
    """Действующие скидки компании, подходящие объекту по дому и типу."""
    from .views import _filter_by_company_scope

    today = timezone.localdate()
    # Ограничения складываются, а не заменяют друг друга: скидка подходит,
    # если её ограничение по дому И ограничение по типу недвижимости
    # выполняются одновременно. При ИЛИ скидка одного дома попадала
    # в подбор для другого — достаточно было совпадения типа объекта.
    matches_building = Q(buildings__isnull=True) | Q(buildings=property_obj.building)
    matches_type = Q(property_type__isnull=True) | Q(property_type='') | \
        Q(property_type=property_obj.property_type)
    # Скидка действует, если период начался и ещё не закончился
    in_period = Q(start_date__lte=today) & (Q(end_date__isnull=True) | Q(end_date__gte=today))

    queryset = Discount.objects.filter(matches_building, matches_type, in_period, is_active=True).distinct()
    # Скидка принадлежит компании — чужие условия не предлагаем
    return (_filter_by_company_scope(user, queryset, 'company', 'DISCOUNT')
            .prefetch_related('buildings', 'payment_plans').distinct())
