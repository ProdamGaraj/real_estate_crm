# real_estate_crm/backend/apps/finances/serializers.py

from rest_framework import serializers
from .models import Payment, PaymentType, BeneficiaryAccount
from apps.crm.serializers import ClientListSerializer

class PaymentTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentType
        fields = '__all__'

class BeneficiaryAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = BeneficiaryAccount
        fields = '__all__'

class PaymentSerializer(serializers.ModelSerializer):
    payment_type = serializers.StringRelatedField(read_only=True)
    beneficiary_account = serializers.StringRelatedField(read_only=True)
    created_by = serializers.StringRelatedField(read_only=True)
    responsible_employee = serializers.StringRelatedField(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    client = ClientListSerializer(read_only=True)
    # ИСПРАВЛЕНИЕ: Заменяем прямое поле на SerializerMethodField
    deal = serializers.SerializerMethodField()

    payment_type_id = serializers.IntegerField(write_only=True)
    beneficiary_account_id = serializers.IntegerField(write_only=True)
    responsible_employee_id = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = Payment
        fields = [
            'id', 'amount', 'currency', 'method', 'due_date', 'payment_date',
            'status', 'status_display', 'created_at', 'payment_type', 'beneficiary_account',
            'created_by', 'responsible_employee', 'payment_type_id',
            'beneficiary_account_id', 'responsible_employee_id', 'client', 'deal'
        ]
        read_only_fields = ['created_at', 'status_display', 'client']

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