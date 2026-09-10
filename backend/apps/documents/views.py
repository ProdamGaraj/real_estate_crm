from django.http import HttpResponse
from django.db.models import Q
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser
from rest_framework.views import APIView
from rest_framework.response import Response
from docxtpl import DocxTemplate
from jinja2.sandbox import SandboxedEnvironment
import io

from apps.deals.models import Deal
from .models import Template
from .serializers import TemplateSerializer
from permissions.permissions import TemplatePermission
from permissions.backends import can_user_perform_action, get_filtered_queryset


class TemplateListCreateView(generics.ListCreateAPIView):
    serializer_class = TemplateSerializer
    permission_classes = [IsAuthenticated, TemplatePermission]
    parser_classes = [MultiPartParser]

    def get_queryset(self):
        return get_filtered_queryset(
            self.request.user,
            Template.objects.all(),
            'TEMPLATE'
        )

    def perform_create(self, serializer):
        company = None
        if hasattr(self.request.user, 'profile') and self.request.user.profile.company:
            company = self.request.user.profile.company
        serializer.save(company=company, created_by=self.request.user)


class TemplateDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TemplateSerializer
    permission_classes = [IsAuthenticated, TemplatePermission]
    parser_classes = [MultiPartParser]

    def get_queryset(self):
        return get_filtered_queryset(
            self.request.user,
            Template.objects.all(),
            'TEMPLATE'
        )


class DealTemplatesListView(generics.ListAPIView):
    serializer_class = TemplateSerializer
    permission_classes = [IsAuthenticated, TemplatePermission]

    def get_queryset(self):
        deal_id = self.kwargs.get('deal_pk')
        try:
            deal = Deal.objects.select_related('property__building__project').get(pk=deal_id)
        except Deal.DoesNotExist:
            return Template.objects.none()

        # Проверяем доступ к этой сделке
        if not can_user_perform_action(self.request.user, 'VIEW', 'DEAL', obj=deal):
            return Template.objects.none()

        prop = deal.property
        building = prop.building
        project = building.project

        # Сначала фильтруем по полям, которые поддерживаются базой данных
        queryset = Template.objects.filter(
            Q(applies_to_projects__isnull=True) | Q(applies_to_projects=project),
            Q(applies_to_buildings__isnull=True) | Q(applies_to_buildings=building),
        ).distinct()

        # Затем фильтруем по JSON-полю уже в Python
        prop_type = prop.property_type
        filtered_pks = []
        for template in queryset:
            applies_to_types = template.applies_to_property_types
            # Шаблон подходит, если список типов пуст (подходит для всех)
            # или если тип недвижимости сделки есть в списке
            if not applies_to_types or prop_type in applies_to_types:
                filtered_pks.append(template.pk)

        return get_filtered_queryset(
            self.request.user,
            Template.objects.filter(pk__in=filtered_pks),
            'TEMPLATE'
        )


class GenerateDocumentView(APIView):
    permission_classes = [IsAuthenticated, TemplatePermission]

    def get(self, request, deal_pk, template_pk, *args, **kwargs):
        try:
            deal = Deal.objects.select_related('client', 'property__building__project', 'created_by').get(pk=deal_pk)
        except Deal.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        # Проверяем доступ к этой сделке (scope-фильтрация)
        if not can_user_perform_action(request.user, 'VIEW', 'DEAL', obj=deal):
            return Response(
                {"error": "У вас нет доступа к этой сделке."},
                status=status.HTTP_403_FORBIDDEN
            )

        # По отменённой или расторгнутой сделке договор печатать нельзя:
        # документ выглядел бы действующим, хотя сделки уже нет
        if deal.status in (Deal.DealStatus.CANCELLED, Deal.DealStatus.TERMINATED):
            return Response(
                {"error": f"Сделка {deal.get_status_display().lower()} — "
                          f"документы по ней больше не формируются."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Шаблон тоже фильтруем по scope (нельзя использовать чужой шаблон)
        template_qs = get_filtered_queryset(request.user, Template.objects.all(), 'TEMPLATE')
        try:
            template = template_qs.get(pk=template_pk)
        except Template.DoesNotExist:
            return Response(
                {"error": "Шаблон не найден или недоступен."},
                status=status.HTTP_404_NOT_FOUND
            )

        doc = DocxTemplate(template.file.path)
        context = {
            'deal': deal,
            'client': deal.client,
            'property': deal.property,
            'building': deal.property.building,
            'project': deal.property.building.project,
            'manager': deal.created_by,
        }
        # Используем SandboxedEnvironment для защиты от SSTI/RCE
        doc.render(context, jinja_env=SandboxedEnvironment())

        file_stream = io.BytesIO()
        doc.save(file_stream)
        file_stream.seek(0)

        response = HttpResponse(
            file_stream.read(),
            content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        response['Content-Disposition'] = f'attachment; filename="generated_doc_{deal.id}.docx"'
        return response