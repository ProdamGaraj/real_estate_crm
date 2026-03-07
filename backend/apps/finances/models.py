from django.db import models
from django.conf import settings
from django.utils import timezone


class PaymentType(models.Model):
    """ Справочник: Тип платежа (например, Первоначальный взнос, Ежемесячный платеж) """
    name = models.CharField(max_length=200, unique=True, verbose_name="Название типа платежа")

    class Meta:
        verbose_name = "Тип платежа"
        verbose_name_plural = "Типы платежей"

    def __str__(self):
        return self.name


class BeneficiaryAccount(models.Model):
    """ Справочник: Счёт получателя """
    name = models.CharField(max_length=200, verbose_name="Название счёта")
    details = models.TextField(blank=True, verbose_name="Реквизиты")
    company = models.ForeignKey(
        'permissions.Company',
        on_delete=models.CASCADE,
        related_name='beneficiary_accounts',
        verbose_name="Компания",
        null=True,
        blank=True
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='created_beneficiary_accounts',
        verbose_name="Кем создан",
        null=True,
        blank=True
    )

    class Meta:
        verbose_name = "Счёт получателя"
        verbose_name_plural = "Счета получателей"

    def __str__(self):
        return self.name


class Payment(models.Model):
    """ Платёж """
    # --- Привязка к компании ---
    company = models.ForeignKey(
        'permissions.Company',
        on_delete=models.PROTECT,
        related_name='payments',
        verbose_name="Компания",
        null=True,
        blank=True
    )

    class Currency(models.TextChoices):
        UZS = 'UZS', 'Узбекский сум'
        USD = 'USD', 'Доллар США'
        EUR = 'EUR', 'Евро'

    class PaymentMethod(models.TextChoices):
        CASH = 'CASH', 'Наличные'
        CASHLESS = 'CASHLESS', 'Безналичные'

    class PaymentStatus(models.TextChoices):
        PENDING = 'PENDING', 'К оплате'
        PAID = 'PAID', 'Оплачен'
        OVERDUE = 'OVERDUE', 'Просрочен'
        TO_BE_RETURNED = 'TO_BE_RETURNED', 'К возврату'
        RETURNED = 'RETURNED', 'Возвращен'


    # --- Участники и связи ---
    deal = models.ForeignKey('deals.Deal', on_delete=models.SET_NULL, null=True, blank=True, related_name='payments',
                             verbose_name="Сделка")
    client = models.ForeignKey('crm.Client', on_delete=models.PROTECT, related_name='payments', verbose_name="Клиент")
    responsible_employee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                             related_name='responsible_for_payments',
                                             verbose_name="Ответственный сотрудник")

    # --- Сумма и тип ---
    amount = models.DecimalField(max_digits=12, decimal_places=2, verbose_name="Сумма платежа")
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.UZS, verbose_name="Валюта")
    payment_type = models.ForeignKey(PaymentType, on_delete=models.SET_NULL, null=True, verbose_name="Тип платежа")
    method = models.CharField(max_length=10, choices=PaymentMethod.choices, verbose_name="Вид платежа")
    beneficiary_account = models.ForeignKey(BeneficiaryAccount, on_delete=models.PROTECT,
                                            verbose_name="Счёт получателя")

    # --- Даты ---
    due_date = models.DateField(verbose_name="Дата к оплате")
    payment_date = models.DateField(null=True, blank=True, verbose_name="Дата фактической оплаты")

    # --- Статус ---
    status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.PENDING,
        verbose_name="Статус"
    )

    # --- Системные поля (Логи) ---
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата последнего изменения")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                   related_name='created_payments', verbose_name="Кем создан")

    class Meta:
        verbose_name = "Платёж"
        verbose_name_plural = "Платежи"
        ordering = ['-due_date']

    def __str__(self):
        return f"Платёж на {self.amount} {self.currency} от {self.client}"


class PaymentLog(models.Model):
    """ Логирование изменений по платежу """
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="logs", verbose_name="Платёж")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                             verbose_name="Пользователь")
    action = models.TextField(verbose_name="Совершенное действие")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Время")

    class Meta:
        verbose_name = "Лог платежа"
        verbose_name_plural = "Логи платежей"
        ordering = ['-created_at']

    def __str__(self):
        return f"Лог для платежа №{self.payment.id}"