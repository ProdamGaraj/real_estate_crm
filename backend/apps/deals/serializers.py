from decimal import Decimal, ROUND_HALF_UP

from apps.common import EmployeeNameField

from apps.finances.models import Payment, PaymentType

# Сколько записей журнала отдавать в карточке.
# Карточка возвращала всю историю целиком: у долгоживущей записи это сотни
# строк, которые никто не читает целиком. Отдаём последние, а общее число —
# отдельным полем, чтобы счётчик на вкладке оставался честным.
LOG_PAGE_SIZE = 50

from rest_framework import serializers
from .models import Booking, BookingLog, Deal, DealLog
from apps.crm.serializers import ClientListSerializer
# ИСПРАВЛЕНИЕ: Импортируем DiscountListSerializer
from apps.realty.serializers import PropertyListSerializer, DiscountListSerializer
# ИСПРАВЛЕНИЕ: Удаляем импорт PaymentSerializer отсюда

class DealCreateSerializer(serializers.ModelSerializer):
    """
    Сериализатор для создания новой сделки.

    Основной путь — сделка по действующей брони: ``booking`` передан, цена
    берётся из брони, бронь становится её частью. Сделка по свободному
    объекту (продажа без брони) оформляется без ``booking``.
    """

    class Meta:
        model = Deal
        fields = ['client', 'property', 'application', 'booking']

    booking = serializers.PrimaryKeyRelatedField(
        queryset=Booking.objects.all(), required=False, allow_null=True, write_only=True,
        help_text="Действующая бронь, по которой оформляется сделка"
    )

    def validate_booking(self, value):
        """Бронь должна быть доступна пользователю (scope-check)."""
        if value is None:
            return value
        from permissions.backends import get_filtered_queryset

        user = self.context['request'].user
        accessible = get_filtered_queryset(user, Booking.objects.filter(pk=value.pk), 'BOOKING')
        if not accessible.exists():
            raise serializers.ValidationError('Бронь не найдена или недоступна.')
        return value

    def create(self, validated_data):
        # Бронь обрабатывает view: она же блокирует её и объект в транзакции
        validated_data.pop('booking', None)
        return super().create(validated_data)

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

class BookingLogSerializer(serializers.ModelSerializer):
    user = EmployeeNameField()

    class Meta:
        model = BookingLog
        fields = ['id', 'user', 'action', 'created_at']
        read_only_fields = ['created_at']


class BookingCreateSerializer(serializers.ModelSerializer):
    """
    Оформление брони: клиент, объект, срок в днях.

    Даты не принимаются: бронь оформляется на срок, а фактические даты
    записываются в момент активации. Бронь при занятом объекте встаёт
    в конец очереди — без дат и без цены.
    """

    class Meta:
        model = Booking
        fields = ['client', 'property', 'duration_days', 'application',
                  'contract_number', 'contract_date']

    def validate_client(self, value):
        from permissions.backends import get_filtered_queryset
        from apps.crm.models import Client

        user = self.context['request'].user
        if not get_filtered_queryset(user, Client.objects.filter(pk=value.pk), 'CLIENT').exists():
            raise serializers.ValidationError('Клиент не найден или недоступен.')
        return value

    def validate_property(self, value):
        from apps.realty.views import _filter_by_company_scope
        from apps.realty.models import Property

        user = self.context['request'].user
        accessible = _filter_by_company_scope(
            user, Property.objects.filter(pk=value.pk), 'building__project__company', 'PROPERTY'
        )
        if not accessible.exists():
            raise serializers.ValidationError('Объект недвижимости не найден или недоступен.')
        return value

    def validate_application(self, value):
        if value is None:
            return value
        from permissions.backends import get_filtered_queryset
        from apps.crm.models import Application

        user = self.context['request'].user
        if not get_filtered_queryset(user, Application.objects.filter(pk=value.pk), 'APPLICATION').exists():
            raise serializers.ValidationError('Заявка не найдена или недоступна.')
        return value

    def validate_contract_number(self, value):
        return _validate_booking_contract_number(self, value)

    def validate(self, data):
        data = super().validate(data)
        application = data.get('application')
        client = data.get('client')
        if application and client and application.client_id != client.pk:
            raise serializers.ValidationError({'application': 'Заявка оформлена на другого клиента.'})
        return data


class BookingListSerializer(serializers.ModelSerializer):
    client = serializers.StringRelatedField()
    property = serializers.StringRelatedField()
    created_by = EmployeeNameField()
    # Место в очереди и расчётные даты считаются на лету: в базе их нет
    queue_position = serializers.SerializerMethodField()
    projected_start_date = serializers.SerializerMethodField()
    projected_end_date = serializers.SerializerMethodField()
    dates_projected = serializers.SerializerMethodField()
    fee_status = serializers.SerializerMethodField()
    deal_id = serializers.IntegerField(source='deal.id', read_only=True, default=None)

    class Meta:
        model = Booking
        fields = ['id', 'status', 'client', 'property', 'duration_days', 'start_date', 'end_date',
                  'price', 'currency', 'contract_number', 'contract_date', 'created_by',
                  'created_at', 'queue_position', 'projected_start_date', 'projected_end_date',
                  'dates_projected', 'fee_status', 'deal_id']

    def _schedule(self, obj):
        """
        Расчётные даты очереди считаются один раз на объект.

        Список броней — это десятки записей по одному объекту, и считать
        проекцию для каждой заново значило бы повторять одни и те же
        запросы: кеш живёт в контексте сериализатора.
        """
        from .booking import projected_schedule

        cache = self.context.setdefault('_projected', {})
        if obj.property_id not in cache:
            cache[obj.property_id] = projected_schedule(obj.property)
        return cache[obj.property_id].get(obj.id) or {}

    def get_queue_position(self, obj):
        from .booking import queue_position

        return queue_position(obj)

    def get_projected_start_date(self, obj):
        return self._schedule(obj).get('start_date')

    def get_projected_end_date(self, obj):
        return self._schedule(obj).get('end_date')

    def get_dates_projected(self, obj):
        return self._schedule(obj).get('projected', False)

    def get_fee_status(self, obj):
        """Статус взноса: ``None`` — взноса нет (бронь без платы)."""
        payment = next(iter(obj.payments.all()), None)
        if payment is None:
            return None
        return {
            'id': payment.id,
            'amount': str(payment.amount),
            'currency': payment.currency,
            'due_date': payment.due_date,
            'status': payment.status,
            'status_display': payment.get_status_display(),
            'paid': payment.status == 'PAID',
        }


class BookingDetailSerializer(BookingListSerializer):
    """Карточка брони: вложенные клиент и объект, журнал, права."""
    client = ClientListSerializer(read_only=True)
    property = PropertyListSerializer(read_only=True)
    logs = serializers.SerializerMethodField()
    logs_total = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    # Брони, стоящие в очереди за этой, — чтобы менеджер видел всю очередь
    queue = serializers.SerializerMethodField()
    client_missing_passport_fields = serializers.SerializerMethodField()

    class Meta(BookingListSerializer.Meta):
        fields = BookingListSerializer.Meta.fields + [
            'application', 'cancellation_reason', 'signed_scan', 'company',
            'logs', 'logs_total', 'can_edit', 'queue', 'client_missing_passport_fields',
        ]
        read_only_fields = ['status', 'start_date', 'end_date', 'price', 'currency',
                            'created_by', 'created_at', 'company', 'client', 'property']

    def get_logs(self, obj):
        return BookingLogSerializer(obj.logs.all()[:LOG_PAGE_SIZE], many=True).data

    def get_logs_total(self, obj):
        return obj.logs.count()

    def get_can_edit(self, obj):
        request = self.context.get('request')
        if request is None:
            return None
        from permissions.backends import can_user_perform_action

        return can_user_perform_action(request.user, 'EDIT', 'BOOKING', obj=obj)

    def get_client_missing_passport_fields(self, obj):
        # Для брони паспорт не нужен — он понадобится при оформлении сделки,
        # и карточка предупреждает об этом заранее
        return obj.client.missing_passport_fields()

    def get_queue(self, obj):
        from .booking import projected_schedule
        from .occupancy import active_booking, booking_queue

        schedule = projected_schedule(obj.property)
        rows = []
        current = active_booking(obj.property)
        for booking in ([current] if current else []) + list(booking_queue(obj.property)):
            dates = schedule.get(booking.id) or {}
            rows.append({
                'id': booking.id,
                'status': booking.status,
                'client': str(booking.client),
                'duration_days': booking.duration_days,
                'start_date': dates.get('start_date'),
                'end_date': dates.get('end_date'),
                'projected': dates.get('projected', False),
                'is_current': booking.id == obj.id,
            })
        return rows

    def to_representation(self, instance):
        from real_estate_project.media_access import build_media_url

        data = super().to_representation(instance)
        if instance.signed_scan:
            data['signed_scan'] = build_media_url(instance.signed_scan)
        return data

    def validate_contract_number(self, value):
        return _validate_booking_contract_number(self, value)


def _validate_booking_contract_number(serializer, value):
    """
    Номер договора брони уникален внутри компании.

    У броней своя серия номеров, отдельная от номеров договоров сделок:
    проверять их вместе значило бы, что номер брони №1 мешает завести
    договор сделки №1.
    """
    if not value:
        return None
    company_id = getattr(serializer.instance, 'company_id', None)
    if company_id is None:
        request = serializer.context.get('request')
        profile = getattr(getattr(request, 'user', None), 'profile', None)
        company_id = getattr(profile, 'company_id', None)

    query = Booking.objects.filter(contract_number=value, company_id=company_id)
    if serializer.instance:
        query = query.exclude(pk=serializer.instance.pk)
    if query.exists():
        raise serializers.ValidationError('Бронь с таким номером договора уже существует.')
    return value


class DealLogSerializer(serializers.ModelSerializer):
    user = EmployeeNameField()

    class Meta:
        model = DealLog
        fields = ['id', 'user', 'action', 'created_at']
        read_only_fields = ['created_at']

class DealListSerializer(serializers.ModelSerializer):
    client = serializers.StringRelatedField()
    property = serializers.StringRelatedField()
    created_by = EmployeeNameField()

    class Meta:
        model = Deal
        fields = ['id', 'status', 'contract_number', 'client', 'property', 'contract_price', 'currency',
                  'created_by', 'created_at']
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
    created_by = EmployeeNameField()
    # ИСПРАВЛЕНИЕ: Заменяем прямое поле на SerializerMethodField
    payments = serializers.SerializerMethodField()
    logs = serializers.SerializerMethodField()
    # Может ли текущий пользователь изменять и отменять эту сделку. Карточку
    # видят шире, чем могут менять (например, сделки коллег по отделу), и без
    # признака кнопки «Отменить / Расторгнуть», «Применить скидки» отвечали
    # непонятным отказом сервера
    can_edit = serializers.SerializerMethodField()
    logs_total = serializers.SerializerMethodField()
    # Незаполненные паспортные данные клиента: карточка сделки предупреждает
    # заранее, а не отказом при сохранении графика или подписании
    client_missing_passport_fields = serializers.SerializerMethodField()

    # Бронь, из которой выросла сделка: даты, цена и договор брони живут
    # на ней, а не на сделке
    booking_info = serializers.SerializerMethodField()

    def get_booking_info(self, obj):
        from .booking import booking_for_deal

        booking = booking_for_deal(obj)
        if booking is None:
            return None
        return {
            'id': booking.id,
            'status': booking.status,
            'status_display': booking.get_status_display(),
            'start_date': booking.start_date,
            'end_date': booking.end_date,
            'duration_days': booking.duration_days,
            'price': str(booking.price) if booking.price is not None else None,
            'currency': booking.currency,
            'contract_number': booking.contract_number,
            'contract_date': booking.contract_date,
        }

    def get_client_missing_passport_fields(self, obj):
        return obj.client.missing_passport_fields()

    def get_logs(self, obj):
        recent = obj.logs.all()[:LOG_PAGE_SIZE]
        return DealLogSerializer(recent, many=True).data

    def get_logs_total(self, obj):
        return obj.logs.count()

    # Поле только для записи (write-only), чтобы принимать массив ID скидок при обновлении
    applied_discounts_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        write_only=True,
        queryset=Deal.applied_discounts.field.related_model.objects.all(),
        source='applied_discounts'
    )
    payment_plan_name = serializers.CharField(source='payment_plan.name', read_only=True, default=None)
    # Фактические условия оплаты — из графика, а не из названия плана.
    # В карточке стояло «Рассрочка на 18 месяцев», а в графике было два
    # платежа: название плана с договором не сверялось ничем
    payment_terms = serializers.SerializerMethodField()

    def get_payment_terms(self, obj):
        """
        Что реально записано в графике платежей сделки.

        ``plan_months`` — срок выбранного плана, ``scheduled_payments`` —
        сколько платежей в графике на самом деле, ``matches_plan`` — сходятся
        ли они. Карточка показывает фактические условия и предупреждает,
        когда они расходятся с названием плана.
        """
        payments = [p for p in obj.payments.all()
                    if p.status != Payment.PaymentStatus.CANCELLED]
        scheduled = len(payments)
        plan = obj.payment_plan
        plan_kind = plan.plan_kind if plan else ''
        plan_months = plan.plan_months if plan else 0

        expected = None
        if plan_kind == PaymentType.PlanKind.FULL:
            expected = 1
        elif plan_kind == PaymentType.PlanKind.DEFERRED:
            # Взнос и остаток одним платежом
            expected = 2
        elif plan_kind == PaymentType.PlanKind.INSTALLMENT and plan_months:
            # Первоначальный взнос и ежемесячные платежи
            expected = plan_months + 1

        return {
            'plan_kind': plan_kind,
            'plan_months': plan_months,
            'expected_payments': expected,
            'scheduled_payments': scheduled,
            'paid_payments': sum(1 for p in payments if p.status == Payment.PaymentStatus.PAID),
            'first_due_date': min((p.due_date for p in payments), default=None),
            'last_due_date': max((p.due_date for p in payments), default=None),
            # None — плана нет или по нему нельзя посчитать число платежей
            'matches_plan': None if (expected is None or not scheduled) else expected == scheduled,
        }

    def validate_payment_plan(self, value):
        """План — тип платежа с видом плана, своей компании или общий."""
        if value is None:
            return value
        from permissions.reference_scope import scope_reference_queryset
        from apps.finances.models import PaymentType

        if not value.plan_kind:
            raise serializers.ValidationError(f'«{value.name}» — не план оплаты.')
        user = self.context['request'].user
        if not scope_reference_queryset(user, PaymentType.objects.filter(pk=value.pk)).exists():
            raise serializers.ValidationError('План оплаты не найден или недоступен.')
        return value

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

        # Скидка «только для планов» применима лишь при одном из этих планов
        plan = data.get('payment_plan', instance.payment_plan)
        for discount in discounts:
            plans = list(discount.payment_plans.all())
            if plans and plan not in plans:
                names = ', '.join(f'«{p.name}»' for p in plans)
                raise serializers.ValidationError({
                    'applied_discounts_ids': (
                        f'Скидка «{discount.name}» действует только для планов оплаты: {names}. '
                        f'Выберите один из них в поле «План оплаты» или уберите скидку.'
                    )
                })

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

        # Стоимость договора и график должны сойтись, но требовать этого
        # в момент смены цены нельзя: график пересобирается только под уже
        # сохранённую стоимость, и взаимная проверка запирала бы сделку —
        # ни цену поменять, ни график переделать. Поэтому здесь запрещаем
        # менять цену лишь тогда, когда по сделке реально прошли деньги.
        if 'contract_price' in data and instance.pk:
            settled = instance.payments.filter(status__in=(
                Payment.PaymentStatus.PAID,
                Payment.PaymentStatus.TO_BE_RETURNED,
                Payment.PaymentStatus.RETURNED,
            ))
            if settled.exists() and contract_price is not None:
                if Decimal(contract_price) != Decimal(instance.contract_price or 0):
                    raise serializers.ValidationError({
                        'contract_price': (
                            'По сделке уже прошли платежи, поэтому стоимость по договору '
                            'менять нельзя. Отмените оплату или расторгните сделку.'
                        )
                    })

        # Сделка в работе закрывается, как только заполнены обе даты подписания
        # (DealDetailView.perform_update). Договор без паспортных данных клиента
        # не подписать, поэтому закрытие без них не пропускаем
        client_signed = data.get('client_signature_date', instance.client_signature_date)
        company_signed = data.get('company_signature_date', instance.company_signature_date)
        if instance.status == Deal.DealStatus.IN_PROGRESS and client_signed and company_signed:
            passport_error = instance.client.passport_required_error('закрыть сделку')
            if passport_error:
                raise serializers.ValidationError(passport_error)

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
            'id', 'status', 'client', 'property', 'booking_info',
            'initial_price', 'initial_price_per_sqm', 'contract_price', 'currency', 'notes',
            'created_by', 'created_at', 'applied_discounts', 'applied_discounts_ids',
            'payments', 'contract_number', 'contract_date', 'application', 'logs_total',
            'signed_document_scan', 'client_signature_date', 'company_signature_date','logs','cancellation_reason', 'termination_document_scan', 'termination_date',
            'catalog_price', 'catalog_currency', 'catalog_rate', 'company',
            'payment_plan', 'payment_plan_name', 'payment_terms', 'can_edit',
            'client_missing_passport_fields',
        ]
        # Валюта сделки задаётся настройкой компании при брони и дальше не меняется:
        # весь график платежей хранится в ней
        read_only_fields = [
            'id', 'status', 'client', 'property', 'application',
            'initial_price', 'initial_price_per_sqm', 'created_by', 'created_at', 'applied_discounts', 'payments','logs','cancellation_reason', 'termination_document_scan', 'termination_date',
            'currency', 'catalog_price', 'catalog_currency', 'catalog_rate', 'company',
        ]

    def get_can_edit(self, obj):
        request = self.context.get('request')
        if request is None:
            return None
        from permissions.backends import can_user_perform_action
        return can_user_perform_action(request.user, 'EDIT', 'DEAL', obj=obj)

    # ИСПРАВЛЕНИЕ: Добавляем метод для сериализации платежей
    def get_payments(self, obj):
        from apps.finances.serializers import PaymentSerializer

        # В каждой строке графика сериализуются тип, счёт, сотрудники и сама
        # сделка: без связей карточка сделки делала по пять запросов на платёж
        payments = obj.payments.select_related(
            'payment_type', 'beneficiary_account', 'created_by', 'responsible_employee',
            'client', 'deal__client', 'deal__property', 'deal__created_by',
        ).prefetch_related('client__phone_numbers')
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