# real_estate_crm/backend/apps/finances/serializers.py

from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Payment, PaymentType, BeneficiaryAccount
from apps.crm.serializers import ClientListSerializer

class PaymentTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentType
        fields = '__all__'
        # Компанию проставляет представление по профилю пользователя
        read_only_fields = ['company']

class BeneficiaryAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = BeneficiaryAccount
        fields = '__all__'
        read_only_fields = ['company', 'created_by']

class PaymentSerializer(serializers.ModelSerializer):
    payment_type = serializers.StringRelatedField(read_only=True)
    beneficiary_account = serializers.StringRelatedField(read_only=True)
    created_by = serializers.StringRelatedField(read_only=True)
    responsible_employee = serializers.StringRelatedField(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    # Клиент восстанавливал справочники поиском по названию с запасным нулём,
    # поэтому удаление типа платежа ломало правку графика
    payment_type_ref = serializers.PrimaryKeyRelatedField(source='payment_type', read_only=True)
    beneficiary_account_ref = serializers.PrimaryKeyRelatedField(
        source='beneficiary_account', read_only=True
    )
    client = ClientListSerializer(read_only=True)
    # ИСПРАВЛЕНИЕ: Заменяем прямое поле на SerializerMethodField
    deal = serializers.SerializerMethodField()

    # Раньше это были сырые IntegerField: существование записи не проверялось,
    # принадлежность компании — тем более, а несуществующий id давал 500
    payment_type_id = serializers.PrimaryKeyRelatedField(
        queryset=PaymentType.objects.all(), source='payment_type', write_only=True
    )
    beneficiary_account_id = serializers.PrimaryKeyRelatedField(
        queryset=BeneficiaryAccount.objects.all(), source='beneficiary_account', write_only=True
    )
    responsible_employee_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='responsible_employee',
        write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = Payment
        fields = [
            'id', 'amount', 'currency', 'method', 'due_date', 'payment_date',
            'status', 'status_display', 'created_at', 'payment_type', 'beneficiary_account',
            'created_by', 'responsible_employee', 'payment_type_id',
            'beneficiary_account_id', 'responsible_employee_id', 'client', 'deal',
            'payment_type_ref', 'beneficiary_account_ref'
        ]
        read_only_fields = ['created_at', 'status_display', 'client', 'status']

    def validate_payment_type_id(self, value):
        """Тип платежа — своей компании или общесистемный."""
        request = self.context.get('request')
        if request is None or value is None:
            return value
        from permissions.reference_scope import is_admin

        user = request.user
        if is_admin(user):
            return value
        profile = getattr(user, 'profile', None)
        if value.company_id is not None and (
            profile is None or value.company_id != profile.company_id
        ):
            raise serializers.ValidationError('Тип платежа недоступен.')
        return value

    def validate_beneficiary_account_id(self, value):
        """Счёт получателя должен принадлежать компании пользователя."""
        request = self.context.get('request')
        if request is None or value is None:
            return value
        user = request.user
        if user.is_superuser:
            return value
        profile = getattr(user, 'profile', None)
        if profile is None or profile.is_system_admin:
            return value
        if value.company_id and profile.company_id and value.company_id != profile.company_id:
            raise serializers.ValidationError('Счёт получателя недоступен.')
        return value

    def validate(self, data):
        data = super().validate(data)
        instance = self.instance
        if instance is None:
            return data

        # По проведённому платежу деньги уже прошли: менять сумму, срок и
        # валюту нельзя, иначе график расходится с договором в обход проверок
        locked_statuses = (
            Payment.PaymentStatus.PAID,
            Payment.PaymentStatus.TO_BE_RETURNED,
            Payment.PaymentStatus.RETURNED,
        )
        if instance.status in locked_statuses:
            protected = {'amount': 'сумму', 'due_date': 'срок оплаты', 'currency': 'валюту'}
            changed = [
                label for field, label in protected.items()
                if field in data and data[field] != getattr(instance, field)
            ]
            if changed:
                raise serializers.ValidationError(
                    f'Нельзя изменить {", ".join(changed)} платежа со статусом '
                    f'«{instance.get_status_display()}». Сначала отмените оплату.'
                )
        return data

    # ИСПРАВЛЕНИЕ: Добавляем метод для сериализации сделки
    def get_deal(self, obj):
        from apps.deals.serializers import DealListSerializer
        if obj.deal:
            return DealListSerializer(obj.deal).data
        return None


class PaymentDetailSerializer(PaymentSerializer):
    """
    Расширенный сериализатор для детального просмотра платежа.
    """
    class Meta(PaymentSerializer.Meta):
        pass