"""
Фильтры меток в шаблонах договоров.

Без них поля подставлялись «как в базе»: цена — 500000000.00, дата —
2026-10-09, а суммы прописью не было вовсе. Фильтр пишется в метке после
вертикальной черты:

    {{ deal.contract_price|money }}         → 247 231 950
    {{ deal.contract_price|amount_words }}  → двести сорок семь миллионов … сумов
    {{ deal.contract_price|words }}         → двести сорок семь миллионов …
    {{ deal.contract_price|amount_words_uz }} → ikki yuz qirq yetti million … so'm
    {{ deal.contract_price|words_uz_cyr }}  → икки юз қирқ етти миллион … (кириллицей)
    {{ deal.contract_date|date }}           → 09.10.2026
    {{ deal.contract_date|date_text }}      → 9 октября 2026 г.

Валюта суммы прописью по умолчанию — валюта сделки; другую можно указать
переменной: {{ property.price|amount_words(project.price_currency) }}.
Строку в кавычках в Word лучше не писать: он заменяет кавычки на «ёлочки»,
и шаблон перестаёт разбираться.
"""

from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from jinja2.sandbox import SandboxedEnvironment

NBSP = ' '

# --- Русский язык ------------------------------------------------------------

_ONES = {
    False: ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'],
    True: ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'],
}
_TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
          'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']
_TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят',
         'восемьдесят', 'девяносто']
_HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот',
             'восемьсот', 'девятьсот']
# (формы, женский род): «одна тысяча», но «один миллион»
_SCALES = [
    (('тысяча', 'тысячи', 'тысяч'), True),
    (('миллион', 'миллиона', 'миллионов'), False),
    (('миллиард', 'миллиарда', 'миллиардов'), False),
    (('триллион', 'триллиона', 'триллионов'), False),
]

# Валюта: формы целой части, её род и формы дробной части
CURRENCIES_RU = {
    'UZS': (('сум', 'сума', 'сумов'), False, ('тийин', 'тийина', 'тийинов')),
    'USD': (('доллар США', 'доллара США', 'долларов США'), False, ('цент', 'цента', 'центов')),
    'EUR': (('евро', 'евро', 'евро'), False, ('евроцент', 'евроцента', 'евроцентов')),
    'RUB': (('рубль', 'рубля', 'рублей'), False, ('копейка', 'копейки', 'копеек')),
}


def plural_ru(n, forms):
    """Форма слова для числа: 1 сум, 2 сума, 5 сумов, 11 сумов, 21 сум."""
    n = abs(n)
    if 11 <= n % 100 <= 14:
        return forms[2]
    if n % 10 == 1:
        return forms[0]
    if 2 <= n % 10 <= 4:
        return forms[1]
    return forms[2]


def _triad_ru(n, feminine):
    words = [_HUNDREDS[n // 100]]
    rest = n % 100
    if 10 <= rest <= 19:
        words.append(_TEENS[rest - 10])
    else:
        words.append(_TENS[rest // 10])
        words.append(_ONES[feminine][rest % 10])
    return [w for w in words if w]


def number_words_ru(n, feminine=False):
    """Целое число прописью: 21000 → «двадцать одна тысяча»."""
    n = int(n)
    if n == 0:
        return 'ноль'
    if n < 0:
        return 'минус ' + number_words_ru(-n, feminine)
    words = []
    triads = []
    while n:
        triads.append(n % 1000)
        n //= 1000
    if len(triads) > len(_SCALES) + 1:
        raise ValueError('Слишком большое число')
    for index in range(len(triads) - 1, -1, -1):
        triad = triads[index]
        if not triad:
            continue
        if index == 0:
            words += _triad_ru(triad, feminine)
        else:
            forms, scale_feminine = _SCALES[index - 1]
            words += _triad_ru(triad, scale_feminine)
            words.append(plural_ru(triad, forms))
    return ' '.join(words)


# --- Узбекский язык: латиница и кириллица -------------------------------------------

# Договоры компании пишутся и латиницей, и кириллицей («юз миллион сўм»).
# Сотни — без «бир»: «юз миллион», как в шаблоне закалата
UZBEK = {
    'latn': {
        'ones': ['', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"],
        'tens': ['', "o'n", 'yigirma', "o'ttiz", 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', "to'qson"],
        'hundred': 'yuz',
        'scales': ['ming', 'million', 'milliard', 'trillion'],
        'zero': 'nol',
        'minus': 'minus',
        'currencies': {
            'UZS': ("so'm", 'tiyin'),
            'USD': ('AQSH dollari', 'sent'),
            'EUR': ('yevro', 'yevrosent'),
            'RUB': ('rubl', 'tiyin'),
        },
    },
    'cyrl': {
        'ones': ['', 'бир', 'икки', 'уч', 'тўрт', 'беш', 'олти', 'етти', 'саккиз', 'тўққиз'],
        'tens': ['', 'ўн', 'йигирма', 'ўттиз', 'қирқ', 'эллик', 'олтмиш', 'етмиш', 'саксон', 'тўқсон'],
        'hundred': 'юз',
        'scales': ['минг', 'миллион', 'миллиард', 'триллион'],
        'zero': 'нол',
        'minus': 'минус',
        'currencies': {
            'UZS': ('сўм', 'тийин'),
            'USD': ('АҚШ доллари', 'цент'),
            'EUR': ('евро', 'евроцент'),
            'RUB': ('рубл', 'тийин'),
        },
    },
}


def _triad_uz(n, vocab):
    words = []
    hundreds = n // 100
    if hundreds:
        if hundreds > 1:
            words.append(vocab['ones'][hundreds])
        words.append(vocab['hundred'])
    words += [vocab['tens'][(n % 100) // 10], vocab['ones'][n % 10]]
    return [w for w in words if w]


def number_words_uz(n, script='latn'):
    """Целое число прописью по-узбекски: 1250 → «bir ming ikki yuz ellik» (script='cyrl' — кириллицей)."""
    vocab = UZBEK[script]
    n = int(n)
    if n == 0:
        return vocab['zero']
    if n < 0:
        return vocab['minus'] + ' ' + number_words_uz(-n, script)
    triads = []
    while n:
        triads.append(n % 1000)
        n //= 1000
    if len(triads) > len(vocab['scales']) + 1:
        raise ValueError('Слишком большое число')
    words = []
    for index in range(len(triads) - 1, -1, -1):
        triad = triads[index]
        if not triad:
            continue
        words += _triad_uz(triad, vocab)
        if index:
            words.append(vocab['scales'][index - 1])
    return ' '.join(words)


# --- Деньги и даты ---------------------------------------------------------------

def _to_decimal(value):
    if value is None or value == '':
        return None
    try:
        return Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        return None


def _split(amount):
    """Целая часть и копейки (0–99) неотрицательной суммы."""
    whole = int(amount)
    return whole, int((amount - whole) * 100)


def money(value):
    """247231950 → «247 231 950», 140583150.54 → «140 583 150,54». Разряды — неразрывным пробелом."""
    amount = _to_decimal(value)
    if amount is None:
        return ''
    sign = '-' if amount < 0 else ''
    whole, cents = _split(abs(amount))
    text = f'{whole:,}'.replace(',', NBSP)
    if cents:
        text += f',{cents:02d}'
    return sign + text


def number(value):
    """Число без лишних нулей: 48.00 → «48», 120.50 → «120,5», 1250 → «1 250»."""
    text = money(value)
    if ',' in text:
        text = text.rstrip('0').rstrip(',')
    return text


def words(value):
    """Целая часть суммы прописью, без валюты: для записи «247 231 950 (…) сум»."""
    amount = _to_decimal(value)
    if amount is None:
        return ''
    return number_words_ru(int(amount))


def amount_words(value, currency='UZS'):
    """Сумма прописью с валютой: «двести сорок семь миллионов … сумов 54 тийина»."""
    amount = _to_decimal(value)
    if amount is None:
        return ''
    whole, cents = _split(abs(amount))
    known = CURRENCIES_RU.get((currency or '').upper())
    if known is None:
        text = f'{number_words_ru(whole)} {currency or ""}'.strip()
        return text + (f' {cents:02d}' if cents else '')
    forms, feminine, fraction_forms = known
    text = f'{number_words_ru(whole, feminine)} {plural_ru(whole, forms)}'
    if cents:
        text += f' {cents:02d} {plural_ru(cents, fraction_forms)}'
    return text


def words_uz(value, script='latn'):
    """Целая часть суммы прописью по-узбекски, без валюты."""
    amount = _to_decimal(value)
    if amount is None:
        return ''
    return number_words_uz(int(amount), script)


def amount_words_uz(value, currency='UZS', script='latn'):
    """Сумма прописью по-узбекски: «ikki yuz qirq yetti million … so'm 54 tiyin»; кириллицей — «… сўм»."""
    amount = _to_decimal(value)
    if amount is None:
        return ''
    whole, cents = _split(abs(amount))
    name, fraction = UZBEK[script]['currencies'].get((currency or '').upper(), (currency or '', ''))
    text = f'{number_words_uz(whole, script)} {name}'.strip()
    if cents:
        text += f' {cents:02d} {fraction}'.rstrip()
    return text


_MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа',
                    'сентября', 'октября', 'ноября', 'декабря']


def _as_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def date_short(value):
    """2026-10-09 → «09.10.2026»."""
    day = _as_date(value)
    return day.strftime('%d.%m.%Y') if day else ''


def date_text(value):
    """2026-10-09 → «9 октября 2026 г.»."""
    day = _as_date(value)
    return f'{day.day} {_MONTHS_GENITIVE[day.month - 1]} {day.year} г.' if day else ''


def template_environment(currency='UZS'):
    """Окружение Jinja для шаблонов: песочница (защита от выполнения кода) и фильтры."""
    # Незаполненное поле (номер договора, дата выдачи паспорта) выводилось
    # словом «None» — подставляем пустоту, как и обещает справка
    env = SandboxedEnvironment(finalize=lambda value: '' if value is None else value)
    env.filters.update({
        'money': money,
        # То же форматирование для площади и прочих чисел: 48.00 → «48», 120.50 → «120,5»
        'number': number,
        'words': words,
        'amount_words': lambda value, cur=None: amount_words(value, cur or currency),
        'amount_words_uz': lambda value, cur=None: amount_words_uz(value, cur or currency),
        'words_uz': words_uz,
        'amount_words_uz_cyr': lambda value, cur=None: amount_words_uz(value, cur or currency, 'cyrl'),
        'words_uz_cyr': lambda value: words_uz(value, 'cyrl'),
        'date': date_short,
        'date_text': date_text,
    })
    return env
