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


# --- Сериализаторы для Клиентов ---

class ClientFileSerializer(serializers.ModelSerializer):
    uploaded_by = serializers.StringRelatedField()

    class Meta:
        model = ClientFile
        fields = ['id', 'file', 'comment', 'uploaded_at', 'uploaded_by']


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
            'is_overdue', 'created_at', 'logs'
        ]
        read_only_fields = ['is_auto_created', 'is_overdue', 'created_at', 'logs', 'creator']
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

    def validate_interested_building_id(self, value):
        """Проверяем scope-доступ к зданию"""
        if value is None:
            return value
        from apps.realty.views import _filter_by_company_scope
        from apps.realty.models import Building
        user = self.context['request'].user
        if not _filter_by_company_scope(user, Building.objects.filter(pk=value), 'project__company').exists():
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
        return data

# --- Детальные сериализаторы ---
class ClientDetailSerializer(serializers.ModelSerializer):
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

    class Meta:
        model = Application
        fields = [
            'id', 'client', 'client_id', 'status', 'source', 'precise_source',
            'interested_projects', 'interested_property_type',
            'min_area', 'max_area', 'min_floor', 'max_floor',
            'notes', 'created_by', 'created_at', 'updated_at',
            'rejection_reason', 'rejection_reason_id', 'logs', 'meetings'
        ]
        read_only_fields = ['created_at', 'updated_at']

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