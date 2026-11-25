# real_estate_crm/backend/apps/deals/booking.py
"""
Переходы броней: очередь, активация, снятие, продление, конвертация.

Ошибки здесь не видны сразу: автомат крутится ночью без присмотра, и
пропущенная ветка не падает с ошибкой, а молча оставляет объект занятым
или продаёт его по цене до повышения. Поэтому порядок на границе двух
броней живёт в одной функции — `resettle_property`:

    закрыть предыдущую → снять её неоплаченный долг → перенести
    ожидающую цену → активировать следующую → записать ей даты и
    зафиксировать цену.

Все вызовы делаются внутри транзакции, под `select_for_update` на объекте:
иначе два менеджера одновременно активируют две брони на одну квартиру.
"""

from datetime import timedelta

from django.utils import timezone

from apps.realty.models import Property
from apps.realty.services import apply_pending_price, log_property, release_property

from .models import Booking, BookingLog
from .occupancy import (
    EXPECTED_PROPERTY_STATUS, active_booking, booking_queue, live_deal, pending_refund_deal,
)


class BookingError(Exception):
    """Бронь нельзя оформить или изменить: сообщение уходит пользователю."""


def lock_property(property_obj):
    """
    Перечитывает объект под блокировкой до конца транзакции.

    Без неё две брони проходят проверку одновременно и обе становятся
    активными — уникальное ограничение отклоняет вторую уже после того,
    как по первой создан платёж.
    """
    return Property.objects.select_for_update().select_related('building__project').get(
        pk=property_obj.pk if hasattr(property_obj, 'pk') else property_obj
    )


# --------------------------------------------------------------- настройки

def booking_settings(company):
    """
    Настройки брони компании: ``(сумма взноса, счёт, минимальный срок)``.

    Компании нет (записи до мультитенантности) — взнос не создаётся,
    минимальный срок 1 день.
    """
    if company is None:
        return None, None, 1
    amount = company.booking_fee_amount or None
    return amount, company.booking_fee_account, company.min_booking_days or 1


def validate_duration(company, duration_days):
    """Срок брони не короче минимума из настроек компании."""
    _, _, minimum = booking_settings(company)
    if duration_days is None or duration_days < 1:
        raise BookingError("Срок брони указывается в днях и не может быть меньше одного дня.")
    if duration_days < minimum:
        raise BookingError(
            f"Минимальный срок брони — {minimum} дн. По настройкам компании меньше нельзя."
        )
    return duration_days


# --------------------------------------------------------------- взнос

def create_fee_payment(booking, actor=None):
    """
    Создаёт единственный платёж брони — взнос.

    Сумма фиксированная, из настроек компании, в валюте сделок компании:
    прайс проекта может быть в долларах, а взнос платят в сумах. Взнос —
    реальный долг: не оплачен — подлежит оплате, бронь снята — долг
    снимается (`cancel_unpaid_payments`).

    Взнос, не заданный в настройках (ноль), не создаётся: бронь остаётся
    бесплатной, и компания, не настроившая взнос, не блокируется.
    """
    from apps.finances.models import Payment
    from apps.finances.services import resolve_unpaid_status

    amount, account, _ = booking_settings(booking.company)
    if not amount:
        return None
    if account is None:
        raise BookingError(
            "В настройках компании не указан счёт для взноса за бронь. "
            "Укажите счёт в разделе «Настройки» или обнулите сумму взноса."
        )
    if booking.payments.exists():
        # Повторная активация той же брони взнос не удваивает
        return booking.payments.first()

    due_date = (booking.start_date or timezone.now()).date()
    return Payment.objects.create(
        company=booking.company,
        booking=booking,
        client=booking.client,
        amount=amount,
        currency=booking.company.deal_currency if booking.company else 'UZS',
        method=Payment.PaymentMethod.CASHLESS,
        beneficiary_account=account,
        due_date=due_date,
        status=resolve_unpaid_status(due_date),
        responsible_employee=booking.created_by,
        created_by=actor or booking.created_by,
    )


# --------------------------------------------------------------- переходы

def activate_booking(booking, actor=None, reason='', prop=None):
    """
    Делает бронь действующей: даты, цена, статус объекта, взнос.

    Цена фиксируется именно здесь, а не при создании: бронь из очереди
    иначе «забрала» бы старую цену, и повышение прайса между двумя
    бронями до неё не дошло бы.
    """
    now = timezone.now()
    prop = prop or booking.property
    project = prop.building.project

    booking.status = Booking.BookingStatus.ACTIVE
    booking.start_date = now
    booking.end_date = now + timedelta(days=booking.duration_days)
    booking.price = prop.price
    booking.currency = project.price_currency or ''
    booking.save(update_fields=['status', 'start_date', 'end_date', 'price', 'currency', 'updated_at'])

    if prop.status != Property.PropertyStatus.BOOKING:
        was = prop.get_status_display()
        prop.status = Property.PropertyStatus.BOOKING
        prop.save(update_fields=['status', 'updated_at'])
        log_property(prop, actor, f"Объект забронирован (бронь №{booking.id}): «{was}» → «Бронь».")

    payment = create_fee_payment(booking, actor)

    action = (
        f"Бронь активирована до {booking.end_date:%d.%m.%Y %H:%M} "
        f"(срок {booking.duration_days} дн.). Цена объекта зафиксирована: "
        f"{booking.price} {booking.currency}."
    )
    if payment is not None:
        action += f" Взнос {payment.amount} {payment.currency} со сроком {payment.due_date}."
    if reason:
        action += f" Причина активации: {reason}"
    BookingLog.objects.create(booking=booking, user=actor, action=action)
    return booking


def finish_booking(booking, *, status, reason, actor=None, advance=True):
    """
    Снимает бронь: статус, причина, снятие неоплаченного долга, очередь.

    Бронь, ставшая сделкой (`CONVERTED`), неизменяема и из снятия
    исключена — в том числе из автоматического.

    :param advance: двигать ли очередь. Выключается при массовой отмене
                    хвоста очереди, когда объект уже продан.
    :return: True, если бронь была снята этим вызовом.
    """
    from apps.finances.services import cancel_unpaid_payments

    if booking.status not in Booking.LIVE_STATUSES:
        return False

    was_active = booking.status == Booking.BookingStatus.ACTIVE
    booking.status = status
    booking.cancellation_reason = reason
    booking.save(update_fields=['status', 'cancellation_reason', 'updated_at'])

    action = f"{Booking.BookingStatus(status).label}. {reason}"
    cancelled = cancel_unpaid_payments(booking=booking)
    if cancelled:
        action += f" Неоплаченных взносов снято: {cancelled}."
    BookingLog.objects.create(booking=booking, user=actor, action=action)

    if advance and was_active:
        resettle_property(booking.property, actor=actor, reason=reason)
    return True


def cancel_queue(property_obj, actor=None, reason='Другая бронь стала сделкой.', exclude=None):
    """
    Отменяет хвост очереди: объект продан, ждать больше нечего.

    Вызывается при успешном закрытии сделки. Долги по снятым броням
    снимаются, объект уже «Продан», поэтому очередь не двигается.
    """
    cancelled = 0
    for booking in booking_queue(property_obj):
        if exclude is not None and booking.pk == exclude.pk:
            continue
        if finish_booking(booking, status=Booking.BookingStatus.CANCELLED, reason=reason,
                          actor=actor, advance=False):
            cancelled += 1
    return cancelled


def resettle_property(property_obj, actor=None, reason=''):
    """
    Пересчитывает занятость объекта: единственное место на границе.

    Шесть ветвей, которые нельзя разнести по вызывающим модулям:

    1. объект держит живая сделка — статус по сделке, очередь стоит;
    2. объект держит действующая бронь — статус «Бронь»;
    3. объект держат невозвращённые платежи расторгнутой сделки — ждём
       возврата, не освобождаем и очередь не двигаем;
    4. очередь пуста — объект в «Подбор», ожидающая цена применяется;
    5. в очереди есть бронь — цена применяется **до** активации (это тот
       самый момент между двумя бронями, когда цена и должна подняться),
       затем бронь активируется и фиксирует уже новую цену;
    6. объект не занят и не был занят — ничего не меняется.

    :return: бронь, ставшая действующей, или None.
    """
    deal = live_deal(property_obj)
    if deal is not None:
        _align_status(property_obj, EXPECTED_PROPERTY_STATUS[deal.status], actor,
                      f"по сделке №{deal.id}")
        return None

    current = active_booking(property_obj)
    if current is not None:
        _align_status(property_obj, Property.PropertyStatus.BOOKING, actor,
                      f"по брони №{current.id}")
        return None

    if pending_refund_deal(property_obj) is not None:
        # Продавать квартиру, по которой не рассчитались с прежним клиентом,
        # нельзя: объект освободится, когда вернут последний платёж
        return None

    following = booking_queue(property_obj).first()
    if following is None:
        release_property(property_obj, actor, reason)
        return None

    apply_pending_price(property_obj, actor,
                        reason=reason or 'очередь броней продвинулась')
    return activate_booking(following, actor=actor, reason=reason, prop=property_obj)


def _align_status(property_obj, expected, actor, note):
    """Приводит статус объекта к ожидаемому, если он разошёлся."""
    if property_obj.status == expected:
        return False
    was = property_obj.get_status_display()
    property_obj.status = expected
    property_obj.save(update_fields=['status', 'updated_at'])
    log_property(property_obj, actor,
                 f"Статус объекта приведён к занятости ({note}): "
                 f"«{was}» → «{Property.PropertyStatus(expected).label}».")
    return True


def extend_booking(booking, duration_days, actor=None):
    """
    Меняет срок брони. Даты хвоста очереди пересчитываются сами.

    Продлевать можно только неистёкшую бронь и в любом месте очереди.
    Продление бесплатное: первый взнос покрывает продлённый срок.
    """
    if booking.status not in Booking.LIVE_STATUSES:
        raise BookingError("Срок меняется только у брони в очереди или действующей брони.")
    if booking.status == Booking.BookingStatus.ACTIVE and booking.is_expired_by_date:
        raise BookingError("Срок брони уже истёк — продлить её нельзя, оформите новую бронь.")

    validate_duration(booking.company, duration_days)
    was = booking.duration_days
    if duration_days == was:
        return booking

    booking.duration_days = duration_days
    fields = ['duration_days', 'updated_at']
    if booking.status == Booking.BookingStatus.ACTIVE and booking.start_date:
        new_end = booking.start_date + timedelta(days=duration_days)
        if new_end <= timezone.now():
            raise BookingError(
                "При таком сроке бронь закончилась бы уже сейчас. "
                "Укажите срок длиннее или снимите бронь."
            )
        booking.end_date = new_end
        fields.append('end_date')
    booking.save(update_fields=fields)

    action = f"Срок брони изменён: {was} → {duration_days} дн."
    if booking.end_date:
        action += f" Новая дата окончания: {booking.end_date:%d.%m.%Y %H:%M}."
    BookingLog.objects.create(booking=booking, user=actor, action=action)
    return booking


# --------------------------------------------------------------- расчётные даты

def projected_schedule(property_obj, now=None):
    """
    Даты броней объекта: фактические у действующей, расчётные у очереди.

    Конец предыдущей брони — начало следующей. В базе расчётные даты не
    хранятся: любое изменение срока или продвижение очереди пересчитывает
    их целиком. За живой сделкой расчётных дат нет вовсе — неизвестно,
    когда сделка разрешится, поэтому брони показываются как «ожидает».

    :return: ``{booking_id: {'start_date', 'end_date', 'projected'}}``
    """
    now = now or timezone.now()
    schedule = {}

    deal = live_deal(property_obj)
    current = active_booking(property_obj)
    unknown = deal is not None
    cursor = now

    if current is not None:
        schedule[current.id] = {
            'start_date': current.start_date,
            'end_date': current.end_date,
            'projected': False,
        }
        if current.end_date:
            # Срок мог истечь до ночного прогона: очередь начинается не в прошлом
            cursor = max(current.end_date, now)

    for booking in booking_queue(property_obj):
        if unknown:
            schedule[booking.id] = {'start_date': None, 'end_date': None, 'projected': True}
            continue
        end = cursor + timedelta(days=booking.duration_days)
        schedule[booking.id] = {'start_date': cursor, 'end_date': end, 'projected': True}
        cursor = end

    return schedule


def queue_position(booking):
    """Место брони в очереди: 0 — действующая, 1 и далее — ожидающие."""
    if booking.status == Booking.BookingStatus.ACTIVE:
        return 0
    if booking.status != Booking.BookingStatus.PENDING_QUEUE:
        return None
    ahead = booking_queue(booking.property).filter(
        created_at__lt=booking.created_at
    ).count()
    # Действующая бронь занимает нулевое место, поэтому очередь начинается с 1
    return ahead + 1


# --------------------------------------------------------------- сделка

def attach_booking_to_deal(booking, deal, actor=None):
    """
    Бронь стала сделкой: `CONVERTED`, платёж получает ссылку на сделку.

    Запись становится неизменяемой и исключается из автоматического снятия.
    У платежа-взноса после этого заполнены **оба** поля: `booking` остаётся
    как происхождение (по нему отчёты отделяют деньги броней), `deal`
    добавляется, чтобы взнос вошёл в график сделки первой строкой и в
    проверку суммы графика против стоимости по договору.

    Ожидающая цена объекта здесь **не** применяется: объект остаётся
    занятым, а цена сделки уже зафиксирована при активации брони.
    """
    booking.status = Booking.BookingStatus.CONVERTED
    booking.deal = deal
    booking.save(update_fields=['status', 'deal', 'updated_at'])

    moved = booking.payments.update(deal=deal)
    action = (f"Бронь оформлена в сделку №{deal.id}. "
              f"Цена брони {booking.price} {booking.currency} перенесена в сделку.")
    if moved:
        action += f" Взнос включён в график сделки (строк: {moved})."
    BookingLog.objects.create(booking=booking, user=actor, action=action)
    return booking


def booking_for_deal(deal):
    """Бронь сделки или None: `OneToOne` в обратную сторону без исключения."""
    try:
        return deal.booking
    except Booking.DoesNotExist:
        return None


def cancel_booking_of_deal(deal, actor=None, reason=None, advance=True):
    """
    Отмена сделки отменяет и её бронь, очередь продвигается.

    Решение PM: следующая бронь активируется с этого момента, расчётные
    даты всей очереди пересчитываются.
    """
    booking = booking_for_deal(deal)
    if booking is None or booking.status != Booking.BookingStatus.CONVERTED:
        return None

    booking.status = Booking.BookingStatus.CANCELLED
    booking.cancellation_reason = reason or f"Сделка №{deal.id} {deal.get_status_display().lower()}."
    booking.save(update_fields=['status', 'cancellation_reason', 'updated_at'])
    BookingLog.objects.create(booking=booking, user=actor, action=booking.cancellation_reason)

    if advance:
        resettle_property(deal.property, actor=actor, reason=booking.cancellation_reason)
    return booking
