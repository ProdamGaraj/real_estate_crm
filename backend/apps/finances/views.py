# real_estate_crm/backend/apps/finances/views.py

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from decimal import Decimal, InvalidOperation
from .models import PaymentLog
from .models import Payment, PaymentType, BeneficiaryAccount
from apps.deals.models import Deal, DealLog
from apps.realty.models import Property
from .serializers import PaymentSerializer, PaymentTypeSerializer, BeneficiaryAccountSerializer, PaymentDetailSerializer
from .services import (
    refresh_overdue_payments_throttled,
    resolve_unpaid_status,
)
from datetime import date
from django.db import transaction
from django.utils import timezone
from django.shortcuts import get_object_or_404
from .filters import PaymentFilter
import pandas as pd
from django.http import HttpResponse
from django.db.models import Sum, Count, Q
from permissions.permissions import PaymentPermission, PaymentTypePermission, BeneficiaryAccountPermission, ReportPermission
from permissions.backends import get_filtered_queryset, can_user_perform_action
from permissions.reference_scope import CompanyScopedReferenceMixin


class ProtectedReferenceDeleteMixin:
    """
    Отказ вместо ошибки сервера, когда справочник ещё используется.

    Счёт получателя защищён от удаления на уровне базы (PROTECT), поэтому
    попытка убрать используемый счёт превращалась в 500-ю ошибку без
    объяснения. Показываем, сколько платежей на него ссылается.
    """

    protected_message = 'Запись используется и не может быть удалена.'

    def perform_destroy(self, instance):
        from django.db.models import ProtectedError
        from rest_framework.exceptions import ValidationError as DRFValidationError

        try:
            instance.delete()
        except ProtectedError as error:
            used_by = len(getattr(error, 'protected_objects', []) or [])
            detail = self.protected_message
            if used_by:
                detail += f' Связанных записей: {used_by}.'
            raise DRFValidationError({'detail': detail})


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

        # Актуализируем просрочку до подсчёта витрин, иначе сумма зависит
        # от того, открывал ли кто-то сегодня список платежей
        refresh_overdue_payments_throttled(
            get_filtered_queryset(request.user, Payment.objects.all(), 'PAYMENT')
        )

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

        # Витрины считаются в разрезе валют: суммировать сумы с долларами
        # в одно число нельзя — цифра получалась бессмысленной
        widgets_rows = queryset.values('currency').annotate(
            overdue_sum=Sum('amount', filter=Q(status=Payment.PaymentStatus.OVERDUE)),
            paid_sum=Sum('amount', filter=Q(status=Payment.PaymentStatus.PAID)),
        ).order_by('currency')
        widgets_data = {
            'by_currency': [
                {
                    'currency': row['currency'],
                    'overdue_sum': row['overdue_sum'] or 0,
                    'paid_sum': row['paid_sum'] or 0,
                }
                for row in widgets_rows
            ]
        }

        if group_by == 'status':
            summary = queryset.values('status', 'currency').annotate(
                total_amount=Sum('amount')).order_by('-total_amount')
            data_for_df = [
                {'Status': item['status'], 'Currency': item['currency'], 'Total Amount': item['total_amount']}
                for item in summary
            ]

        elif group_by == 'project':
            summary = queryset.values('deal__property__building__project__name', 'currency').annotate(
                total_amount=Sum('amount')).order_by('-total_amount')
            data_for_df = [{'Project': item['deal__property__building__project__name'] or "N/A",
                            'Currency': item['currency'],
                            'Total Amount': item['total_amount']} for item in summary]

        elif group_by == 'manager':
            summary = queryset.values('responsible_employee__first_name', 'responsible_employee__last_name',
                                      'responsible_employee__username', 'currency').annotate(
                total_amount=Sum('amount')).order_by('-total_amount')
            data_for_df = []
            for item in summary:
                full_name = f"{item['responsible_employee__first_name']} {item['responsible_employee__last_name']}".strip()
                data_for_df.append({
                    'Manager': full_name or item['responsible_employee__username'] or "N/A",
                    'Currency': item['currency'],
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
        # Автоматически обновляем статусы просроченных платежей (только в рамках доступных пользователю)
        refresh_overdue_payments_throttled(
            get_filtered_queryset(self.request.user, Payment.objects.all(), 'PAYMENT')
        )

        queryset = Payment.objects.select_related('client', 'deal', 'payment_type').all()
        # Фильтруем по разрешениям пользователя
        return get_filtered_queryset(self.request.user, queryset, 'PAYMENT')


class PaymentEditPermission(PaymentPermission):
    """POST на отметку возврата — это EDIT, а не ADD (как и у сделок)"""

    def _get_action_from_method(self, method):
        if method == 'POST':
            return 'EDIT'
        return super()._get_action_from_method(method)


class PaymentMarkAsReturnedView(APIView):
    permission_classes = [IsAuthenticated, PaymentEditPermission]

    def post(self, request, pk, *args, **kwargs):
        payment = get_object_or_404(Payment, pk=pk)
        # Проверяем доступ к этому платежу (scope-фильтрация)
        if not can_user_perform_action(request.user, 'EDIT', 'PAYMENT', obj=payment):
            return Response(
                {"error": "У вас нет доступа к этому платежу."},
                status=status.HTTP_403_FORBIDDEN
            )
        if payment.status == Payment.PaymentStatus.TO_BE_RETURNED:
            with transaction.atomic():
                payment.status = Payment.PaymentStatus.RETURNED
                payment.save()
                PaymentLog.objects.create(
                    payment=payment,
                    user=request.user,
                    action="Платеж отмечен как возвращенный."
                )
                self._release_property_if_settled(payment, request.user)
            return Response(PaymentSerializer(payment).data, status=status.HTTP_200_OK)
        return Response(
            {"error": "Платеж не может быть отмечен как возвращенный."},
            status=status.HTTP_400_BAD_REQUEST
        )

    @staticmethod
    def _release_property_if_settled(payment, user):
        """
        Освобождает объект расторгнутой сделки, когда возвращён последний платёж.

        До этого момента объект намеренно остаётся занятым: продавать квартиру,
        по которой ещё не рассчитались с прежним клиентом, нельзя.
        """
        deal = payment.deal
        if not deal or deal.status != Deal.DealStatus.TERMINATED:
            return
        if deal.payments.filter(status=Payment.PaymentStatus.TO_BE_RETURNED).exists():
            return

        property_obj = deal.property
        if property_obj.status == Property.PropertyStatus.SELECTION:
            return

        property_obj.status = Property.PropertyStatus.SELECTION
        property_obj.save(update_fields=['status', 'updated_at'])
        DealLog.objects.create(
            deal=deal,
            user=user,
            action="Все платежи возвращены — объект освобождён и снова доступен для продажи."
        )


class PaymentTypeListView(CompanyScopedReferenceMixin, generics.ListCreateAPIView):
    queryset = PaymentType.objects.all()
    serializer_class = PaymentTypeSerializer
    permission_classes = [IsAuthenticated, PaymentTypePermission]


class BeneficiaryAccountListView(generics.ListCreateAPIView):
    serializer_class = BeneficiaryAccountSerializer
    permission_classes = [IsAuthenticated, BeneficiaryAccountPermission]

    def get_queryset(self):
        return get_filtered_queryset(
            self.request.user,
            BeneficiaryAccount.objects.all(),
            'BENEFICIARY_ACCOUNT'
        )

    def perform_create(self, serializer):
        company = None
        if hasattr(self.request.user, 'profile') and self.request.user.profile.company:
            company = self.request.user.profile.company
        serializer.save(company=company, created_by=self.request.user)


class DealPaymentScheduleCreateView(APIView):
    """
    Создаёт или обновляет график платежей сделки.

    Принимает список платежей. Строки с существующим `id` обновляются на месте —
    поэтому отметки об оплате и фактические даты не теряются при правке графика.
    Строки без `id` создаются заново, отсутствующие в запросе — удаляются.
    Удалить платёж, по которому уже прошли деньги, нельзя.
    """
    permission_classes = [IsAuthenticated, PaymentPermission]

    # Статусы, которые отражают реальное движение денег: такие платежи
    # нельзя молча удалить или сбросить при пересборке графика.
    PROTECTED_STATUSES = (
        Payment.PaymentStatus.PAID,
        Payment.PaymentStatus.TO_BE_RETURNED,
        Payment.PaymentStatus.RETURNED,
    )

    def post(self, request, deal_pk, *args, **kwargs):
        try:
            deal = Deal.objects.select_related('client', 'property').get(pk=deal_pk)
        except Deal.DoesNotExist:
            return Response({"error": "Сделка не найдена."}, status=status.HTTP_404_NOT_FOUND)

        # Проверяем доступ к этой сделке (scope-фильтрация)
        if not can_user_perform_action(request.user, 'EDIT', 'DEAL', obj=deal):
            return Response({"error": "У вас нет доступа к этой сделке."}, status=status.HTTP_403_FORBIDDEN)

        if deal.status in (Deal.DealStatus.CANCELLED, Deal.DealStatus.TERMINATED):
            return Response(
                {"error": "Сделка отменена или расторгнута — изменить график платежей нельзя."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not deal.contract_price:
            return Response({"error": "Для создания графика необходимо указать 'Стоимость по договору' в сделке."},
                            status=status.HTTP_400_BAD_REQUEST)

        payments_data = request.data
        if not isinstance(payments_data, list) or not all(isinstance(p, dict) for p in payments_data):
            return Response({"error": "Ожидается список платежей."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # str() обязателен: Decimal(float) даёт двоичный «хвост»,
            # из-за которого корректная сумма не сходится со стоимостью по договору.
            total_amount = sum(Decimal(str(p.get('amount', 0))) for p in payments_data)
        except (InvalidOperation, TypeError):
            return Response({"error": "Некорректная сумма платежа."}, status=status.HTTP_400_BAD_REQUEST)

        # Складывать суммы можно только в одной валюте. Раньше платежи в разных
        # валютах суммировались как одно число и «сходились» со стоимостью договора.
        currencies = {p.get('currency') or deal.currency for p in payments_data}
        if len(currencies) > 1:
            return Response({
                "error": (
                    f"В графике смешаны валюты: {', '.join(sorted(currencies))}. "
                    f"Все платежи должны быть в валюте договора ({deal.currency})."
                )
            }, status=status.HTTP_400_BAD_REQUEST)
        if currencies and currencies != {deal.currency}:
            return Response({
                "error": (
                    f"Валюта платежей ({currencies.pop()}) не совпадает "
                    f"с валютой договора ({deal.currency})."
                )
            }, status=status.HTTP_400_BAD_REQUEST)

        if total_amount != deal.contract_price:
            return Response({
                "error": f"Сумма платежей ({total_amount} {deal.currency}) не совпадает "
                         f"со стоимостью по договору ({deal.contract_price} {deal.currency})."
            }, status=status.HTTP_400_BAD_REQUEST)

        existing_payments = {p.id: p for p in deal.payments.all()}
        submitted_id_list = [p.get('id') for p in payments_data if p.get('id') in existing_payments]
        if len(submitted_id_list) != len(set(submitted_id_list)):
            # Иначе одна строка перезаписала бы другую и график сошёлся бы не на всю сумму
            return Response({"error": "Один и тот же платёж передан в графике дважды."},
                            status=status.HTTP_400_BAD_REQUEST)

        submitted_ids = set(submitted_id_list)
        removed_payments = [p for pid, p in existing_payments.items() if pid not in submitted_ids]

        # Проведённые платежи из графика убрать нельзя — сначала отменяется оплата
        blocked = [p for p in removed_payments if p.status in self.PROTECTED_STATUSES]
        if blocked:
            details = "; ".join(
                f"{p.amount} {p.currency} от {p.due_date} ({p.get_status_display()})" for p in blocked
            )
            return Response({
                "error": (
                    f"Нельзя удалить из графика платежи, по которым уже прошли деньги: {details}. "
                    f"Сначала отмените оплату по ним."
                )
            }, status=status.HTTP_400_BAD_REQUEST)

        payment_company = deal.company
        if not payment_company and hasattr(request.user, 'profile') and request.user.profile.company:
            payment_company = request.user.profile.company

        # Ответственный за платежи — менеджер сделки. Без этого поле оставалось
        # пустым всегда, и отчёт по менеджерам показывал одну строку «N/A».
        responsible_employee = deal.created_by or request.user

        created_count = 0
        updated_count = 0
        resulting_payments = []

        with transaction.atomic():
            for payment_data in payments_data:
                instance = existing_payments.get(payment_data.get('id'))
                serializer = PaymentSerializer(instance=instance, data=payment_data)
                serializer.is_valid(raise_exception=True)
                due_date = serializer.validated_data.get('due_date')

                if instance is None:
                    payment = serializer.save(
                        deal=deal,
                        client=deal.client,
                        created_by=request.user,
                        company=payment_company,
                        responsible_employee=responsible_employee,
                        status=resolve_unpaid_status(due_date),
                    )
                    created_count += 1
                else:
                    # Проведённый платёж сохраняет свой статус и дату фактической оплаты.
                    # Для непроведённого пересчитываем «К оплате»/«Просрочен» по новому сроку.
                    new_status = instance.status
                    if instance.status not in self.PROTECTED_STATUSES:
                        new_status = resolve_unpaid_status(due_date)
                    payment = serializer.save(
                        deal=deal,
                        client=deal.client,
                        company=payment_company,
                        responsible_employee=instance.responsible_employee or responsible_employee,
                        status=new_status,
                    )
                    updated_count += 1

                resulting_payments.append(PaymentSerializer(payment).data)

            for payment in removed_payments:
                # Логи платежа удаляются каскадом, поэтому переносим суть
                # в журнал сделки — иначе история правки графика теряется
                DealLog.objects.create(
                    deal=deal,
                    user=request.user,
                    action=(
                        f"Из графика удалён платёж на {payment.amount} {payment.currency} "
                        f"со сроком {payment.due_date} (статус — {payment.get_status_display()})."
                    )
                )
                payment.delete()

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
                changes = []
                if created_count:
                    changes.append(f"добавлено {created_count}")
                if updated_count:
                    changes.append(f"изменено {updated_count}")
                if removed_payments:
                    changes.append(f"удалено {len(removed_payments)}")
                details = f" Платежей: {', '.join(changes)}." if changes else ""
                DealLog.objects.create(
                    deal=deal,
                    user=request.user,
                    action=f"График платежей обновлен. Новая общая сумма: {total_amount}.{details}"
                )

        return Response(resulting_payments, status=status.HTTP_201_CREATED)


class PaymentTypeDetailView(ProtectedReferenceDeleteMixin, CompanyScopedReferenceMixin, generics.DestroyAPIView):
    queryset = PaymentType.objects.all()
    serializer_class = PaymentTypeSerializer
    permission_classes = [IsAuthenticated, PaymentTypePermission]
    protected_message = 'Этот тип платежа используется в графиках платежей.'


class BeneficiaryAccountDetailView(ProtectedReferenceDeleteMixin, generics.DestroyAPIView):
    serializer_class = BeneficiaryAccountSerializer
    permission_classes = [IsAuthenticated, BeneficiaryAccountPermission]
    protected_message = (
        'По этому счёту получателя есть платежи, поэтому удалить его нельзя. '
        'Заведите новый счёт, а этот оставьте для истории.'
    )

    def get_queryset(self):
        return get_filtered_queryset(
            self.request.user,
            BeneficiaryAccount.objects.all(),
            'BENEFICIARY_ACCOUNT'
        )


class PaymentDetailView(generics.RetrieveUpdateAPIView):
    """
    View для обновления данных по конкретному платежу.
    Используется для проставления/отмены даты оплаты.
    """
    queryset = Payment.objects.all()
    permission_classes = [IsAuthenticated, PaymentPermission]

    def get_queryset(self):
        queryset = Payment.objects.select_related('client', 'deal', 'payment_type').all()
        return get_filtered_queryset(self.request.user, queryset, 'PAYMENT')

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
            self._log_full_payment(instance, self.request.user)

    @staticmethod
    def _log_full_payment(payment, user):
        """
        Отмечает в журнале сделки момент, когда график оплачен полностью.

        Статус сделки при этом не меняется: успешное закрытие по-прежнему
        требует подписей обеих сторон. Но факт полной оплаты раньше нигде
        не фиксировался, и понять его можно было только вручную сверив график.
        """
        deal = payment.deal
        if not deal or deal.status not in (Deal.DealStatus.BOOKING, Deal.DealStatus.IN_PROGRESS):
            return
        if deal.payments.exclude(status=Payment.PaymentStatus.PAID).exists():
            return
        already_logged = DealLog.objects.filter(
            deal=deal, action__startswith='График платежей оплачен полностью'
        ).exists()
        if already_logged:
            return
        DealLog.objects.create(
            deal=deal,
            user=user,
            action=(
                'График платежей оплачен полностью. '
                'Для закрытия сделки осталось загрузить подписи сторон.'
            )
        )