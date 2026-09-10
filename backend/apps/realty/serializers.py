from rest_framework import serializers
from django.conf import settings
from .models import (
    Project, Building, BuildingType, Property, Layout, Discount, DiscountLog,
    BuildingLog, ProjectImage, BuildingImage
)


# --- "Листовые" сериализаторы (без зависимостей от других сериализаторов в этом файле) ---

class ProjectImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectImage
        fields = '__all__'
        read_only_fields = ['project']


class BuildingImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = BuildingImage
        fields = '__all__'
        read_only_fields = ['building']

class BuildingTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = BuildingType
        fields = ['id', 'name']


class BuildingMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Building
        fields = ['id', 'name']


class LayoutMiniSerializer(serializers.ModelSerializer):
    # Возвращаем относительные пути вместо абсолютных URL
    main_layout_image = serializers.SerializerMethodField()
    extra_layout_image = serializers.SerializerMethodField()
    floor_plan_image = serializers.SerializerMethodField()
    usp_image = serializers.SerializerMethodField()

    class Meta:
        model = Layout
        fields = ['id', 'name', 'main_layout_image', 'extra_layout_image', 'floor_plan_image', 'usp_image']

    def get_main_layout_image(self, obj):
        return obj.main_layout_image.url if obj.main_layout_image else None

    def get_extra_layout_image(self, obj):
        return obj.extra_layout_image.url if obj.extra_layout_image else None

    def get_floor_plan_image(self, obj):
        return obj.floor_plan_image.url if obj.floor_plan_image else None

    def get_usp_image(self, obj):
        return obj.usp_image.url if obj.usp_image else None


class LayoutSerializer(serializers.ModelSerializer):
    # Возвращаем относительные пути вместо абсолютных URL
    # Фронтенд сам добавит правильный baseUrl
    main_layout_image = serializers.ImageField(required=False, allow_null=True)
    extra_layout_image = serializers.ImageField(required=False, allow_null=True)
    floor_plan_image = serializers.ImageField(required=False, allow_null=True)
    usp_image = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = Layout
        fields = '__all__'
        read_only_fields = ['building']

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Возвращаем относительные пути для изображений
        image_fields = ['main_layout_image', 'extra_layout_image', 'floor_plan_image', 'usp_image']
        for field in image_fields:
            file_obj = getattr(instance, field)
            if file_obj:
                ret[field] = file_obj.url
            else:
                ret[field] = None
        return ret


class DiscountLogSerializer(serializers.ModelSerializer):
    user = serializers.StringRelatedField()

    class Meta:
        model = DiscountLog
        fields = ['id', 'user', 'action', 'created_at']
        read_only_fields = ['created_at']


class BuildingLogSerializer(serializers.ModelSerializer):
    user = serializers.StringRelatedField()

    class Meta:
        model = BuildingLog
        fields = ['id', 'user', 'action', 'created_at']
        read_only_fields = ['created_at']


# --- Сериализаторы Объектов (Property) ---

class PropertyListSerializer(serializers.ModelSerializer):
    layout = LayoutMiniSerializer(read_only=True)
    active_deal_id = serializers.SerializerMethodField()

    class Meta:
        model = Property
        fields = [
            'id', 'unit_number', 'property_type', 'status', 'area', 'price',
            'floor', 'entrance', 'riser', 'has_finishing', 'layout', 'description', 'active_deal_id'
        ]

    def get_active_deal_id(self, obj):
        """
        Ищет активную сделку (не отмененную/расторгнутую/завершенную) для этого объекта
        и возвращает ее ID.
        """
        active_statuses = [
            'BOOKING',
            'IN_PROGRESS',
            'CLOSED_WON'
        ]
        # Используем related_name 'deals', который мы задали в модели
        active_deal = obj.deals.filter(status__in=active_statuses).first()
        return active_deal.id if active_deal else None


class PropertyDetailSerializer(serializers.ModelSerializer):
    """
    Ручное редактирование объекта.

    Статусы «Бронь», «Сделка в работе» и «Сделка проведена» ставит и снимает
    только сам процесс сделки — руками их менять нельзя, иначе проданный объект
    возвращается в подбор и продаётся повторно.
    """

    # Статусы, которыми управляет сделка, а не пользователь
    DEAL_MANAGED_STATUSES = (
        Property.PropertyStatus.BOOKING,
        Property.PropertyStatus.IN_DEAL,
        Property.PropertyStatus.SOLD,
    )

    class Meta:
        model = Property
        fields = ['status', 'description']

    def validate_status(self, value):
        current_status = self.instance.status if self.instance else None
        if value == current_status:
            return value

        if value in self.DEAL_MANAGED_STATUSES:
            raise serializers.ValidationError(
                'Этот статус выставляется автоматически при работе со сделкой.'
            )

        if current_status in self.DEAL_MANAGED_STATUSES:
            raise serializers.ValidationError(
                f'Объект занят сделкой (статус — «{self.instance.get_status_display()}»). '
                f'Сначала отмените или расторгните сделку.'
            )

        return value


# --- Сериализаторы Скидок (Discount) ---

class DiscountBuildingsScopeMixin:
    """
    Общая проверка домов, к которым привязывают скидку.

    Дома должны быть доступны пользователю: иначе скидку можно привязать
    к чужому проекту и раздать свои условия соседней компании.
    """

    def validate_buildings(self, value):
        from .views import _filter_by_company_scope

        if not value:
            return value

        request = self.context.get('request')
        if request is None:
            return value

        ids = [building.pk for building in value]
        accessible = _filter_by_company_scope(
            request.user, Building.objects.filter(pk__in=ids), 'project__company', 'BUILDING'
        )
        denied = set(ids) - set(accessible.values_list('pk', flat=True))
        if denied:
            raise serializers.ValidationError(
                f'Дома {sorted(denied)} не найдены или недоступны.'
            )
        return value

    def validate(self, data):
        data = super().validate(data)
        start_date = data.get('start_date', getattr(self.instance, 'start_date', None))
        end_date = data.get('end_date', getattr(self.instance, 'end_date', None))
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError(
                {'end_date': 'Дата окончания не может быть раньше даты начала.'}
            )
        return data


class DiscountListSerializer(DiscountBuildingsScopeMixin, serializers.ModelSerializer):
    buildings_info = serializers.StringRelatedField(source='buildings', many=True, read_only=True)

    class Meta:
        model = Discount
        # buildings доступно на запись: без него любая созданная скидка
        # становилась глобальной, хотя интерфейс предлагал выбрать дома
        fields = [
            'id', 'name', 'percentage_value', 'property_type', 'start_date', 'end_date',
            'buildings', 'buildings_info', 'comment', 'is_active',
        ]


class DiscountDetailSerializer(DiscountBuildingsScopeMixin, serializers.ModelSerializer):
    buildings_info = serializers.StringRelatedField(source='buildings', many=True, read_only=True)
    logs = DiscountLogSerializer(many=True, read_only=True)

    class Meta:
        model = Discount
        fields = '__all__'
        # buildings убрано из read_only: привязку к домам нужно уметь менять.
        # company назначается по профилю создателя и вручную не переносится.
        read_only_fields = ['created_by', 'updated_by', 'created_at', 'updated_at', 'company']


# --- Сериализаторы Проектов (Project) ---

class ProjectListSerializer(serializers.ModelSerializer):
    buildings = BuildingMiniSerializer(many=True, read_only=True)
    company_name = serializers.CharField(source='company.name', read_only=True, allow_null=True)

    class Meta:
        model = Project
        fields = ['id', 'name', 'address', 'created_at', 'buildings', 'company', 'company_name']
        read_only_fields = ['created_at']


# --- "Составные" сериализаторы (зависят от определенных выше) ---

class BuildingSerializer(serializers.ModelSerializer):
    building_type = BuildingTypeSerializer(read_only=True)
    building_type_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    properties = PropertyListSerializer(many=True, read_only=True)
    project = ProjectListSerializer(read_only=True)
    logs = BuildingLogSerializer(many=True, read_only=True)
    gallery_images = BuildingImageSerializer(many=True, read_only=True)

    class Meta:
        model = Building
        fields = '__all__'
        read_only_fields = ['created_by', 'updated_by', 'created_at', 'updated_at']


class ProjectDetailSerializer(serializers.ModelSerializer):
    buildings = BuildingSerializer(many=True, read_only=True)
    gallery_images = ProjectImageSerializer(many=True, read_only=True)
    company_name = serializers.CharField(source='company.name', read_only=True, allow_null=True)

    class Meta:
        model = Project
        fields = '__all__'
        read_only_fields = ['created_by', 'updated_by', 'created_at', 'updated_at', 'company']
    
    def validate_company(self, value):
        """Компания обязательна при создании проекта."""
        if value is None and not self.instance:
            raise serializers.ValidationError("Необходимо указать компанию для проекта.")
        return value

class PublicImageLayoutSerializer(serializers.ModelSerializer):
    """ Сериализатор для планировок, отдает полные URL изображений """
    main_layout_image = serializers.SerializerMethodField()
    extra_layout_image = serializers.SerializerMethodField()
    floor_plan_image = serializers.SerializerMethodField()
    usp_image = serializers.SerializerMethodField()

    class Meta:
        model = Layout
        fields = ['id', 'name', 'main_layout_image', 'extra_layout_image', 'floor_plan_image', 'usp_image']

    def get_main_layout_image(self, obj):
        if obj.main_layout_image:
            return f"{settings.SITE_URL}{obj.main_layout_image.url}"
        return None
    def get_extra_layout_image(self, obj):
        if obj.extra_layout_image:
            return f"{settings.SITE_URL}{obj.extra_layout_image.url}"
        return None
    def get_floor_plan_image(self, obj):
        if obj.floor_plan_image:
            return f"{settings.SITE_URL}{obj.floor_plan_image.url}"
        return None
    def get_usp_image(self, obj):
        if obj.usp_image:
            return f"{settings.SITE_URL}{obj.usp_image.url}"
        return None


class PublicPropertySerializer(serializers.ModelSerializer):
    """ Сериализатор для объектов недвижимости (публичный) """
    layout = PublicImageLayoutSerializer(read_only=True)
    class Meta:
        model = Property
        fields = [
            'id', 'unit_number', 'property_type', 'status', 'area', 'price',
            'floor', 'entrance', 'has_finishing', 'layout'
        ]

class PublicBuildingImageSerializer(serializers.ModelSerializer):
    """ Сериализатор для галереи дома (публичный) """
    image = serializers.SerializerMethodField()
    class Meta:
        model = BuildingImage
        fields = ['id', 'image', 'caption']
    def get_image(self, obj):
        return f"{settings.SITE_URL}{obj.image.url}"


class PublicBuildingDetailSerializer(serializers.ModelSerializer):
    """ Сериализатор для детальной карточки дома (публичный) """
    properties = PublicPropertySerializer(many=True, read_only=True)
    gallery_images = PublicBuildingImageSerializer(many=True, read_only=True)
    class Meta:
        model = Building
        fields = ['id', 'name', 'floors_count', 'status', 'properties', 'gallery_images']


class PublicProjectImageSerializer(serializers.ModelSerializer):
    """ Сериализатор для галереи проекта (публичный) """
    image = serializers.SerializerMethodField()
    class Meta:
        model = ProjectImage
        fields = ['id', 'image', 'caption']
    def get_image(self, obj):
        return f"{settings.SITE_URL}{obj.image.url}"


class PublicProjectListSerializer(serializers.ModelSerializer):
    """ Сериализатор для списка проектов (публичный) """
    logo = serializers.SerializerMethodField()
    class Meta:
        model = Project
        fields = ['id', 'name', 'address', 'logo']
    def get_logo(self, obj):
        if obj.logo:
            return f"{settings.SITE_URL}{obj.logo.url}"
        return None

class PublicProjectDetailSerializer(serializers.ModelSerializer):
    """ Сериализатор для детальной карточки проекта (публичный) """
    buildings = PublicBuildingDetailSerializer(many=True, read_only=True)
    gallery_images = PublicProjectImageSerializer(many=True, read_only=True)
    logo = serializers.SerializerMethodField()
    class Meta:
        model = Project
        fields = [
            'id', 'name', 'address', 'description', 'logo', 'usp_1',
            'usp_2', 'usp_3', 'buildings', 'gallery_images'
        ]
    def get_logo(self, obj):
        if obj.logo:
            return f"{settings.SITE_URL}{obj.logo.url}"
        return None