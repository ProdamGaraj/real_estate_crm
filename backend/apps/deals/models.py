from django.db import models
from django.conf import settings


class PurchasePurpose(models.Model):
    """ Справочник: Цель приобретения """
    name = models.CharField(max_length=200, unique=True, verbose_name="Название цели")

    class Meta:
        verbose_name = "Цель приобретения"
        verbose_name_plural = "Цели приобретения"

    def __str__(self):
        return self.name


class PaymentType(models.Model):
    """ Справочник: Тип оплаты """
    name = models.CharField(max_length=200, unique=True, verbose_name="Название типа оплаты")

    class Meta:
        verbose_name = "Тип оплаты"
        verbose_name_plural = "Типы оплат"

    def __str__(self):
        return self.name


class Deal(models.Model):
    """ Сделка """

    class DealStatus(models.TextChoices):
        BOOKING = 'BOOKING', 'Бронь'
        IN_PROGRESS = 'IN_PROGRESS', 'В работе'
        CLOSED_WON = 'CLOSED_WON', 'Успешно закрыта'
        CANCELLED = 'CANCELLED', 'Отменена'
        TERMINATED = 'TERMINATED', 'Расторгнута'

    # --- Основные участники сделки ---
    client = models.ForeignKey('crm.Client', on_delete=models.PROTECT, related_name='deals', verbose_name="Клиент")
    property = models.ForeignKey(
        'realty.Property',
        on_delete=models.PROTECT,
        related_name='deals',
        verbose_name="Объект недвижимости"
    )

    # --- Статус и даты ---
    status = models.CharField(max_length=20, choices=DealStatus.choices, default=DealStatus.BOOKING,
                              verbose_name="Статус сделки")
    booking_start_date = models.DateTimeField(auto_now_add=True, verbose_name="Дата начала брони")
    booking_end_date = models.DateTimeField(verbose_name="Плановая дата окончания брони")

    # --- Поля для фиксации стоимости на момент начала сделки ---
    initial_price = models.DecimalField(max_digits=12, decimal_places=2,
                                        verbose_name="Стоимость на момент начала сделки")
    initial_price_per_sqm = models.DecimalField(max_digits=12, decimal_places=2,
                                                verbose_name="Цена за м² на момент начала сделки")

    # --- Детали этапа "В работе" ---
    applied_discounts = models.ManyToManyField('realty.Discount', blank=True, verbose_name="Примененные скидки")
    purchase_purpose = models.ForeignKey(PurchasePurpose, on_delete=models.SET_NULL, null=True, blank=True,
                                         verbose_name="Цель приобретения")
    payment_type = models.ForeignKey(PaymentType, on_delete=models.SET_NULL, null=True, blank=True,
                                     verbose_name="Тип оплаты")
    contract_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True,
                                         verbose_name="Стоимость по договору")
    notes = models.TextField(blank=True, verbose_name="Примечание к сделке")
    # --- Поля для документов ---
    contract_number = models.CharField(
        max_length=100,
        blank=True,
        null=True,  # <--- РАЗРЕШАЕМ NULL В БАЗЕ
        unique=True,  # <--- ДОБАВЛЯЕМ УНИКАЛЬНОСТЬ
        verbose_name="Номер договора"
    )
    contract_date = models.DateField(null=True, blank=True, verbose_name="Дата договора")
    signed_document_scan = models.FileField(
        upload_to='deals/signed_documents/',
        null=True,
        blank=True,
        verbose_name="Скан подписанного документа"
    )
    client_signature_date = models.DateField(null=True, blank=True, verbose_name="Дата подписания клиентом")
    company_signature_date = models.DateField(null=True, blank=True, verbose_name="Дата подписания компанией")
    cancellation_reason = models.TextField(blank=True, null=True, verbose_name="Причина отмены")
    termination_document_scan = models.FileField(
        upload_to='deals/termination_documents/',
        null=True,
        blank=True,
        verbose_name="Скан документа о расторжении"
    )
    termination_date = models.DateField(null=True, blank=True, verbose_name="Дата расторжения")
    # --- Системные поля (Логи) ---
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата последнего изменения")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_deals',
        verbose_name="Менеджер"
    )

    class Meta:
        verbose_name = "Сделка"
        verbose_name_plural = "Сделки"
        ordering = ['-created_at']

    def __str__(self):
        return f"Сделка №{self.id} по объекту {self.property}"


class DealLog(models.Model):
    """ Логирование изменений по сделке """
    deal = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name="logs", verbose_name="Сделка")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        verbose_name="Пользователь"
    )
    action = models.TextField(verbose_name="Совершенное действие")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Время")

    class Meta:
        verbose_name = "Лог сделки"
        verbose_name_plural = "Логи сделок"
        ordering = ['-created_at']

    def __str__(self):
        return f"Лог для сделки №{self.deal.id}"
