from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q, Count, Case, When, BooleanField, Sum
from .models import Deal
from apps.realty.models import Property, Discount
from .serializers import DealCreateSerializer, DealDetailSerializer, DealListSerializer
from apps.realty.serializers import DiscountListSerializer
from rest_framework import generics, status
from apps.realty.models import Property
from .models import Deal, DealLog
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser
from rest_framework import serializers
from .filters import DealFilter
from apps.finances.models import Payment
import pandas as pd
from django.http import HttpResponse
from permissions.permissions import DealPermission, ReportPermission, DiscountPermission
from permissions.backends import get_filtered_queryset


class DealSummaryView(APIView):
    permission_classes = [IsAuthenticated, ReportPermission]

    def get(self, request, *args, **kwargs):
        group_by = request.query_params.get('group_by', 'created_by')
        export_format = request.query_params.get('format')
        created_at_after = request.query_params.get('created_at_after')
        created_at_before = request.query_params.get('created_at_before')

        queryset = Deal.objects.all().select_related('created_by', 'property__building__project')
        # Фильтруем по разрешениям пользователя
        queryset = get_filtered_queryset(request.user, queryset, 'DEAL')

        if created_at_after:
            queryset = queryset.filter(created_at__date__gte=created_at_after)
        if created_at_before:
            queryset = queryset.filter(created_at__date__lte=created_at_before)

        # Widgets data
        widgets_data = queryset.aggregate(
            booking_count=Count('id', filter=Q(status=Deal.DealStatus.BOOKING)),
            in_progress_count=Count('id', filter=Q(status=Deal.DealStatus.IN_PROGRESS)),
            closed_won_count=Count('id', filter=Q(status=Deal.DealStatus.CLOSED_WON)),
            terminated_count=Count('id', filter=Q(status=Deal.DealStatus.TERMINATED)),
            cancelled_count=Count('id', filter=Q(status=Deal.DealStatus.CANCELLED)),
        )

        if group_by == 'created_by':
            summary = queryset.values(
                'created_by__first_name', 'created_by__last_name', 'created_by__username'
            ).annotate(
                total_deals=Count('id')
            ).order_by('-total_deals')

            data_for_df = []
            for item in summary:
                full_name = f"{item['created_by__first_name']} {item['created_by__last_name']}".strip()
                data_for_df.append({
                    'Manager': full_name or item['created_by__username'] or "System",
                    'Total Deals': item['total_deals'],
                })

        elif group_by == 'project':
            summary = queryset.values('property__building__project__name').annotate(total_deals=Count('id')).order_by(
                '-total_deals')
            data_for_df = [
                {'Project': item['property__building__project__name'] or "N/A", 'Total Deals': item['total_deals']} for
                item in summary]

        elif group_by == 'status':
            summary = queryset.values('status').annotate(total_deals=Count('id')).order_by('-total_deals')
            data_for_df = [{'Status': item['status'], 'Total Deals': item['total_deals']} for item in summary]

        else:
            return Response({"error": "Invalid group_by parameter"}, status=status.HTTP_400_BAD_REQUEST)

        if export_format == 'excel':
            df = pd.DataFrame(data_for_df)
            response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            response['Content-Disposition'] = f'attachment; filename=deal_summary_{group_by}.xlsx'
            df.to_excel(response, index=False)
            return response

        response_data = {
            'summary': data_for_df,
            'widgets': widgets_data
        }

        return Response(response_data)


class DealListView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, DealPermission]
    filterset_class = DealFilter

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return DealCreateSerializer
        return DealListSerializer

    def get_queryset(self):
        # Аннотируем queryset для специальной сортировки
        queryset = Deal.objects.annotate(
            has_payments=Count('payments'),
            is_terminated_with_payments=Case(
                When(status=Deal.DealStatus.TERMINATED, has_payments__gt=0, then=True),
                default=False,
                output_field=BooleanField()
            )
        ).select_related('client', 'property', 'created_by').order_by('-is_terminated_with_payments', '-created_at')
        return get_filtered_queryset(self.request.user, queryset, 'DEAL')

    def create(self, request, *args, **kwargs):
        serializer = DealCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        property_instance = serializer.validated_data['property']
        active_statuses = [Deal.DealStatus.BOOKING, Deal.DealStatus.IN_PROGRESS]
        if Deal.objects.filter(property=property_instance, status__in=active_statuses).exists():
            return Response(
                {"error": "Этот объект уже находится в другой активной сделке."},
                status=status.HTTP_400_BAD_REQUEST
            )

        self.perform_create(serializer)
        response_serializer = DealDetailSerializer(serializer.instance)
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        property_instance = serializer.validated_data['property']
        deal = serializer.save(
            created_by=self.request.user,
            initial_price=property_instance.price,
            initial_price_per_sqm=property_instance.price_per_sqm
        )
        property_instance.status = Property.PropertyStatus.BOOKING
        property_instance.save()
        DealLog.objects.create(
            deal=deal,
            user=self.request.user,
            action=f"Сделка создана (Бронь) для клиента '{deal.client}' по объекту '{deal.property}'."
        )


class DealCancelOrTerminateView(APIView):
    """
    View для отмены или расторжения сделки.
    """
    permission_classes = [IsAuthenticated, DealPermission]
    parser_classes = [MultiPartParser]  # Для загрузки файлов

    def post(self, request, deal_pk, *args, **kwargs):
        try:
            deal = Deal.objects.select_related('property').prefetch_related('payments').get(pk=deal_pk)
        except Deal.DoesNotExist:
            return Response({"error": "Сделка не найдена."}, status=status.HTTP_404_NOT_FOUND)

        # Проверка, что сделка еще не в финальном статусе (отменена или расторгнута)
        # CLOSED_WON можно расторгнуть, поэтому не включаем в этот список
        if deal.status in [Deal.DealStatus.CANCELLED, Deal.DealStatus.TERMINATED]:
            return Response({"error": "Сделка уже отменена или расторгнута."}, status=status.HTTP_400_BAD_REQUEST)

        # Определяем, есть ли финансовые операции или подпись
        has_paid_payments = deal.payments.filter(payment_date__isnull=False).exists()
        is_signed = bool(deal.client_signature_date)
        is_closed_won = deal.status == Deal.DealStatus.CLOSED_WON

        action_log = ""

        if is_closed_won or has_paid_payments or is_signed:
            # --- ЛОГИКА РАСТОРЖЕНИЯ ---
            document = request.data.get('termination_document_scan')
            date = request.data.get('termination_date')
            if not document or not date:
                return Response({"error": "Для расторжения необходимо загрузить документ и указать дату."},
                                status=status.HTTP_400_BAD_REQUEST)

            deal.status = Deal.DealStatus.TERMINATED
            deal.termination_document_scan = document
            deal.termination_date = date
            action_log = f"Сделка расторгнута. Дата: {date}."

            # --- ИЗМЕНЕНИЕ ЗДЕСЬ ---
            # Меняем статус оплаченных платежей на "К возврату"
            deal.payments.filter(status=Payment.PaymentStatus.PAID).update(status=Payment.PaymentStatus.TO_BE_RETURNED)


        else:
            # --- ЛОГИКА ОТМЕНЫ ---
            reason = request.data.get('cancellation_reason')
            if not reason:
                return Response({"error": "Для отмены необходимо указать причину."}, status=status.HTTP_400_BAD_REQUEST)
            deal.status = Deal.DealStatus.CANCELLED
            deal.cancellation_reason = reason
            action_log = f"Сделка отменена. Причина: {reason}."

        # Обновляем статус объекта недвижимости
        property_obj = deal.property
        property_obj.status = Property.PropertyStatus.SELECTION
        property_obj.save()

        deal.save()

        # Логируем действие
        DealLog.objects.create(deal=deal, user=request.user, action=action_log)

        return Response(DealDetailSerializer(deal).data, status=status.HTTP_200_OK)


class DealDetailView(generics.RetrieveUpdateAPIView):
    queryset = Deal.objects.select_related('client', 'property', 'created_by').prefetch_related('applied_discounts',
                                                                                                'logs')
    serializer_class = DealDetailSerializer
    permission_classes = [IsAuthenticated, DealPermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        return get_filtered_queryset(self.request.user, queryset, 'DEAL')

    def perform_update(self, serializer):
        old_instance = self.get_object()
        old_discounts = set(old_instance.applied_discounts.values_list('name', flat=True))

        instance = serializer.save()
        new_discounts = set(instance.applied_discounts.values_list('name', flat=True))

        changes = []
        fields_to_check = {
            'contract_price': 'Стоимость по договору',
            'notes': 'Примечание',
            'contract_number': 'Номер договора',
            'contract_date': 'Дата договора',
            'client_signature_date': 'Дата подписания клиентом',
            'company_signature_date': 'Дата подписания компанией',
        }

        for field, name in fields_to_check.items():
            old_value = getattr(old_instance, field)
            new_value = getattr(instance, field)
            if old_value != new_value:
                changes.append(f"Поле '{name}' изменено с '{old_value or 'пусто'}' на '{new_value or 'пусто'}'")

        if old_discounts != new_discounts:
            changes.append(
                f"Скидки изменены с '[{', '.join(old_discounts) or 'пусто'}]' на '[{', '.join(new_discounts) or 'пусто'}]'")

        if old_instance.signed_document_scan != instance.signed_document_scan and instance.signed_document_scan:
            changes.append("Загружен скан подписанного документа.")

        if changes:
            action_text = "Данные сделки обновлены. " + "; ".join(changes)
            DealLog.objects.create(
                deal=instance,
                user=self.request.user,
                action=action_text
            )

        if instance.status == Deal.DealStatus.IN_PROGRESS and instance.client_signature_date and instance.company_signature_date:
            instance.status = Deal.DealStatus.CLOSED_WON
            instance.property.status = Property.PropertyStatus.SOLD
            instance.save()
            instance.property.save()
            DealLog.objects.create(
                deal=instance,
                user=self.request.user,
                action="Статус сделки изменен на 'Успешно закрыта'."
            )


class AvailableDiscountsView(generics.ListAPIView):
    """
    Возвращает список скидок, доступных для объекта в сделке.
    """
    serializer_class = DiscountListSerializer
    permission_classes = [IsAuthenticated, DiscountPermission]

    def get_queryset(self):
        deal_id = self.kwargs['deal_pk']
        try:
            deal = Deal.objects.select_related('property__building').get(pk=deal_id)
            property_obj = deal.property
            building_obj = property_obj.building

            # --- ИСПРАВЛЕННАЯ ЛОГИКА ФИЛЬТРАЦИИ ---
            return Discount.objects.filter(
                # Условие 1: Скидка привязана к конкретному дому ИЛИ
                Q(buildings=building_obj) |
                # Условие 2: Скидка привязана к типу недвижимости нашего объекта
                Q(property_type=property_obj.property_type) |
                # Условие 3: Скидка общая для всех (не привязана ни к дому, ни к типу)
                Q(buildings__isnull=True, property_type__isnull=True),
                is_active=True
            ).distinct()
            # -----------------------------------------

        except Deal.DoesNotExist:
            return Discount.objects.none()