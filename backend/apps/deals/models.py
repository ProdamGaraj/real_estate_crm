from decimal import ROUND_HALF_UP, Decimal

from django.db import models
from django.conf import settings

# Поле модели `property` перекрывает встроенный `property` внутри тела класса,
# поэтому декоратор вычисляемых полей берём под другим именем
computed = property


class PurchasePurpose(models.Model):
    """ Справочник: Цель приобретения """
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
    name = models.CharField(max_length=200, verbose_name="Название цели")

    class Meta:
        verbose_name = "Цель приобретения"
        verbose_name_plural = "Цели приобретения"
        unique_together = ('company', 'name')

    def __str__(self):
        return self.name


class PaymentType(models.Model):
    """ Справочник: Тип оплаты """
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
    name = models.CharField(max_length=200, verbose_name="Название типа оплаты")

    class Meta:
        verbose_name = "Тип оплаты"
        verbose_name_plural = "Типы оплат"
        unique_together = ('company', 'name')

    def __str__(self):
        return self.name


class Deal(models.Model):
    """ Сделка """
    # --- Привязка к компании ---
    company = models.ForeignKey(
        'permissions.Company',
        on_delete=models.PROTECT,
        related_name='deals',
        verbose_name="Компания",
        null=True,
        blank=True
    )

    class DealStatus(models.TextChoices):
        # Статуса «Бронь» у сделки больше нет: бронь — отдельная сущность
        # `Booking` со своей очередью, сроком, ценой и договором. Сделка
        # создаётся, когда начинается работа по договору, поэтому в воронке
        # остаются только сделки. Брони, бывшие сделками, перенесены в
        # `Booking` миграцией 00XX_booking.
        IN_PROGRESS = 'IN_PROGRESS', 'В работе'
        CLOSED_WON = 'CLOSED_WON', 'Успешно закрыта'
        CANCELLED = 'CANCELLED', 'Отменена'
        TERMINATED = 'TERMINATED', 'Расторгнута'

    # --- Основные участники сделки ---
    client = models.ForeignKey('crm.Client', on_delete=models.PROTECT, related_name='deals', verbose_name="Клиент")
    # Связь с заявкой замыкает воронку: без неё конверсию «заявка → сделка»
    # посчитать было нечем, а заявка не закрывалась при продаже
    application = models.ForeignKey(
        'crm.Application',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='deals',
        verbose_name="Заявка"
    )
    property = models.ForeignKey(
        'realty.Property',
        on_delete=models.PROTECT,
        related_name='deals',
        verbose_name="Объект недвижимости"
    )

    # --- Статус и даты ---
    status = models.CharField(max_length=20, choices=DealStatus.choices, default=DealStatus.IN_PROGRESS,
                              verbose_name="Статус сделки")

    # --- Валюта сделки ---
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

    # Без валюты договора сумма графика сравнивалась со стоимостью вслепую:
    # платежи в разных валютах складывались как одно число
    currency = models.CharField(
        max_length=3,
        choices=Currency.choices,
        default=Currency.UZS,
        verbose_name="Валюта сделки"
    )

    # --- Поля для фиксации стоимости на момент начала сделки ---
    initial_price = models.DecimalField(max_digits=18, decimal_places=2,
                                        verbose_name="Стоимость на момент начала сделки")
    initial_price_per_sqm = models.DecimalField(max_digits=18, decimal_places=2,
                                                verbose_name="Цена за м² на момент начала сделки")

    # --- Детали этапа "В работе" ---
    applied_discounts = models.ManyToManyField('realty.Discount', blank=True, verbose_name="Примененные скидки")
    # План оплаты (тип платежа с планом). От него зависят доступные скидки:
    # скидка «только для 100% оплаты» применима, лишь когда выбран этот план
    payment_plan = models.ForeignKey('finances.PaymentType', on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='deals', verbose_name="План оплаты")
    purchase_purpose = models.ForeignKey(PurchasePurpose, on_delete=models.SET_NULL, null=True, blank=True,
                                         verbose_name="Цель приобретения")
    payment_type = models.ForeignKey(PaymentType, on_delete=models.SET_NULL, null=True, blank=True,
                                     verbose_name="Тип оплаты")
    contract_price = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True,
                                         verbose_name="Стоимость по договору")

    # Цена объекта по прайсу в валюте проекта и курс, по которому она пересчитана
    # в валюту сделки при брони. Нужны, чтобы цену сделки можно было проверить:
    # «прайс 21 000 USD × 11 772,95 = 247 231 950 UZS».
    catalog_price = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True,
                                        verbose_name="Цена по прайсу")
    catalog_currency = models.CharField(max_length=3, choices=Currency.choices, blank=True,
                                        verbose_name="Валюта прайса")
    catalog_rate = models.DecimalField(max_digits=30, decimal_places=12, null=True, blank=True,
                                       verbose_name="Курс пересчёта прайса в валюту сделки")
    notes = models.TextField(blank=True, verbose_name="Примечание к сделке")
    # --- Поля для документов ---
    contract_number = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        # Номер договора уникален внутри компании: своя нумерация у каждой,
        # глобальная уникальность мешала бы соседней компании завести свой №1
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
    # Момент фактического закрытия сделки. Раньше отчёты брали updated_at,
    # из-за чего любое редактирование старой сделки переносило её выручку
    # в текущий месяц.
    closed_at = models.DateTimeField(null=True, blank=True, verbose_name="Дата успешного закрытия")
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
        unique_together = ('company', 'contract_number')
        ordering = ['-created_at']
        # Списки и отчёты фильтруют сделки по компании, статусу и датам —
        # без индексов каждый такой запрос читает таблицу целиком
        indexes = [
            models.Index(fields=['company', 'status']),
            models.Index(fields=['status', '-created_at']),
            models.Index(fields=['created_by', 'status']),
            models.Index(fields=['closed_at']),
            models.Index(fields=['contract_date']),
        ]

    def __str__(self):
        return f"Сделка №{self.id} по объекту {self.property}"

    @computed
    def contract_price_per_sqm(self):
        """
        Цена 1 м² по договору: стоимость по договору, делённая на площадь.

        В договоре цена за метр должна сходиться с суммой договора, поэтому
        считается от неё, а не от `initial_price_per_sqm`: та зафиксирована
        до скидок и после их применения с суммой договора уже не сходится.

        None — пока не заполнена стоимость по договору или у объекта нет
        площади; в шаблоне договора такое поле печатается пустым.
        """
        area = self.property.area if self.property_id else None
        if not self.contract_price or not area or area <= 0:
            return None
        return (self.contract_price / area).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


class Booking(models.Model):
    """
    Бронь объекта: лёгкая запись перед сделкой.

    Раньше бронь была статусом сделки, и из-за этого 279 из 724 сделок
    оказались бронями и мёртвыми бронями без договора и без денег — они
    искажали воронку. График платежей нельзя было поправить, не закрыв
    бронь: сохранение графика само переводило бронь в работу. У брони не
    было ни своей цены, ни своего срока, ни своего договора, а на один
    объект нельзя было поставить больше одной брони — очередь выразить
    было нечем.

    У брони нет графика платежей: по ней один платёж — взнос, фиксированной
    суммой из настроек компании. Срок задаётся в днях; даты записываются
    при активации, а у броней в очереди проецируются (конец предыдущей —
    начало следующей) и в базе не хранятся.
    """

    class BookingStatus(models.TextChoices):
        PENDING_QUEUE = 'PENDING_QUEUE', 'В очереди'
        ACTIVE = 'ACTIVE', 'Активна'
        CONVERTED = 'CONVERTED', 'Оформлена в сделку'
        EXPIRED = 'EXPIRED', 'Истекла'
        CANCELLED = 'CANCELLED', 'Отменена'

    # Брони, которые ещё могут стать сделкой: по ним ждут денег и они
    # занимают место в очереди на объект
    LIVE_STATUSES = (BookingStatus.ACTIVE, BookingStatus.PENDING_QUEUE)
    # Брони, по которым денег больше не ждут
    DEAD_STATUSES = (BookingStatus.EXPIRED, BookingStatus.CANCELLED)

    company = models.ForeignKey(
        'permissions.Company',
        on_delete=models.PROTECT,
        related_name='bookings',
        verbose_name="Компания",
        null=True,
        blank=True
    )
    client = models.ForeignKey('crm.Client', on_delete=models.PROTECT, related_name='bookings',
                               verbose_name="Клиент")
    property = models.ForeignKey('realty.Property', on_delete=models.PROTECT, related_name='bookings',
                                 verbose_name="Объект недвижимости")
    # Одна сделка — одна бронь. NULL в уникальном индексе не конфликтуют,
    # поэтому броней без сделки может быть сколько угодно.
    deal = models.OneToOneField(Deal, on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='booking', verbose_name="Сделка")
    # Заявка переносится с брони на сделку при конвертации: без этого
    # воронка «заявка → бронь → сделка» обрывалась на броне
    application = models.ForeignKey('crm.Application', on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='bookings', verbose_name="Заявка")

    status = models.CharField(max_length=20, choices=BookingStatus.choices,
                              default=BookingStatus.PENDING_QUEUE, verbose_name="Статус брони")
    # Срок в днях, а не датой окончания: у броней в очереди даты неизвестны,
    # пока не освободится объект. Минимум — в настройках компании.
    duration_days = models.PositiveSmallIntegerField(verbose_name="Срок брони, дней")
    # Заполняются при активации. У брони в очереди пусты — даты проецируются
    start_date = models.DateTimeField(null=True, blank=True, verbose_name="Дата начала брони")
    end_date = models.DateTimeField(null=True, blank=True, verbose_name="Дата окончания брони")

    # Цена фиксируется в момент активации, не создания: иначе бронь из
    # очереди «забрала» бы старую цену и повышение прайса между бронями
    # до неё не дошло бы
    price = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True,
                                verbose_name="Цена объекта на момент брони")
    currency = models.CharField(max_length=3, choices=Deal.Currency.choices, blank=True,
                                verbose_name="Валюта цены (валюта прайса проекта)")

    # Своя серия номеров, отдельно от номеров договоров сделок
    contract_number = models.CharField(max_length=100, blank=True, null=True,
                                       verbose_name="Номер договора брони")
    contract_date = models.DateField(null=True, blank=True, verbose_name="Дата договора брони")
    signed_scan = models.FileField(upload_to='bookings/signed_documents/', null=True, blank=True,
                                   verbose_name="Скан подписанного договора брони")
    cancellation_reason = models.TextField(blank=True, null=True, verbose_name="Причина снятия")

    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата последнего изменения")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_bookings',
        verbose_name="Менеджер"
    )

    class Meta:
        verbose_name = "Бронь"
        verbose_name_plural = "Брони"
        # Очередь строго FIFO по дате создания: id вторым ключом, потому что
        # две брони могут быть созданы в одну и ту же микросекунду
        ordering = ['-created_at', '-id']
        constraints = [
            # Не больше одной активной брони на объект: очередь ведут
            # остальные брони в статусе «В очереди»
            models.UniqueConstraint(
                fields=['property'],
                condition=models.Q(status='ACTIVE'),
                name='uniq_active_booking_per_property',
            ),
            # Номер договора брони уникален внутри компании
            models.UniqueConstraint(
                fields=['company', 'contract_number'],
                condition=models.Q(contract_number__isnull=False),
                name='uniq_booking_contract_number_per_company',
            ),
        ]
        indexes = [
            models.Index(fields=['property', 'status']),
            models.Index(fields=['company', 'status']),
            models.Index(fields=['status', 'end_date']),
            models.Index(fields=['created_by', 'status']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"Бронь №{self.id} по объекту {self.property}"

    @computed
    def is_live(self):
        return self.status in self.LIVE_STATUSES

    @computed
    def is_expired_by_date(self):
        """Срок активной брони истёк — но автомат её ещё не снял."""
        from django.utils import timezone

        return bool(self.end_date and self.end_date < timezone.now())


class BookingLog(models.Model):
    """ Логирование изменений по брони """
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="logs", verbose_name="Бронь")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        verbose_name="Пользователь"
    )
    action = models.TextField(verbose_name="Совершенное действие")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Время")

    class Meta:
        verbose_name = "Лог брони"
        verbose_name_plural = "Логи броней"
        ordering = ['-created_at']

    def __str__(self):
        return f"Лог для брони №{self.booking_id}"


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
