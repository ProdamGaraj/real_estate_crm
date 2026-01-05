# real_estate_crm/backend/apps/finances/views.py

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from decimal import Decimal
from .models import PaymentLog
from .models import Payment, PaymentType, BeneficiaryAccount
from apps.deals.models import Deal, DealLog
from apps.realty.models import Property
from .serializers import PaymentSerializer, PaymentTypeSerializer, BeneficiaryAccountSerializer, PaymentDetailSerializer
from datetime import date
from django.utils import timezone
from django.shortcuts import get_object_or_404
from .filters import PaymentFilter
import pandas as pd
from django.http import HttpResponse
from django.db.models import Sum, Count, Q
from permissions.permissions import PaymentPermission, PaymentTypePermission, BeneficiaryAccountPermission, ReportPermission
from permissions.backends import get_filtered_queryset


class FinanceSummaryView(APIView):
    permission_classes = [IsAuthenticated, ReportPermission]

    def get(self, request, *args, **kwargs):
        group_by = request.query_params.get('group_by', 'status')
        export_format = request.query_params.get('format')

        # Date filters
        due_date_after = request.query_params.get('due_date_after')
        due_date_before = request.query_params.get('due_date_before')
        payment_date_after = request.query_params.get('payment_date_after')
        payment_date_before = request.query_params.get('payment_date_before')

        queryset = Payment.objects.all().select_related(
            'deal__property__building__project', 'responsible_employee'
        )
        # Фильтруем по разрешениям пользователя
        queryset = get_filtered_queryset(request.user, queryset, 'PAYMENT')

        if due_date_after:
            queryset = queryset.filter(due_date__gte=due_date_after)
        if due_date_before:
            queryset = queryset.filter(due_date__lte=due_date_before)
        if payment_date_after:
            queryset = queryset.filter(payment_date__gte=payment_date_after)
        if payment_date_before:
            queryset = queryset.filter(payment_date__lte=payment_date_before)

        # Widgets data
        widgets_data = queryset.aggregate(
            overdue_sum=Sum('amount', filter=Q(status=Payment.PaymentStatus.OVERDUE)),
            paid_sum=Sum('amount', filter=Q(status=Payment.PaymentStatus.PAID))
        )

        if group_by == 'status':
            summary = queryset.values('status').annotate(total_amount=Sum('amount')).order_by('-total_amount')
            data_for_df = [{'Status': item['status'], 'Total Amount': item['total_amount']} for item in summary]

        elif group_by == 'project':
            summary = queryset.values('deal__property__building__project__name').annotate(
                total_amount=Sum('amount')).order_by('-total_amount')
            data_for_df = [{'Project': item['deal__property__building__project__name'] or "N/A",
                            'Total Amount': item['total_amount']} for item in summary]

        elif group_by == 'manager':
            summary = queryset.values('responsible_employee__first_name', 'responsible_employee__last_name',
                                      'responsible_employee__username').annotate(total_amount=Sum('amount')).order_by(
                '-total_amount')
            data_for_df = []
            for item in summary:
                full_name = f"{item['responsible_employee__first_name']} {item['responsible_employee__last_name']}".strip()
                data_for_df.append({
                    'Manager': full_name or item['responsible_employee__username'] or "N/A",
                    'Total Amount': item['total_amount'],
                })

        else:
            return Response({"error": "Invalid group_by parameter"}, status=status.HTTP_400_BAD_REQUEST)

        if export_format == 'excel':
            df = pd.DataFrame(data_for_df)
            response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            response['Content-Disposition'] = f'attachment; filename=finance_summary_{group_by}.xlsx'
            df.to_excel(response, index=False)
            return response

        response_data = {
            'summary': data_for_df,
            'widgets': widgets_data
        }

        return Response(response_data)


class PaymentListView(generics.ListAPIView):
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated, PaymentPermission]
    filterset_class = PaymentFilter

    def get_queryset(self):
        # Автоматически обновляем статусы просроченных платежей перед отдачей
        today = timezone.now().date()
        Payment.objects.filter(
            due_date__lt=today,
            status=Payment.PaymentStatus.PENDING
        ).update(status=Payment.PaymentStatus.OVERDUE)

        queryset = Payment.objects.select_related('client', 'deal', 'payment_type').all()
        # Фильтруем по разрешениям пользователя
        return get_filtered_queryset(self.request.user, queryset, 'PAYMENT')


class PaymentMarkAsReturnedView(APIView):
    permission_classes = [IsAuthenticated, PaymentPermission]

    def post(self, request, pk, *args, **kwargs):
        payment = get_object_or_404(Payment, pk=pk)
        if payment.status == Payment.PaymentStatus.TO_BE_RETURNED:
            payment.status = Payment.PaymentStatus.RETURNED
            payment.save()
            PaymentLog.objects.create(
                payment=payment,
                user=request.user,
                action="Платеж отмечен как возвращенный."
            )
            return Response(PaymentSerializer(payment).data, status=status.HTTP_200_OK)
        return Response(
            {"error": "Платеж не может быть отмечен как возвращенный."},
            status=status.HTTP_400_BAD_REQUEST
        )


class PaymentTypeListView(generics.ListCreateAPIView):
    queryset = PaymentType.objects.all()
    serializer_class = PaymentTypeSerializer
    permission_classes = [IsAuthenticated, PaymentTypePermission]


class BeneficiaryAccountListView(generics.ListCreateAPIView):
    queryset = BeneficiaryAccount.objects.all()
    serializer_class = BeneficiaryAccountSerializer
    permission_classes = [IsAuthenticated, BeneficiaryAccountPermission]


class DealPaymentScheduleCreateView(APIView):
    """
    Создает график платежей для сделки.
    Принимает список объектов платежей.
    """
    permission_classes = [IsAuthenticated, PaymentPermission]

    def post(self, request, deal_pk, *args, **kwargs):
        try:
            deal = Deal.objects.get(pk=deal_pk)
        except Deal.DoesNotExist:
            return Response({"error": "Сделка не найдена."}, status=status.HTTP_404_NOT_FOUND)

        if not deal.contract_price:
            return Response({"error": "Для создания графика необходимо указать 'Стоимость по договору' в сделке."},
                            status=status.HTTP_400_BAD_REQUEST)

        payments_data = request.data
        if not isinstance(payments_data, list):
            return Response({"error": "Ожидается список платежей."}, status=status.HTTP_400_BAD_REQUEST)

        total_amount = sum(Decimal(p.get('amount', 0)) for p in payments_data)

        if total_amount != deal.contract_price:
            return Response({
                "error": f"Сумма платежей ({total_amount}) не совпадает со стоимостью по договору ({deal.contract_price})."
            }, status=status.HTTP_400_BAD_REQUEST)

        # Удаляем старый график, если он был
        deal.payments.all().delete()

        created_payments = []
        for payment_data in payments_data:
            serializer = PaymentSerializer(data=payment_data)
            if serializer.is_valid(raise_exception=True):
                # Сохраняем платеж, привязывая его к сделке, клиенту и текущему пользователю
                payment = serializer.save(
                    deal=deal,
                    client=deal.client,
                    created_by=request.user,
                    status=Payment.PaymentStatus.PENDING
                )
                created_payments.append(PaymentSerializer(payment).data)

        if deal.status == Deal.DealStatus.BOOKING:
            deal.status = Deal.DealStatus.IN_PROGRESS
            deal.property.status = Property.PropertyStatus.IN_DEAL
            deal.save()
            deal.property.save()
            DealLog.objects.create(
                deal=deal,
                user=request.user,
                action=f"График платежей создан на сумму {total_amount}. Статус сделки изменен на 'В работе'."
            )
        else:  # Если график просто обновляется
            DealLog.objects.create(
                deal=deal,
                user=self.request.user,
                action=f"График платежей обновлен. Новая общая сумма: {total_amount}."
            )

        return Response(created_payments, status=status.HTTP_201_CREATED)


class PaymentTypeDetailView(generics.DestroyAPIView):
    queryset = PaymentType.objects.all()
    serializer_class = PaymentTypeSerializer
    permission_classes = [IsAuthenticated, PaymentTypePermission]


class BeneficiaryAccountDetailView(generics.DestroyAPIView):
    queryset = BeneficiaryAccount.objects.all()
    serializer_class = BeneficiaryAccountSerializer
    permission_classes = [IsAuthenticated, BeneficiaryAccountPermission]


class PaymentDetailView(generics.RetrieveUpdateAPIView):
    """
    View для обновления данных по конкретному платежу.
    Используется для проставления/отмены даты оплаты.
    """
    queryset = Payment.objects.all()
    permission_classes = [IsAuthenticated, PaymentPermission]

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return PaymentDetailSerializer
        return PaymentSerializer

    def perform_update(self, serializer):
        instance_before_update = self.get_object()
        new_payment_date_str = serializer.validated_data.get('payment_date')
        log_action = None

        # Проверяем, было ли поле payment_date в запросе
        if 'payment_date' in serializer.validated_data:
            # Случай: ПЛАТЕЖ ОТМЕЧЕН КАК ОПЛАЧЕННЫЙ
            if new_payment_date_str and not instance_before_update.payment_date:
                serializer.instance.status = Payment.PaymentStatus.PAID
                log_action = f"Платеж отмечен как оплаченный. Дата оплаты: {new_payment_date_str}."

            # Случай: ОПЛАТА ОТМЕНЕНА
            elif new_payment_date_str is None and instance_before_update.payment_date:
                new_status = Payment.PaymentStatus.OVERDUE if instance_before_update.due_date < timezone.now().date() else Payment.PaymentStatus.PENDING
                serializer.instance.status = new_status
                log_action = f"Оплата отменена. Предыдущая дата: {instance_before_update.payment_date}."

        instance = serializer.save()

        if log_action:
            PaymentLog.objects.create(
                payment=instance,
                user=self.request.user,
                action=log_action
            )