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


def dead_deal_statuses():
    """Статусы сделок, по которым денег уже не ждут: отменена и расторгнута."""
    from apps.deals.models import Deal

    return (Deal.DealStatus.CANCELLED, Deal.DealStatus.TERMINATED)


def exclude_dead_deals(queryset):
    """
    Убирает из выборки платежи отменённых и расторгнутых сделок.

    Нужна там, где считаются ожидаемые деньги (просрочка, «к оплате»,
    остаток). Платежи расторгнутых договоров переводятся в «Отменён»
    при расторжении, но в базе остаются строки, созданные до появления
    этого статуса, поэтому витрины фильтруют и по статусу сделки.
    Платежи без сделки остаются: сделка — необязательная связь.
    """
    return queryset.exclude(deal__status__in=dead_deal_statuses())


def cancel_unpaid_payments(deal):
    """
    Переводит неоплаченные платежи сделки в статус «Отменён».

    Вызывается при отмене и расторжении сделки: по такому договору
    остаток уже не ждут, и держать его в «Просрочен»/«К оплате» значит
    показывать руководству несуществующий долг.

    :return: количество обновлённых платежей.
    """
    return deal.payments.filter(
        status__in=Payment.UNPAID_STATUSES
    ).update(status=Payment.PaymentStatus.CANCELLED)


def refresh_overdue_payments(queryset=None):
    """
    Переводит неоплаченные платежи с истёкшим сроком в статус «Просрочен».

    Платежи отменённых и расторгнутых сделок не трогаются: по ним денег
    не ждут, и просроченными они быть не могут.

    :param queryset: ограничение выборки (например, по правам пользователя).
                     None — обработать все платежи в системе.
    :return: количество обновлённых платежей.
    """
    payments = Payment.objects.all() if queryset is None else queryset
    return exclude_dead_deals(payments).filter(
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
