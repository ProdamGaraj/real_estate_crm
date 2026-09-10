from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator


class Project(models.Model):
    """ Проект (Жилой комплекс) """
    # --- Привязка к компании ---
    company = models.ForeignKey(
        'permissions.Company',
        on_delete=models.PROTECT,
        related_name='projects',
        verbose_name="Компания",
        null=True,
        blank=True
    )
    
    # --- Основная информация ---
    name = models.CharField(max_length=200, verbose_name="Название проекта")
    address = models.CharField(max_length=255, verbose_name="Адрес")
    description = models.TextField(blank=True, verbose_name="Описание")
    logo = models.ImageField(upload_to='projects/logos/', blank=True, null=True, verbose_name="Логотип")

    # --- УТП ---
    usp_1 = models.TextField(blank=True, verbose_name="УТП 1")
    usp_2 = models.TextField(blank=True, verbose_name="УТП 2")
    usp_3 = models.TextField(blank=True, verbose_name="УТП 3")

    # --- Характеристики ---
    min_floors = models.PositiveIntegerField(blank=True, null=True, verbose_name="Этажность (мин)")
    max_floors = models.PositiveIntegerField(blank=True, null=True, verbose_name="Этажность (макс)")
    cadastre_date_plan = models.DateField(blank=True, null=True, verbose_name="Дата кадастра (План)")
    # --- Юридическая информация ---
    developer_details = models.TextField(blank=True, verbose_name="Реквизиты застройщика")

    # --- Системные поля (Логи) ---
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата последнего изменения")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_projects',
        verbose_name="Кем создан"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='updated_projects',
        verbose_name="Кем изменен"
    )

    class Meta:
        verbose_name = "Проект"
        verbose_name_plural = "Проекты"
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class ProjectImage(models.Model):
    """ Фотография для галереи проекта """
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='gallery_images', verbose_name="Проект")
    image = models.ImageField(upload_to='projects/gallery/', verbose_name="Изображение")
    caption = models.CharField(max_length=255, blank=True, verbose_name="Подпись к фото")

    class Meta:
        verbose_name = "Фотография проекта"
        verbose_name_plural = "Галерея проекта"

    def __str__(self):
        return f"Фото для {self.project.name}"


class BuildingType(models.Model):
    """ Тип дома (например, Монолитный, Кирпичный) """
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
    name = models.CharField(max_length=100, verbose_name="Название типа")

    class Meta:
        verbose_name = "Тип дома"
        verbose_name_plural = "Типы домов"
        unique_together = ('company', 'name')

    def __str__(self):
        return self.name


class Building(models.Model):
    """ Дом/Корпус в рамках проекта """

    class BuildingStatus(models.TextChoices):
        UNDER_REVIEW = 'UNDER_REVIEW', 'На проверке'
        FOR_SALE = 'FOR_SALE', 'В продаже'
        COMPLETED = 'COMPLETED', 'Сдан'
        ARCHIVED = 'ARCHIVED', 'В архиве'

    project = models.ForeignKey(Project, related_name='buildings', on_delete=models.CASCADE, verbose_name="Проект")
    name = models.CharField(max_length=100, verbose_name="Название или номер дома/корпуса")
    address_detail = models.CharField(max_length=255, blank=True, verbose_name="Точный адрес дома")
    building_type = models.ForeignKey(BuildingType, on_delete=models.SET_NULL, null=True, blank=True,
                                      verbose_name="Тип дома")
    status = models.CharField(max_length=20, choices=BuildingStatus.choices, default=BuildingStatus.UNDER_REVIEW,
                              verbose_name="Статус дома")
    floors_count = models.PositiveIntegerField(verbose_name="Количество этажей")
    ceiling_height = models.DecimalField(max_digits=4, decimal_places=2, blank=True, null=True,
                                         verbose_name="Высота потолков (м)")
    material = models.CharField(max_length=100, blank=True, verbose_name="Материал")
    usp_1 = models.TextField(blank=True, verbose_name="УТП 1")
    usp_2 = models.TextField(blank=True, verbose_name="УТП 2")
    sales_start_date = models.DateField(blank=True, null=True, verbose_name="Дата старта продаж")
    cadastre_date_plan = models.DateField(blank=True, null=True, verbose_name="Дата кадастра (План)")
    cadastre_date_fact = models.DateField(blank=True, null=True, verbose_name="Дата кадастра (Факт)")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата последнего изменения")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_buildings',
        verbose_name="Кем создан"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='updated_buildings',
        verbose_name="Кем изменен"
    )

    class Meta:
        verbose_name = "Дом"
        verbose_name_plural = "Дома"

    def __str__(self):
        return f"{self.project.name} - {self.name}"


class BuildingImage(models.Model):
    """ Фотография для галереи дома """
    building = models.ForeignKey(Building, on_delete=models.CASCADE, related_name='gallery_images', verbose_name="Дом")
    image = models.ImageField(upload_to='buildings/gallery/', verbose_name="Изображение")
    caption = models.CharField(max_length=255, blank=True, verbose_name="Подпись к фото")

    class Meta:
        verbose_name = "Фотография дома"
        verbose_name_plural = "Галерея дома"

    def __str__(self):
        return f"Фото для {self.building.name}"


class BuildingLog(models.Model):
    """ Логирование изменений по дому """
    building = models.ForeignKey(Building, on_delete=models.CASCADE, related_name="logs", verbose_name="Дом")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                             verbose_name="Пользователь")
    action = models.TextField(verbose_name="Совершенное действие")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Время")

    class Meta:
        verbose_name = "Лог дома"
        verbose_name_plural = "Логи домов"
        ordering = ['-created_at']

    def __str__(self):
        return f"Лог для {self.building.name} от {self.created_at.strftime('%Y-%m-%d %H:%M')}"


class Layout(models.Model):
    building = models.ForeignKey(Building, on_delete=models.CASCADE, related_name="layouts", verbose_name="Дом")
    name = models.CharField(max_length=100, verbose_name="Название планировки")
    main_layout_image = models.ImageField(upload_to='layouts/main/', blank=True, null=True, verbose_name="Планировка")
    extra_layout_image = models.ImageField(upload_to='layouts/extra/', blank=True, null=True,
                                           verbose_name="Доп. планировка")
    floor_plan_image = models.ImageField(upload_to='layouts/floor_plans/', blank=True, null=True,
                                         verbose_name="Расположение на этаже")
    usp_image = models.ImageField(upload_to='layouts/usp/', blank=True, null=True, verbose_name="УТП фото")

    class Meta:
        verbose_name = "Планировка"
        verbose_name_plural = "Планировки"
        unique_together = ('building', 'name')

    def __str__(self):
        return f"{self.name} ({self.building.name})"


class Property(models.Model):
    """ Объект недвижимости (конкретная единица) """

    class PropertyType(models.TextChoices):
        APARTMENT = 'APARTMENT', 'Квартира'
        COMMERCIAL = 'COMMERCIAL', 'Коммерция'
        PARKING = 'PARKING', 'Парковка'
        STORAGE = 'STORAGE', 'Кладовка'
        COTTAGE = 'COTTAGE', 'Коттедж'

    class PropertyStatus(models.TextChoices):
        SELECTION = 'SELECTION', 'Подбор'
        RESERVE = 'RESERVE', 'Резерв'
        BOOKING = 'BOOKING', 'Бронь'
        IN_DEAL = 'IN_DEAL', 'Сделка в работе'
        SOLD = 'SOLD', 'Сделка проведена'

    building = models.ForeignKey(Building, related_name='properties', on_delete=models.CASCADE, verbose_name="Дом")
    property_type = models.CharField(max_length=20, choices=PropertyType.choices, verbose_name="Тип объекта")
    status = models.CharField(max_length=20, choices=PropertyStatus.choices, default=PropertyStatus.SELECTION,
                              verbose_name="Статус")
    unit_number = models.CharField(max_length=20, verbose_name="Номер объекта")
    floor = models.IntegerField(verbose_name="Этаж")
    entrance = models.CharField(max_length=20, blank=True, null=True, verbose_name="Подъезд")
    riser = models.CharField(max_length=20, blank=True, verbose_name="Стояк")
    area = models.DecimalField(max_digits=8, decimal_places=2, verbose_name="Площадь (кв.м)")
    has_finishing = models.BooleanField(default=False, verbose_name="Наличие отделки")
    price = models.DecimalField(max_digits=12, decimal_places=2, verbose_name="Стоимость")
    description = models.TextField(blank=True, verbose_name="Описание")
    layout = models.ForeignKey(Layout, on_delete=models.SET_NULL, null=True, blank=True, related_name="properties",
                               verbose_name="Планировка")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата последнего изменения")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_properties',
        verbose_name="Кем создан"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='updated_properties',
        verbose_name="Кем изменен"
    )

    class Meta:
        verbose_name = "Объект недвижимости"
        verbose_name_plural = "Объекты недвижимости"
        # Номер объекта уникален в пределах дома. Прежняя связка с этажом
        # и подъездом допускала две квартиры с одним номером в одном доме.
        unique_together = ('building', 'unit_number')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_property_type_display()} {self.unit_number} в {self.building}"

    @property
    def price_per_sqm(self):
        if self.area and self.price and self.area > 0:
            return round(self.price / self.area, 2)
        return None


class Discount(models.Model):
    """ Скидка """
    # Скидка — коммерческое условие конкретной компании, а не общий справочник:
    # без этой привязки условия одной компании видны и применимы в другой
    company = models.ForeignKey(
        'permissions.Company',
        on_delete=models.PROTECT,
        related_name='discounts',
        verbose_name="Компания",
        null=True,
        blank=True
    )
    name = models.CharField(max_length=150, verbose_name="Название скидки")
    percentage_value = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        verbose_name="Значение в процентах (%)"
    )
    comment = models.TextField(blank=True, verbose_name="Краткое описание")
    start_date = models.DateField(verbose_name="Дата начала действия")
    end_date = models.DateField(blank=True, null=True, verbose_name="Дата окончания действия (бессрочная, если пусто)")
    property_type = models.CharField(
        max_length=20,
        choices=Property.PropertyType.choices,
        blank=True,
        null=True,
        verbose_name="Тип недвижимости для скидки"
    )
    buildings = models.ManyToManyField(
        Building,
        blank=True,
        related_name="discounts",
        verbose_name="Привязать к домам"
    )
    is_active = models.BooleanField(default=True, verbose_name="Активна")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата последнего изменения")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_discounts',
        verbose_name="Кем создана"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='updated_discounts',
        verbose_name="Кем изменена"
    )

    class Meta:
        verbose_name = "Скидка"
        verbose_name_plural = "Скидки"
        ordering = ['-start_date']

    def __str__(self):
        return f"{self.name} ({self.percentage_value}%)"
class DiscountLog(models.Model):
    """ Логирование изменений по скидке """
    discount = models.ForeignKey(Discount, on_delete=models.CASCADE, related_name="logs", verbose_name="Скидка")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, verbose_name="Пользователь")
    action = models.TextField(verbose_name="Совершенное действие")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Время")

    class Meta:
        verbose_name = "Лог скидки"
        verbose_name_plural = "Логи скидок"
        ordering = ['-created_at']

    def __str__(self):
        return f"Лог для скидки {self.discount.name} от {self.created_at.strftime('%Y-%m-%d %H:%M')}"