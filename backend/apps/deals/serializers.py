from rest_framework import serializers
from .models import Deal, DealLog
from apps.crm.serializers import ClientListSerializer
# ИСПРАВЛЕНИЕ: Импортируем DiscountListSerializer
from apps.realty.serializers import PropertyListSerializer, DiscountListSerializer
# ИСПРАВЛЕНИЕ: Удаляем импорт PaymentSerializer отсюда

class DealCreateSerializer(serializers.ModelSerializer):
    """
    Сериализатор для создания новой сделки (бронирования).
    Принимает ID клиента, объекта и дату окончания брони.
    """

    class Meta:
        model = Deal
        fields = ['client', 'property', 'booking_end_date']

    def validate_client(self, value):
        """Проверяем что клиент доступен пользователю (scope-check)"""
        from permissions.backends import get_filtered_queryset
        user = self.context['request'].user
        from apps.crm.models import Client
        accessible = get_filtered_queryset(user, Client.objects.filter(pk=value.pk), 'CLIENT')
        if not accessible.exists():
            raise serializers.ValidationError('Клиент не найден или недоступен.')
        return value

    def validate_property(self, value):
        """Проверяем что объект недвижимости доступен пользователю (scope-check)"""
        from apps.realty.views import _filter_by_company_scope
        user = self.context['request'].user
        from apps.realty.models import Property
        accessible = _filter_by_company_scope(user, Property.objects.filter(pk=value.pk), 'building__project__company')
        if not accessible.exists():
            raise serializers.ValidationError('Объект недвижимости не найден или недоступен.')
        return value

class DealLogSerializer(serializers.ModelSerializer):
    user = serializers.StringRelatedField()

    class Meta:
        model = DealLog
        fields = ['id', 'user', 'action', 'created_at']
        read_only_fields = ['created_at']

class DealListSerializer(serializers.ModelSerializer):
    client = serializers.StringRelatedField()
    property = serializers.StringRelatedField()
    created_by = serializers.StringRelatedField()

    class Meta:
        model = Deal
        fields = ['id', 'status', 'client', 'property', 'contract_price', 'created_by', 'created_at']
        read_only_fields = ['created_at']


class DealDetailSerializer(serializers.ModelSerializer):
    """
    Сериализатор для детального отображения и обновления сделки.
    Включает вложенные данные о клиенте, объекте и примененных скидках.
    """
    client = ClientListSerializer(read_only=True)
    property = PropertyListSerializer(read_only=True)
    # Используем DiscountListSerializer для отображения краткой информации о скидках
    applied_discounts = DiscountListSerializer(many=True, read_only=True)
    created_by = serializers.StringRelatedField(read_only=True)
    # ИСПРАВЛЕНИЕ: Заменяем прямое поле на SerializerMethodField
    payments = serializers.SerializerMethodField()
    logs = DealLogSerializer(many=True, read_only=True)

    # Поле только для записи (write-only), чтобы принимать массив ID скидок при обновлении
    applied_discounts_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        write_only=True,
        queryset=Deal.applied_discounts.field.related_model.objects.all(),
        source='applied_discounts'
    )

    def validate_applied_discounts_ids(self, value):
        """Проверяем что скидки доступны пользователю (scope-check)"""
        from apps.realty.views import _filter_by_company_scope
        from apps.realty.models import Discount
        user = self.context['request'].user
        ids = [d.pk for d in value]
        accessible = _filter_by_company_scope(
            user, Discount.objects.filter(pk__in=ids), 'buildings__project__company'
        ).distinct()
        accessible_ids = set(accessible.values_list('pk', flat=True))
        denied = set(ids) - accessible_ids
        if denied:
            raise serializers.ValidationError(f'Скидки {denied} не найдены или недоступны.')
        return value

    class Meta:
        model = Deal
        fields = [
            'id', 'status', 'booking_start_date', 'booking_end_date', 'client', 'property',
            'initial_price', 'initial_price_per_sqm', 'contract_price', 'notes',
            'created_by', 'created_at', 'applied_discounts', 'applied_discounts_ids',
            'payments', 'contract_number', 'contract_date',
            'signed_document_scan', 'client_signature_date', 'company_signature_date','logs','cancellation_reason', 'termination_document_scan', 'termination_date'
        ]
        read_only_fields = [
            'id', 'status', 'booking_start_date', 'client', 'property',
            'initial_price', 'initial_price_per_sqm', 'created_by', 'created_at', 'applied_discounts', 'payments','logs','cancellation_reason', 'termination_document_scan', 'termination_date'
        ]

    # ИСПРАВЛЕНИЕ: Добавляем метод для сериализации платежей
    def get_payments(self, obj):
        from apps.finances.serializers import PaymentSerializer
        payments = obj.payments.all()
        return PaymentSerializer(payments, many=True).data

    def validate_contract_number(self, value):
        # Пустое значение разрешено, но если оно передано, преобразуем его в None
        if not value:
            return None

        # Проверяем уникальность, исключая текущую сделку (при редактировании)
        query = Deal.objects.filter(contract_number=value)
        if self.instance:
            query = query.exclude(pk=self.instance.pk)

        if query.exists():
            raise serializers.ValidationError("Сделка с таким номером договора уже существует.")

        return value

    # ИСПРАВЛЕНИЕ: Добавляем метод для возврата относительных путей к файлам
    def to_representation(self, instance):
        representation = super().to_representation(instance)
        if instance.signed_document_scan:
            representation['signed_document_scan'] = instance.signed_document_scan.url
        if instance.termination_document_scan:
            representation['termination_document_scan'] = instance.termination_document_scan.url
        return representation