from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    Client, Application, PreciseSource, ClientLog, RejectionReason,
    ApplicationLog, ClientPhoneNumber, Meeting, MeetingLog, ClientFile,
    ApplicationStatus
)
from apps.realty.serializers import BuildingMiniSerializer


# --- Сериализатор для статусов заявок ---

class ApplicationStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplicationStatus
        fields = ['id', 'code', 'name', 'color', 'order', 'is_active', 'is_final', 'created_at']
        read_only_fields = ['created_at']

    def validate_code(self, value):
        """
        Код уникален в пределах компании.

        Проверяем явно: company в сериализатор не входит, поэтому
        автоматический валидатор уникальности здесь не работает и дубль
        превратился бы в ошибку базы.
        """
        request = self.context.get('request')
        profile = getattr(getattr(request, 'user', None), 'profile', None)
        company_id = getattr(self.instance, 'company_id', None) or getattr(profile, 'company_id', None)

        queryset = ApplicationStatus.objects.filter(code=value, company_id=company_id)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError('Статус с таким кодом уже есть.')
        return value


# --- Сериализаторы для Клиентов ---

class ClientFileSerializer(serializers.ModelSerializer):
    uploaded_by = serializers.StringRelatedField()

    class Meta:
        model = ClientFile
        fields = ['id', 'file', 'comment', 'uploaded_at', 'uploaded_by']

    def to_representation(self, instance):
        from real_estate_project.media_access import build_media_url

        representation = super().to_representation(instance)
        # В файлах клиента лежат сканы документов — ссылка подписывается
        representation['file'] = build_media_url(instance.file)
        return representation


class ClientListSerializer(serializers.ModelSerializer):
    primary_phone_number = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = ['id', 'full_name', 'primary_phone_number', 'email', 'created_at']
        read_only_fields = ['created_at']

    def get_primary_phone_number(self, obj):
        primary_phone = obj.phone_numbers.filter(is_primary=True).first()
        if primary_phone:
            return primary_phone.phone_number
        first_phone = obj.phone_numbers.first()
        return first_phone.phone_number if first_phone else None

class ClientPhoneNumberSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientPhoneNumber
        fields = ['id', 'phone_number', 'is_primary']

class ClientLogSerializer(serializers.ModelSerializer):
    user = serializers.StringRelatedField()
    class Meta:
        model = ClientLog
        fields = ['id', 'user', 'action', 'created_at']
        read_only_fields = ['created_at']

# --- Сериализаторы для Заявок ---
class ApplicationListSerializer(serializers.ModelSerializer):
    client = serializers.StringRelatedField()
    precise_source = serializers.StringRelatedField()
    created_by = serializers.StringRelatedField()
    class Meta:
        model = Application
        fields = ['id', 'status', 'source', 'client', 'precise_source', 'created_by', 'created_at']
        read_only_fields = ['created_at']

class ApplicationLogSerializer(serializers.ModelSerializer):
    user = serializers.StringRelatedField()
    class Meta:
        model = ApplicationLog
        fields = ['id', 'user', 'action', 'created_at']
        read_only_fields = ['created_at']

class RejectionReasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = RejectionReason
        fields = '__all__'
        # Компанию проставляет представление по профилю: иначе запись
        # справочника можно было бы перенести в чужую компанию
        read_only_fields = ['company']

# --- Сериализаторы для Встреч ---

class MeetingLogSerializer(serializers.ModelSerializer):
    user = serializers.StringRelatedField()
    class Meta:
        model = MeetingLog
        fields = ['id', 'user', 'action', 'created_at']
        read_only_fields = ['created_at']

class MeetingSerializer(serializers.ModelSerializer):
    client = ClientListSerializer(read_only=True)
    client_id = serializers.IntegerField(write_only=True)
    application_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    creator = serializers.StringRelatedField(read_only=True)
    executor = serializers.StringRelatedField(read_only=True)
    executor_id = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), source='executor')
    interested_building = BuildingMiniSerializer(read_only=True)
    interested_building_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    is_overdue = serializers.BooleanField(read_only=True)
    logs = MeetingLogSerializer(many=True, read_only=True)

    class Meta:
        model = Meeting
        fields = [
            'id', 'client', 'client_id', 'application_id', 'status', 'planned_date', 'actual_date',
            'creator', 'executor', 'executor_id', 'comment', 'result_comment',
            'interested_building', 'interested_building_id', 'is_auto_created',
            'is_overdue', 'created_at', 'logs', 'is_deleted', 'deleted_at'
        ]
        read_only_fields = [
            'is_auto_created', 'is_overdue', 'created_at', 'logs', 'creator',
            'is_deleted', 'deleted_at',
        ]
        extra_kwargs = {
            'planned_date': {'required': True},
        }

    def validate_executor_id(self, value):
        """Проверяем что исполнитель из доступной компании"""
        request_user = self.context['request'].user
        if not request_user.is_superuser and hasattr(request_user, 'profile') and not request_user.profile.is_system_admin:
            if request_user.profile.company and hasattr(value, 'profile') and value.profile.company != request_user.profile.company:
                raise serializers.ValidationError('Исполнитель не принадлежит вашей компании.')
        return value

    def validate_client_id(self, value):
        """Проверяем scope-доступ к клиенту"""
        from permissions.backends import get_filtered_queryset
        from .models import Client
        user = self.context['request'].user
        if not get_filtered_queryset(user, Client.objects.filter(pk=value), 'CLIENT').exists():
            raise serializers.ValidationError('Клиент не найден или недоступен.')
        return value

    def validate_application_id(self, value):
        """Проверяем scope-доступ к заявке — она не проверялась наравне с клиентом"""
        if value is None:
            return value
        from permissions.backends import get_filtered_queryset
        user = self.context['request'].user
        if not get_filtered_queryset(
            user, Application.objects.filter(pk=value), 'APPLICATION'
        ).exists():
            raise serializers.ValidationError('Заявка не найдена или недоступна.')
        return value

    def validate_interested_building_id(self, value):
        """Проверяем scope-доступ к зданию"""
        if value is None:
            return value
        from apps.realty.views import _filter_by_company_scope
        from apps.realty.models import Building
        user = self.context['request'].user
        if not _filter_by_company_scope(user, Building.objects.filter(pk=value), 'project__company', 'BUILDING').exists():
            raise serializers.ValidationError('Здание не найдено или недоступно.')
        return value

    def validate(self, data):
        """
        Проверяем, что при закрытии встречи (успешном или нет)
        обязательно указан комментарий с результатом.
        """
        status = data.get('status')
        result_comment = data.get('result_comment')

        # Проверяем только при изменении статуса на "закрывающий"
        if status in [Meeting.MeetingStatus.COMPLETED, Meeting.MeetingStatus.CANCELLED]:
            if not result_comment:
                raise serializers.ValidationError({
                    "result_comment": "Необходимо указать результат встречи при ее закрытии."
                })
            # Без фактической даты нельзя понять, когда встреча реально прошла
            actual_date = data.get('actual_date') or getattr(self.instance, 'actual_date', None)
            if status == Meeting.MeetingStatus.COMPLETED and not actual_date:
                raise serializers.ValidationError({
                    "actual_date": "Укажите фактическую дату состоявшейся встречи."
                })
        return data

# --- Детальные сериализаторы ---
class ClientDetailSerializer(serializers.ModelSerializer):
    def validate_email(self, value):
        """
        Email уникален внутри компании.

        Один и тот же человек может быть клиентом нескольких компаний —
        это разные карточки, поэтому глобальной уникальности больше нет,
        а совпадение внутри компании проверяем сами.
        """
        if not value:
            return value

        request = self.context.get('request')
        profile = getattr(getattr(request, 'user', None), 'profile', None)
        company_id = getattr(self.instance, 'company_id', None) or getattr(profile, 'company_id', None)

        queryset = Client.objects.filter(email=value, company_id=company_id)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError('Клиент с таким email уже есть в вашей компании.')
        return value

    def validate_relatives(self, value):
        """
        Родственниками могут быть только клиенты той же компании.

        Один и тот же человек, заведённый в двух компаниях, — это две разные
        карточки, и связывать их между собой нельзя: иначе через связь видно
        клиента соседней компании.
        """
        if not value:
            return value
        request = self.context.get('request')
        instance_company_id = getattr(self.instance, 'company_id', None)
        if instance_company_id is None and request is not None:
            profile = getattr(request.user, 'profile', None)
            instance_company_id = getattr(profile, 'company_id', None)
        if instance_company_id is None:
            return value

        foreign = [c.pk for c in value if c.company_id != instance_company_id]
        if foreign:
            raise serializers.ValidationError(
                f'Клиенты {sorted(foreign)} принадлежат другой компании.'
            )
        return value

    applications = ApplicationListSerializer(many=True, read_only=True)
    logs = ClientLogSerializer(many=True, read_only=True)
    phone_numbers = ClientPhoneNumberSerializer(many=True, required=False)
    meetings = MeetingSerializer(many=True, read_only=True)
    files = ClientFileSerializer(many=True, read_only=True)

    phone_number = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = Client
        fields = [
            'id', 'full_name', 'email', 'date_of_birth', 'gender', 'status',
            'marital_status', 'passport_series', 'passport_number', 'passport_issued_by',
            'passport_issued_date', 'inn', 'pinfl', 'registration_address', 'billing_address',
            'comment', 'relatives', 'created_at', 'updated_at',
            'created_by', 'applications', 'logs', 'phone_numbers',
            'phone_number', 'meetings', 'files'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']

    def create(self, validated_data):
        phone_numbers_data = validated_data.pop('phone_numbers', [])
        initial_phone = validated_data.pop('phone_number', None)
        client = Client.objects.create(**validated_data)
        if initial_phone:
            ClientPhoneNumber.objects.create(client=client, phone_number=initial_phone, is_primary=True)
        elif phone_numbers_data:
            for phone_data in phone_numbers_data:
                ClientPhoneNumber.objects.create(client=client, **phone_data)
        return client

    def update(self, instance, validated_data):
        phone_numbers_data = validated_data.pop('phone_numbers', None)
        instance = super().update(instance, validated_data)

        if phone_numbers_data is not None:
            instance.phone_numbers.all().delete()
            for phone_data in phone_numbers_data:
                ClientPhoneNumber.objects.create(client=instance, **phone_data)
        return instance

class ApplicationDetailSerializer(serializers.ModelSerializer):
    created_by = serializers.StringRelatedField(read_only=True)
    client = ClientDetailSerializer(read_only=True)
    client_id = serializers.IntegerField(write_only=True)
    logs = ApplicationLogSerializer(many=True, read_only=True)
    rejection_reason = RejectionReasonSerializer(read_only=True)
    rejection_reason_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    meetings = MeetingSerializer(many=True, read_only=True)
    # Статус проверяется по настраиваемому справочнику, а не по зашитому
    # списку choices: иначе добавленный в настройках статус никуда не применялся
    status = serializers.CharField(required=False)
    # Оформление статуса берётся из справочника — фронт не хранит цвета сам
    status_info = serializers.SerializerMethodField()

    def _status_queryset(self, company_id=None):
        """
        Статусы, доступные заявке: своей компании и общесистемные.

        Без этого ограничения компания могла поставить заявке статус
        из воронки соседней компании.
        """
        from django.db.models import Q

        if company_id is None:
            company_id = getattr(self.instance, 'company_id', None)
        if company_id is None:
            request = self.context.get('request')
            profile = getattr(getattr(request, 'user', None), 'profile', None)
            company_id = getattr(profile, 'company_id', None)

        queryset = ApplicationStatus.objects.all()
        if company_id is None:
            return queryset.filter(company__isnull=True)
        return queryset.filter(Q(company_id=company_id) | Q(company__isnull=True))

    def get_status_info(self, obj):
        status = self._status_queryset(obj.company_id).filter(code=obj.status).first()
        if status is None:
            return {'code': obj.status, 'name': obj.get_status_display(),
                    'color': '#9e9e9e', 'is_final': False}
        return {'code': status.code, 'name': status.name,
                'color': status.color, 'is_final': status.is_final}

    def validate(self, data):
        data = super().validate(data)
        status_value = data.get('status', getattr(self.instance, 'status', None))
        reason_id = data.get('rejection_reason_id', ...)
        if reason_id is ...:
            reason_id = getattr(self.instance, 'rejection_reason_id', None)

        # Аналитика причин отказов строилась на выборочно заполненном поле:
        # закрывающие статусы теперь требуют указать причину
        rejection_statuses = {
            Application.ApplicationStatusChoices.JUNK,
            Application.ApplicationStatusChoices.REJECTED,
        }
        if status_value in rejection_statuses and not reason_id:
            raise serializers.ValidationError({
                'rejection_reason_id': 'Укажите причину: она нужна для аналитики отказов.'
            })
        return data

    def validate_status(self, value):
        if not value:
            return value
        available = self._status_queryset()
        if available.filter(code=value, is_active=True).exists():
            return value
        # Справочник может быть пуст на старых установках — тогда работает
        # прежний зашитый список
        if not available.filter(is_active=True).exists():
            valid = dict(Application.ApplicationStatusChoices.choices)
            if value in valid:
                return value
        raise serializers.ValidationError(
            f'Статус «{value}» не найден среди активных статусов заявок вашей компании.'
        )

    class Meta:
        model = Application
        fields = [
            'id', 'client', 'client_id', 'status', 'source', 'precise_source',
            'interested_projects', 'interested_property_type',
            'min_area', 'max_area', 'min_floor', 'max_floor',
            'notes', 'created_by', 'created_at', 'updated_at',
            'rejection_reason', 'rejection_reason_id', 'logs', 'meetings',
            'status_info', 'is_deleted', 'deleted_at'
        ]
        # Признак удаления меняется только кнопками удаления и восстановления
        read_only_fields = ['created_at', 'updated_at', 'is_deleted', 'deleted_at']

    def validate_client_id(self, value):
        """Проверяем scope-доступ к клиенту"""
        from permissions.backends import get_filtered_queryset
        from .models import Client
        user = self.context['request'].user
        if not get_filtered_queryset(user, Client.objects.filter(pk=value), 'CLIENT').exists():
            raise serializers.ValidationError('Клиент не найден или недоступен.')
        return value

    def create(self, validated_data):
        validated_data['client_id'] = validated_data.pop('client_id')
        return super().create(validated_data)

# --- Публичные сериализаторы ---
class PublicApplicationSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255, required=False)
    phone_number = serializers.CharField(max_length=20)
    source = serializers.ChoiceField(choices=Application.ApplicationSource.choices)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_phone_number(self, value):
        if not value.replace('+', '').isdigit():
            raise serializers.ValidationError("Номер телефона должен содержать только цифры и знак '+'")
        return value

# --- СЕРИАЛИЗАТОР ДЛЯ ПОЛЬЗОВАТЕЛЕЙ ---
class UserSerializer(serializers.ModelSerializer):
    """ Сериализатор для вывода списка пользователей (менеджеров) """
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name']