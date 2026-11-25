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


def dead_booking_statuses():
    """Статусы броней, по которым денег уже не ждут: истекла и снята."""
    from apps.deals.models import Booking

    return (Booking.BookingStatus.EXPIRED, Booking.BookingStatus.CANCELLED)


def exclude_dead_deals(queryset):
    """
    Убирает из выборки платежи отменённых и расторгнутых сделок и мёртвых броней.

    Нужна там, где считаются ожидаемые деньги (просрочка, «к оплате»,
    остаток). Платежи расторгнутых договоров переводятся в «Отменён»
    при расторжении, но в базе остаются строки, созданные до появления
    этого статуса, поэтому витрины фильтруют и по статусу сделки.

    Взнос по брони — такой же случай через другую дверь: у него нет
    сделки, пока бронь не оформлена в сделку, поэтому фильтр по статусу
    сделки его не ловил, и неоплаченный взнос истёкшей брони остался бы
    «Просрочен» навсегда. Платежи без сделки и без брони остаются:
    сделка — необязательная связь.
    """
    return queryset.exclude(deal__status__in=dead_deal_statuses()).exclude(
        deal__isnull=True, booking__status__in=dead_booking_statuses()
    )


def exclude_booking_fees(queryset):
    """
    Убирает взносы по броням: бронь — не контрактация.

    Платежи броней не входят в план-факт и в контрактацию и показываются
    отдельной строкой. Взнос, вошедший в график сделки, остаётся: он
    часть стоимости договора.
    """
    return queryset.exclude(booking__isnull=False, deal__isnull=True)


def cancel_unpaid_payments(deal=None, booking=None):
    """
    Переводит неоплаченные платежи сделки или брони в статус «Отменён».

    Вызывается при отмене и расторжении сделки и при снятии брони: по
    такому договору остаток уже не ждут, и держать его в «Просрочен»/
    «К оплате» значит показывать руководству несуществующий долг.

    :return: количество обновлённых платежей.
    """
    owner = deal if deal is not None else booking
    if owner is None:
        return 0
    return owner.payments.filter(
        status__in=Payment.UNPAID_STATUSES
    ).update(status=Payment.PaymentStatus.CANCELLED)


def refresh_overdue_payments(queryset=None):
    """
    Переводит неоплаченные платежи с истёкшим сроком в статус «Просрочен».

    Платежи отменённых и расторгнутых сделок и мёртвых броней не трогаются:
    по ним денег не ждут, и просроченными они быть не могут.

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
