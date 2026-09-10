from django.utils import timezone
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema
from .models import Client, Application, ClientLog, RejectionReason, ApplicationLog, Meeting, MeetingLog, ClientFile, ApplicationStatus
from .serializers import (
    ClientListSerializer, ClientDetailSerializer,
    ApplicationListSerializer, ApplicationDetailSerializer,
    PublicApplicationSerializer, RejectionReasonSerializer, MeetingSerializer, ClientFileSerializer,
    ApplicationStatusSerializer
)
from .filters import ClientFilter, ApplicationFilter, MeetingFilter
from django.contrib.auth.models import User


def _get_field_display_name(model, field_name):
    """Получить человекочитаемое название поля из verbose_name модели."""
    try:
        return str(model._meta.get_field(field_name).verbose_name)
    except Exception:
        return field_name


def _get_choice_display(model, field_name, value):
    """Получить человекочитаемое значение для choices-поля."""
    if value is None or value == '':
        return 'пусто'
    try:
        field = model._meta.get_field(field_name)
        if hasattr(field, 'choices') and field.choices:
            choices_dict = dict(field.choices)
            if value in choices_dict:
                return str(choices_dict[value])
    except Exception:
        pass
    return str(value) or 'пусто'


def _format_change(model, key, old_value, new_value):
    """Сформировать строку изменения с человекочитаемыми названиями."""
    field_label = _get_field_display_name(model, key)
    old_display = _get_choice_display(model, key, old_value)
    new_display = _get_choice_display(model, key, new_value)
    return f"'{field_label}' изменено с '{old_display}' на '{new_display}'"
from .serializers import UserSerializer
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser
from datetime import date, timedelta
from django.db.models import Count, Sum, F, Q
from apps.deals.models import Deal
from apps.finances.models import Payment
from apps.finances.services import refresh_overdue_payments_throttled
import pandas as pd
from django.http import HttpResponse
from permissions.permissions import (
    ClientPermission, ApplicationPermission, MeetingPermission, 
    ReportPermission, DashboardPermission, SettingsPermission, UserPermission,
    HasPartnerCreateApplicationScope, ApplicationStatusPermission
)
from permissions.backends import get_filtered_queryset, get_user_max_scope, can_user_perform_action
from permissions.reference_scope import CompanyScopedReferenceMixin, scope_reference_queryset


class SoftDeleteMixin:
    """
    Удаление скрывает запись, но оставляет её в базе.

    Физическое удаление уносило с собой и журнал изменений (CASCADE),
    поэтому восстановить, кто и что делал с заявкой или встречей, было нельзя.
    Удалённые записи пропадают из выдачи; посмотреть их можно запросом
    с ``?include_deleted=true``.
    """

    log_model = None
    log_field = None

    def filter_deleted(self, queryset):
        if self.request.query_params.get('include_deleted') == 'true':
            return queryset
        return queryset.filter(is_deleted=False)

    def perform_destroy(self, instance):
        instance.soft_delete(user=self.request.user)
        if self.log_model and self.log_field:
            self.log_model.objects.create(
                **{self.log_field: instance},
                user=self.request.user,
                action="Запись удалена (перемещена в удалённые)."
            )


class ApplicationSummaryView(APIView):
    permission_classes = [IsAuthenticated, ReportPermission]

    def get(self, request, *args, **kwargs):
        group_by = request.query_params.get('group_by', 'created_by')
        export_format = request.query_params.get('format')
        days_since_update = request.query_params.get('days_since_update', 7)
        created_at_after = request.query_params.get('created_at_after')
        created_at_before = request.query_params.get('created_at_before')

        try:
            days_since_update = int(days_since_update)
        except (ValueError, TypeError):
            days_since_update = 7

        # Удалённые заявки в отчёт не попадают
        queryset = Application.objects.filter(is_deleted=False).select_related('created_by', 'client')
        # Фильтруем по разрешениям пользователя с учётом scope отчёта
        report_scope = get_user_max_scope(request.user, 'REPORT')
        queryset = get_filtered_queryset(request.user, queryset, 'APPLICATION', max_scope=report_scope)

        if created_at_after:
            queryset = queryset.filter(created_at__date__gte=created_at_after)
        if created_at_before:
            queryset = queryset.filter(created_at__date__lte=created_at_before)

        forgotten_applications_count = queryset.filter(
            updated_at__lt=timezone.now() - timedelta(days=days_since_update)
        ).count()

        if group_by == 'created_by':
            summary = queryset.values(
                'created_by__first_name', 'created_by__last_name', 'created_by__username'
            ).annotate(
                total_applications=Count('id')
            ).order_by('-total_applications')

            data_for_df = []
            for item in summary:
                full_name = f"{item['created_by__first_name']} {item['created_by__last_name']}".strip()
                data_for_df.append({
                    'User': full_name or item['created_by__username'] or "System",
                    'Total Applications': item['total_applications'],
                })

        elif group_by == 'status':
            summary = queryset.order_by().values('status').annotate(total_applications=Count('id')).order_by('-total_applications')
            data_for_df = [{'Status': item['status'], 'Total Applications': item['total_applications']} for item in
                           summary]

        elif group_by == 'project':
            summary = queryset.order_by().values('interested_projects__name').annotate(total_applications=Count('id')).order_by(
                '-total_applications')
            data_for_df = [{'Project': item['interested_projects__name'] or "N/A",
                            'Total Applications': item['total_applications']} for item in summary]

        elif group_by == 'source':
            summary = queryset.order_by().values('source').annotate(total_applications=Count('id')).order_by('-total_applications')
            data_for_df = [{'Source': item['source'], 'Total Applications': item['total_applications']} for item in
                           summary]

        else:
            return Response({"error": "Invalid group_by parameter"}, status=status.HTTP_400_BAD_REQUEST)

        if export_format == 'excel':
            df = pd.DataFrame(data_for_df)
            response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            response['Content-Disposition'] = f'attachment; filename=application_summary_{group_by}.xlsx'
            df.to_excel(response, index=False)
            return response

        response_data = {
            'summary': data_for_df,
            'forgotten_count': forgotten_applications_count
        }

        return Response(response_data)


class MeetingSummaryView(APIView):
    permission_classes = [IsAuthenticated, ReportPermission]

    def get(self, request, *args, **kwargs):
        group_by = request.query_params.get('group_by', 'executor')
        export_format = request.query_params.get('format')

        # Get date filters from query params
        planned_date_after = request.query_params.get('planned_date_after')
        planned_date_before = request.query_params.get('planned_date_before')
        actual_date_after = request.query_params.get('actual_date_after')
        actual_date_before = request.query_params.get('actual_date_before')

        # Удалённые встречи в отчёт не попадают
        queryset = Meeting.objects.filter(is_deleted=False).select_related(
            'executor', 'interested_building__project', 'client'
        )
        # Фильтруем по разрешениям пользователя с учётом scope отчёта
        report_scope = get_user_max_scope(request.user, 'REPORT')
        queryset = get_filtered_queryset(request.user, queryset, 'MEETING', max_scope=report_scope)

        # Встречи, заведённые системой при регистрации клиента, — не работа
        # менеджера. Пока они попадали в отчёт, у каждого было ровно столько
        # «состоявшихся встреч», сколько заведённых клиентов.
        if request.query_params.get('include_auto') != 'true':
            queryset = queryset.filter(is_auto_created=False)

        # Apply date filters
        if planned_date_after:
            queryset = queryset.filter(planned_date__date__gte=planned_date_after)
        if planned_date_before:
            queryset = queryset.filter(planned_date__date__lte=planned_date_before)
        if actual_date_after:
            queryset = queryset.filter(actual_date__date__gte=actual_date_after)
        if actual_date_before:
            queryset = queryset.filter(actual_date__date__lte=actual_date_before)

        # Calculate overdue meetings from the filtered queryset
        overdue_meetings_count = queryset.filter(
            status=Meeting.MeetingStatus.NEW,
            planned_date__lt=timezone.now()
        ).count()

        if group_by == 'executor':
            summary = queryset.values(
                'executor__username', 'executor__first_name', 'executor__last_name'
            ).annotate(
                total_meetings=Count('id'),
                new_meetings=Count('id', filter=Q(status=Meeting.MeetingStatus.NEW)),
                completed_meetings=Count('id', filter=Q(status=Meeting.MeetingStatus.COMPLETED)),
                cancelled_meetings=Count('id', filter=Q(status=Meeting.MeetingStatus.CANCELLED)),
            ).order_by('-total_meetings')

            data_for_df = []
            for item in summary:
                full_name = f"{item['executor__first_name']} {item['executor__last_name']}".strip()
                data_for_df.append({
                    'Executor': full_name or item['executor__username'] or "System",
                    'Total Meetings': item['total_meetings'],
                    'New Meetings': item['new_meetings'],
                    'Completed Meetings': item['completed_meetings'],
                    'Cancelled Meetings': item['cancelled_meetings'],
                })

        elif group_by == 'project':
            summary = queryset.values(
                'interested_building__project__name'
            ).annotate(
                total_meetings=Count('id'),
                new_meetings=Count('id', filter=Q(status=Meeting.MeetingStatus.NEW)),
                completed_meetings=Count('id', filter=Q(status=Meeting.MeetingStatus.COMPLETED)),
                cancelled_meetings=Count('id', filter=Q(status=Meeting.MeetingStatus.CANCELLED)),
            ).order_by('-total_meetings')

            data_for_df = []
            for item in summary:
                data_for_df.append({
                    'Project': item['interested_building__project__name'] or "N/A",
                    'Total Meetings': item['total_meetings'],
                    'New Meetings': item['new_meetings'],
                    'Completed Meetings': item['completed_meetings'],
                    'Cancelled Meetings': item['cancelled_meetings'],
                })

        elif group_by == 'status':
            summary = queryset.values(
                'status'
            ).annotate(
                total_meetings=Count('id')
            ).order_by('-total_meetings')

            data_for_df = []
            for item in summary:
                data_for_df.append({
                    'Status': item['status'],
                    'Total Meetings': item['total_meetings']
                })

        else:
            return Response({"error": "Invalid group_by parameter"}, status=status.HTTP_400_BAD_REQUEST)

        if export_format == 'excel':
            df = pd.DataFrame(data_for_df)
            response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            response['Content-Disposition'] = f'attachment; filename=meeting_summary_{group_by}.xlsx'
            df.to_excel(response, index=False)
            return response

        response_data = {
            'summary': data_for_df,
            'overdue_count': overdue_meetings_count
        }

        return Response(response_data)


class DashboardAnalyticsView(APIView):
    permission_classes = [IsAuthenticated, DashboardPermission]

    def get(self, request, *args, **kwargs):
        today = timezone.now().date()
        start_of_month = today.replace(day=1)

        # Определяем scope дашборда — он ограничивает видимость данных
        dashboard_scope = get_user_max_scope(request.user, 'DASHBOARD')

        # KPIs - фильтруем по разрешениям с учётом scope дашборда
        clients_qs = get_filtered_queryset(request.user, Client.objects.all(), 'CLIENT', max_scope=dashboard_scope)
        apps_qs = get_filtered_queryset(request.user, Application.objects.filter(is_deleted=False), 'APPLICATION', max_scope=dashboard_scope)
        deals_qs = get_filtered_queryset(request.user, Deal.objects.all(), 'DEAL', max_scope=dashboard_scope)
        payments_qs = get_filtered_queryset(request.user, Payment.objects.all(), 'PAYMENT', max_scope=dashboard_scope)
        meetings_qs = get_filtered_queryset(request.user, Meeting.objects.filter(is_deleted=False), 'MEETING', max_scope=dashboard_scope)
        
        new_clients_today = clients_qs.filter(created_at__date=today).count()
        new_applications_today = apps_qs.filter(created_at__date=today).count()
        # Считаем по дате закрытия сделки: по updated_at любая правка старой
        # сделки переносила её сумму в текущий месяц
        closed_this_month = deals_qs.filter(
            status=Deal.DealStatus.CLOSED_WON,
            closed_at__gte=start_of_month
        )
        monthly_sales = closed_this_month.aggregate(total=Sum('contract_price'))['total'] or 0
        # Актуализируем просрочку, иначе цифра зависит от того, открывал ли
        # кто-то сегодня раздел «Финансы»
        refresh_overdue_payments_throttled(payments_qs)
        # Берём тот же признак, что и витрина «Финансы»: раньше дашборд
        # добавлял сюда ещё и PENDING, и две цифры просрочки не сходились
        overdue_payments = payments_qs.filter(
            status=Payment.PaymentStatus.OVERDUE
        ).aggregate(total=Sum('amount'))['total'] or 0

        # Charts - используем отфильтрованный queryset
        # .order_by() сбрасывает Meta.ordering, иначе created_at попадает в GROUP BY и дублирует строки
        application_statuses = apps_qs.order_by().values('status').annotate(count=Count('id'))
        application_sources = apps_qs.order_by().values('source').annotate(count=Count('id'))

        # Динамика заявок по дням за неделю. График с таким названием на дашборде
        # был, но рисовал распределение по статусам — то есть отвечал на другой вопрос.
        week_start = today - timedelta(days=6)
        per_day_rows = apps_qs.filter(created_at__date__gte=week_start).order_by().values(
            'created_at__date'
        ).annotate(count=Count('id'))
        counts_by_day = {row['created_at__date']: row['count'] for row in per_day_rows}
        applications_per_day = [
            {
                'date': (week_start + timedelta(days=offset)).isoformat(),
                'count': counts_by_day.get(week_start + timedelta(days=offset), 0),
            }
            for offset in range(7)
        ]

        # Top Managers - на основе отфильтрованных сделок
        from django.db.models import OuterRef, Subquery
        # Одним запросом вместо выборки id и отдельного запроса на каждого
        top_rows = closed_this_month.order_by().values(
            'created_by', 'created_by__first_name', 'created_by__last_name'
        ).annotate(
            total_sales=Sum('contract_price')
        ).order_by('-total_sales')[:5]

        top_managers = [
            {
                'first_name': row['created_by__first_name'] or '',
                'last_name': row['created_by__last_name'] or '',
                'total_sales': row['total_sales'] or 0,
            }
            for row in top_rows if row['created_by']
        ]

        # Upcoming Meetings - используем отфильтрованный queryset
        upcoming_meetings = meetings_qs.filter(
            planned_date__gte=today,
            status=Meeting.MeetingStatus.NEW
        ).select_related('client').order_by('planned_date')[:5]

        data = {
            'kpi': {
                'newClientsToday': new_clients_today,
                'newApplicationsToday': new_applications_today,
                'monthlySales': monthly_sales,
                'overduePayments': overdue_payments,
            },
            'charts': {
                'applicationStatuses': list(application_statuses),
                'applicationSources': list(application_sources),
                'applicationsPerDay': applications_per_day,
            },
            'topManagers': list(top_managers),
            'upcomingMeetings': [
                {
                    'client': meeting.client.full_name,
                    'time': meeting.planned_date.strftime('%Y-%m-%d %H:%M')
                } for meeting in upcoming_meetings
            ]
        }

        return Response(data)


class ClientFileView(APIView):
    permission_classes = [IsAuthenticated, ClientPermission]
    parser_classes = [MultiPartParser]

    def get(self, request, pk, format=None):
        # Проверяем доступ к клиенту через scope-фильтрацию
        client_qs = get_filtered_queryset(request.user, Client.objects.all(), 'CLIENT')
        if not client_qs.filter(pk=pk).exists():
            return Response({"error": "Клиент не найден или нет доступа."}, status=status.HTTP_404_NOT_FOUND)
        files = ClientFile.objects.filter(client_id=pk)
        serializer = ClientFileSerializer(files, many=True)
        return Response(serializer.data)

    def post(self, request, pk, format=None):
        # Проверяем доступ к клиенту через scope-фильтрацию
        client_qs = get_filtered_queryset(request.user, Client.objects.all(), 'CLIENT')
        if not client_qs.filter(pk=pk).exists():
            return Response({"error": "Клиент не найден или нет доступа."}, status=status.HTTP_404_NOT_FOUND)
        file_serializer = ClientFileSerializer(data=request.data)
        if file_serializer.is_valid():
            file_serializer.save(client_id=pk, uploaded_by=request.user)
            return Response(file_serializer.data, status=status.HTTP_201_CREATED)
        else:
            return Response(file_serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class RejectionReasonListView(CompanyScopedReferenceMixin, generics.ListCreateAPIView):
    serializer_class = RejectionReasonSerializer
    permission_classes = [IsAuthenticated, SettingsPermission]
    queryset = RejectionReason.objects.filter(is_active=True)

    def get_queryset(self):
        queryset = super().get_queryset()
        reason_type = self.request.query_params.get('type')
        if reason_type:
            queryset = queryset.filter(reason_type=reason_type)
        return queryset


class ClientListView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, ClientPermission]
    queryset = Client.objects.all()
    filterset_class = ClientFilter

    def get_queryset(self):
        queryset = super().get_queryset()
        # Архивные клиенты в общем списке не показываются
        if self.request.query_params.get('include_archived') != 'true':
            queryset = queryset.exclude(status=Client.ClientStatus.ARCHIVED)
        return get_filtered_queryset(self.request.user, queryset, 'CLIENT')

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ClientDetailSerializer
        return ClientListSerializer

    def perform_create(self, serializer):
        # Определяем компанию из профиля пользователя
        company = None
        if hasattr(self.request.user, 'profile') and self.request.user.profile.company:
            company = self.request.user.profile.company
        client_instance = serializer.save(created_by=self.request.user, company=company)

        today = timezone.now()
        Meeting.objects.create(
            client=client_instance,
            creator=None,
            executor=self.request.user,
            status=Meeting.MeetingStatus.COMPLETED,
            planned_date=today,
            actual_date=today,
            comment="Автоматически созданная встреча при регистрации клиента.",
            is_auto_created=True
        )

        ClientLog.objects.create(
            client=client_instance,
            user=self.request.user,
            action=f"Клиент создан."
        )


class ClientDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, ClientPermission]
    queryset = Client.objects.prefetch_related('phone_numbers').all()
    serializer_class = ClientDetailSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.query_params.get('include_archived') != 'true':
            queryset = queryset.exclude(status=Client.ClientStatus.ARCHIVED)
        return get_filtered_queryset(self.request.user, queryset, 'CLIENT')

    def perform_destroy(self, instance):
        """
        Клиент переводится в архив, а не удаляется.

        Физическое удаление уносило каскадом заявки, встречи, файлы и все
        журналы — вместе с историей работы по клиенту.
        """
        # По клиенту с незакрытой сделкой работа продолжается: спрятав его
        # карточку, менеджер потерял бы контакты и историю прямо посреди сделки
        from apps.deals.models import Deal
        from rest_framework.exceptions import ValidationError as DRFValidationError

        active_deals = instance.deals.filter(status__in=(
            Deal.DealStatus.BOOKING, Deal.DealStatus.IN_PROGRESS
        ))
        if active_deals.exists():
            numbers = ", ".join(f"№{deal.id}" for deal in active_deals[:5])
            raise DRFValidationError({
                'detail': (
                    f'По клиенту идут сделки: {numbers}. '
                    f'Сначала завершите, отмените или расторгните их.'
                )
            })

        instance.status = Client.ClientStatus.ARCHIVED
        instance.save(update_fields=['status', 'updated_at'])
        ClientLog.objects.create(
            client=instance,
            user=self.request.user,
            action="Клиент перемещён в архив."
        )

    def perform_update(self, serializer):
        old_instance = self.get_object()
        old_data = self.get_serializer(old_instance).data
        old_phones = sorted([p['phone_number'] for p in old_data.get('phone_numbers', [])])
        instance = serializer.save()
        new_data = self.get_serializer(instance).data
        new_phones = sorted([p['phone_number'] for p in new_data.get('phone_numbers', [])])
        changes = []
        skip_keys = {'updated_at', 'logs', 'applications', 'phone_numbers', 'meetings', 'id', 'created_at', 'created_by'}
        for key, value in old_data.items():
            if key not in skip_keys:
                new_value = new_data.get(key)
                if value != new_value:
                    changes.append(_format_change(Client, key, value, new_value))
        if old_phones != new_phones:
            old_phones_str = ", ".join(old_phones) or "пусто"
            new_phones_str = ", ".join(new_phones) or "пусто"
            changes.append(f"'Номера телефонов' изменено с '{old_phones_str}' на '{new_phones_str}'")
        if changes:
            action_text = "Данные клиента обновлены. " + "; ".join(changes)
            ClientLog.objects.create(
                client=instance,
                user=self.request.user,
                action=action_text
            )


class ApplicationListView(generics.ListCreateAPIView):
    queryset = Application.objects.select_related('client', 'precise_source', 'created_by').all()
    permission_classes = [IsAuthenticated, ApplicationPermission]
    filterset_class = ApplicationFilter

    def get_queryset(self):
        # Удалённые заявки в списке не показываем
        queryset = super().get_queryset().filter(is_deleted=False)
        return get_filtered_queryset(self.request.user, queryset, 'APPLICATION')

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ApplicationDetailSerializer
        return ApplicationListSerializer

    def perform_create(self, serializer):
        # Определяем компанию из профиля пользователя
        company = None
        if hasattr(self.request.user, 'profile') and self.request.user.profile.company:
            company = self.request.user.profile.company
        # Всегда записываем created_by
        instance = serializer.save(created_by=self.request.user, company=company)

        # Логируем создание заявки
        ApplicationLog.objects.create(
            application=instance,
            user=self.request.user,
            action="Заявка создана."
        )


class RejectionReasonDetailView(CompanyScopedReferenceMixin, generics.RetrieveUpdateAPIView):
    queryset = RejectionReason.objects.all()
    serializer_class = RejectionReasonSerializer
    permission_classes = [IsAuthenticated, SettingsPermission]


class ApplicationDetailView(SoftDeleteMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = Application.objects.all()
    serializer_class = ApplicationDetailSerializer
    permission_classes = [IsAuthenticated, ApplicationPermission]
    log_model = ApplicationLog
    log_field = 'application'

    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = get_filtered_queryset(self.request.user, queryset, 'APPLICATION')
        return self.filter_deleted(queryset)

    def perform_update(self, serializer):
        old_instance = self.get_object()
        old_data = self.get_serializer(old_instance).data
        instance = serializer.save()
        new_data = self.get_serializer(instance).data
        changes = []
        skip_keys = {'updated_at', 'logs', 'client', 'meetings', 'id', 'created_at', 'created_by'}
        for key in old_data:
            if key not in skip_keys and old_data[key] != new_data[key]:
                changes.append(_format_change(Application, key, old_data[key], new_data[key]))
        if changes:
            action_text = "Заявка обновлена. " + "; ".join(changes)
            ApplicationLog.objects.create(
                application=instance,
                user=self.request.user,
                action=action_text
            )


@extend_schema(
    tags=['Public API'],
    description='''
Создать заявку от партнёра.

**Требует API-ключ партнёра** в заголовке `X-API-Key` с разрешением CREATE_APPLICATION.

Создаёт нового клиента (если не существует по номеру телефона) и заявку.
''',
    responses={
        201: {'description': 'Заявка успешно создана'},
        400: {'description': 'Ошибка валидации данных'},
        401: {'description': 'API-ключ отсутствует или недействителен'},
        403: {'description': 'API-ключ не имеет разрешения CREATE_APPLICATION'},
    }
)
class PublicApplicationCreateView(generics.CreateAPIView):
    """
    Публичный эндпоинт для создания заявок с сайтов партнёров.
    Требует валидный API-ключ с правом CREATE_APPLICATION.
    """
    serializer_class = PublicApplicationSerializer
    authentication_classes = []  # API-ключ проверяется в permission_classes
    permission_classes = [HasPartnerCreateApplicationScope]
    # Частоту запросов партнёра ограничивает его собственный ключ
    # (requests_per_minute / requests_per_day). Общий анонимный лимит
    # здесь снят: иначе настройки ключа не действовали бы — партнёр
    # упирался в 100 запросов в час независимо от того, что ему выдали.
    throttle_classes = []

    def create(self, request, *args, **kwargs):
        from .models import ClientPhoneNumber

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        phone_number = data.get('phone_number')
        full_name = data.get('full_name', '')

        # Определяем компанию из API-ключа партнёра
        partner_company = None
        if hasattr(request, 'partner_api_key') and request.partner_api_key:
            # Порядок задаём явно, иначе при нескольких компаниях у ключа
            # заявки распределялись бы непредсказуемо
            partner_company = request.partner_api_key.companies.order_by('id').first()

        if partner_company is None:
            return Response(
                {'error': 'API-ключ не привязан ни к одной компании — заявку принять некуда.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Клиента ищем только среди клиентов этой компании. Глобальный поиск
        # по телефону отдавал партнёру карточку клиента другой компании
        # и затирал в ней ФИО.
        # Ищем по любому написанию: сайт партнёра может прислать номер
        # в своём формате, а в базе он уже приведён к единому виду
        from django.db.models import Q

        from .phones import normalize_phone, phone_search_variants

        phone_number = normalize_phone(phone_number)
        phone_condition = Q()
        for variant in phone_search_variants(phone_number):
            phone_condition |= Q(phone_number__icontains=variant)

        phone_obj = ClientPhoneNumber.objects.filter(
            phone_condition,
            client__company=partner_company,
        ).select_related('client').first()

        if phone_obj:
            # Клиент существует
            client = phone_obj.client
            # Имя заполняем только если его ещё нет: данные из формы на сайте
            # партнёра не должны затирать то, что менеджер уточнил вручную
            if full_name and not client.full_name:
                client.full_name = full_name
                client.save(update_fields=['full_name', 'updated_at'])
        else:
            # Создаём нового клиента сразу в компании партнёра
            client = Client.objects.create(full_name=full_name, company=partner_company)
            ClientPhoneNumber.objects.create(client=client, phone_number=phone_number)
        
        # Повторная отправка формы на сайте партнёра не должна плодить заявки:
        # если по этому клиенту уже есть открытая заявка того же источника,
        # заведённая только что, дополняем её, а не создаём вторую
        recent_threshold = timezone.now() - timedelta(hours=24)
        application = Application.objects.filter(
            client=client,
            company=partner_company,
            source=data.get('source'),
            created_at__gte=recent_threshold,
            is_deleted=False,
        ).exclude(
            status__in=(
                Application.ApplicationStatusChoices.CLOSED_WON,
                Application.ApplicationStatusChoices.CLOSED_LOST,
            )
        ).order_by('-created_at').first()

        duplicate = application is not None
        if duplicate:
            extra_notes = data.get('notes', '')
            if extra_notes and extra_notes not in (application.notes or ''):
                application.notes = "\n".join(
                    part for part in (application.notes, extra_notes) if part
                ).strip()
                application.save(update_fields=['notes', 'updated_at'])
        else:
            application = Application.objects.create(
                client=client,
                source=data.get('source'),
                notes=data.get('notes', ''),
                company=partner_company
            )

        # Логируем создание заявки через партнёрский API
        partner_name = ''
        if hasattr(request, 'partner_api_key') and request.partner_api_key:
            partner_name = request.partner_api_key.name
        if duplicate:
            log_action = (
                f"Повторное обращение через партнёрский API (партнёр: {partner_name})."
                if partner_name else "Повторное обращение через партнёрский API."
            )
        else:
            log_action = (
                f"Заявка создана через партнёрский API (партнёр: {partner_name})."
                if partner_name else "Заявка создана через партнёрский API."
            )
        ApplicationLog.objects.create(
            application=application,
            user=None,
            action=log_action
        )

        # Логируем создание клиента, если он был создан
        if not phone_obj:
            ClientLog.objects.create(
                client=client,
                user=None,
                action=f"Клиент создан через партнёрский API (партнёр: {partner_name})." if partner_name else "Клиент создан через партнёрский API."
            )

        return Response({'status': 'success'}, status=status.HTTP_201_CREATED)


# --- Views для Встреч ---
class MeetingListCreateView(generics.ListCreateAPIView):
    serializer_class = MeetingSerializer
    permission_classes = [IsAuthenticated, MeetingPermission]

    def get_queryset(self):
        client_id = self.request.query_params.get('client_id')
        queryset = Meeting.objects.all().select_related(
            'client', 'creator', 'executor', 'interested_building'
        )
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        # Удалённые встречи в списке не показываем
        queryset = queryset.filter(is_deleted=False)
        return get_filtered_queryset(self.request.user, queryset, 'MEETING')

    def perform_create(self, serializer):
        # Определяем компанию из профиля пользователя
        company = None
        if hasattr(self.request.user, 'profile') and self.request.user.profile.company:
            company = self.request.user.profile.company
        serializer.save(creator=self.request.user, company=company)


class MeetingDetailView(SoftDeleteMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = Meeting.objects.all()
    serializer_class = MeetingSerializer
    permission_classes = [IsAuthenticated, MeetingPermission]
    log_model = MeetingLog
    log_field = 'meeting'

    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = get_filtered_queryset(self.request.user, queryset, 'MEETING')
        return self.filter_deleted(queryset)

    def perform_update(self, serializer):
        old_instance = self.get_object()
        tracked = ['status', 'planned_date', 'actual_date', 'executor',
                   'comment', 'result_comment', 'interested_building']
        before = {field: getattr(old_instance, field) for field in tracked}

        instance = serializer.save()

        # Раньше в журнал попадало безликое «Встреча обновлена» — по нему нельзя
        # было понять, что именно изменилось, в отличие от клиентов и заявок
        changes = []
        for field in tracked:
            new_value = getattr(instance, field)
            if before[field] != new_value:
                changes.append(_format_change(Meeting, field, before[field], new_value))

        action_text = "Встреча обновлена."
        if changes:
            action_text += " " + "; ".join(changes)
        MeetingLog.objects.create(
            meeting=instance,
            user=self.request.user,
            action=action_text
        )


class ApplicationRestoreView(APIView):
    """Возвращает удалённую заявку в работу."""
    permission_classes = [IsAuthenticated, ApplicationPermission]

    def post(self, request, pk, *args, **kwargs):
        queryset = get_filtered_queryset(request.user, Application.objects.all(), 'APPLICATION')
        application = queryset.filter(pk=pk, is_deleted=True).first()
        if application is None:
            return Response(
                {'error': 'Удалённая заявка не найдена или недоступна.'},
                status=status.HTTP_404_NOT_FOUND
            )
        application.restore()
        ApplicationLog.objects.create(
            application=application,
            user=request.user,
            action="Заявка восстановлена из удалённых."
        )
        return Response(ApplicationDetailSerializer(application).data, status=status.HTTP_200_OK)


class MeetingRestoreView(APIView):
    """Возвращает удалённую встречу в работу."""
    permission_classes = [IsAuthenticated, MeetingPermission]

    def post(self, request, pk, *args, **kwargs):
        queryset = get_filtered_queryset(request.user, Meeting.objects.all(), 'MEETING')
        meeting = queryset.filter(pk=pk, is_deleted=True).first()
        if meeting is None:
            return Response(
                {'error': 'Удалённая встреча не найдена или недоступна.'},
                status=status.HTTP_404_NOT_FOUND
            )
        meeting.restore()
        MeetingLog.objects.create(
            meeting=meeting,
            user=request.user,
            action="Встреча восстановлена из удалённых."
        )
        return Response(MeetingSerializer(meeting).data, status=status.HTTP_200_OK)


class UserListView(generics.ListAPIView):
    queryset = User.objects.filter(is_active=True)
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, UserPermission]

    def get_queryset(self):
        """Фильтрация пользователей по scope-разрешениям."""
        qs = super().get_queryset()
        user = self.request.user

        if user.is_superuser:
            return qs

        try:
            profile = user.profile
            if profile.is_system_admin:
                return qs

            if profile.has_permission_for_action('VIEW', 'USER', 'SYSTEM'):
                return qs
            if profile.has_permission_for_action('VIEW', 'USER', 'COMPANY') and profile.company:
                return qs.filter(profile__company=profile.company)
            if profile.has_permission_for_action('VIEW', 'USER', 'DEPARTMENT') and profile.department:
                return qs.filter(profile__department=profile.department)
            if profile.has_permission_for_action('VIEW', 'USER', 'OWN'):
                return qs.filter(id=user.id)
            return qs.none()
        except Exception:
            return qs.none()


# --- Views для статусов заявок ---
class ApplicationStatusListCreateView(CompanyScopedReferenceMixin, generics.ListCreateAPIView):
    """
    GET: Список всех статусов заявок (доступно всем авторизованным пользователям)
    POST: Создание нового статуса заявки (требует разрешение APPLICATION_STATUS)
    """
    queryset = ApplicationStatus.objects.all()
    serializer_class = ApplicationStatusSerializer

    def get_permissions(self):
        """
        Чтение списка статусов - для всех авторизованных.
        Создание - требует разрешение ApplicationStatusPermission.
        """
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAuthenticated(), ApplicationStatusPermission()]

    def get_queryset(self):
        # super() уже ограничил выборку компанией пользователя
        queryset = super().get_queryset()
        # Фильтр по активным статусам (опционально)
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        return queryset


class ApplicationStatusDetailView(CompanyScopedReferenceMixin, generics.RetrieveUpdateDestroyAPIView):
    """
    GET: Детали статуса заявки (доступно всем авторизованным пользователям)
    PUT/PATCH: Обновление статуса заявки (требует разрешение APPLICATION_STATUS)
    DELETE: Удаление статуса заявки (требует разрешение APPLICATION_STATUS)
    """
    queryset = ApplicationStatus.objects.all()
    serializer_class = ApplicationStatusSerializer

    def get_permissions(self):
        """
        Чтение статуса - для всех авторизованных.
        Редактирование/удаление - требует разрешение ApplicationStatusPermission.
        """
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAuthenticated(), ApplicationStatusPermission()]
