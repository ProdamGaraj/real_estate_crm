# real_estate_crm/backend/apps/realty/services.py
"""
Занятость объекта и перенос цены из прайса.

Объект возвращали в «Подбор» пять разных мест, и два из них — одно и то же
событие в разных модулях (отмена сделки в `deals/views.py` и отказ по
договору с возвратом денег в `finances/views.py`). Как только к освобождению
добавился перенос ожидающей цены, дописывать его в каждое место стало
опасно: забытое место не падает с ошибкой, объект просто уходит в продажу
по цене до повышения, и по логам это не видно.

Поэтому освобождение живёт здесь одной функцией, а все остальные модули
пользуются только ей.
"""

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import Property, PropertyLog

# Статусы объекта, при которых он занят и цена из прайса к нему не применяется
OCCUPIED_STATUSES = (
    Property.PropertyStatus.BOOKING,
    Property.PropertyStatus.IN_DEAL,
    Property.PropertyStatus.SOLD,
)


def log_property(prop, actor, action):
    """Запись в журнал объекта. Вынесена, чтобы вызовы были одинаковыми."""
    return PropertyLog.objects.create(property=prop, user=actor, action=action)


def set_pending_price(prop, price, actor=None, *, note=''):
    """
    Записывает цену из прайса в `pending_price`, не меняя `price`.

    Возвращает True, если значение изменилось. Повтор той же цены не пишется
    и в журнал не попадает: загрузка прайса идёт по всему дому, и иначе
    каждая загрузка оставляла бы по записи на каждый объект.
    """
    if price is None:
        return False
    if prop.pending_price is not None and prop.pending_price == price:
        return False
    # Цена, равная текущей, ожидающей не является: применять нечего
    if prop.pending_price is None and prop.price == price:
        return False

    previous = prop.pending_price
    prop.pending_price = price
    prop.pending_price_set_at = timezone.now()
    prop.save(update_fields=['pending_price', 'pending_price_set_at', 'updated_at'])

    if previous is not None and previous != price:
        # Прежняя ожидающая цена перезаписана, не успев примениться
        action = (f"Ожидающая цена изменена: {previous} → {price} "
                  f"(текущая цена объекта {prop.price} не менялась).")
    else:
        action = f"Записана ожидающая цена {price} (текущая цена объекта {prop.price})."
    if note:
        action += f" {note}"
    log_property(prop, actor, action)
    return True


def apply_pending_price(prop, actor=None, *, reason=''):
    """
    Переносит `pending_price` в `price`: объект больше не занят.

    Вызывается в каждый момент, когда объект перестаёт быть занятым, —
    и когда очередь броней продвинулась, то есть в тот самый момент между
    двумя бронями, когда цена и должна подняться. При конвертации брони
    в сделку не вызывается: объект остаётся занятым, а цена сделки уже
    зафиксирована при активации брони.

    :return: True, если цена изменилась.
    """
    if prop.pending_price is None:
        return False

    old_price = prop.price
    prop.price = prop.pending_price
    prop.pending_price = None
    prop.pending_price_set_at = None
    prop.save(update_fields=['price', 'pending_price', 'pending_price_set_at', 'updated_at'])

    action = f"Цена из прайса применена: {old_price} → {prop.price}."
    if reason:
        action += f" Причина: {reason}"
    log_property(prop, actor, action)
    return True


def apply_pending_prices_bulk(queryset, actor=None, *, reason='Загрузка прайса'):
    """
    Переносит ожидающие цены у свободных объектов одним запросом.

    Нужна для загрузки прайса: дом — это почти тысяча объектов, и перенос
    по одному означал бы столько же запросов. Занятые объекты сохраняют
    ожидающую цену до освобождения.

    :param queryset: объекты, среди которых искать (например, дом).
    :return: количество применённых цен.
    """
    from apps.deals.models import Booking

    free = queryset.filter(pending_price__isnull=False).exclude(
        status__in=OCCUPIED_STATUSES
    ).exclude(
        # Страховка: активная бронь при статусе объекта, разошедшемся с ней
        pk__in=Booking.objects.filter(
            status=Booking.BookingStatus.ACTIVE
        ).values('property_id')
    )

    rows = list(free.values_list('pk', 'price', 'pending_price'))
    if not rows:
        return 0

    with transaction.atomic():
        PropertyLog.objects.bulk_create([
            PropertyLog(
                property_id=pk,
                user=actor,
                action=f"Цена из прайса применена: {old} → {new}. Причина: {reason}",
            )
            for pk, old, new in rows
        ])
        # Один запрос на всю выборку вместо N+N
        Property.objects.filter(pk__in=[pk for pk, _, _ in rows]).update(
            price=F('pending_price'), pending_price=None, pending_price_set_at=None,
            updated_at=timezone.now(),
        )
    return len(rows)


def property_is_free(prop):
    """
    Свободен ли объект: нет активной брони и нет живой сделки.

    «Резерв» свободен: резерв ставят вручную и он не связан ни с клиентом,
    ни с договором, поэтому цена по прайсу к нему применяется.
    """
    from apps.deals.models import Booking
    from apps.deals.occupancy import live_deal, pending_refund_deal

    if live_deal(prop) is not None:
        return False
    if pending_refund_deal(prop) is not None:
        return False
    return not Booking.objects.filter(
        property=prop, status=Booking.BookingStatus.ACTIVE
    ).exists()


def release_property(prop, actor=None, reason=''):
    """
    Возвращает объект в «Подбор» и переносит ожидающую цену.

    Единственное место, где объект освобождается: истёк срок последней брони,
    бронь снята вручную, сделка отменена или расторгнута (включая отказ по
    договору после возврата всех платежей), клиент удалён, расхождение
    исправлено командой сверки.

    Объект в «Подборе» или «Резерве» занятым не считается, статус ему не
    меняется — но ожидающая цена применяется и к нему: он свободен.

    :return: True, если что-то изменилось.
    """
    changed = False
    if prop.status in OCCUPIED_STATUSES:
        was = prop.get_status_display()
        prop.status = Property.PropertyStatus.SELECTION
        prop.save(update_fields=['status', 'updated_at'])
        action = f"Объект освобождён: «{was}» → «Подбор»."
        if reason:
            action += f" Причина: {reason}"
        log_property(prop, actor, action)
        changed = True

    if apply_pending_price(prop, actor, reason=reason or 'объект освобождён'):
        changed = True
    return changed
