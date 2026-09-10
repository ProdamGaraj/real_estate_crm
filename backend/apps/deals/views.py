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
from django.db import transaction
from django.utils import timezone
from apps.realty.views import _filter_by_company_scope
from permissions.permissions import DealPermission, ReportPermission, DiscountPermission
from permissions.backends import get_filtered_queryset, can_user_perform_action


class PropertyUnavailable(Exception):
    """Объект нельзя взять в новую сделку: бронь отклоняется, транзакция откатывается."""


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

    # Статусы сделки, при которых объект уже занят. CLOSED_WON обязателен:
    # без него проданный объект можно было продать повторно.
    BLOCKING_DEAL_STATUSES = (
        Deal.DealStatus.BOOKING,
        Deal.DealStatus.IN_PROGRESS,
        Deal.DealStatus.CLOSED_WON,
    )
    # Статусы объекта, из которых допустимо начинать новую сделку
    AVAILABLE_PROPERTY_STATUSES = (
        Property.PropertyStatus.SELECTION,
        Property.PropertyStatus.RESERVE,
    )

    def create(self, request, *args, **kwargs):
        serializer = DealCreateSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                # Блокируем объект до конца транзакции: без этого два менеджера
                # проходят проверку одновременно и создают две брони на одну квартиру
                property_instance = Property.objects.select_for_update().get(
                    pk=serializer.validated_data['property'].pk
                )

                if Deal.objects.filter(
                    property=property_instance,
                    status__in=self.BLOCKING_DEAL_STATUSES,
                ).exists():
                    raise PropertyUnavailable("Этот объект уже находится в другой активной сделке.")

                if property_instance.status not in self.AVAILABLE_PROPERTY_STATUSES:
                    raise PropertyUnavailable(
                        f"Объект недоступен для брони: текущий статус — "
                        f"«{property_instance.get_status_display()}»."
                    )

                self.perform_create(serializer, property_instance)
        except PropertyUnavailable as error:
            return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        response_serializer = DealDetailSerializer(serializer.instance)
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer, property_instance=None):
        if property_instance is None:
            property_instance = serializer.validated_data['property']
        # Определяем компанию из профиля пользователя
        company = None
        if hasattr(self.request.user, 'profile') and self.request.user.profile.company:
            company = self.request.user.profile.company

        # У объекта с нулевой площадью цена за м² не считается, а поле обязательное
        price_per_sqm = property_instance.price_per_sqm
        if price_per_sqm is None:
            raise PropertyUnavailable(
                "У объекта не заполнены площадь или стоимость — "
                "невозможно зафиксировать цену сделки."
            )

        deal = serializer.save(
            created_by=self.request.user,
            initial_price=property_instance.price,
            initial_price_per_sqm=price_per_sqm,
            company=company
        )
        property_instance.status = Property.PropertyStatus.BOOKING
        property_instance.save(update_fields=['status', 'updated_at'])
        DealLog.objects.create(
            deal=deal,
            user=self.request.user,
            action=f"Сделка создана (Бронь) для клиента '{deal.client}' по объекту '{deal.property}'."
        )


class DealCancelOrTerminatePermission(DealPermission):
    """POST на отмену/расторжение = EDIT, не ADD"""
    def _get_action_from_method(self, method):
        if method == 'POST':
            return 'EDIT'
        return super()._get_action_from_method(method)


class DealCancelOrTerminateView(APIView):
    """
    View для отмены или расторжения сделки.
    """
    permission_classes = [IsAuthenticated, DealCancelOrTerminatePermission]
    parser_classes = [MultiPartParser]  # Для загрузки файлов

    def post(self, request, deal_pk, *args, **kwargs):
        try:
            deal = Deal.objects.select_related('property').prefetch_related('payments').get(pk=deal_pk)
        except Deal.DoesNotExist:
            return Response({"error": "Сделка не найдена."}, status=status.HTTP_404_NOT_FOUND)

        # Проверяем что пользователь имеет доступ к этой сделке (scope-фильтрация)
        if not can_user_perform_action(request.user, 'EDIT', 'DEAL', obj=deal):
            return Response({"error": "У вас нет доступа к этой сделке."}, status=status.HTTP_403_FORBIDDEN)

        # Проверка, что сделка еще не в финальном статусе (отменена или расторгнута)
        # CLOSED_WON можно расторгнуть, поэтому не включаем в этот список
        if deal.status in [Deal.DealStatus.CANCELLED, Deal.DealStatus.TERMINATED]:
            return Response({"error": "Сделка уже отменена или расторгнута."}, status=status.HTTP_400_BAD_REQUEST)

        # Определяем, есть ли финансовые операции или подпись
        has_paid_payments = deal.payments.filter(payment_date__isnull=False).exists()
        is_signed = bool(deal.client_signature_date)
        is_closed_won = deal.status == Deal.DealStatus.CLOSED_WON

        action_log = ""
        pending_refund = False

        # Вся смена статусов идёт одной транзакцией: иначе сбой на середине
        # оставляет объект свободным при живой сделке
        with transaction.atomic():
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

                # Меняем статус оплаченных платежей на "К возврату"
                refunds = deal.payments.filter(status=Payment.PaymentStatus.PAID).update(
                    status=Payment.PaymentStatus.TO_BE_RETURNED
                )
                # Пока деньги клиенту не вернули, объект остаётся занятым:
                # иначе его перепродают при незакрытых обязательствах
                pending_refund = refunds > 0
                if pending_refund:
                    action_log += f" Платежей к возврату: {refunds}."
            else:
                # --- ЛОГИКА ОТМЕНЫ ---
                reason = request.data.get('cancellation_reason')
                if not reason:
                    return Response({"error": "Для отмены необходимо указать причину."},
                                    status=status.HTTP_400_BAD_REQUEST)
                deal.status = Deal.DealStatus.CANCELLED
                deal.cancellation_reason = reason
                action_log = f"Сделка отменена. Причина: {reason}."

            # Обновляем статус объекта недвижимости
            if pending_refund:
                action_log += " Объект освободится после возврата всех платежей."
            else:
                property_obj = deal.property
                property_obj.status = Property.PropertyStatus.SELECTION
                property_obj.save(update_fields=['status', 'updated_at'])

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
            # Смена статуса сделки и объекта — одной транзакцией
            with transaction.atomic():
                instance.status = Deal.DealStatus.CLOSED_WON
                # Фиксируем момент закрытия: отчёты считают выручку по нему,
                # а не по времени последнего редактирования записи
                instance.closed_at = timezone.now()
                instance.property.status = Property.PropertyStatus.SOLD
                instance.save(update_fields=['status', 'closed_at', 'updated_at'])
                instance.property.save(update_fields=['status', 'updated_at'])
                DealLog.objects.create(
                    deal=instance,
                    user=self.request.user,
                    action="Статус сделки изменен на 'Успешно закрыта'."
                )
                self._close_related_application(instance)

    def _close_related_application(self, deal):
        """
        Закрывает заявку, из которой выросла сделка.

        Раньше заявку приходилось закрывать руками, и воронка обрывалась:
        по данным нельзя было понять, чем закончилось обращение.
        """
        from apps.crm.models import Application, ApplicationLog

        application = deal.application
        if application is None:
            return
        final_statuses = (
            Application.ApplicationStatusChoices.CLOSED_WON,
            Application.ApplicationStatusChoices.CLOSED_LOST,
        )
        if application.status in final_statuses:
            return

        application.status = Application.ApplicationStatusChoices.CLOSED_WON
        application.save(update_fields=['status', 'updated_at'])
        ApplicationLog.objects.create(
            application=application,
            user=self.request.user,
            action=f"Заявка закрыта успешно: по ней проведена сделка №{deal.id}."
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
            deal = Deal.objects.select_related('property__building__project').get(pk=deal_id)
        except Deal.DoesNotExist:
            return Discount.objects.none()

        # Проверяем что пользователь имеет доступ к этой сделке
        if not can_user_perform_action(self.request.user, 'VIEW', 'DEAL', obj=deal):
            return Discount.objects.none()

        property_obj = deal.property
        building_obj = property_obj.building
        today = timezone.now().date()

        # Ограничения складываются, а не заменяют друг друга: скидка подходит,
        # если её ограничение по дому И ограничение по типу недвижимости
        # выполняются одновременно. При ИЛИ скидка одного дома попадала
        # в подбор для другого — достаточно было совпадения типа объекта.
        matches_building = Q(buildings__isnull=True) | Q(buildings=building_obj)
        matches_type = Q(property_type__isnull=True) | Q(property_type='') | \
            Q(property_type=property_obj.property_type)
        # Скидка действует, если период начался и ещё не закончился
        in_period = Q(start_date__lte=today) & (Q(end_date__isnull=True) | Q(end_date__gte=today))

        queryset = Discount.objects.filter(
            matches_building,
            matches_type,
            in_period,
            is_active=True,
        ).distinct()

        # Скидка принадлежит компании — чужие условия к сделке не предлагаем
        return _filter_by_company_scope(self.request.user, queryset, 'company', 'DISCOUNT').distinct()
