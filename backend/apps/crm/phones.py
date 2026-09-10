"""
Приведение телефонных номеров к единому виду.

Номер приходит из разных мест — формы CRM, сайта партнёра, импорта — и в
разном написании: «+998 90 123-45-67», «998901234567», «(90) 1234567».
Пока номера хранились как введены, поиск существующего клиента их не
сопоставлял, и на одного человека заводилась вторая карточка.

Хранимый вид — только цифры с ведущим «+»: ``+998901234567``. Локальные
номера Узбекистана (9 цифр) дополняются кодом страны, иначе номер
сохраняется как есть — лишь бы одинаково.
"""

import re

# Код страны по умолчанию: система работает с узбекским рынком
DEFAULT_COUNTRY_CODE = '998'
# Длина местного номера без кода страны
LOCAL_NUMBER_LENGTH = 9


def normalize_phone(value):
    """
    Возвращает номер в едином виде.

    Пустое значение и строку без единой цифры отдаёт как есть — за
    сообщение об ошибке отвечает валидация, а не нормализация.
    """
    if not value:
        return value

    digits = re.sub(r'\D', '', str(value))
    if not digits:
        return str(value).strip()

    # 8 в начале — местная замена кода страны
    if len(digits) == LOCAL_NUMBER_LENGTH + 1 and digits.startswith('8'):
        digits = DEFAULT_COUNTRY_CODE + digits[1:]
    elif len(digits) == LOCAL_NUMBER_LENGTH:
        digits = DEFAULT_COUNTRY_CODE + digits

    return f'+{digits}'


def phone_search_variants(value):
    """
    Варианты написания для поиска по уже сохранённым данным.

    Нужны, пока в базе остаются номера, записанные до нормализации:
    ищем и по приведённому виду, и по одним цифрам.
    """
    normalized = normalize_phone(value)
    digits = re.sub(r'\D', '', str(value or ''))
    variants = {v for v in (normalized, digits) if v}
    if digits and len(digits) > LOCAL_NUMBER_LENGTH:
        # Хвост без кода страны — по нему найдётся номер, записанный локально
        variants.add(digits[-LOCAL_NUMBER_LENGTH:])
    return variants
