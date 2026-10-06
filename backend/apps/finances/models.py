from django.db import models
from django.conf import settings
from django.utils import timezone


class PaymentType(models.Model):
    """
    Справочник: тип платежа — и одновременно план оплаты.

    Тип с заданным планом («Рассрочка на 12 месяцев», «100% оплата»,
    «Ипотека») задаёт условия: срок, скидку и минимальный первоначальный
    взнос. По таким типам калькулятор показывает клиенту варианты оплаты
    и собирает график сделки; все платежи графика получают этот тип.
    Тип без плана — просто название платежа.
    """

    class PlanKind(models.TextChoices):
        FULL = 'FULL', 'Оплата всей суммой'
        INSTALLMENT = 'INSTALLMENT', 'Взнос и ежемесячные платежи'
        DEFERRED = 'DEFERRED', 'Взнос и остаток одним платежом'

    # Справочник принадлежит компании. Пустое значение — общесистемная запись,
    # заведённая администратором: видна всем, но редактируется только им.
    company = models.ForeignKey(
        'permissions.Company',
        on_delete=models.CASCADE,
        related_name='%(app_label)s_%(class)ss',
        verbose_name="Компания",
        null=True,
        blank=True
    )
    name = models.CharField(max_length=200, verbose_name="Название типа платежа")
    # Пусто — тип без плана: калькулятор его не показывает
    plan_kind = models.CharField(max_length=12, choices=PlanKind.choices, blank=True, default='',
                                 verbose_name="План оплаты")
    # Рассрочка — число ежемесячных платежей; «остаток одним платежом» —
    # через сколько месяцев после взноса вносится остаток (ипотека)
    plan_months = models.PositiveSmallIntegerField(default=0, verbose_name="Срок, мес.")
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0,
                                           verbose_name="Скидка по плану, %")
    down_payment_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0,
                                               verbose_name="Минимальный первоначальный взнос, %")

    class Meta:
        verbose_name = "Тип платежа"
        verbose_name_plural = "Типы платежей"
        unique_together = ('company', 'name')

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
        RUB = 'RUB', 'Российский рубль'
        CNY = 'CNY', 'Китайский юань'
        KZT = 'KZT', 'Казахстанский тенге'
        GBP = 'GBP', 'Фунт стерлингов'
        AED = 'AED', 'Дирхам ОАЭ'
        TRY = 'TRY', 'Турецкая лира'

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
    amount = models.DecimalField(max_digits=18, decimal_places=2, verbose_name="Сумма платежа")
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.UZS, verbose_name="Валюта")
    # Сумма в том виде, в каком её ввели в графике, если валюта отличалась от
    # валюты сделки. График хранится в одной валюте, а исходный ввод и курс
    # пересчёта сохраняются, чтобы можно было показать и проверить расчёт.
    entered_amount = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True,
                                         verbose_name="Введённая сумма")
    entered_currency = models.CharField(max_length=3, choices=Currency.choices, blank=True,
                                        verbose_name="Валюта ввода")
    entered_rate = models.DecimalField(max_digits=30, decimal_places=12, null=True, blank=True,
                                       verbose_name="Курс пересчёта в валюту сделки")
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
        # Просрочка ищется по паре «статус + срок», сводки — по компании
        indexes = [
            models.Index(fields=['status', 'due_date']),
            models.Index(fields=['company', 'status']),
            models.Index(fields=['payment_date']),
            models.Index(fields=['deal']),
            models.Index(fields=['responsible_employee', 'status']),
        ]

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


class ExchangeRate(models.Model):
    """
    Курс валюты к суму на дату.

    Курс ЦБ общий для всех компаний (компания не указана). Ручной курс
    принадлежит компании и действует только в её расчётах.
    """

    class Source(models.TextChoices):
        CBU = 'CBU', 'ЦБ Узбекистана'
        MANUAL = 'MANUAL', 'Введён вручную'

    currency = models.CharField(max_length=3, choices=Payment.Currency.choices, verbose_name="Валюта")
    date = models.DateField(verbose_name="Дата курса")
    rate = models.DecimalField(max_digits=24, decimal_places=8, verbose_name="Сумов за единицу валюты")
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.CBU, verbose_name="Источник")
    company = models.ForeignKey(
        'permissions.Company', on_delete=models.CASCADE, null=True, blank=True,
        related_name='exchange_rates', verbose_name="Компания (для ручного курса)"
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                   verbose_name="Кем введён")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")

    class Meta:
        verbose_name = "Курс валюты"
        verbose_name_plural = "Курсы валют"
        ordering = ['-date', 'currency']
        constraints = [
            # Один курс ЦБ на валюту и дату
            models.UniqueConstraint(fields=['currency', 'date'], condition=models.Q(company__isnull=True),
                                    name='uniq_cbu_rate_per_day'),
            # Один ручной курс компании на валюту и дату
            models.UniqueConstraint(fields=['currency', 'date', 'company'], name='uniq_company_rate_per_day'),
        ]
        indexes = [models.Index(fields=['currency', 'date'])]

    def __str__(self):
        return f"{self.currency} {self.date:%d.%m.%Y} = {self.rate} UZS"
