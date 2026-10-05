"""
Курсы валют и пересчёт сумм.

Курс хранится так же, как его публикует Центральный банк Узбекистана:
сколько сумов стоит одна единица валюты. Пересчёт любой пары идёт через сум:
``сумма × курс(из) / курс(в)``.

Источники курса:

* ЦБ (cbu.uz) — общий для всех компаний, загружается регламентным заданием
  и по кнопке в настройках;
* ручной курс — заводится компанией для своих расчётов (например, когда ЦБ
  недоступен) и действует только внутри неё: один и тот же курс не может
  менять расчёты другой компании.

На дату берётся последний известный курс не позже этой даты; ручной курс
компании на ту же дату важнее курса ЦБ.
"""

import json
import logging
import ssl
import urllib.request
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

logger = logging.getLogger(__name__)

BASE_CURRENCY = 'UZS'

# Валюты, с которыми работает система. Порядок — порядок в списках интерфейса.
CURRENCIES = [
    ('UZS', 'Узбекский сум'),
    ('USD', 'Доллар США'),
    ('EUR', 'Евро'),
    ('RUB', 'Российский рубль'),
    ('CNY', 'Китайский юань'),
    ('KZT', 'Казахстанский тенге'),
    ('GBP', 'Фунт стерлингов'),
    ('AED', 'Дирхам ОАЭ'),
    ('TRY', 'Турецкая лира'),
]
CURRENCY_CODES = [code for code, _ in CURRENCIES]

DEFAULT_SUPPORTED = ['UZS', 'USD']

CBU_URL_CURRENT = 'https://cbu.uz/ru/arkhiv-kursov-valyut/json/'
CBU_URL_ON_DATE = 'https://cbu.uz/ru/arkhiv-kursov-valyut/json/all/{date}/'

# Если ближайший известный курс старше этого, его пытаются освежить с ЦБ
STALE_DAYS = 7

CENT = Decimal('0.01')
# Курс к суму: ЦБ публикует его с 2 знаками, 8 знаков — с запасом
RATE_PRECISION = Decimal('0.00000001')
# Кросс-курс в сделке и платеже хранится с 12 знаками: у пары сум → доллар
# он порядка 0,0000849, и 8 знаков для него мало
CROSS_RATE_PRECISION = Decimal('0.000000000001')


class RateUnavailable(Exception):
    """Курса нет ни в базе, ни у ЦБ — пересчитать сумму нельзя."""


def default_supported_currencies():
    return list(DEFAULT_SUPPORTED)


def money(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


# --- Загрузка с ЦБ ------------------------------------------------------------

def _download(url, timeout):
    request = urllib.request.Request(url, headers={'User-Agent': 'CRM-Nedvizhimost/1.0'})
    with urllib.request.urlopen(request, context=ssl.create_default_context(), timeout=timeout) as response:
        return json.loads(response.read().decode('utf-8'))


def fetch_cbu_rates(on_date=None, timeout=10):
    """
    Загружает курсы ЦБ на дату (по умолчанию — действующие сейчас).

    Возвращает число сохранённых курсов. Повторная загрузка той же даты
    обновляет значения, а не создаёт дубли.
    """
    from .models import ExchangeRate

    url = CBU_URL_ON_DATE.format(date=on_date.isoformat()) if on_date else CBU_URL_CURRENT
    rows = _download(url, timeout)
    saved = 0
    with transaction.atomic():
        for row in rows:
            code = row.get('Ccy')
            if code not in CURRENCY_CODES or code == BASE_CURRENCY:
                continue
            try:
                rate = Decimal(str(row['Rate'])) / Decimal(str(row.get('Nominal') or 1))
                rate_date = datetime.strptime(row['Date'], '%d.%m.%Y').date()
            except (KeyError, ValueError, ArithmeticError):
                logger.warning('Курс ЦБ пропущен: %s', row)
                continue
            ExchangeRate.objects.update_or_create(
                currency=code, date=rate_date, company=None,
                defaults={'rate': rate.quantize(RATE_PRECISION), 'source': ExchangeRate.Source.CBU},
            )
            saved += 1
    return saved


# --- Курс на дату -------------------------------------------------------------

def _lookup(currency, on_date, company):
    from .models import ExchangeRate

    scope = Q(company__isnull=True)
    if company is not None:
        scope |= Q(company=company)
    return (ExchangeRate.objects
            .filter(scope, currency=currency, date__lte=on_date)
            # На одну дату ручной курс компании важнее курса ЦБ
            .order_by('-date', F('company').desc(nulls_last=True))
            .first())


def get_rate(currency, on_date=None, company=None, fetch=True):
    """Сколько сумов стоит единица валюты на дату."""
    if currency == BASE_CURRENCY:
        return Decimal(1)
    on_date = on_date or timezone.localdate()
    record = _lookup(currency, on_date, company)
    if fetch and (record is None or (on_date - record.date).days > STALE_DAYS):
        try:
            fetch_cbu_rates(None if on_date >= timezone.localdate() else on_date)
            record = _lookup(currency, on_date, company)
        except Exception as error:  # сеть, формат ответа — работаем с тем, что есть
            logger.warning('Не удалось загрузить курсы ЦБ на %s: %s', on_date, error)
    if record is None:
        raise RateUnavailable(
            f'Нет курса {currency} на {on_date:%d.%m.%Y}. '
            f'Обновите курсы ЦБ или введите курс вручную в настройках («Валюты»).'
        )
    return record.rate


def cross_rate(from_currency, to_currency, on_date=None, company=None, fetch=True):
    """
    Сколько единиц валюты to_currency даёт единица from_currency.

    Не округляется: округление курса сум → доллар до 8 знаков давало ошибку до
    нескольких долларов на договоре в полтора миллиарда сумов. Для записи в базу
    курс округляют через stored_rate.
    """
    if from_currency == to_currency:
        return Decimal(1)
    return get_rate(from_currency, on_date, company, fetch) / get_rate(to_currency, on_date, company, fetch)


def stored_rate(rate):
    """Кросс-курс в том виде, в каком он хранится в сделке и платеже."""
    return Decimal(rate).quantize(CROSS_RATE_PRECISION, rounding=ROUND_HALF_UP)


def convert(amount, from_currency, to_currency, on_date=None, company=None, fetch=True):
    """Пересчитывает сумму из одной валюты в другую по курсу на дату."""
    if amount is None:
        return None
    if from_currency == to_currency:
        return money(amount)
    return money(Decimal(amount) * cross_rate(from_currency, to_currency, on_date, company, fetch))


class Converter:
    """
    Пересчёт множества сумм к одной валюте — для отчётов и дашборда.

    Запоминает курсы на время расчёта и не ходит к ЦБ: в отчёте сотни дат,
    и на каждую по запросу к внешнему сервису — недопустимо долго. Если
    курса на дату нет, используется ближайший более ранний; если нет вовсе —
    сумма не учитывается, а валюта попадает в список ``missing``.
    """

    def __init__(self, target_currency, company=None):
        self.target = target_currency
        self.company = company
        self._rates = {}
        self.missing = set()

    def _rate(self, currency, on_date):
        key = (currency, on_date)
        if key not in self._rates:
            try:
                self._rates[key] = get_rate(currency, on_date, self.company, fetch=False)
            except RateUnavailable:
                self._rates[key] = None
        return self._rates[key]

    def __call__(self, amount, currency, on_date):
        if amount is None:
            return Decimal(0)
        currency = currency or BASE_CURRENCY
        if currency == self.target:
            return Decimal(amount)
        if isinstance(on_date, datetime):
            on_date = timezone.localtime(on_date).date() if timezone.is_aware(on_date) else on_date.date()
        on_date = on_date or timezone.localdate()
        source, target = self._rate(currency, on_date), self._rate(self.target, on_date)
        if source is None or target is None:
            self.missing.add(currency if source is None else self.target)
            return Decimal(0)
        return Decimal(amount) * source / target

    def total(self, rows):
        """Сумма строк (amount, currency, date), приведённая к целевой валюте."""
        return money(sum((self(amount, currency, on_date) for amount, currency, on_date in rows), Decimal(0)))


def company_base_currency(company):
    """Валюта сделок компании — к ней приводятся отчёты."""
    return getattr(company, 'deal_currency', None) or BASE_CURRENCY


def user_company(user):
    profile = getattr(user, 'profile', None)
    return getattr(profile, 'company', None)


def supported_currencies(company):
    """Валюты, в которых компания принимает ввод сумм; валюта сделок — всегда среди них."""
    codes = list(getattr(company, 'supported_currencies', None) or DEFAULT_SUPPORTED)
    base = company_base_currency(company)
    if base not in codes:
        codes.insert(0, base)
    return [c for c in CURRENCY_CODES if c in codes]


def iter_dates(start, end):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)

