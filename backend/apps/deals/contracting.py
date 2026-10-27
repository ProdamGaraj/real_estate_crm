"""
Контрактация — сделки, по которым клиент согласился платить.

Раньше отчёты план-факт и дашборд считали только успешно закрытые сделки
(внесены обе даты подписания). Работа менеджеров, у которых договор оформлен,
а подписи ещё не внесены, в цифрах не появлялась вовсе — новые менеджеры
пропадали из отчёта по сотрудникам. Теперь в контрактацию входят сделки
«В работе» и «Успешно закрыта»; брони, отменённые и расторгнутые — нет.

Дата контрактации — дата договора; если её нет — дата закрытия сделки; если нет
и её — дата брони (создания сделки). По этой же дате сумма договора приводится
к валюте отчёта.
"""

from django.db.models import DateField
from django.db.models.functions import Coalesce, TruncDate

from .models import Deal

CONTRACTED_STATUSES = (Deal.DealStatus.IN_PROGRESS, Deal.DealStatus.CLOSED_WON)


def contracted_deals(queryset, start_date, end_date):
    """
    Сделки контрактации с датой контрактации в периоде [start_date, end_date].

    К каждой сделке добавляется поле contracted_on — дата контрактации.
    """
    return queryset.filter(status__in=CONTRACTED_STATUSES).annotate(
        contracted_on=Coalesce(
            'contract_date', TruncDate('closed_at'), TruncDate('created_at'),
            output_field=DateField(),
        )
    ).filter(contracted_on__range=[start_date, end_date])


def contracting_amounts(queryset):
    """Строки (сумма договора, валюта, дата контрактации) для Converter.total."""
    return queryset.values_list('contract_price', 'currency', 'contracted_on')
