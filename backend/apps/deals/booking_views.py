# real_estate_crm/backend/apps/deals/booking_views.py
"""
API броней: список и карточка, оформление, продление, снятие, договор.

Бронь живёт отдельно от сделки, поэтому и права на неё отдельные — ресурс
`BOOKING`: менеджеру можно разрешить бронировать, не открывая работу с
договорами, а бухгалтеру — видеть взносы, не оформляя брони.
"""

import os

from django.db import transaction
from django.db.models import BooleanField, Case, Count, Q, When
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.realty.models import Property
from permissions.backends import can_user_perform_action, get_filtered_queryset
from permissions.permissions import BookingPermission, ReportPermission, SettingsPermission

from .booking import (
    BookingError, activate_booking, booking_settings, extend_booking, finish_booking,
    projected_schedule, validate_duration,
)
from .filters import BookingFilter
from .models import Booking, BookingLog
from .occupancy import active_booking, live_deal, pending_refund_deal, property_holder
from .serializers import BookingCreateSerializer, BookingDetailSerializer, BookingListSerializer


def booking_queryset(user):
    """Брони, доступные пользователю, со связями для списка и карточки."""
    return get_filtered_queryset(
        user,
        Booking.objects.select_related(
            'client', 'property__building__project', 'created_by', 'deal'
        ).prefetch_related('payments'),
        'BOOKING',
    )


class BookingListView(generics.ListCreateAPIView):
    """
    GET — список броней, POST — оформление брони.

    Бронь по свободному объекту становится действующей сразу: пишутся
    даты, фиксируется цена, создаётся взнос. Бронь по занятому объекту
    встаёт в конец очереди — без дат и без цены, они появятся при
    активации.
    """
    permission_classes = [IsAuthenticated, BookingPermission]
    filterset_class = BookingFilter

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return BookingCreateSerializer
        return BookingListSerializer

    def get_queryset(self):
        # Действующие и ожидающие брони — наверху: с ними работают, а
        # истёкшие, снятые и оформленные в сделку нужны как история
        return booking_queryset(self.request.user).annotate(
            is_closed=Case(
                When(status__in=Booking.LIVE_STATUSES, then=False),
                default=True,
                output_field=BooleanField(),
            )
        ).order_by('is_closed', '-created_at', '-id')

    def create(self, request, *args, **kwargs):
        serializer = BookingCreateSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)

        company = None
        profile = getattr(request.user, 'profile', None)
        if profile is not None and profile.company:
            company = profile.company

        try:
            with transaction.atomic():
                property_instance = Property.objects.select_for_update().select_related(
                    'building__project'
                ).get(pk=serializer.validated_data['property'].pk)

                validate_duration(company, serializer.validated_data.get('duration_days'))

                if property_instance.status == Property.PropertyStatus.RESERVE:
                    raise BookingError(
                        "Объект в резерве — бронировать его нельзя. Снять резерв может "
                        "сотрудник с правом изменения объектов."
                    )
                if property_instance.status == Property.PropertyStatus.SOLD:
                    raise BookingError("Объект продан — бронировать его нельзя.")

                deal = live_deal(property_instance)
                if deal is not None and deal.status == deal.DealStatus.CLOSED_WON:
                    raise BookingError("По объекту проведена сделка — бронировать его нельзя.")

                fee_amount, fee_account, _ = booking_settings(company)
                if fee_amount and fee_account is None:
                    raise BookingError(
                        "В настройках компании не указан счёт для взноса за бронь. "
                        "Укажите счёт или обнулите сумму взноса."
                    )

                # Очередь строго FIFO по дате создания, поэтому новая бронь
                # всегда встаёт в конец — переупорядочивание запрещено
                occupied = (deal is not None
                            or active_booking(property_instance) is not None
                            or pending_refund_deal(property_instance) is not None)

                booking = serializer.save(
                    company=company,
                    created_by=request.user,
                    status=Booking.BookingStatus.PENDING_QUEUE,
                )
                BookingLog.objects.create(
                    booking=booking,
                    user=request.user,
                    action=(
                        f"Бронь оформлена для клиента «{booking.client}» по объекту "
                        f"«{booking.property}» на {booking.duration_days} дн."
                    ),
                )

                if occupied:
                    holder_kind, holder = property_holder(property_instance)
                    reason = {
                        'deal': f"объект в сделке №{getattr(holder, 'id', '')}",
                        'booking': f"объект забронирован (бронь №{getattr(holder, 'id', '')})",
                        'refund': f"по объекту не завершён возврат платежей (сделка №{getattr(holder, 'id', '')})",
                    }.get(holder_kind, 'объект занят')
                    BookingLog.objects.create(
                        booking=booking,
                        user=request.user,
                        action=f"Бронь встала в очередь: {reason}.",
                    )
                else:
                    booking.property = property_instance
                    activate_booking(booking, actor=request.user, prop=property_instance)
        except BookingError as error:
            return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        booking = booking_queryset(request.user).get(pk=booking.pk)
        data = BookingDetailSerializer(booking, context=self.get_serializer_context()).data
        return Response(data, status=status.HTTP_201_CREATED)


class BookingDetailView(generics.RetrieveUpdateAPIView):
    """
    Карточка брони. Менять можно только номер и дату договора брони и заявку:
    срок меняется продлением, а даты, цена и статус — переходами.

    Бронь, ставшая сделкой, и снятая бронь неизменяемы.
    """
    serializer_class = BookingDetailSerializer
    permission_classes = [IsAuthenticated, BookingPermission]

    def get_queryset(self):
        return booking_queryset(self.request.user)

    def perform_update(self, serializer):
        instance = self.get_object()
        if instance.status not in Booking.LIVE_STATUSES:
            from rest_framework.exceptions import ValidationError

            raise ValidationError({
                'detail': f"Бронь «{instance.get_status_display()}» изменить нельзя."
            })

        changes = []
        tracked = {
            'contract_number': 'Номер договора брони',
            'contract_date': 'Дата договора брони',
            'application': 'Заявка',
        }
        before = {field: getattr(instance, field) for field in tracked}
        updated = serializer.save()
        for field, label in tracked.items():
            if before[field] != getattr(updated, field):
                changes.append(
                    f"Поле «{label}» изменено с «{before[field] or 'пусто'}» "
                    f"на «{getattr(updated, field) or 'пусто'}»"
                )
        if changes:
            BookingLog.objects.create(
                booking=updated, user=self.request.user,
                action="Данные брони обновлены. " + "; ".join(changes),
            )


class BookingEditPermission(BookingPermission):
    """POST на продление, снятие и скан — это EDIT, а не ADD."""

    def _get_action_from_method(self, method):
        if method == 'POST':
            return 'EDIT'
        return super()._get_action_from_method(method)


class BookingActionView(APIView):
    """Общее для действий над бронью: доступ к записи и единый ответ."""
    permission_classes = [IsAuthenticated, BookingEditPermission]

    def get_booking(self, request, pk):
        try:
            booking = Booking.objects.select_related(
                'property__building__project', 'client', 'company__booking_fee_account'
            ).get(pk=pk)
        except Booking.DoesNotExist:
            return None, Response({"error": "Бронь не найдена."}, status=status.HTTP_404_NOT_FOUND)
        if not can_user_perform_action(request.user, 'EDIT', 'BOOKING', obj=booking):
            return None, Response({"error": "У вас нет доступа к этой брони."},
                                  status=status.HTTP_403_FORBIDDEN)
        return booking, None

    def ok(self, request, booking):
        booking = booking_queryset(request.user).get(pk=booking.pk)
        return Response(BookingDetailSerializer(booking, context={'request': request}).data)


class BookingExtendView(BookingActionView):
    """
    Продление брони: правка срока в днях.

    Продлить можно только неистёкшую бронь и в любом месте очереди —
    расчётные даты хвоста пересчитываются сами, потому что в базе их нет.
    Продление бесплатное: первый взнос покрывает продлённый срок.
    """

    def post(self, request, pk, *args, **kwargs):
        booking, error = self.get_booking(request, pk)
        if error:
            return error

        raw = request.data.get('duration_days')
        try:
            duration_days = int(raw)
        except (TypeError, ValueError):
            return Response({"error": "Укажите новый срок брони в днях."},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                Property.objects.select_for_update().get(pk=booking.property_id)
                extend_booking(booking, duration_days, actor=request.user)
        except BookingError as problem:
            return Response({"error": str(problem)}, status=status.HTTP_400_BAD_REQUEST)
        return self.ok(request, booking)


class BookingCancelView(BookingActionView):
    """
    Снятие брони вручную: долг по взносу снимается, очередь продвигается.

    Бронь, ставшая сделкой, не снимается: её судьбу решает сделка.
    """

    def post(self, request, pk, *args, **kwargs):
        booking, error = self.get_booking(request, pk)
        if error:
            return error

        reason = (request.data.get('cancellation_reason') or '').strip()
        if not reason:
            return Response({"error": "Для снятия брони необходимо указать причину."},
                            status=status.HTTP_400_BAD_REQUEST)
        if booking.status == Booking.BookingStatus.CONVERTED:
            return Response({
                "error": f"Бронь оформлена в сделку №{booking.deal_id}. "
                         f"Снимите её, отменив сделку."
            }, status=status.HTTP_400_BAD_REQUEST)
        if booking.status not in Booking.LIVE_STATUSES:
            return Response({"error": f"Бронь уже «{booking.get_status_display()}»."},
                            status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            prop = Property.objects.select_for_update().select_related('building__project').get(
                pk=booking.property_id
            )
            booking.property = prop
            finish_booking(booking, status=Booking.BookingStatus.CANCELLED,
                           reason=f"Бронь снята вручную. Причина: {reason}", actor=request.user)
        return self.ok(request, booking)


class BookingScanView(BookingActionView):
    """
    Загрузка и замена скана подписанного договора брони.

    Прежний файл с диска не удаляется: если заменили не тот, его можно
    вернуть, — так же сделано для сканов сделки.
    """
    parser_classes = [MultiPartParser]

    def post(self, request, pk, *args, **kwargs):
        booking, error = self.get_booking(request, pk)
        if error:
            return error

        upload = request.FILES.get('file')
        if not upload or not upload.size:
            return Response({"error": "Выберите файл скана."}, status=status.HTTP_400_BAD_REQUEST)

        old_name = os.path.basename(booking.signed_scan.name) if booking.signed_scan else None
        booking.signed_scan.save(upload.name, upload, save=False)
        booking.save(update_fields=['signed_scan', 'updated_at'])

        new_name = os.path.basename(booking.signed_scan.name)
        BookingLog.objects.create(
            booking=booking, user=request.user,
            action=(f"Заменён скан договора брони: «{old_name}» → «{new_name}»." if old_name
                    else f"Загружен скан договора брони: «{new_name}»."),
        )
        return self.ok(request, booking)


class PropertyBookingQueueView(APIView):
    """
    Очередь броней объекта с расчётными датами.

    Нужна в карточке объекта и на шахматке: менеджер должен видеть, что
    объект занят до какого-то числа и сколько человек стоит за ним.
    """
    permission_classes = [IsAuthenticated, BookingPermission]

    def get(self, request, property_pk, *args, **kwargs):
        from apps.realty.views import _filter_by_company_scope

        accessible = _filter_by_company_scope(
            request.user, Property.objects.filter(pk=property_pk),
            'building__project__company', 'PROPERTY',
        )
        prop = accessible.select_related('building__project').first()
        if prop is None:
            return Response({"error": "Объект не найден или недоступен."},
                            status=status.HTTP_404_NOT_FOUND)

        visible = set(booking_queryset(request.user).filter(property=prop).values_list('pk', flat=True))
        schedule = projected_schedule(prop)
        current = active_booking(prop)
        rows = []
        bookings = ([current] if current else []) + list(
            Booking.objects.filter(property=prop, status=Booking.BookingStatus.PENDING_QUEUE)
            .select_related('client').order_by('created_at', 'id')
        )
        for position, booking in enumerate(bookings):
            dates = schedule.get(booking.id) or {}
            rows.append({
                'id': booking.id,
                'position': position,
                'status': booking.status,
                'status_display': booking.get_status_display(),
                # Клиента чужой брони менеджер видеть не должен, а саму
                # занятость — должен: иначе он бронирует «свободный» объект
                'client': str(booking.client) if booking.id in visible else None,
                'duration_days': booking.duration_days,
                'start_date': dates.get('start_date'),
                'end_date': dates.get('end_date'),
                'projected': dates.get('projected', False),
                'accessible': booking.id in visible,
            })

        deal = live_deal(prop)
        return Response({
            'property': prop.id,
            'property_status': prop.status,
            'queue': rows,
            'live_deal_id': deal.id if deal else None,
            'awaiting_refund': pending_refund_deal(prop) is not None,
            'pending_price': str(prop.pending_price) if prop.pending_price is not None else None,
        })


class BookingSettingsView(APIView):
    """
    Настройки брони компании: взнос, счёт получателя, минимальный срок.

    Живут на компании рядом с валютой сделок и источником курса, поэтому
    и правятся правом на настройки, а не правом на брони: сумму взноса
    задаёт руководство, а не менеджер, который бронирует.
    """
    permission_classes = [IsAuthenticated, SettingsPermission]

    @staticmethod
    def _payload(company):
        from apps.finances.models import BeneficiaryAccount

        if company is None:
            return {'company': None, 'booking_fee_amount': '0', 'booking_fee_account': None,
                    'min_booking_days': 1, 'accounts': []}
        accounts = BeneficiaryAccount.objects.filter(
            Q(company=company) | Q(company__isnull=True)
        ).order_by('name')
        return {
            'company': company.id,
            'company_name': company.name,
            'booking_fee_amount': str(company.booking_fee_amount or 0),
            'booking_fee_account': company.booking_fee_account_id,
            'booking_fee_currency': company.deal_currency,
            'min_booking_days': company.min_booking_days,
            'accounts': [{'id': account.id, 'name': account.name} for account in accounts],
        }

    def _company(self, request):
        profile = getattr(request.user, 'profile', None)
        return getattr(profile, 'company', None)

    def get(self, request, *args, **kwargs):
        return Response(self._payload(self._company(request)))

    def patch(self, request, *args, **kwargs):
        from decimal import Decimal, InvalidOperation

        from apps.finances.models import BeneficiaryAccount

        company = self._company(request)
        if company is None:
            return Response({'error': 'Не указана компания.'}, status=status.HTTP_400_BAD_REQUEST)

        if 'booking_fee_amount' in request.data:
            try:
                amount = Decimal(str(request.data['booking_fee_amount'] or 0)).quantize(Decimal('0.01'))
            except (InvalidOperation, ValueError):
                return Response({'error': 'Сумма взноса — число.'}, status=status.HTTP_400_BAD_REQUEST)
            if amount < 0:
                return Response({'error': 'Сумма взноса не может быть отрицательной.'},
                                status=status.HTTP_400_BAD_REQUEST)
            company.booking_fee_amount = amount

        if 'booking_fee_account' in request.data:
            account_id = request.data['booking_fee_account']
            if account_id in (None, '', 0):
                company.booking_fee_account = None
            else:
                account = BeneficiaryAccount.objects.filter(
                    Q(pk=account_id), Q(company=company) | Q(company__isnull=True)
                ).first()
                if account is None:
                    return Response({'error': 'Счёт получателя не найден или недоступен.'},
                                    status=status.HTTP_400_BAD_REQUEST)
                company.booking_fee_account = account

        if 'min_booking_days' in request.data:
            try:
                days = int(request.data['min_booking_days'])
            except (TypeError, ValueError):
                return Response({'error': 'Минимальный срок брони — целое число дней.'},
                                status=status.HTTP_400_BAD_REQUEST)
            if days < 1:
                return Response({'error': 'Минимальный срок брони — не меньше одного дня.'},
                                status=status.HTTP_400_BAD_REQUEST)
            company.min_booking_days = days

        # Взнос без счёта оформить нельзя: счёт получателя у платежа обязателен
        if company.booking_fee_amount and company.booking_fee_account_id is None:
            return Response({
                'error': 'Укажите счёт для взноса за бронь — без него бронь не оформить.'
            }, status=status.HTTP_400_BAD_REQUEST)

        company.save(update_fields=['booking_fee_amount', 'booking_fee_account',
                                    'min_booking_days', 'updated_at'])
        return Response(self._payload(company))


class BookingSummaryView(APIView):
    """
    Сводка по броням: сколько действующих, в очереди, истёкших, снятых.

    Брони в воронку сделок не входят (бронь — не контрактация), поэтому
    и сводка у них своя.
    """
    permission_classes = [IsAuthenticated, ReportPermission]

    def get(self, request, *args, **kwargs):
        queryset = booking_queryset(request.user)
        created_after = request.query_params.get('created_at_after')
        created_before = request.query_params.get('created_at_before')
        if created_after:
            queryset = queryset.filter(created_at__date__gte=created_after)
        if created_before:
            queryset = queryset.filter(created_at__date__lte=created_before)

        widgets = queryset.aggregate(
            active_count=Count('id', filter=Q(status=Booking.BookingStatus.ACTIVE)),
            queued_count=Count('id', filter=Q(status=Booking.BookingStatus.PENDING_QUEUE)),
            converted_count=Count('id', filter=Q(status=Booking.BookingStatus.CONVERTED)),
            expired_count=Count('id', filter=Q(status=Booking.BookingStatus.EXPIRED)),
            cancelled_count=Count('id', filter=Q(status=Booking.BookingStatus.CANCELLED)),
        )
        # Брони, срок которых истёк, а ночной прогон ещё не прошёл: иначе
        # «действующих» на дашборде больше, чем их есть на самом деле
        widgets['overdue_count'] = queryset.filter(
            status=Booking.BookingStatus.ACTIVE, end_date__lt=timezone.now()
        ).count()
        return Response({'widgets': widgets})
