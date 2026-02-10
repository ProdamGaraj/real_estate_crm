from datetime import timezone

from django.db import models
from django.conf import settings  # Используем для ссылки на модель User
from apps.realty.models import Property, Building


class PreciseSource(models.Model):
    """ Точный источник (например, рекламная кампания) """
    name = models.CharField(max_length=200, unique=True, verbose_name="Название точного источника")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        verbose_name="Кем создан"
    )

    class Meta:
        verbose_name = "Точный источник"
        verbose_name_plural = "Точные источники"

    def __str__(self):
        return self.name

class ClientPhoneNumber(models.Model):
    client = models.ForeignKey('Client', on_delete=models.CASCADE, related_name='phone_numbers', verbose_name="Клиент")
    phone_number = models.CharField(max_length=20, verbose_name="Номер телефона")
    is_primary = models.BooleanField(default=False, verbose_name="Основной")

    class Meta:
        verbose_name = "Номер телефона клиента"
        verbose_name_plural = "Номера телефонов клиента"
        unique_together = ('client', 'phone_number') # Номер должен быть уникальным для клиента

    def __str__(self):
        return self.phone_number

class RejectionReason(models.Model):
    class ReasonType(models.TextChoices):
        JUNK = 'JUNK', 'Нецелевая'
        REJECTED = 'REJECTED', 'Отказ'

    name = models.CharField(max_length=255, verbose_name="Причина")
    reason_type = models.CharField(max_length=10, choices=ReasonType.choices, verbose_name="Тип причины")
    is_active = models.BooleanField(default=True, verbose_name="Активна")


class ApplicationStatus(models.Model):
    """ Статус заявки (настраиваемый справочник) """
    code = models.CharField(max_length=50, unique=True, verbose_name="Код статуса")
    name = models.CharField(max_length=100, verbose_name="Название статуса")
    color = models.CharField(max_length=7, default='#9e9e9e', verbose_name="Цвет (HEX)")
    order = models.PositiveIntegerField(default=0, verbose_name="Порядок сортировки")
    is_active = models.BooleanField(default=True, verbose_name="Активен")
    is_final = models.BooleanField(default=False, verbose_name="Финальный статус")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")

    class Meta:
        verbose_name = "Статус заявки"
        verbose_name_plural = "Статусы заявок"
        ordering = ['order', 'name']

    def __str__(self):
        return self.name


class Application(models.Model):
    """ Заявка от клиента """
    # --- Привязка к компании ---
    company = models.ForeignKey(
        'permissions.Company',
        on_delete=models.PROTECT,
        related_name='applications',
        verbose_name="Компания",
        null=True,
        blank=True
    )

    # Сохраняем для обратной совместимости и миграции
    class ApplicationStatusChoices(models.TextChoices):
        NEW = 'NEW', 'Новая'
        IN_PROGRESS = 'IN_PROGRESS', 'В работе'
        JUNK = 'JUNK', 'Нецелевая'
        REJECTED = 'REJECTED', 'Отказ'
        CLOSED_WON = 'CLOSED_WON', 'Успешно закрыта'
        CLOSED_LOST = 'CLOSED_LOST', 'Неуспешно закрыта'

    class ApplicationSource(models.TextChoices):
        INTERNET = 'INTERNET', 'Интернет'
        SOCIAL_MEDIA = 'SOCIAL_MEDIA', 'Соц.сети'
        OFFICE = 'OFFICE', 'Офис'
        CALL = 'CALL', 'Звонок'

    # --- Основная информация ---
    client = models.ForeignKey('Client', on_delete=models.CASCADE, related_name='applications', verbose_name="Клиент")
    status = models.CharField(max_length=50, choices=ApplicationStatusChoices.choices, default=ApplicationStatusChoices.NEW,
                              verbose_name="Статус заявки")

    # --- Источник ---
    source = models.CharField(max_length=20, choices=ApplicationSource.choices, verbose_name="Источник")
    precise_source = models.ForeignKey('PreciseSource', on_delete=models.SET_NULL, null=True, blank=True,
                                       verbose_name="Точный источник")

    # --- Интересы клиента ---
    interested_projects = models.ManyToManyField('realty.Project', blank=True, verbose_name="Интересующие проекты")
    interested_property_type = models.CharField(
        max_length=20,
        choices=Property.PropertyType.choices,
        blank=True,
        verbose_name="Интересующий тип недвижимости"
    )
    min_area = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True,
                                   verbose_name="Площадь от (кв.м)")
    max_area = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True,
                                   verbose_name="Площадь до (кв.м)")
    min_floor = models.IntegerField(null=True, blank=True, verbose_name="Этаж от")
    max_floor = models.IntegerField(null=True, blank=True, verbose_name="Этаж до")

    # --- Причина отказа/нецелевой ---
    rejection_reason = models.ForeignKey(
        'RejectionReason',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        verbose_name="Причина (отказ/нецелевая)"
    )

    # --- Прочее ---
    notes = models.TextField(blank=True, verbose_name="Комментарии")

    # --- Системные поля ---
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата последнего изменения")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Кем создана (менеджер)"
    )

    class Meta:
        verbose_name = "Заявка"
        verbose_name_plural = "Заявки"
        ordering = ['-created_at']

    def __str__(self):
        return f"Заявка №{self.id} от {self.client.full_name}"


class ApplicationLog(models.Model):
    """ Логирование изменений по заявке """
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="logs", verbose_name="Заявка")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        verbose_name="Пользователь"
    )
    action = models.TextField(verbose_name="Совершенное действие")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Время")

    class Meta:
        verbose_name = "Лог заявки"
        verbose_name_plural = "Логи заявок"
        ordering = ['-created_at']

    def __str__(self):
        return f"Лог для заявки №{self.application.id} в {self.created_at.strftime('%Y-%m-%d %H:%M')}"


class Client(models.Model):
    """ Клиент """
    # --- Привязка к компании ---
    company = models.ForeignKey(
        'permissions.Company',
        on_delete=models.PROTECT,
        related_name='clients',
        verbose_name="Компания",
        null=True,
        blank=True
    )

    class Gender(models.TextChoices):
        MALE = 'MALE', 'Мужской'
        FEMALE = 'FEMALE', 'Женский'

    class MaritalStatus(models.TextChoices):
        SINGLE = 'SINGLE', 'Холост/Не замужем'
        MARRIED = 'MARRIED', 'Женат/Замужем'
        DIVORCED = 'DIVORCED', 'В разводе'
        WIDOWED = 'WIDOWED', 'Вдовец/Вдова'

    # ДОБАВЛЕНО: Статус клиента
    class ClientStatus(models.TextChoices):
        ACTIVE = 'ACTIVE', 'Активный'
        INACTIVE = 'INACTIVE', 'Неактивный'
        ARCHIVED = 'ARCHIVED', 'В архиве'

    # --- Основная информация ---
    full_name = models.CharField(max_length=255, verbose_name="Полное имя")
    # УДАЛЕНО: phone_number = models.CharField(max_length=20, unique=True, verbose_name="Номер телефона")
    email = models.EmailField(unique=True, blank=True, null=True, verbose_name="Email")
    date_of_birth = models.DateField(blank=True, null=True, verbose_name="Дата рождения")
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True, verbose_name="Пол")
    marital_status = models.CharField(max_length=10, choices=MaritalStatus.choices, blank=True,
                                      verbose_name="Семейный статус")
    status = models.CharField(max_length=10, choices=ClientStatus.choices, default=ClientStatus.ACTIVE,
                              verbose_name="Статус клиента")

    # --- Паспортные данные ---
    passport_series = models.CharField(max_length=10, blank=True, verbose_name="Серия паспорта")  # ИЗМЕНЕНО
    passport_number = models.CharField(max_length=20, blank=True, verbose_name="Номер паспорта")  # ИЗМЕНЕНО
    passport_issued_by = models.CharField(max_length=255, blank=True, verbose_name="Кем выдан паспорт")
    passport_issued_date = models.DateField(blank=True, null=True, verbose_name="Когда выдан паспорт")

    # --- Дополнительные идентификаторы ---
    inn = models.CharField(max_length=14, blank=True, verbose_name="ИНН")  # ДОБАВЛЕНО
    pinfl = models.CharField(max_length=14, blank=True, verbose_name="ПИНФЛ")

    # --- Адреса и прочее ---
    registration_address = models.TextField(blank=True, verbose_name="Адрес прописки")
    billing_address = models.TextField(blank=True, verbose_name="Расчетный адрес")  # ДОБАВЛЕНО
    comment = models.TextField(blank=True, verbose_name="Комментарий")  # ДОБАВЛЕНО

    # --- Связи ---
    relatives = models.ManyToManyField('self', blank=True, verbose_name="Родственники")

    # --- Системные поля ---
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата последнего изменения")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_clients',
        verbose_name="Создатель"
    )

    class Meta:
        verbose_name = "Клиент"
        verbose_name_plural = "Клиенты"
        ordering = ['-created_at']

    def __str__(self):
        return self.full_name


class ClientFile(models.Model):
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='files', verbose_name="Клиент")
    file = models.FileField(upload_to='client_files/', verbose_name="Файл")
    comment = models.TextField(blank=True, verbose_name="Комментарий")
    uploaded_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата загрузки")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, verbose_name="Кем загружен")

    class Meta:
        verbose_name = "Файл клиента"
        verbose_name_plural = "Файлы клиента"
        ordering = ['-uploaded_at']


class ClientLog(models.Model):
    """ Логирование изменений по клиенту """
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="logs", verbose_name="Клиент")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        verbose_name="Пользователь"
    )
    action = models.TextField(verbose_name="Совершенное действие")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Время")

    class Meta:
        verbose_name = "Лог клиента"
        verbose_name_plural = "Логи клиентов"
        ordering = ['-created_at']

    def __str__(self):
        return f"Лог для {self.client} в {self.created_at.strftime('%Y-%m-%d %H:%M')}"

class Meeting(models.Model):
    """ Встреча с клиентом """
    # --- Привязка к компании ---
    company = models.ForeignKey(
        'permissions.Company',
        on_delete=models.PROTECT,
        related_name='meetings',
        verbose_name="Компания",
        null=True,
        blank=True
    )

    class MeetingStatus(models.TextChoices):
        NEW = 'NEW', 'Новая встреча'
        COMPLETED = 'COMPLETED', 'Встреча состоялась'
        CANCELLED = 'CANCELLED', 'Встреча не состоялась'

    # --- Связи ---
    client = models.ForeignKey(Client, on_delete=models.PROTECT, related_name='meetings', verbose_name="Клиент")
    application = models.ForeignKey(Application, on_delete=models.SET_NULL, null=True, blank=True, related_name='meetings', verbose_name="Заявка")
    interested_building = models.ForeignKey(Building, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Интересующий дом")

    # --- Участники ---
    creator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, # Может быть null, если постановщик - Система
        related_name='created_meetings',
        verbose_name="Постановщик"
    )
    executor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='assigned_meetings',
        verbose_name="Исполнитель"
    )

    # --- Даты и Статус ---
    status = models.CharField(max_length=20, choices=MeetingStatus.choices, default=MeetingStatus.NEW, verbose_name="Статус")
    planned_date = models.DateTimeField(verbose_name="Плановая дата и время")
    actual_date = models.DateTimeField(null=True, blank=True, verbose_name="Фактическая дата и время")

    # --- Содержание ---
    comment = models.TextField(blank=True, verbose_name="Комментарий к встрече")
    result_comment = models.TextField(blank=True, verbose_name="Результат встречи")

    # --- Системные поля ---
    is_auto_created = models.BooleanField(default=False, verbose_name="Создана автоматически")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата последнего изменения")

    class Meta:
        verbose_name = "Встреча"
        verbose_name_plural = "Встречи"
        ordering = ['-planned_date']

    @property
    def is_overdue(self):
        """ Свойство для определения просроченной встречи """
        return self.status == self.MeetingStatus.NEW and self.planned_date < timezone.now()

    def __str__(self):
        return f"Встреча с {self.client.full_name} на {self.planned_date.strftime('%Y-%m-%d %H:%M')}"


class MeetingLog(models.Model):
    """ Логирование изменений по встрече """
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name="logs", verbose_name="Встреча")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, verbose_name="Пользователь")
    action = models.TextField(verbose_name="Совершенное действие")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Время")

    class Meta:
        verbose_name = "Лог встречи"
        verbose_name_plural = "Логи встреч"
        ordering = ['-created_at']

    def __str__(self):
        return f"Лог для встречи №{self.meeting.id}"