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
from .serializers import UserSerializer
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser
from datetime import date, timedelta
from django.db.models import Count, Sum, F, Q
from apps.deals.models import Deal
from apps.finances.models import Payment
import pandas as pd
from django.http import HttpResponse
from permissions.permissions import (
    ClientPermission, ApplicationPermission, MeetingPermission, 
    ReportPermission, DashboardPermission, SettingsPermission, UserPermission,
    HasPartnerCreateApplicationScope, ApplicationStatusPermission
)
from permissions.backends import get_filtered_queryset


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

        queryset = Application.objects.all().select_related('created_by', 'client')
        # Фильтруем по разрешениям пользователя
        queryset = get_filtered_queryset(request.user, queryset, 'APPLICATION')

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
            summary = queryset.values('status').annotate(total_applications=Count('id')).order_by('-total_applications')
            data_for_df = [{'Status': item['status'], 'Total Applications': item['total_applications']} for item in
                           summary]

        elif group_by == 'project':
            summary = queryset.values('interested_projects__name').annotate(total_applications=Count('id')).order_by(
                '-total_applications')
            data_for_df = [{'Project': item['interested_projects__name'] or "N/A",
                            'Total Applications': item['total_applications']} for item in summary]

        elif group_by == 'source':
            summary = queryset.values('source').annotate(total_applications=Count('id')).order_by('-total_applications')
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

        queryset = Meeting.objects.all().select_related(
            'executor', 'interested_building__project', 'client'
        )
        # Фильтруем по разрешениям пользователя
        queryset = get_filtered_queryset(request.user, queryset, 'MEETING')

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

        # KPIs - фильтруем по разрешениям
        clients_qs = get_filtered_queryset(request.user, Client.objects.all(), 'CLIENT')
        apps_qs = get_filtered_queryset(request.user, Application.objects.all(), 'APPLICATION')
        deals_qs = get_filtered_queryset(request.user, Deal.objects.all(), 'DEAL')
        payments_qs = get_filtered_queryset(request.user, Payment.objects.all(), 'PAYMENT')
        meetings_qs = get_filtered_queryset(request.user, Meeting.objects.all(), 'MEETING')
        
        new_clients_today = clients_qs.filter(created_at__date=today).count()
        new_applications_today = apps_qs.filter(created_at__date=today).count()
        monthly_sales = deals_qs.filter(
            status=Deal.DealStatus.CLOSED_WON,
            updated_at__gte=start_of_month
        ).aggregate(total=Sum('contract_price'))['total'] or 0
        overdue_payments = payments_qs.filter(
            due_date__lt=today,
            status=Payment.PaymentStatus.PENDING
        ).aggregate(total=Sum('amount'))['total'] or 0

        # Charts - используем отфильтрованный queryset
        application_statuses = apps_qs.values('status').annotate(count=Count('id'))
        application_sources = apps_qs.values('source').annotate(count=Count('id'))

        # Top Managers - на основе отфильтрованных сделок
        from django.db.models import OuterRef, Subquery
        top_manager_ids = deals_qs.filter(
            status=Deal.DealStatus.CLOSED_WON,
            updated_at__gte=start_of_month
        ).values('created_by').annotate(
            total_sales=Sum('contract_price')
        ).order_by('-total_sales')[:5].values_list('created_by', flat=True)
        
        top_managers = []
        for user_id in top_manager_ids:
            user = User.objects.filter(id=user_id).first()
            if user:
                sale = deals_qs.filter(
                    status=Deal.DealStatus.CLOSED_WON,
                    updated_at__gte=start_of_month,
                    created_by=user
                ).aggregate(total_sales=Sum('contract_price'))['total_sales'] or 0
                top_managers.append({
                    'first_name': user.first_name,
                    'last_name': user.last_name,
                    'total_sales': sale
                })

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
        files = ClientFile.objects.filter(client_id=pk)
        serializer = ClientFileSerializer(files, many=True)
        return Response(serializer.data)

    def post(self, request, pk, format=None):
        file_serializer = ClientFileSerializer(data=request.data)
        if file_serializer.is_valid():
            file_serializer.save(client_id=pk, uploaded_by=request.user)
            return Response(file_serializer.data, status=status.HTTP_201_CREATED)
        else:
            return Response(file_serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class RejectionReasonListView(generics.ListCreateAPIView):
    serializer_class = RejectionReasonSerializer
    permission_classes = [IsAuthenticated, SettingsPermission]

    def get_queryset(self):
        queryset = RejectionReason.objects.filter(is_active=True)
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
        return get_filtered_queryset(self.request.user, queryset, 'CLIENT')

    def perform_update(self, serializer):
        old_instance = self.get_object()
        old_data = self.get_serializer(old_instance).data
        old_phones = sorted([p['phone_number'] for p in old_data.get('phone_numbers', [])])
        instance = serializer.save()
        new_data = self.get_serializer(instance).data
        new_phones = sorted([p['phone_number'] for p in new_data.get('phone_numbers', [])])
        changes = []
        for key, value in old_data.items():
            if key not in ['updated_at', 'logs', 'applications', 'phone_numbers', 'meetings']:
                new_value = new_data.get(key)
                if value != new_value:
                    old_value_str = value or "пусто"
                    new_value_str = new_value or "пусто"
                    changes.append(f"Поле '{key}' изменено с '{old_value_str}' на '{new_value_str}'")
        if old_phones != new_phones:
            old_phones_str = ", ".join(old_phones) or "пусто"
            new_phones_str = ", ".join(new_phones) or "пусто"
            changes.append(f"Поле 'phone_numbers' изменено с '{old_phones_str}' на '{new_phones_str}'")
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
        queryset = super().get_queryset()
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
        if serializer.validated_data.get('source') == 'OFFICE':
            serializer.save(created_by=self.request.user, company=company)
        else:
            serializer.save(company=company)


class RejectionReasonDetailView(generics.RetrieveUpdateAPIView):
    queryset = RejectionReason.objects.all()
    serializer_class = RejectionReasonSerializer
    permission_classes = [IsAuthenticated, SettingsPermission]


class ApplicationDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Application.objects.all()
    serializer_class = ApplicationDetailSerializer
    permission_classes = [IsAuthenticated, ApplicationPermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        return get_filtered_queryset(self.request.user, queryset, 'APPLICATION')

    def perform_update(self, serializer):
        old_instance = self.get_object()
        old_data = self.get_serializer(old_instance).data
        instance = serializer.save()
        new_data = self.get_serializer(instance).data
        changes = []
        for key in old_data:
            if old_data[key] != new_data[key]:
                if key not in ['updated_at', 'logs', 'client', 'meetings']:
                    old_value = old_data[key] or "пусто"
                    new_value = new_data[key] or "пусто"
                    changes.append(f"Поле '{key}' изменено с '{old_value}' на '{new_value}'")
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

    def create(self, request, *args, **kwargs):
        from .models import ClientPhoneNumber
        
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        phone_number = data.get('phone_number')
        full_name = data.get('full_name', '')
        
        # Ищем клиента по номеру телефона
        phone_obj = ClientPhoneNumber.objects.filter(phone_number=phone_number).first()
        
        if phone_obj:
            # Клиент существует
            client = phone_obj.client
            if full_name and client.full_name != full_name:
                client.full_name = full_name
                client.save()
        else:
            # Создаём нового клиента
            client = Client.objects.create(full_name=full_name)
            ClientPhoneNumber.objects.create(client=client, phone_number=phone_number)
        
        # Определяем компанию из API-ключа партнёра
        partner_company = None
        if hasattr(request, 'partner_api_key') and request.partner_api_key:
            partner_company = request.partner_api_key.companies.first()
        
        # Привязываем клиента к компании, если у него ещё нет компании
        if partner_company and not client.company:
            client.company = partner_company
            client.save(update_fields=['company'])
        
        Application.objects.create(
            client=client,
            source=data.get('source'),
            notes=data.get('notes', ''),
            company=partner_company
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
        return get_filtered_queryset(self.request.user, queryset, 'MEETING')

    def perform_create(self, serializer):
        # Определяем компанию из профиля пользователя
        company = None
        if hasattr(self.request.user, 'profile') and self.request.user.profile.company:
            company = self.request.user.profile.company
        serializer.save(creator=self.request.user, company=company)


class MeetingDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Meeting.objects.all()
    serializer_class = MeetingSerializer
    permission_classes = [IsAuthenticated, MeetingPermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        return get_filtered_queryset(self.request.user, queryset, 'MEETING')

    def perform_update(self, serializer):
        instance = serializer.save()
        MeetingLog.objects.create(
            meeting=instance,
            user=self.request.user,
            action="Встреча обновлена."
        )


class UserListView(generics.ListAPIView):
    queryset = User.objects.filter(is_active=True)
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, UserPermission]


# --- Views для статусов заявок ---
class ApplicationStatusListCreateView(generics.ListCreateAPIView):
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
        queryset = super().get_queryset()
        # Фильтр по активным статусам (опционально)
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        return queryset


class ApplicationStatusDetailView(generics.RetrieveUpdateDestroyAPIView):
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
