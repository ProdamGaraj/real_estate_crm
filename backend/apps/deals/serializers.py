from decimal import Decimal, ROUND_HALF_UP

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
        fields = ['client', 'property', 'booking_end_date', 'application']

    def validate_application(self, value):
        """Заявка должна быть доступна пользователю и принадлежать тому же клиенту"""
        if value is None:
            return value
        from permissions.backends import get_filtered_queryset
        from apps.crm.models import Application

        user = self.context['request'].user
        accessible = get_filtered_queryset(
            user, Application.objects.filter(pk=value.pk), 'APPLICATION'
        )
        if not accessible.exists():
            raise serializers.ValidationError('Заявка не найдена или недоступна.')
        return value

    def validate(self, data):
        data = super().validate(data)
        application = data.get('application')
        client = data.get('client')
        if application and client and application.client_id != client.pk:
            raise serializers.ValidationError({
                'application': 'Заявка оформлена на другого клиента.'
            })
        return data

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
        accessible = _filter_by_company_scope(user, Property.objects.filter(pk=value.pk), 'building__project__company', 'PROPERTY')
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

    def validate(self, data):
        """
        Сверяем цену договора со скидками и с уже собранным графиком платежей.
        """
        data = super().validate(data)
        instance = self.instance
        if instance is None:
            return data

        discounts = data.get('applied_discounts', list(instance.applied_discounts.all()))
        contract_price = data.get('contract_price', instance.contract_price)

        # Суммарный процент ограничивался только у каждой скидки по отдельности
        total_percent = sum((d.percentage_value or 0) for d in discounts)
        if total_percent > 100:
            raise serializers.ValidationError({
                'applied_discounts_ids': f'Суммарная скидка {total_percent}% превышает 100%.'
            })

        if contract_price is not None and instance.initial_price:
            expected = (instance.initial_price * (Decimal(100) - Decimal(total_percent)) / Decimal(100))
            expected = expected.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            if Decimal(contract_price) > expected:
                raise serializers.ValidationError({
                    'contract_price': (
                        f'Стоимость по договору ({contract_price}) больше цены со скидками '
                        f'({expected}). Проверьте набор скидок.'
                    )
                })

        # Цену договора можно было менять уже после сборки графика — суммы
        # молча расходились до следующей правки графика
        if 'contract_price' in data and instance.pk:
            paid_total = sum(
                (p.amount for p in instance.payments.all()), Decimal(0)
            )
            if instance.payments.exists() and contract_price is not None:
                if Decimal(contract_price) != paid_total:
                    raise serializers.ValidationError({
                        'contract_price': (
                            f'По сделке уже собран график на {paid_total}. '
                            f'Сначала пересоберите график под новую стоимость.'
                        )
                    })

        return data

    def validate_applied_discounts_ids(self, value):
        """Проверяем что скидки доступны пользователю (scope-check)"""
        from apps.realty.views import _filter_by_company_scope
        from apps.realty.models import Discount
        user = self.context['request'].user
        ids = [d.pk for d in value]
        accessible = _filter_by_company_scope(
            user, Discount.objects.filter(pk__in=ids), 'company', 'DISCOUNT'
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
            'payments', 'contract_number', 'contract_date', 'application',
            'signed_document_scan', 'client_signature_date', 'company_signature_date','logs','cancellation_reason', 'termination_document_scan', 'termination_date'
        ]
        read_only_fields = [
            'id', 'status', 'booking_start_date', 'client', 'property', 'application',
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

        # Уникальность проверяем внутри компании: у каждой своя нумерация
        company_id = getattr(self.instance, 'company_id', None)
        if company_id is None:
            request = self.context.get('request')
            profile = getattr(getattr(request, 'user', None), 'profile', None)
            company_id = getattr(profile, 'company_id', None)

        query = Deal.objects.filter(contract_number=value, company_id=company_id)
        if self.instance:
            query = query.exclude(pk=self.instance.pk)

        if query.exists():
            raise serializers.ValidationError("Сделка с таким номером договора уже существует.")

        return value

    # ИСПРАВЛЕНИЕ: Добавляем метод для возврата относительных путей к файлам
    def to_representation(self, instance):
        from real_estate_project.media_access import build_media_url

        representation = super().to_representation(instance)
        # Документы сделки отдаются по ссылке с подписанным токеном:
        # прямой путь в media открыт любому, кто его угадает
        if instance.signed_document_scan:
            representation['signed_document_scan'] = build_media_url(instance.signed_document_scan)
        if instance.termination_document_scan:
            representation['termination_document_scan'] = build_media_url(instance.termination_document_scan)
        return representation