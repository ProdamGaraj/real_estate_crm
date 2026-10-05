"""
Условия рассрочки компании: срок, скидка за срок и минимальный взнос.

Читать условия может любой сотрудник компании — по ним считается калькулятор
рассрочки в карточке объекта и в сделке. Менять — по правам на ресурс
«Скидки»: скидка за срок оплаты — та же скидка, и ведёт её тот же человек.
Системный администратор работает с любой компанией, передавая её в ``company``.
"""

from decimal import Decimal

from django.db import IntegrityError, transaction
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from permissions.backends import can_user_perform_action
from permissions.models import Company
from permissions.reference_scope import is_admin

from .currency import user_company
from .models import InstallmentPlan

MAX_MONTHS = 120


class InstallmentPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstallmentPlan
        fields = ['id', 'months', 'discount_percent', 'down_payment_percent', 'is_active']

    def validate_months(self, value):
        if value > MAX_MONTHS:
            raise serializers.ValidationError(f'Срок рассрочки — не больше {MAX_MONTHS} месяцев.')
        return value

    def validate_discount_percent(self, value):
        if not Decimal(0) <= value < Decimal(100):
            raise serializers.ValidationError('Скидка — от 0 до 100 %, не включая 100.')
        return value

    def validate_down_payment_percent(self, value):
        if not Decimal(0) <= value <= Decimal(100):
            raise serializers.ValidationError('Первоначальный взнос — от 0 до 100 %.')
        return value

    def validate(self, data):
        months = data.get('months', getattr(self.instance, 'months', None))
        down = data.get('down_payment_percent', getattr(self.instance, 'down_payment_percent', Decimal(0)))
        # Взнос 100 % при рассрочке оставил бы на месяцы нулевые платежи
        if months and down >= Decimal(100):
            raise serializers.ValidationError(
                {'down_payment_percent': 'При рассрочке первоначальный взнос должен быть меньше 100 %.'})
        return data


def _target_company(request):
    """Компания запроса: своя, а для системного администратора — указанная."""
    company_id = request.query_params.get('company')
    if company_id and is_admin(request.user):
        return Company.objects.filter(pk=company_id).first()
    return user_company(request.user)


def _allowed(request, action):
    return is_admin(request.user) or can_user_perform_action(request.user, action, 'DISCOUNT')


def _duplicate_error():
    return Response({'months': ['Условие на такой срок уже есть — измените его.']},
                    status=status.HTTP_400_BAD_REQUEST)


class InstallmentPlanListView(APIView):
    """GET — условия компании (с ``all=1`` — и отключённые); POST — новое условие."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        company = _target_company(request)
        queryset = InstallmentPlan.objects.filter(company=company) if company else InstallmentPlan.objects.none()
        if not request.query_params.get('all'):
            queryset = queryset.filter(is_active=True)
        return Response(InstallmentPlanSerializer(queryset.order_by('months'), many=True).data)

    def post(self, request):
        if not _allowed(request, 'ADD'):
            return Response({'error': 'Нет права добавлять условия рассрочки.'}, status=status.HTTP_403_FORBIDDEN)
        company = _target_company(request)
        if company is None:
            return Response({'error': 'Не указана компания.'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = InstallmentPlanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            # Точка сохранения: повтор срока не должен ломать транзакцию запроса
            with transaction.atomic():
                plan = serializer.save(company=company)
        except IntegrityError:
            return _duplicate_error()
        return Response(InstallmentPlanSerializer(plan).data, status=status.HTTP_201_CREATED)


class InstallmentPlanDetailView(APIView):
    """PATCH — изменить условие, DELETE — удалить. Только условия своей компании."""
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        plan = InstallmentPlan.objects.filter(pk=pk).first()
        if plan is None:
            return None
        if not is_admin(request.user) and plan.company_id != getattr(user_company(request.user), 'id', None):
            return None
        return plan

    def patch(self, request, pk):
        if not _allowed(request, 'EDIT'):
            return Response({'error': 'Нет права изменять условия рассрочки.'}, status=status.HTTP_403_FORBIDDEN)
        plan = self._get(request, pk)
        if plan is None:
            return Response({'error': 'Условие не найдено.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = InstallmentPlanSerializer(plan, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError:
            return _duplicate_error()
        return Response(serializer.data)

    def delete(self, request, pk):
        if not _allowed(request, 'DELETE'):
            return Response({'error': 'Нет права удалять условия рассрочки.'}, status=status.HTTP_403_FORBIDDEN)
        plan = self._get(request, pk)
        if plan is None:
            return Response({'error': 'Условие не найдено.'}, status=status.HTTP_404_NOT_FOUND)
        plan.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
