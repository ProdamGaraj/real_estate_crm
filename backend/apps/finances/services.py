# real_estate_crm/backend/apps/finances/services.py
"""
Общая бизнес-логика по платежам.

Вынесена отдельно, чтобы статус «Просрочен» считался одинаково во всех местах,
где цифры по платежам попадают пользователю на глаза: список платежей, сводка
по финансам, дашборд и management-команда для запуска по расписанию.
"""

from django.core.cache import cache
from django.utils import timezone

from .models import Payment


def refresh_overdue_payments(queryset=None):
    """
    Переводит неоплаченные платежи с истёкшим сроком в статус «Просрочен».

    :param queryset: ограничение выборки (например, по правам пользователя).
                     None — обработать все платежи в системе.
    :return: количество обновлённых платежей.
    """
    payments = Payment.objects.all() if queryset is None else queryset
    return payments.filter(
        due_date__lt=timezone.now().date(),
        status=Payment.PaymentStatus.PENDING,
    ).update(status=Payment.PaymentStatus.OVERDUE)


def resolve_unpaid_status(due_date):
    """
    Статус для платежа без фактической оплаты: «Просрочен» или «К оплате».

    Используется при создании и пересборке графика, чтобы новый срок оплаты
    сразу давал корректный статус, не дожидаясь следующего пересчёта.
    """
    if due_date and due_date < timezone.now().date():
        return Payment.PaymentStatus.OVERDUE
    return Payment.PaymentStatus.PENDING


# Как часто допускается пересчёт из обработчика чтения (секунды)
REFRESH_THROTTLE_SECONDS = 600


def refresh_overdue_payments_throttled(queryset=None, cache_key='crm:overdue_refresh'):
    """
    То же, что refresh_overdue_payments, но не чаще раза в 10 минут.

    Пересчёт вызывается из GET-обработчиков (список платежей, сводка, дашборд),
    то есть чтение превращалось в запись на каждый запрос. Регулярный пересчёт
    выполняет планировщик, а это лишь подстраховка для свежести цифр.
    """
    try:
        if cache.get(cache_key):
            return 0
        cache.set(cache_key, True, REFRESH_THROTTLE_SECONDS)
    except Exception:
        # Кеш недоступен — работаем как раньше, без троттлинга
        pass
    return refresh_overdue_payments(queryset)
