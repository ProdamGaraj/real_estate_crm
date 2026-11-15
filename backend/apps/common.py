"""
Общие мелочи для всех приложений CRM.

Имя сотрудника в журналах и карточках: по умолчанию DRF отдаёт
``str(User)`` — это логин («mpp_3»), и в истории изменений было видно
не человека, а учётную запись. Берём ФИО из профиля пользователя и
падаем на логин только там, где ФИО не заполнено.

Здесь же формулировка записи журнала «Поле '…' изменено с '…' на '…'»
с человекочитаемыми названиями полей и значений: её разбирает компонент
клиентской части ``HumanizedLog``, поэтому формулировка общая для всех
разделов (см. документ 33, «Журналы изменений»).
"""

from rest_framework import serializers


def employee_name(user):
    """ФИО сотрудника, иначе логин. None — если пользователя нет."""
    if user is None:
        return None
    full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return full_name or user.get_username()


class EmployeeNameField(serializers.Field):
    """
    Поле только для чтения: сотрудник как ФИО.

    Ставится вместо ``StringRelatedField`` на поля вроде ``user``,
    ``created_by``, ``executor``: формат ответа остаётся строкой, но
    вместо логина приходит имя, которое видит заказчик в журнале.
    """

    def __init__(self, **kwargs):
        kwargs.setdefault('read_only', True)
        super().__init__(**kwargs)

    def to_representation(self, value):
        return employee_name(value)

    def to_internal_value(self, data):  # pragma: no cover - поле только для чтения
        raise NotImplementedError


def field_display_name(model, field_name):
    """Человекочитаемое название поля из verbose_name модели."""
    try:
        return str(model._meta.get_field(field_name).verbose_name)
    except Exception:
        return field_name


def choice_display(model, field_name, value):
    """Человекочитаемое значение для поля со списком значений."""
    if value is None or value == '':
        return 'пусто'
    try:
        field = model._meta.get_field(field_name)
        if getattr(field, 'choices', None):
            choices = dict(field.choices)
            if value in choices:
                return str(choices[value])
    except Exception:
        pass
    return str(value) or 'пусто'


def format_field_change(model, key, old_value, new_value):
    """Запись журнала об изменении одного поля."""
    return (
        f"'{field_display_name(model, key)}' изменено с "
        f"'{choice_display(model, key, old_value)}' на "
        f"'{choice_display(model, key, new_value)}'"
    )
